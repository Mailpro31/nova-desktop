import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { isOrganizationMode } from "@/lib/mode";
import {
  chosenEdition,
  currentEdition,
  forgetEditionChoice,
  organizationKindIntent,
  rememberEditionChoice,
  rememberOrganizationKindIntent,
  rememberOrganizationType,
  currentOrganizationType,
  forgetOrganizationType,
} from "@/lib/organization";

/**
 * Le choix d'édition ne doit rien changer pour les postes déjà déployés, et ne
 * doit jamais devenir une façon de s'attribuer une organisation.
 *
 * Les deux régressions que ces tests rendent impossibles :
 *
 * 1. un paquet Organization qui se mettrait à consulter un choix local — un
 *    poste géré verrait alors un écran de choix qu'aucune DSI n'a demandé ;
 * 2. une intention « entreprise » qui écraserait ce que le serveur annonce —
 *    c'est-à-dire un utilisateur qui se déclare lui-même le type de son
 *    organisation.
 */

const BUILD_MODE = "VITE_NOVA_MODE";
let previousBuildMode: string | undefined;

function withBuild(mode: string | undefined) {
  if (mode === undefined) delete process.env[BUILD_MODE];
  else process.env[BUILD_MODE] = mode;
}

beforeEach(() => {
  previousBuildMode = process.env[BUILD_MODE];
  forgetEditionChoice();
  forgetOrganizationType();
});

afterEach(() => {
  withBuild(previousBuildMode);
  forgetEditionChoice();
  forgetOrganizationType();
});

describe("Un paquet qui déclare son édition ne consulte jamais le choix", () => {
  test("un build Organization reste Organization malgré un choix contraire", () => {
    withBuild("campus");
    rememberEditionChoice("personal");
    expect(currentEdition()).toBe("organization");
    expect(isOrganizationMode()).toBe(true);
  });

  test("l'alias historique `organization` se comporte comme `campus`", () => {
    withBuild("organization");
    rememberEditionChoice("personal");
    expect(currentEdition()).toBe("organization");
  });

  test("un build Personal reste Personal malgré un choix contraire", () => {
    withBuild("personal");
    rememberEditionChoice("organization");
    expect(currentEdition()).toBe("personal");
    expect(isOrganizationMode()).toBe(false);
  });
});

describe("Un paquet unifié laisse le choix décider", () => {
  test("sans choix, le repli reste Personal — rien n'est contacté", () => {
    withBuild(undefined);
    expect(chosenEdition()).toBeNull();
    expect(currentEdition()).toBe("personal");
    expect(isOrganizationMode()).toBe(false);
  });

  test("un choix Organisation ouvre le chemin Organization", () => {
    withBuild(undefined);
    rememberEditionChoice("organization");
    expect(chosenEdition()).toBe("organization");
    expect(currentEdition()).toBe("organization");
    expect(isOrganizationMode()).toBe(true);
  });

  test("un choix Personnel reste personnel", () => {
    withBuild(undefined);
    rememberEditionChoice("personal");
    expect(currentEdition()).toBe("personal");
    expect(isOrganizationMode()).toBe(false);
  });

  test("le choix survit à une lecture répétée", () => {
    withBuild(undefined);
    rememberEditionChoice("organization");
    expect(currentEdition()).toBe("organization");
    expect(currentEdition()).toBe("organization");
  });

  test("l'oubli ramène au repli, jamais à l'autre édition", () => {
    withBuild(undefined);
    rememberEditionChoice("organization");
    forgetEditionChoice();
    expect(chosenEdition()).toBeNull();
    expect(currentEdition()).toBe("personal");
  });
});

describe("Campus / Entreprise est une intention, jamais une vérité", () => {
  test("aucune intention par défaut", () => {
    expect(organizationKindIntent()).toBeNull();
  });

  test("l'intention est retenue telle quelle", () => {
    rememberOrganizationKindIntent("business");
    expect(organizationKindIntent()).toBe("business");
    rememberOrganizationKindIntent("campus");
    expect(organizationKindIntent()).toBe("campus");
  });

  test("une intention entreprise ne rend pas l'organisation entreprise", () => {
    withBuild("campus");
    rememberOrganizationKindIntent("business");
    // Rien n'a été annoncé par un serveur : le repli historique s'applique,
    // et il ne dépend pas de ce que l'utilisateur a coché.
    expect(currentOrganizationType()).toBe("education");
  });

  test("le serveur écrase l'intention, dans les deux sens", () => {
    withBuild("campus");
    rememberOrganizationKindIntent("business");
    rememberOrganizationType("education");
    expect(currentOrganizationType()).toBe("education");

    rememberOrganizationKindIntent("campus");
    rememberOrganizationType("business");
    expect(currentOrganizationType()).toBe("business");
  });

  test("l'intention ne décide jamais de l'édition", () => {
    withBuild(undefined);
    rememberOrganizationKindIntent("campus");
    expect(currentEdition()).toBe("personal");
  });
});
