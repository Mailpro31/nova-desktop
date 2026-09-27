import { describe, expect, test } from "bun:test";

import { emailDiscoveryErrorKey, looksLikeEmail } from "./emailDiscovery";

/**
 * Trouver son organisation avec son adresse e-mail : ce que le poste accepte
 * de tenter, et ce qu'il dit quand il refuse.
 */

describe("Découverte par adresse", () => {
  test("une adresse complète suffit à tenter la recherche", () => {
    for (const value of ["a@ecole.fr", " prenom.nom@sous.ecole.fr "]) {
      expect(looksLikeEmail(value)).toBe(true);
    }
  });

  test("ce qui n'est pas une adresse ne déclenche rien", () => {
    for (const value of [
      "",
      "ecole.fr",
      "a@",
      "@ecole.fr",
      "a@ecole",
      "a@@ecole.fr",
    ]) {
      expect(looksLikeEmail(value)).toBe(false);
    }
  });

  test("chaque refus a sa phrase", () => {
    expect(emailDiscoveryErrorKey({ code: "RecordNotFound" })).toBe(
      "campus.onboarding.email.discoveryErrors.RECORD_NOT_FOUND",
    );
    expect(emailDiscoveryErrorKey({ code: "EndpointOutsideDomain" })).toBe(
      "campus.onboarding.email.discoveryErrors.ENDPOINT_OUTSIDE_DOMAIN",
    );
  });

  test("un code inconnu ne produit jamais une clé manquante", () => {
    expect(emailDiscoveryErrorKey({ code: "Inventé" } as never)).toBe(
      "campus.onboarding.email.discoveryErrors.DNS_UNAVAILABLE",
    );
    expect(emailDiscoveryErrorKey(null)).toBe(
      "campus.onboarding.email.discoveryErrors.DNS_UNAVAILABLE",
    );
  });
});
