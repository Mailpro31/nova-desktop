import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

import { NOTE_TYPES, structuredNotesEngine } from "./structuredNotes";

/**
 * « Notes structurées » remplace l'onglet « Notes d'ingénierie » de Réglages.
 *
 * L'outil ne servait qu'un métier et vivait caché dans Réglages. Il devient une
 * catégorie de la barre latérale, juste après Prompts, pour tout le monde : on
 * choisit un type de note, on colle ou dicte du brut, Nova le range. Un exemple
 * avant/après reste affiché en permanence pour qu'on sache s'en servir.
 */

const read = (path: string) => readFileSync(path, "utf8");

type Tree = { [key: string]: string | Tree };

function value(locale: string, path: string): string | undefined {
  let node: string | Tree | undefined = JSON.parse(
    read(`src/i18n/locales/${locale}/translation.json`),
  ) as Tree;
  for (const part of path.split(".")) {
    node = typeof node === "object" ? node[part] : undefined;
  }
  return typeof node === "string" ? node : undefined;
}

describe("types de notes", () => {
  test("cinq types, dans l'ordre du sélecteur", () => {
    expect([...NOTE_TYPES]).toEqual([
      "meeting",
      "lecture",
      "observation",
      "ideas",
      "free",
    ]);
  });
});

describe("moteur utilisé", () => {
  test("une organisation passe par son serveur quand elle ouvre la fonction", () => {
    expect(
      structuredNotesEngine({
        organizationMode: true,
        signedIn: true,
        capabilityOpen: true,
      }),
    ).toBe("organization");
  });

  test("une organisation qui ferme la fonction ne la propose pas", () => {
    expect(
      structuredNotesEngine({
        organizationMode: true,
        signedIn: true,
        capabilityOpen: false,
      }),
    ).toBe("unavailable");
  });

  test("sans session d'organisation, rien n'est envoyé", () => {
    expect(
      structuredNotesEngine({
        organizationMode: true,
        signedIn: false,
        capabilityOpen: true,
      }),
    ).toBe("unavailable");
  });

  test("Nova Personal utilise le moteur de réécriture choisi", () => {
    expect(
      structuredNotesEngine({
        organizationMode: false,
        signedIn: false,
        capabilityOpen: false,
      }),
    ).toBe("personal");
  });
});

describe("navigation", () => {
  const sidebar = read("src/components/Sidebar.tsx");

  test("la catégorie suit Prompts dans la barre d'organisation", () => {
    const primary = sidebar.slice(
      sidebar.indexOf("const ORGANIZATION_PRIMARY"),
    );
    const list = primary.slice(0, primary.indexOf("];"));
    expect(list.indexOf('"notes"')).toBeGreaterThan(list.indexOf('"prompts"'));
    expect(list.indexOf('"notes"')).toBeLessThan(list.indexOf('"history"'));
  });

  test("la catégorie suit Prompts dans la barre Personal", () => {
    expect(sidebar.indexOf("\n  notes: {")).toBeGreaterThan(
      sidebar.indexOf("\n  prompts: {"),
    );
    expect(sidebar.indexOf("\n  notes: {")).toBeLessThan(
      sidebar.indexOf("\n  meeting: {"),
    );
  });

  test("une organisation qui ferme la fonction la retire de la barre", () => {
    expect(sidebar).toContain('useCapability("engineeringNotes")');
  });

  test("Réglages n'a plus d'onglet de notes", () => {
    const settings = read(
      "src/components/settings/configuration/ConfigurationSettings.tsx",
    );
    expect(settings).not.toContain("engineeringNotes");
    expect(settings).not.toContain("CampusEngineeringNotes");
  });

  test("l'exemple avant/après est toujours affiché", () => {
    const page = read(
      "src/components/settings/notes/StructuredNotesSettings.tsx",
    );
    expect(page).toContain("structuredNotes.exampleTitle");
    expect(page).toContain("structuredNotes.examples.");
  });
});

describe("textes", () => {
  const locales = readdirSync("src/i18n/locales");
  const keys = [
    "sidebar.structuredNotes",
    "structuredNotes.title",
    "structuredNotes.subtitle",
    "structuredNotes.typeLabel",
    "structuredNotes.inputPlaceholder",
    "structuredNotes.instructionPlaceholder",
    "structuredNotes.action",
    "structuredNotes.working",
    "structuredNotes.result",
    "structuredNotes.copied",
    "structuredNotes.error",
    "structuredNotes.unavailable",
    "structuredNotes.exampleTitle",
    "structuredNotes.exampleBefore",
    "structuredNotes.exampleAfter",
    ...NOTE_TYPES.flatMap((type) => [
      `structuredNotes.types.${type}`,
      `structuredNotes.examples.${type}.before`,
      `structuredNotes.examples.${type}.after`,
    ]),
  ];

  test("les 22 langues ont chaque texte", () => {
    expect(locales).toHaveLength(22);
    for (const locale of locales) {
      const missing = keys.filter((key) => !value(locale, key)?.trim());
      expect({ locale, missing }).toEqual({ locale, missing: [] });
    }
  });

  test("chaque langue est traduite, pas recopiée de l'anglais", () => {
    for (const locale of locales.filter((name) => name !== "en")) {
      expect({
        locale,
        same:
          value(locale, "structuredNotes.subtitle") ===
          value("en", "structuredNotes.subtitle"),
      }).toEqual({ locale, same: false });
    }
  });

  test("le nom grand public est « Notes structurées » en français", () => {
    expect(value("fr", "structuredNotes.title")).toBe("Notes structurées");
    expect(value("fr", "sidebar.structuredNotes")).toBe("Notes structurées");
  });

  test("les anciens textes « Notes d'ingénierie » ont disparu", () => {
    expect(value("en", "campus.engineeringNotes.title")).toBeUndefined();
  });
});
