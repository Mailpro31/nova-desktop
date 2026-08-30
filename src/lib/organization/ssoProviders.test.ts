import { describe, expect, test } from "bun:test";

import {
  DEFAULT_OIDC_LABEL,
  oidcLabel,
  organizationSignInButtons,
  organizationSignInOptions,
} from "./ssoProviders";

const none = { microsoft_entra: false, google_workspace: false, oidc: false };

describe("Fournisseurs de connexion proposés", () => {
  test("Personal n'affiche aucun fournisseur d'organisation", () => {
    // Pas même désactivé : la notion d'organisation n'existe pas ici.
    expect(
      organizationSignInOptions({
        edition: "personal",
        providers: { microsoft_entra: true, google_workspace: true },
        authMethods: ["entra", "email_code"],
      }),
    ).toEqual([]);
  });

  test("Microsoft seul", () => {
    expect(
      organizationSignInOptions({
        edition: "organization",
        providers: { ...none, microsoft_entra: true },
      }),
    ).toEqual(["microsoft_entra", "legacy_email_code"]);
  });

  test("Google seul", () => {
    expect(
      organizationSignInOptions({
        edition: "organization",
        providers: { ...none, google_workspace: true },
      }),
    ).toEqual(["google_workspace", "legacy_email_code"]);
  });

  test("les deux fournisseurs, Microsoft en premier", () => {
    expect(
      organizationSignInOptions({
        edition: "organization",
        providers: { microsoft_entra: true, google_workspace: true },
      }),
    ).toEqual(["microsoft_entra", "google_workspace", "legacy_email_code"]);
  });

  test("aucun fournisseur moderne : le code par adresse reste", () => {
    expect(
      organizationSignInOptions({ edition: "organization", providers: none }),
    ).toEqual(["legacy_email_code"]);
  });

  test("un serveur ancien garde son chemin Microsoft hérité", () => {
    // `auth_methods: ["entra"]` sans SSO moderne : c'est le Device Code.
    expect(
      organizationSignInOptions({
        edition: "organization",
        providers: none,
        authMethods: ["entra", "email_code"],
      }),
    ).toEqual(["microsoft_entra", "legacy_email_code"]);
  });

  test("Google n'a pas de repli hérité", () => {
    // Rien dans `auth_methods` ne peut faire apparaître Google : il n'existe
    // que configuré, mapping de domaine compris.
    expect(
      organizationSignInOptions({
        edition: "organization",
        providers: none,
        authMethods: ["google", "google_workspace", "oidc"],
      }),
    ).toEqual(["legacy_email_code"]);
  });

  test("OIDC seul, avec son libellé", () => {
    expect(
      organizationSignInOptions({
        edition: "organization",
        providers: { ...none, oidc: true },
      }),
    ).toEqual(["oidc", "legacy_email_code"]);
  });

  test("les trois fournisseurs, dans un ordre stable", () => {
    expect(
      organizationSignInOptions({
        edition: "organization",
        providers: {
          microsoft_entra: true,
          google_workspace: true,
          oidc: true,
        },
      }),
    ).toEqual([
      "microsoft_entra",
      "google_workspace",
      "oidc",
      "legacy_email_code",
    ]);
  });

  test("Personal n'affiche aucun OIDC non plus", () => {
    expect(
      organizationSignInOptions({
        edition: "personal",
        providers: {
          microsoft_entra: true,
          google_workspace: true,
          oidc: true,
        },
      }),
    ).toEqual([]);
  });

  test("le libellé OIDC vient du serveur, avec un repli propre", () => {
    expect(oidcLabel({ ...none, oidc_display_name: "IPSA SSO" })).toBe(
      "IPSA SSO",
    );
    expect(oidcLabel({ ...none, oidc_display_name: "  " })).toBe(
      DEFAULT_OIDC_LABEL,
    );
    expect(oidcLabel(none)).toBe(DEFAULT_OIDC_LABEL);
    // Jamais le code technique à l'écran.
    expect(oidcLabel(none)).not.toBe("oidc");
  });

  test("un bouton par configuration annoncée", () => {
    const buttons = organizationSignInButtons({
      edition: "organization",
      providers: {
        ...none,
        oidc: true,
        configs: [
          { id: "cfg-1", type: "oidc", display_name: "Okta" },
          { id: "cfg-2", type: "oidc", display_name: "Lab SSO" },
        ],
      },
    });
    // Deux IdP OIDC pour une même organisation : ce que des booléens par type
    // ne sauraient pas représenter.
    expect(buttons.map((b) => b.display_name)).toEqual(["Okta", "Lab SSO"]);
    expect(new Set(buttons.map((b) => b.id)).size).toBe(2);
  });

  test("un serveur ancien retombe sur un bouton par type", () => {
    const buttons = organizationSignInButtons({
      edition: "organization",
      providers: { microsoft_entra: true, google_workspace: true, oidc: false },
    });
    expect(buttons.map((b) => b.type)).toEqual([
      "microsoft_entra",
      "google_workspace",
    ]);
    // Le code par adresse n'est pas un bouton de fournisseur.
    expect(buttons.map((b) => b.type)).not.toContain("legacy_email_code");
  });

  test("Personal n'a aucun bouton, même avec des configurations", () => {
    expect(
      organizationSignInButtons({
        edition: "personal",
        providers: {
          ...none,
          configs: [{ id: "cfg-1", type: "oidc", display_name: "Okta" }],
        },
      }),
    ).toEqual([]);
  });

  test("aucune configuration annoncée, aucun bouton", () => {
    expect(
      organizationSignInButtons({
        edition: "organization",
        providers: { ...none, configs: [] },
      }),
    ).toEqual([]);
  });

  test("aucun bouton inopérant ne peut apparaître", () => {
    // Le serveur est la seule source : ce qu'il ne cite pas n'est pas proposé.
    const options = organizationSignInOptions({
      edition: "organization",
      providers: { microsoft_entra: false, google_workspace: true },
    });
    expect(options).not.toContain("microsoft_entra");
    expect(options).toContain("google_workspace");
  });
});
