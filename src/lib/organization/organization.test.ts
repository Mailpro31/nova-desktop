import { describe, expect, test } from "bun:test";

import { resolveCampusContext } from "@/lib/campusPolicy";
import type { CampusConfig } from "@/lib/campusSession";
import {
  can,
  CORE_CAPABILITIES,
  resolveOrganizationContext,
  type CapabilityId,
  type OrganizationContext,
} from "@/lib/organization";

/**
 * Ces tests portent sur ce que **l'application voit**, pas sur le détail des
 * fonctions internes : le contexte Campus est toujours construit par le chemin
 * réel (`resolveCampusContext` sur une configuration d'établissement), jamais
 * assemblé à la main. Une régression du côté Campus ferait donc échouer ces
 * tests même si le code Organization restait intact — c'est le but.
 */

function campusConfig(overrides: Partial<CampusConfig> = {}): CampusConfig {
  return {
    server_url: "https://nova.exemple.fr",
    organization: {
      id: "exemple",
      name: "Établissement Exemple",
      shortName: "Exemple",
      campusName: "Paris",
      managed: true,
    },
    ...overrides,
  };
}

/** Poste Campus tel qu'il tourne aujourd'hui : config d'établissement + profil. */
function campusOrganizationContext(
  config: CampusConfig | null = campusConfig(),
  profile: { email: string; role: string; cohort: string } | null = null,
): OrganizationContext {
  return resolveOrganizationContext({
    edition: "organization",
    organizationType: "education",
    campus: resolveCampusContext(config, profile),
  });
}

const ORGANIZATION_ONLY: CapabilityId[] = [
  "organizationVocabulary",
  "organizationSnippets",
  "organizationFormattingRules",
  "organizationStyles",
  "aiSkills",
];

// `learning` ne figure ni ici ni dans le Nova Core : c'est une capacité Core
// qu'une policy peut fermer. Personal la garde toujours ; une organisation la
// reçoit ouverte et peut la refermer.

describe("Édition Personal", () => {
  const context = resolveOrganizationContext({ edition: "personal" });

  test("ne fabrique aucune organisation", () => {
    expect(context.edition).toBe("personal");
    expect(context.organization).toBeNull();
    expect(context.member).toBeNull();
  });

  test("garde tout le Nova Core", () => {
    for (const capability of CORE_CAPABILITIES) {
      expect(can(context, capability)).toBe(true);
    }
  });

  test("n'ouvre aucune surface d'organisation", () => {
    for (const capability of ORGANIZATION_ONLY) {
      expect(can(context, capability)).toBe(false);
    }
  });

  test("garde Learn, qui appartient au Core", () => {
    // Learn n'est pas une surface d'organisation : il vaut sans serveur.
    expect(can(context, "learning")).toBe(true);
  });
});

describe("Campus hérité", () => {
  test("est une organisation de type éducation", () => {
    const context = campusOrganizationContext();
    expect(context.edition).toBe("organization");
    expect(context.organization?.type).toBe("education");
  });

  test("conserve le Nova Core d'un établissement en mode normal", () => {
    const context = campusOrganizationContext();
    for (const capability of CORE_CAPABILITIES) {
      expect(can(context, capability)).toBe(true);
    }
  });

  test("garde le repli local même sans serveur joignable", () => {
    // Aucune configuration lue : c'est l'état d'un poste hors ligne.
    const context = resolveOrganizationContext({
      edition: "organization",
      organizationType: "education",
      campus: null,
    });
    expect(can(context, "localFallback")).toBe(true);
    expect(can(context, "dictation")).toBe(true);
    // Rien qui suppose un serveur n'est promis dans cet état.
    expect(can(context, "cloudInference")).toBe(false);
    expect(can(context, "organizationVocabulary")).toBe(false);
  });

  test("laisse les AI Skills fermés tant que l'établissement ne les ouvre pas", () => {
    expect(can(campusOrganizationContext(), "aiSkills")).toBe(false);

    const withSkills = campusOrganizationContext(
      campusConfig({ capabilities: { aiSkills: true } }),
    );
    expect(can(withSkills, "aiSkills")).toBe(true);
  });

  test("ne promet pas de Styles d'organisation", () => {
    // Aucun serveur n'en distribue : les annoncer serait une promesse creuse.
    const context = campusOrganizationContext(
      campusConfig({ capabilities: { styles: true } }),
    );
    expect(can(context, "organizationStyles")).toBe(false);
  });

  test("ouvre Learn par défaut, et le referme si la policy le dit", () => {
    // Learn appartient au Core : un établissement qui n'a rien configuré le
    // garde. Fermer une capacité doit rester une décision, jamais un défaut.
    expect(can(campusOrganizationContext(), "learning")).toBe(true);

    const closed = campusOrganizationContext(
      campusConfig({ capabilities: { learning: false } }),
    );
    expect(can(closed, "learning")).toBe(false);
  });

  test("suit le mode examen de l'établissement", () => {
    const context = campusOrganizationContext(
      campusConfig({ education_mode: "assessment" }),
    );
    expect(can(context, "dictation")).toBe(true);
    expect(can(context, "rewrite")).toBe(false);
    expect(can(context, "writingStyles")).toBe(false);
    expect(can(context, "fileTranscription")).toBe(false);
  });

  test("expose le vocabulaire et les règles de l'établissement", () => {
    const context = campusOrganizationContext(
      campusConfig({
        capabilities: {
          dictionary: true,
          snippets: true,
          formattingRules: true,
        },
      }),
    );
    expect(can(context, "organizationVocabulary")).toBe(true);
    expect(can(context, "organizationSnippets")).toBe(true);
    expect(can(context, "organizationFormattingRules")).toBe(true);
  });
});

describe("Identité de l'organisation", () => {
  test("retient l'identifiant fourni par l'établissement", () => {
    const context = campusOrganizationContext();
    expect(context.organization?.id).toBe("exemple");
    expect(context.organization?.displayName).toBe("Établissement Exemple");
    expect(context.organization?.shortName).toBe("Exemple");
  });

  test("ne fait pas passer le bouchon interne pour un tenant", () => {
    // Sans configuration lue, le client se rabat sur une organisation par
    // défaut : ce n'est pas l'identité d'un établissement.
    const context = campusOrganizationContext(null);
    expect(context.organization?.id).toBeNull();
    expect(context.organization?.displayName).toBeNull();
  });

  test("ne dérive jamais d'identifiant d'un nom d'affichage", () => {
    const context = campusOrganizationContext(
      campusConfig({
        organization: { id: "  ", name: "IPSA Paris", managed: true },
      }),
    );
    // Le nom reste un nom, et l'identifiant reste absent : c'est exactement le
    // cas où il serait tentant de fabriquer une clé à partir du libellé.
    expect(context.organization?.displayName).toBe("IPSA Paris");
    expect(context.organization?.id).toBeNull();
  });
});

describe("Membre, groupes et sécurité", () => {
  test("traduit le rôle serveur en nature de membre", () => {
    const context = campusOrganizationContext(campusConfig(), {
      email: "etudiant@exemple.fr",
      role: "student",
      cohort: "AERO2",
    });
    expect(context.member?.memberType).toBe("student");
  });

  test("n'accorde aucun droit d'administration à un métier", () => {
    for (const role of ["student", "teacher", "staff", "partner"]) {
      const context = campusOrganizationContext(campusConfig(), {
        email: `${role}@exemple.fr`,
        role,
        cohort: "",
      });
      expect(context.member?.securityRole).toBe("member");
    }
  });

  test("ne retient pas un rôle que le serveur n'a pas annoncé", () => {
    const context = campusOrganizationContext(campusConfig(), {
      email: "inconnu@exemple.fr",
      role: "doyen",
      cohort: "",
    });
    expect(context.member?.memberType).toBeNull();
  });

  test("expose la cohorte comme groupe de compatibilité", () => {
    const context = campusOrganizationContext(campusConfig(), {
      email: "etudiant@exemple.fr",
      role: "student",
      cohort: "AERO2",
    });
    expect(context.member?.groups).toEqual([
      {
        id: "AERO2",
        label: "AERO2",
        source: "legacy_cohort",
        externalGroupId: null,
      },
    ]);
  });

  test("ne fabrique pas de groupe vide", () => {
    const context = campusOrganizationContext(campusConfig(), {
      email: "etudiant@exemple.fr",
      role: "student",
      cohort: "",
    });
    expect(context.member?.groups).toEqual([]);
  });
});
