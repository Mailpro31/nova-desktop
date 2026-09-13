import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

/**
 * Les textes visibles autour des outils d'organisation sont traduits.
 *
 * Vérifiés à l'écran en allemand, népalais, vietnamien, russe et arabe : le
 * bouton « Continue later » d'un module AI Essentials, l'onglet et l'écran
 * « Engineering Notes » et l'onglet « Personalization » de Réglages restaient
 * en anglais dans vingt langues.
 */

const LOCALES_DIR = "src/i18n/locales";

const KEYS = [
  "sidebar.personalization",
  "campus.firstRun.continueLater",
  "campus.firstRun.useNovaNow",
  "campus.engineeringNotes.title",
  "campus.engineeringNotes.description",
  "campus.engineeringNotes.inputPlaceholder",
  "campus.engineeringNotes.instructionPlaceholder",
  "campus.engineeringNotes.action",
  "campus.engineeringNotes.working",
  "campus.engineeringNotes.result",
  "campus.engineeringNotes.copied",
  "campus.engineeringNotes.error",
];

function translation(locale: string): unknown {
  return JSON.parse(
    readFileSync(`${LOCALES_DIR}/${locale}/translation.json`, "utf8"),
  );
}

function lookup(tree: unknown, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[part]
          : undefined,
      tree,
    );
}

const ENGLISH = translation("en");
const LOCALES = readdirSync(LOCALES_DIR);

describe("organization tools copy", () => {
  test("toutes les langues sont présentes, et l'anglais a chaque texte", () => {
    expect(LOCALES).toHaveLength(22);
    for (const key of KEYS) {
      expect(typeof lookup(ENGLISH, key)).toBe("string");
    }
  });

  for (const locale of LOCALES.filter((name) => name !== "en")) {
    test(`${locale} : chaque texte est traduit`, () => {
      const translated = translation(locale);
      const untranslated = KEYS.filter(
        (key) =>
          typeof lookup(translated, key) !== "string" ||
          lookup(translated, key) === lookup(ENGLISH, key),
      );
      expect(untranslated).toEqual([]);
    });
  }
});
