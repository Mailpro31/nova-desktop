import { describe, expect, test } from "bun:test";
import {
  DEFAULT_ORGANIZATION_POLICY,
  DEFAULT_ORGANIZATION_POLICY_SETTINGS,
  isSupportedPolicySchema,
  parseOrganizationPolicy,
  POLICY_SCHEMA_VERSION,
  resolveEffectiveCapabilities,
  resolveOrganizationContext,
  type OrganizationPolicy,
} from "./index";
import type { CapabilityMap } from "./model";

function policy(
  aiSkillsEnabled: boolean,
  overrides: Partial<OrganizationPolicy> = {},
): OrganizationPolicy {
  return {
    schemaVersion: POLICY_SCHEMA_VERSION,
    revision: 1,
    settings: { ...DEFAULT_ORGANIZATION_POLICY_SETTINGS, aiSkillsEnabled },
    known: true,
    ...overrides,
  };
}

function base(capabilities: Record<string, boolean>): CapabilityMap {
  return capabilities as unknown as CapabilityMap;
}

describe("Policy defaults", () => {
  test("every default is permissive", () => {
    // La règle qui protège les installations existantes : une organisation qui
    // n'a jamais rien configuré ne perd rien le jour où les policies existent.
    for (const value of Object.values(DEFAULT_ORGANIZATION_POLICY_SETTINGS)) {
      expect(value).toBe(true);
    }
  });

  test("an unconfigured policy reports revision 0 and known: false", () => {
    expect(DEFAULT_ORGANIZATION_POLICY.revision).toBe(0);
    expect(DEFAULT_ORGANIZATION_POLICY.known).toBe(false);
  });
});

describe("Effective capability formula", () => {
  const resolve = (baseValue: boolean, policyValue: boolean) =>
    resolveEffectiveCapabilities(
      base({ aiSkills: baseValue }),
      policy(policyValue),
    ).aiSkills;

  test("base false / policy false -> false", () => {
    expect(resolve(false, false)).toBe(false);
  });

  test("base false / policy true -> false", () => {
    // Le test fondamental : une policy n'invente jamais une capacité que le
    // produit ne fournit pas.
    expect(resolve(false, true)).toBe(false);
  });

  test("base true / policy false -> false", () => {
    expect(resolve(true, false)).toBe(false);
  });

  test("base true / policy true -> true", () => {
    expect(resolve(true, true)).toBe(true);
  });

  test("leaves ungoverned capabilities untouched", () => {
    const effective = resolveEffectiveCapabilities(
      base({ dictation: true, rewrite: false, aiSkills: true }),
      policy(false),
    );
    expect(effective.dictation).toBe(true);
    expect(effective.rewrite).toBe(false);
    expect(effective.aiSkills).toBe(false);
  });

  test("never adds a capability the base does not carry", () => {
    const effective = resolveEffectiveCapabilities(base({}), policy(true));
    expect("aiSkills" in effective).toBe(false);
  });

  test("is idempotent", () => {
    // Le serveur filtre déjà ce qu'il annonce. Reposer la formule ne doit rien
    // changer, sans quoi on n'oserait pas l'appliquer deux fois.
    const once = resolveEffectiveCapabilities(
      base({ aiSkills: true }),
      policy(false),
    );
    const twice = resolveEffectiveCapabilities(once, policy(false));
    expect(twice).toEqual(once);
  });
});

describe("Every governed capability, four cases", () => {
  // Table-driven : ajouter une policy sans son quadruplet ferait echouer le
  // test de couverture ci-dessous.
  const GOVERNED: [keyof typeof DEFAULT_ORGANIZATION_POLICY_SETTINGS, string][] =
    [
      ["aiSkillsEnabled", "aiSkills"],
      ["organizationVocabularyEnabled", "organizationVocabulary"],
      ["voiceCommandsEnabled", "commands"],
      ["engineeringNotesEnabled", "engineeringNotes"],
      ["fileImportEnabled", "fileTranscription"],
    ];

  test("covers every declared policy", () => {
    expect(GOVERNED.map(([key]) => key).sort()).toEqual(
      Object.keys(DEFAULT_ORGANIZATION_POLICY_SETTINGS).sort(),
    );
  });

  for (const [key, capability] of GOVERNED) {
    const resolve = (baseValue: boolean, policyValue: boolean) =>
      resolveEffectiveCapabilities(base({ [capability]: baseValue }), {
        schemaVersion: POLICY_SCHEMA_VERSION,
        revision: 1,
        settings: {
          ...DEFAULT_ORGANIZATION_POLICY_SETTINGS,
          [key]: policyValue,
        },
        known: true,
      })[capability as keyof ReturnType<typeof base>];

    test(`${key}: base false / policy false -> false`, () => {
      expect(resolve(false, false)).toBe(false);
    });
    test(`${key}: base false / policy true -> false`, () => {
      // Une policy n'invente jamais une capacite que le produit ne fournit
      // pas — c'est aussi ce qui preserve les restrictions de mode.
      expect(resolve(false, true)).toBe(false);
    });
    test(`${key}: base true / policy false -> false`, () => {
      expect(resolve(true, false)).toBe(false);
    });
    test(`${key}: base true / policy true -> true`, () => {
      expect(resolve(true, true)).toBe(true);
    });
  }
});

describe("Mode composition", () => {
  test("a classroom restriction survives a permissive policy", () => {
    // Le mode vit dans la capacite de base : l'intersection le preserve, sans
    // qu'aucune regle de priorite n'ait a etre ecrite ni retenue.
    const classroom = base({ commands: false, engineeringNotes: false });
    const effective = resolveEffectiveCapabilities(classroom, {
      schemaVersion: POLICY_SCHEMA_VERSION,
      revision: 1,
      settings: DEFAULT_ORGANIZATION_POLICY_SETTINGS,
      known: true,
    });
    expect(effective.commands).toBe(false);
    expect(effective.engineeringNotes).toBe(false);
  });
});

describe("Policy parsing", () => {
  test("reads a well-formed document", () => {
    const parsed = parseOrganizationPolicy({
      schema_version: 1,
      revision: 4,
      settings: { ai_skills_enabled: false },
    });
    expect(parsed.known).toBe(true);
    expect(parsed.revision).toBe(4);
    expect(parsed.settings.aiSkillsEnabled).toBe(false);
  });

  test("a missing key falls back to its default", () => {
    const parsed = parseOrganizationPolicy({
      schema_version: 1,
      revision: 2,
      settings: {},
    });
    expect(parsed.settings.aiSkillsEnabled).toBe(true);
  });

  test("an unknown key is ignored", () => {
    const parsed = parseOrganizationPolicy({
      schema_version: 1,
      revision: 2,
      settings: { ai_skills_enabled: false, venu_du_futur: true },
    });
    expect(parsed.settings).toEqual({
      ...DEFAULT_ORGANIZATION_POLICY_SETTINGS,
      aiSkillsEnabled: false,
    });
  });

  test("a wrong type falls back to its default", () => {
    const parsed = parseOrganizationPolicy({
      schema_version: 1,
      revision: 2,
      settings: { ai_skills_enabled: "non" },
    });
    expect(parsed.settings.aiSkillsEnabled).toBe(true);
  });

  test("malformed input yields the permissive defaults", () => {
    for (const input of [null, undefined, "", 3, [], {}, { settings: 1 }]) {
      const parsed = parseOrganizationPolicy(input);
      expect(parsed.settings).toEqual(DEFAULT_ORGANIZATION_POLICY_SETTINGS);
      expect(parsed.known).toBe(false);
    }
  });
});

describe("Unknown schema version", () => {
  test("recognises the versions this build can read", () => {
    expect(isSupportedPolicySchema(1)).toBe(true);
    expect(isSupportedPolicySchema(POLICY_SCHEMA_VERSION + 1)).toBe(false);
    expect(isSupportedPolicySchema(0)).toBe(false);
    expect(isSupportedPolicySchema(-1)).toBe(false);
    expect(isSupportedPolicySchema("1")).toBe(false);
    expect(isSupportedPolicySchema(1.5)).toBe(false);
    expect(isSupportedPolicySchema(undefined)).toBe(false);
  });

  test("a newer schema is not guessed at", () => {
    // Interpréter des règles écrites selon un schéma inconnu reviendrait à
    // appliquer une gouvernance imaginaire.
    const parsed = parseOrganizationPolicy({
      schema_version: POLICY_SCHEMA_VERSION + 1,
      revision: 9,
      settings: { ai_skills_enabled: false },
    });
    expect(parsed.known).toBe(false);
    expect(parsed.settings).toEqual(DEFAULT_ORGANIZATION_POLICY_SETTINGS);
  });
});

describe("Personal is never governed", () => {
  test("a policy has no effect on Personal", () => {
    const withPolicy = resolveOrganizationContext({
      edition: "personal",
      policy: policy(false),
    });
    const without = resolveOrganizationContext({ edition: "personal" });
    expect(withPolicy.capabilities).toEqual(without.capabilities);
  });

  test("Personal carries no organization and no member", () => {
    const context = resolveOrganizationContext({
      edition: "personal",
      policy: policy(false),
    });
    expect(context.organization).toBeNull();
    expect(context.member).toBeNull();
  });
});

describe("Organization context", () => {
  const campus = {
    edition: "organization" as const,
    organizationType: "education" as const,
    server: {
      organizationId: "org-1",
      organizationType: "education" as const,
      capabilities: ["aiSkills", "dictionary"],
      memberType: null,
      securityRole: null,
      groups: [],
      status: null,
      email: null,
      userId: null,
    },
  };

  test("without a policy, nothing is lost", () => {
    // La régression qui compte : une organisation qui n'a rien configuré doit
    // se comporter exactement comme avant la Phase 29.
    const withoutPolicy = resolveOrganizationContext(campus);
    const withDefaults = resolveOrganizationContext({
      ...campus,
      policy: DEFAULT_ORGANIZATION_POLICY,
    });
    expect(withoutPolicy.capabilities.aiSkills).toBe(true);
    expect(withDefaults.capabilities).toEqual(withoutPolicy.capabilities);
  });

  test("a denying policy closes the capability", () => {
    const context = resolveOrganizationContext({
      ...campus,
      policy: policy(false),
    });
    expect(context.capabilities.aiSkills).toBe(false);
  });

  test("an allowing policy leaves the capability open", () => {
    const context = resolveOrganizationContext({
      ...campus,
      policy: policy(true),
    });
    expect(context.capabilities.aiSkills).toBe(true);
  });

  test("a policy cannot reopen what the server withheld", () => {
    const context = resolveOrganizationContext({
      ...campus,
      server: { ...campus.server, capabilities: ["dictionary"] },
      policy: policy(true),
    });
    expect(context.capabilities.aiSkills).toBe(false);
  });

  test("a policy never touches Nova Core capabilities", () => {
    const context = resolveOrganizationContext({
      ...campus,
      policy: policy(false),
    });
    expect(context.capabilities.dictation).toBe(true);
    expect(context.capabilities.localFallback).toBe(true);
  });
});
