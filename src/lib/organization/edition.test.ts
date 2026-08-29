import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { resolveCampusContext } from "@/lib/campusPolicy";
import type { CampusConfig } from "@/lib/campusSession";
import { isBusinessMode, isCampusMode, isOrganizationMode } from "@/lib/mode";
import {
  currentEdition,
  currentOrganizationType,
  forgetOrganizationType,
  parseServerIdentity,
  rememberOrganizationType,
  resolveOrganizationContext,
} from "@/lib/organization";

/**
 * Les trois configurations que Nova doit servir, et qu'on ne peut pas se
 * contenter de raisonner : Personal, Organization/éducation, Organization/
 * entreprise.
 *
 * La régression que ces tests rendent impossible est précise : tant que la
 * nature de l'organisation était codée en dur à `education`, un poste
 * d'entreprise sortait du chemin Organization et retombait dans l'expérience
 * personnelle — sans organisation, sans policy, sans catalogue.
 */

const BUILD_MODE = "VITE_NOVA_MODE";

function withBuild(mode: string | undefined) {
  if (mode === undefined) delete process.env[BUILD_MODE];
  else process.env[BUILD_MODE] = mode;
}

let previousBuildMode: string | undefined;

beforeEach(() => {
  previousBuildMode = process.env[BUILD_MODE];
  forgetOrganizationType();
});

afterEach(() => {
  withBuild(previousBuildMode);
  forgetOrganizationType();
});

describe("Édition déclarée par le build", () => {
  test("aucun mode déclaré signifie Personal", () => {
    withBuild(undefined);
    expect(currentEdition()).toBe("personal");
    expect(isOrganizationMode()).toBe(false);
  });

  test("`campus` reste l'alias historique d'Organization", () => {
    // Les paquets signés et la CI Windows validée emploient cette valeur.
    withBuild("campus");
    expect(currentEdition()).toBe("organization");
    expect(isOrganizationMode()).toBe(true);
  });

  test("`organization` est la valeur cible, et désigne le même produit", () => {
    withBuild("organization");
    expect(currentEdition()).toBe("organization");
    expect(isOrganizationMode()).toBe(true);
  });

  test("une valeur inconnue ne fait entrer personne dans une organisation", () => {
    withBuild("business");
    expect(currentEdition()).toBe("personal");
    expect(isOrganizationMode()).toBe(false);
  });
});

describe("Nature de l'organisation", () => {
  test("Personal n'a pas de nature d'organisation", () => {
    withBuild(undefined);
    rememberOrganizationType("business");
    // Même mémorisée, la nature ne fabrique pas d'organisation : un poste
    // personnel reste personnel.
    expect(currentOrganizationType()).toBeNull();
    expect(isCampusMode()).toBe(false);
    expect(isBusinessMode()).toBe(false);
  });

  test("sans annonce, le repli est éducation — le parc déployé", () => {
    withBuild("campus");
    expect(currentOrganizationType()).toBe("education");
    expect(isCampusMode()).toBe(true);
    expect(isBusinessMode()).toBe(false);
  });

  test("le serveur fait basculer le poste en entreprise", () => {
    withBuild("campus");
    rememberOrganizationType("business");
    expect(currentOrganizationType()).toBe("business");
    expect(isBusinessMode()).toBe(true);
    // Le point qui compte : une entreprise n'est pas un établissement…
    expect(isCampusMode()).toBe(false);
    // …et n'est surtout pas un poste personnel.
    expect(isOrganizationMode()).toBe(true);
  });

  test("une valeur inconnue n'efface pas ce que le serveur avait dit", () => {
    withBuild("campus");
    rememberOrganizationType("business");
    for (const noise of [null, undefined, "", "entreprise", "school"]) {
      rememberOrganizationType(noise);
      expect(currentOrganizationType()).toBe("business");
    }
  });

  test("la déconnexion oublie la nature du tenant", () => {
    withBuild("campus");
    rememberOrganizationType("business");
    forgetOrganizationType();
    expect(currentOrganizationType()).toBe("education");
  });

  test("`/api/me` est l'autorité, et le poste ne fait que la relire", () => {
    withBuild("campus");
    const identity = parseServerIdentity({
      email: "salarie@example.com",
      role: "employee",
      cohort: "",
      contract_version: 2,
      organization_id: "tenant-acme",
      organization_type: "business",
    });
    rememberOrganizationType(identity?.organizationType);
    expect(currentOrganizationType()).toBe("business");
  });
});

describe("Contexte d'organisation résolu", () => {
  function config(): CampusConfig {
    return {
      server_url: "https://nova.exemple.test",
      organization: {
        id: "acme",
        name: "Acme Industries",
        shortName: "Acme",
        managed: true,
      },
    };
  }

  test("une entreprise reste sur le chemin Organization", () => {
    const context = resolveOrganizationContext({
      edition: "organization",
      organizationType: "business",
      campus: resolveCampusContext(config(), {
        email: "salarie@example.com",
        role: "employee",
        cohort: "",
      }),
    });

    expect(context.edition).toBe("organization");
    expect(context.organization?.type).toBe("business");
    expect(context.organization?.displayName).toBe("Acme Industries");
    expect(context.member?.memberType).toBe("employee");
    // Le Nova Core reste ouvert : Business n'est pas une édition amoindrie.
    expect(context.capabilities.dictation).toBe(true);
    expect(context.capabilities.personalStyles).toBe(true);
    expect(context.capabilities.localFallback).toBe(true);
  });

  test("un établissement reste un établissement", () => {
    const context = resolveOrganizationContext({
      edition: "organization",
      organizationType: "education",
      campus: resolveCampusContext(config(), {
        email: "etudiant@example.com",
        role: "student",
        cohort: "AERO2",
      }),
    });

    expect(context.organization?.type).toBe("education");
    expect(context.member?.memberType).toBe("student");
    expect(context.member?.groups[0]?.label).toBe("AERO2");
  });

  test("Personal ne fabrique jamais d'organisation", () => {
    const context = resolveOrganizationContext({ edition: "personal" });
    expect(context.organization).toBeNull();
    expect(context.member).toBeNull();
  });

  test("le type annoncé par le serveur prime sur celui du build", () => {
    const context = resolveOrganizationContext({
      edition: "organization",
      // Ce que le poste supposait…
      organizationType: "education",
      campus: resolveCampusContext(config()),
      // …et ce que le serveur affirme.
      server: parseServerIdentity({
        email: "salarie@example.com",
        role: "manager",
        cohort: "",
        contract_version: 2,
        organization_id: "tenant-acme",
        organization_type: "business",
        membership: {
          member_type: "manager",
          security_role: "member",
          groups: [],
          status: "active",
        },
      }),
    });

    expect(context.organization?.type).toBe("business");
    expect(context.organization?.id).toBe("tenant-acme");
  });

  test("un métier d'encadrement n'accorde aucun droit d'administration", () => {
    const context = resolveOrganizationContext({
      edition: "organization",
      organizationType: "business",
      campus: resolveCampusContext(config(), {
        email: "responsable@example.com",
        role: "manager",
        cohort: "",
      }),
    });

    expect(context.member?.memberType).toBe("manager");
    expect(context.member?.securityRole).toBe("member");
  });
});
