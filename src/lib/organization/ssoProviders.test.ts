import { describe, expect, test } from "bun:test";

import { organizationSignInOptions } from "./ssoProviders";

const none = { microsoft_entra: false, google_workspace: false };

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
