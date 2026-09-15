import { beforeEach, describe, expect, test } from "bun:test";

// Bun n'expose pas `localStorage`. Un substitut minimal suffit : ce qu'on
// mesure, c'est la lecture et l'ecriture des reperes, pas le stockage du
// navigateur.
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

import {
  changesBetween,
  forgetMarkers,
  mergeMarkers,
  readSeenMarkers,
  rememberMarkers,
  whatToReload,
  type CatalogMarkers,
  type ChangeMarkers,
} from "./updates";

/**
 * La décision d'annoncer une nouveauté.
 *
 * Ce qui vaut d'être verrouillé ici n'est pas « une empreinte différente
 * signale un changement » — c'est évident — mais les deux cas où il ne faut
 * **rien** annoncer : la première observation, et une sonde qui n'a pas
 * abouti. Une annonce à tort apprend à ignorer les annonces.
 */

const markers = (packages: string | null, lessons: string | null) =>
  ({ packages, lessons }) satisfies CatalogMarkers;

describe("ce qui a changé entre deux observations", () => {
  test("la première observation n'annonce rien", () => {
    expect(changesBetween(null, markers("abc", "3"))).toEqual([]);
  });

  test("une empreinte identique n'annonce rien", () => {
    expect(changesBetween(markers("abc", "3"), markers("abc", "3"))).toEqual(
      [],
    );
  });

  test("une empreinte de packages différente annonce les packages", () => {
    expect(changesBetween(markers("abc", "3"), markers("def", "3"))).toEqual([
      "packages",
    ]);
  });

  test("le catalogue de leçons est suivi séparément", () => {
    expect(changesBetween(markers("abc", "3"), markers("abc", "4"))).toEqual([
      "lessons",
    ]);
  });

  test("les deux peuvent changer en même temps", () => {
    expect(changesBetween(markers("abc", "3"), markers("def", "4"))).toEqual([
      "packages",
      "lessons",
    ]);
  });

  test("une sonde en échec n'annonce jamais rien", () => {
    // Le serveur n'a pas répondu : on ne sait pas, on ne dit pas.
    expect(changesBetween(markers("abc", "3"), markers(null, null))).toEqual(
      [],
    );
  });
});

describe("ce qu'on retient d'une observation partielle", () => {
  test("une sonde en échec n'efface pas ce qu'on savait", () => {
    expect(mergeMarkers(markers("abc", "3"), markers(null, "4"))).toEqual(
      markers("abc", "4"),
    );
  });

  test("sans rien de connu, on ne retient que ce qu'on a vu", () => {
    expect(mergeMarkers(null, markers("abc", null))).toEqual(
      markers("abc", null),
    );
  });
});

describe("la persistance des repères", () => {
  beforeEach(() => {
    forgetMarkers();
  });

  test("un lancement sans repère connu ne compare rien", () => {
    expect(readSeenMarkers()).toBeNull();
  });

  test("les repères survivent à une fermeture de l'application", () => {
    rememberMarkers(markers("abc", "3"));
    expect(readSeenMarkers()).toEqual(markers("abc", "3"));
  });

  test("un contenu illisible ne fait pas planter le lancement", () => {
    localStorage.setItem("nova.organization.catalogMarkers.v2", "{pas du json");
    expect(readSeenMarkers()).toBeNull();
  });

  test("un repère de l'ancienne forme n'est pas comparé", () => {
    // Avant, le repère des leçons valait la version du catalogue livré (« 2 »).
    // Il intègre maintenant les réglages de l'organisation (« 2:… ») :
    // comparer les deux annoncerait une nouveauté qui n'existe pas.
    localStorage.setItem(
      "nova.organization.catalogMarkers.v1",
      JSON.stringify(markers("abc", "2")),
    );
    expect(readSeenMarkers()).toBeNull();
  });
});

/**
 * Les repères légers de `/api/organization/changes`, interrogés souvent :
 * ce qu'ils disent de recharger, et rien de plus.
 */
const changes = (
  policy_revision: number,
  packages_version: string,
  learning_version: string,
): ChangeMarkers => ({ policy_revision, packages_version, learning_version });

describe("ce qu'il faut recharger", () => {
  test("la première observation ne recharge rien : le lancement vient de tout charger", () => {
    expect(whatToReload(null, changes(1, "p", "2:a"))).toEqual([]);
  });

  test("rien n'a bougé, rien n'est rechargé", () => {
    expect(
      whatToReload(changes(1, "p", "2:a"), changes(1, "p", "2:a")),
    ).toEqual([]);
  });

  test("une policy modifiée recharge la policy", () => {
    expect(
      whatToReload(changes(1, "p", "2:a"), changes(2, "p", "2:a")),
    ).toEqual(["policy"]);
  });

  test("des packages publiés rechargent les packages", () => {
    expect(
      whatToReload(changes(1, "p", "2:a"), changes(1, "q", "2:a")),
    ).toEqual(["packages"]);
  });

  test("une leçon archivée ou rendue obligatoire recharge les leçons", () => {
    expect(
      whatToReload(changes(1, "p", "2:a"), changes(1, "p", "2:b")),
    ).toEqual(["lessons"]);
  });

  test("plusieurs changements à la fois rechargent chacun", () => {
    expect(
      whatToReload(changes(1, "p", "2:a"), changes(3, "q", "2:b")),
    ).toEqual(["policy", "packages", "lessons"]);
  });
});
