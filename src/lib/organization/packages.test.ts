import { describe, expect, test } from "bun:test";
import {
  catalogBelongsTo,
  catalogFor,
  EMPTY_CATALOG,
  mergeVocabulary,
  PACKAGE_CONTENT_SCHEMA_VERSION,
  parseOrganizationCatalog,
  personalCapabilities,
  resolveOrganizationContext,
  usablePackages,
} from "./index";
import type { CapabilityMap } from "./model";

const ORG = "org-1";

function serverPackage(overrides: Record<string, unknown> = {}) {
  return {
    id: "org_vocabulary_abc",
    package_id: "abc",
    type: "vocabulary",
    name: "Example Vocabulary",
    description: "An example.",
    version: 2,
    schema_version: PACKAGE_CONTENT_SCHEMA_VERSION,
    content_hash: "hash",
    content: { entries: [{ term: "SSO", replacement: "single sign-on" }] },
    ...overrides,
  };
}

function catalog(packages: Record<string, unknown>[] = [serverPackage()]) {
  return parseOrganizationCatalog({ packages, catalog_version: "v1" }, ORG);
}

function capabilities(overrides: Record<string, boolean> = {}): CapabilityMap {
  return {
    ...personalCapabilities(),
    writingStyles: true,
    aiSkills: true,
    organizationVocabulary: true,
    ...overrides,
  } as CapabilityMap;
}

describe("Catalog parsing", () => {
  test("reads a well-formed vocabulary package", () => {
    const parsed = catalog();
    expect(parsed.known).toBe(true);
    expect(parsed.packages).toHaveLength(1);
    const entry = parsed.packages[0];
    expect(entry.id).toBe("org_vocabulary_abc");
    expect(entry.version).toBe(2);
    expect(entry.content.type).toBe("vocabulary");
  });

  test("reads styles and AI skills", () => {
    const parsed = catalog([
      serverPackage({
        id: "org_style_a",
        package_id: "a",
        type: "style",
        content: { name: "Example", instruction: "Write plainly." },
      }),
      serverPackage({
        id: "org_ai_skill_b",
        package_id: "b",
        type: "ai_skill",
        content: {
          title: "Example",
          summary: "s",
          practice: "p",
          duration_minutes: 4,
          steps: ["one"],
        },
      }),
    ]);
    expect(parsed.packages.map((p) => p.content.type)).toEqual([
      "style",
      "ai_skill",
    ]);
  });

  test("malformed input yields an empty, unknown catalog", () => {
    for (const input of [null, undefined, "", 3, [], {}, { packages: 1 }]) {
      const parsed = parseOrganizationCatalog(input, ORG);
      expect(parsed.packages).toHaveLength(0);
      expect(parsed.known).toBe(false);
    }
  });

  test("a package with an unknown type is ignored, not guessed", () => {
    expect(
      catalog([serverPackage({ type: "marketplace" })]).packages,
    ).toHaveLength(0);
  });

  test("a newer content schema is ignored", () => {
    // Interpréter un format qu'on ne connaît pas distribuerait du contenu
    // déformé — pire que de ne rien distribuer.
    const parsed = catalog([
      serverPackage({ schema_version: PACKAGE_CONTENT_SCHEMA_VERSION + 1 }),
    ]);
    expect(parsed.packages).toHaveLength(0);
  });

  test("an incomplete package is dropped rather than half-shown", () => {
    expect(
      catalog([serverPackage({ type: "style", content: { name: "x" } })])
        .packages,
    ).toHaveLength(0);
    expect(
      catalog([serverPackage({ content: { entries: [] } })]).packages,
    ).toHaveLength(0);
  });

  test("a valid package survives an invalid neighbour", () => {
    const parsed = catalog([
      serverPackage({ type: "marketplace" }),
      serverPackage({ id: "org_vocabulary_ok", package_id: "ok" }),
    ]);
    expect(parsed.packages).toHaveLength(1);
    expect(parsed.packages[0].packageId).toBe("ok");
  });
});

describe("Tenant scoping", () => {
  test("a catalog belongs to the organization it was received for", () => {
    expect(catalogBelongsTo(catalog(), ORG)).toBe(true);
  });

  test("another organization never receives it", () => {
    // Un cache sans identité rendrait cette faute invisible.
    expect(catalogBelongsTo(catalog(), "org-2")).toBe(false);
    expect(catalogFor(catalog(), "org-2")).toBe(EMPTY_CATALOG);
  });

  test("signing out drops it", () => {
    expect(catalogFor(catalog(), null)).toBe(EMPTY_CATALOG);
  });

  test("an unknown catalog belongs nowhere", () => {
    expect(catalogBelongsTo(EMPTY_CATALOG, ORG)).toBe(false);
  });
});

describe("Policy composition", () => {
  test("a closed policy withholds the content", () => {
    const usable = usablePackages(
      catalog(),
      capabilities({ organizationVocabulary: false }),
    );
    expect(usable).toHaveLength(0);
  });

  test("an open policy delivers it", () => {
    expect(usablePackages(catalog(), capabilities())).toHaveLength(1);
  });

  test("closing one type leaves the others usable", () => {
    const parsed = catalog([
      serverPackage(),
      serverPackage({
        id: "org_style_a",
        package_id: "a",
        type: "style",
        content: { name: "Example", instruction: "Write plainly." },
      }),
    ]);
    const usable = usablePackages(
      parsed,
      capabilities({ organizationVocabulary: false }),
    );
    expect(usable).toHaveLength(1);
    expect(usable[0].content.type).toBe("style");
  });

  test("filtering by type is possible", () => {
    expect(usablePackages(catalog(), capabilities(), "style")).toHaveLength(0);
    expect(
      usablePackages(catalog(), capabilities(), "vocabulary"),
    ).toHaveLength(1);
  });

  test("is idempotent", () => {
    // Le serveur filtre déjà. Reposer la règle protège le cas d'un catalogue
    // conservé pendant qu'une policy change.
    const once = usablePackages(catalog(), capabilities());
    expect(once).toEqual(usablePackages(catalog(), capabilities()));
  });
});

describe("Identifiers", () => {
  test("an organization style cannot be mistaken for a builtin", () => {
    const parsed = catalog([
      serverPackage({
        id: "org_style_a",
        package_id: "a",
        type: "style",
        content: { name: "Example", instruction: "Write plainly." },
      }),
    ]);
    expect(parsed.packages[0].id.startsWith("org_")).toBe(true);
    expect(parsed.packages[0].id.startsWith("nova_style_")).toBe(false);
  });
});

describe("Vocabulary precedence", () => {
  const organization = [
    { term: "SSO", replacement: "single sign-on" },
    { term: "Nova", replacement: "Nova" },
  ];

  test("organization entries apply", () => {
    expect(mergeVocabulary(organization, [])).toHaveLength(2);
  });

  test("a personal entry wins on collision", () => {
    // Un membre qui a corrigé un terme l'a fait en connaissance de cause ; le
    // lui reprendre à la prochaine publication serait un contenu qui se défait
    // tout seul.
    const merged = mergeVocabulary(organization, [
      { term: "sso", replacement: "authentification unique" },
    ]);
    expect(merged).toHaveLength(2);
    expect(
      merged.find((e) => e.term.toLowerCase() === "sso")?.replacement,
    ).toBe("authentification unique");
  });

  test("personal entries are added, not substituted for the whole list", () => {
    const merged = mergeVocabulary(organization, [
      { term: "Perso", replacement: "personnel" },
    ]);
    expect(merged).toHaveLength(3);
  });
});

describe("Personal is never governed", () => {
  test("Personal carries no organization and consumes no catalog", () => {
    const context = resolveOrganizationContext({ edition: "personal" });
    expect(context.organization).toBeNull();
    // Les surfaces d'organisation restent fermées : rien à consommer.
    expect(context.capabilities.organizationVocabulary).toBe(false);
    expect(context.capabilities.organizationStyles).toBe(false);
  });

  test("a catalog has no effect without an organization", () => {
    expect(catalogFor(catalog(), null).packages).toHaveLength(0);
  });
});
