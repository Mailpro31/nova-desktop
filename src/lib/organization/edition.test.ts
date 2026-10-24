import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { resolveOrganizationConfig } from "@/lib/organizationConfig";
import type { OrganizationConfig } from "@/lib/organizationSession";
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

describe("Édition", () => {
  test("Nova n'a qu'une édition, Organization, quel que soit le build", () => {
    for (const mode of [
      undefined,
      "campus",
      "organization",
      "personal",
      "business",
    ]) {
      withBuild(mode);
      expect(currentEdition()).toBe("organization");
      expect(isOrganizationMode()).toBe(true);
    }
  });
});

describe("Nature de l'organisation", () => {
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
  function config(): OrganizationConfig {
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
      campus: resolveOrganizationConfig(config(), {
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
      campus: resolveOrganizationConfig(config(), {
        email: "etudiant@example.com",
        role: "student",
        cohort: "AERO2",
      }),
    });

    expect(context.organization?.type).toBe("education");
    expect(context.member?.memberType).toBe("student");
    expect(context.member?.groups[0]?.label).toBe("AERO2");
  });

  test("le type annoncé par le serveur prime sur celui du build", () => {
    const context = resolveOrganizationContext({
      edition: "organization",
      // Ce que le poste supposait…
      organizationType: "education",
      campus: resolveOrganizationConfig(config()),
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
      campus: resolveOrganizationConfig(config(), {
        email: "responsable@example.com",
        role: "manager",
        cohort: "",
      }),
    });

    expect(context.member?.memberType).toBe("manager");
    expect(context.member?.securityRole).toBe("member");
  });
});
