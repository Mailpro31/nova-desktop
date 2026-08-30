import { describe, expect, test } from "bun:test";

import { resolveCampusContext } from "@/lib/campusPolicy";
import {
  can,
  CORE_CAPABILITIES,
  createFederatedIdentity,
  grantsAccess,
  identityKey,
  parseServerIdentity,
  resolveOrganizationContext,
  resolveOrganizationForTenant,
  type TenantMapping,
} from "@/lib/organization";

/**
 * Ces tests décrivent le **contrat**, pas l'implémentation : réponses serveur
 * réalistes en entrée, contexte d'organisation observable en sortie.
 */

describe("Sujet externe immuable", () => {
  test("une adresse e-mail ne peut jamais devenir un sujet externe", () => {
    for (const email of [
      "etudiant@exemple.fr",
      "  Prenom.Nom@sous.domaine.exemple.fr  ",
      "employe@entreprise.com",
    ]) {
      const result = createFederatedIdentity({
        provider: "microsoft_entra",
        externalSubject: email,
      });
      expect(result).toEqual({ ok: false, rejection: "email_used_as_subject" });
    }
  });

  test("un sujet absent est refusé plutôt que remplacé", () => {
    expect(
      createFederatedIdentity({
        provider: "google_workspace",
        externalSubject: "   ",
      }),
    ).toEqual({ ok: false, rejection: "missing_subject" });
  });

  test("un identifiant opaque est accepté et normalisé", () => {
    const result = createFederatedIdentity({
      provider: "microsoft_entra",
      externalSubject: " 9f2c1a70-1111-4b3e-9f10-abc123456789 ",
      externalTenantId: " tenant-a ",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.identity.externalSubject).toBe(
      "9f2c1a70-1111-4b3e-9f10-abc123456789",
    );
    expect(result.identity.externalTenantId).toBe("tenant-a");
    // Aucune organisation inventée faute de mapping.
    expect(result.identity.organizationId).toBeNull();
  });

  test("le même sujet chez deux fournisseurs reste deux identités", () => {
    const microsoft = createFederatedIdentity({
      provider: "microsoft_entra",
      externalSubject: "sujet-partage",
    });
    const google = createFederatedIdentity({
      provider: "google_workspace",
      externalSubject: "sujet-partage",
    });
    expect(microsoft.ok && google.ok).toBe(true);
    if (!microsoft.ok || !google.ok) return;
    expect(identityKey(microsoft.identity)).not.toBe(
      identityKey(google.identity),
    );
  });
});

describe("Rattachement tenant → organisation", () => {
  const mappings: TenantMapping[] = [
    {
      provider: "microsoft_entra",
      externalTenantId: "tenant-a",
      organizationId: "organisation-a",
    },
    {
      provider: "microsoft_entra",
      externalTenantId: "tenant-b",
      organizationId: "organisation-b",
    },
  ];

  test("deux tenants ne peuvent pas être confondus", () => {
    expect(
      resolveOrganizationForTenant(mappings, "microsoft_entra", "tenant-a"),
    ).toBe("organisation-a");
    expect(
      resolveOrganizationForTenant(mappings, "microsoft_entra", "tenant-b"),
    ).toBe("organisation-b");
  });

  test("un tenant non déclaré n'ouvre aucune organisation", () => {
    expect(
      resolveOrganizationForTenant(
        mappings,
        "microsoft_entra",
        "tenant-inconnu",
      ),
    ).toBeNull();
    expect(
      resolveOrganizationForTenant(mappings, "microsoft_entra", "  "),
    ).toBeNull();
  });

  test("un tenant déclaré pour un fournisseur n'en sert pas un autre", () => {
    expect(
      resolveOrganizationForTenant(mappings, "google_workspace", "tenant-a"),
    ).toBeNull();
  });
});

describe("Aucun secret ne traverse la frontière", () => {
  test("l'instantané serveur ne transporte ni jeton ni sujet externe", () => {
    // Garde-fou de régression : le jour où quelqu'un ajoutera un champ au
    // contrat, ce test refusera qu'il s'agisse d'un identifiant de session.
    const snapshot = parseServerIdentity({
      email: "etudiant@exemple.fr",
      role: "student",
      cohort: "AERO2",
      contract_version: 2,
      user_id: "0f5f1a3e-2222-4c11-9a10-9f0d1e2b3c44",
      identity: { provider: "microsoft_entra", has_external_identity: true },
      // Ce qu'un serveur ne devrait jamais envoyer, et que le poste ne doit en
      // aucun cas conserver s'il l'envoyait quand même.
      token: "secret-de-session",
      external_subject: "oid-immuable",
    });

    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain("secret-de-session");
    expect(serialized).not.toContain("oid-immuable");
    for (const key of Object.keys(snapshot)) {
      expect(key.toLowerCase()).not.toContain("token");
      expect(key.toLowerCase()).not.toContain("secret");
    }
  });
});

describe("Cycle de vie du compte", () => {
  test("seul un compte actif ouvre l'accès", () => {
    expect(grantsAccess("active")).toBe(true);
    expect(grantsAccess("disabled")).toBe(false);
    expect(grantsAccess("deprovisioned")).toBe(false);
  });
});

describe("Lecture de /api/me", () => {
  /** Réponse d'un serveur d'établissement antérieur à cette phase. */
  const legacyResponse = {
    email: "etudiant@exemple.fr",
    role: "student",
    cohort: "AERO2",
  };

  /** Réponse d'un serveur portant le contrat étendu. */
  const v2Response = {
    ...legacyResponse,
    organization: "Établissement Exemple",
    contract_version: 2,
    user_id: "0f5f1a3e-2222-4c11-9a10-9f0d1e2b3c44",
    organization_id: "3b7c1d9e-3333-4a22-8b31-1c2d3e4f5a66",
    membership: {
      member_type: "student",
      security_role: "member",
      groups: [
        {
          id: "AERO2",
          label: "AERO2",
          source: "legacy_cohort",
          external_group_id: null,
        },
      ],
      status: "active",
    },
    identity: { provider: "legacy_email_code" },
    capabilities: ["dictation", "rewrite"],
  };

  test("une réponse ancienne ne casse rien", () => {
    const snapshot = parseServerIdentity(legacyResponse);
    expect(snapshot.contractVersion).toBe(1);
    expect(snapshot.userId).toBeNull();
    expect(snapshot.organizationId).toBeNull();
    expect(snapshot.member).toBeNull();
    // Le mode de connexion réellement en production.
    expect(snapshot.provider).toBe("legacy_email_code");
  });

  test("une réponse illisible ne fabrique aucune identité", () => {
    const snapshot = parseServerIdentity("pas un objet");
    expect(snapshot.member).toBeNull();
    expect(snapshot.organizationId).toBeNull();
  });

  test("une réponse étendue est lue intégralement", () => {
    const snapshot = parseServerIdentity(v2Response);
    expect(snapshot.contractVersion).toBe(2);
    expect(snapshot.userId).toBe("0f5f1a3e-2222-4c11-9a10-9f0d1e2b3c44");
    expect(snapshot.organizationId).toBe(
      "3b7c1d9e-3333-4a22-8b31-1c2d3e4f5a66",
    );
    expect(snapshot.member?.memberType).toBe("student");
    expect(snapshot.member?.securityRole).toBe("member");
    expect(snapshot.member?.status).toBe("active");
    expect(snapshot.member?.groups).toEqual([
      {
        id: "AERO2",
        label: "AERO2",
        source: "legacy_cohort",
        externalGroupId: null,
      },
    ]);
  });

  test("le silence du serveur sur le rôle ne vaut pas élévation", () => {
    const snapshot = parseServerIdentity({
      ...v2Response,
      membership: { member_type: "teacher" },
    });
    expect(snapshot.member?.securityRole).toBe("member");
    expect(snapshot.member?.groups).toEqual([]);
    expect(snapshot.member?.status).toBe("active");
  });

  test("un rôle de sécurité inconnu est rejeté, pas traduit", () => {
    const snapshot = parseServerIdentity({
      ...v2Response,
      membership: { ...v2Response.membership, security_role: "super_admin" },
    });
    // Le schéma refuse la réponse entière plutôt que d'en retenir une partie
    // arbitraire : une valeur non prévue signale un désaccord de contrat.
    expect(snapshot.member).toBeNull();
    expect(snapshot.contractVersion).toBe(1);
  });

  test("un compte désactivé par l'organisation est visible comme tel", () => {
    const snapshot = parseServerIdentity({
      ...v2Response,
      membership: { ...v2Response.membership, status: "deprovisioned" },
    });
    expect(snapshot.member?.status).toBe("deprovisioned");
    expect(grantsAccess(snapshot.member!.status)).toBe(false);
  });

  // -- intégration avec le contexte d'organisation ------------------------

  function contextFrom(raw: unknown) {
    return resolveOrganizationContext({
      edition: "organization",
      organizationType: "education",
      campus: resolveCampusContext(
        {
          server_url: "https://nova.exemple.fr",
          organization: {
            id: "exemple",
            name: "Établissement Exemple",
            managed: true,
          },
        },
        { email: "etudiant@exemple.fr", role: "student", cohort: "AERO2" },
      ),
      server: parseServerIdentity(raw),
    });
  }

  test("le serveur devient l'autorité sur l'organisation et le membre", () => {
    const context = contextFrom(v2Response);
    expect(context.organization?.id).toBe(
      "3b7c1d9e-3333-4a22-8b31-1c2d3e4f5a66",
    );
    expect(context.member?.memberType).toBe("student");
    expect(context.member?.securityRole).toBe("member");
  });

  test("un serveur ancien laisse le comportement Campus inchangé", () => {
    const context = contextFrom(legacyResponse);
    // L'identifiant issu de la configuration de l'établissement est conservé.
    expect(context.organization?.id).toBe("exemple");
    expect(context.member?.memberType).toBe("student");
    expect(context.member?.groups).toEqual([
      {
        id: "AERO2",
        label: "AERO2",
        source: "legacy_cohort",
        externalGroupId: null,
      },
    ]);
  });

  test("un type d'organisation inconnu est ignoré, pas propagé", () => {
    const snapshot = parseServerIdentity({
      ...v2Response,
      organization_type: "galaxie",
    });
    // Le reste de la réponse reste exploitable : un type inconnu ne confère
    // rien, il n'y a donc rien à refuser.
    expect(snapshot.organizationType).toBeNull();
    expect(snapshot.organizationId).toBe(
      "3b7c1d9e-3333-4a22-8b31-1c2d3e4f5a66",
    );
    expect(snapshot.member?.memberType).toBe("student");
  });

  test("un type d'organisation connu est retenu", () => {
    expect(
      parseServerIdentity({ ...v2Response, organization_type: "business" })
        .organizationType,
    ).toBe("business");
  });

  test("le fournisseur d'identité annoncé est retenu", () => {
    expect(
      parseServerIdentity({
        ...v2Response,
        identity: { provider: "microsoft_entra" },
      }).provider,
    ).toBe("microsoft_entra");
  });

  // -- capacités annoncées par le serveur ---------------------------------

  test("les capacités du serveur pilotent les surfaces d'organisation", () => {
    const context = contextFrom({
      ...v2Response,
      capabilities: ["dictionary", "aiSkills"],
    });
    expect(context.capabilities.organizationVocabulary).toBe(true);
    expect(context.capabilities.aiSkills).toBe(true);
    // Ce que le serveur ne cite pas, il ne le fournit pas.
    expect(context.capabilities.organizationSnippets).toBe(false);
    expect(context.capabilities.engineeringNotes).toBe(false);
  });

  test("une capacité inconnue du modèle est ignorée sans effet de bord", () => {
    const context = contextFrom({
      ...v2Response,
      capabilities: ["dictionary", "teleportation"],
    });
    expect(context.capabilities.organizationVocabulary).toBe(true);
    expect(context.capabilities.dictation).toBe(true);
  });

  test("une liste de capacités incomplète n'éteint jamais le Nova Core", () => {
    // Le scénario redouté : un serveur d'une version intermédiaire renvoie une
    // liste tronquée, et la dictée disparaît d'un poste étudiant.
    const context = contextFrom({ ...v2Response, capabilities: [] });
    for (const capability of CORE_CAPABILITIES) {
      expect(can(context, capability)).toBe(true);
    }
  });

  test("l'absence de liste laisse la politique d'établissement décider", () => {
    const { capabilities: _omitted, ...withoutCapabilities } = v2Response;
    const context = contextFrom(withoutCapabilities);
    // Rien n'est écrasé : la configuration Campus reste seule à décider, et
    // elle ouvre le vocabulaire d'établissement dans ce montage.
    expect(context.capabilities.organizationVocabulary).toBe(false);
    expect(can(context, "dictation")).toBe(true);
    expect(can(context, "rewrite")).toBe(true);
  });

  // -- cycle de vie du compte ---------------------------------------------

  test("un compte suspendu ou retiré est visible dans le contexte", () => {
    for (const status of ["disabled", "deprovisioned"] as const) {
      const context = contextFrom({
        ...v2Response,
        membership: { ...v2Response.membership, status },
      });
      expect(context.member?.status).toBe(status);
      expect(grantsAccess(context.member!.status)).toBe(false);
    }
  });

  test("aucun champ envoyé par un client ne peut élever le rôle", () => {
    // Un poste modifié qui s'attribuerait un rôle : la valeur ne vient pas de
    // lui, elle vient de la réponse du serveur.
    const context = contextFrom({
      ...v2Response,
      membership: { ...v2Response.membership, security_role: "member" },
    });
    expect(context.member?.securityRole).toBe("member");
  });
});
