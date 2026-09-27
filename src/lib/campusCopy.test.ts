import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Les textes Organization affichés par l'application sont traduits.
 *
 * Mesuré sur toutes les langues : les textes `campus.*` du premier lancement,
 * de la connexion et du compte restaient en anglais dans vingt langues. Le test
 * ne regarde que les clés **que le code affiche réellement** — une clé que plus
 * aucun écran n'utilise n'a pas à être traduite pour être correcte.
 */

const LOCALES_DIR = "src/i18n/locales";
const SOURCE_DIR = "src";

/** Sections couvertes. Chaque PR de traduction ajoute les siennes. */
const SECTIONS = [
  "onboarding",
  "account",
  "microsoft",
  "errors",
  "sessionExpired",
  "sessionExpiredTitle",
  "serverUnreachableTitle",
  "managedBy",
  "settings",
  "styles",
  "dictionary",
  "snippets",
  "formatting",
  "files",
  "personalization",
];

/** Noms propres, identiques dans toutes les langues. */
const PRODUCT_NAMES = new Set([
  "campus.onboarding.label",
  "campus.onboarding.lab.productName",
]);

/** Mots qu'une langue écrit légitimement comme l'anglais. */
const SAME_AS_ENGLISH: Record<string, string[]> = {
  fr: ["campus.account.access"],
  sv: ["campus.account.access"],
};

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tree).flatMap(([key, value]) =>
      typeof value === "string"
        ? [[`${prefix}${key}`, value]]
        : Object.entries(flatten(value, `${prefix}${key}.`)),
    ),
  );
}

function translation(locale: string): Record<string, string> {
  return flatten(
    JSON.parse(
      readFileSync(`${LOCALES_DIR}/${locale}/translation.json`, "utf8"),
    ) as Tree,
  );
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return path.includes("i18n") ? [] : sourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)
      ? [path]
      : [];
  });
}

const SOURCE = sourceFiles(SOURCE_DIR)
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");
const LITERAL_KEYS = new Set(SOURCE.match(/campus\.[A-Za-z0-9_.-]+/g) ?? []);
const DYNAMIC_PREFIXES = [
  ...new Set(
    (SOURCE.match(/campus\.[A-Za-z0-9_.-]*\$\{/g) ?? []).map((match) =>
      match.slice(0, -2),
    ),
  ),
];

function displayed(key: string): boolean {
  return (
    LITERAL_KEYS.has(key) ||
    DYNAMIC_PREFIXES.some((prefix) => key.startsWith(prefix))
  );
}

function placeholders(text: string): string {
  return JSON.stringify(
    (text.match(/\{\{\s*\w+\s*\}\}/g) ?? [])
      .map((token) => token.replace(/\s/g, ""))
      .sort(),
  );
}

const ENGLISH = translation("en");
const KEYS = Object.keys(ENGLISH).filter(
  (key) =>
    SECTIONS.includes(key.split(".")[1] ?? "") &&
    key.startsWith("campus.") &&
    displayed(key),
);
const LOCALES = readdirSync(LOCALES_DIR);

describe("campus copy", () => {
  test("les sections couvertes ont des textes affichés", () => {
    expect(LOCALES).toHaveLength(22);
    expect(KEYS.length).toBeGreaterThan(70);
  });

  for (const locale of LOCALES.filter((name) => name !== "en")) {
    test(`${locale} : chaque texte affiché est traduit`, () => {
      const translated = translation(locale);
      const allowed = SAME_AS_ENGLISH[locale] ?? [];
      const untranslated = KEYS.filter(
        (key) =>
          !PRODUCT_NAMES.has(key) &&
          !allowed.includes(key) &&
          translated[key] === ENGLISH[key],
      );
      expect(untranslated).toEqual([]);
    });

    test(`${locale} : chaque texte garde ses variables`, () => {
      const translated = translation(locale);
      const broken = KEYS.filter(
        (key) =>
          placeholders(translated[key] ?? "") !== placeholders(ENGLISH[key]),
      );
      expect(broken).toEqual([]);
    });
  }
});
