import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

/**
 * La présentation du cours AI Essentials dit vrai, dans chaque langue.
 *
 * Elle annonçait « Five short modules » (« Cinq modules courts ») alors que le
 * cours en compte six, et vingt langues affichaient ce texte en anglais. Elle ne
 * donne plus de nombre — la progression (« 0 of 6 modules completed ») le fait
 * déjà, à partir du cours lui-même — et chaque langue a sa traduction.
 */

const LOCALES_DIR = "src/i18n/locales";

function description(locale: string): string {
  const translation = JSON.parse(
    readFileSync(`${LOCALES_DIR}/${locale}/translation.json`, "utf8"),
  ) as { campus: { aiSkills: { description: string } } };
  return translation.campus.aiSkills.description;
}

const LOCALES = readdirSync(LOCALES_DIR);
const ENGLISH = description("en");

describe("AI Essentials description", () => {
  test("toutes les langues sont présentes", () => {
    expect(LOCALES).toHaveLength(22);
  });

  for (const locale of LOCALES) {
    test(`${locale} : n'annonce aucun nombre de modules`, () => {
      const text = description(locale);
      expect(text).not.toMatch(/\d/);
      expect(text).not.toMatch(/\bfive\b|\bcinq\b/i);
    });
  }

  for (const locale of LOCALES.filter((name) => name !== "en")) {
    test(`${locale} : est traduite, pas recopiée de l'anglais`, () => {
      expect(description(locale)).not.toBe(ENGLISH);
    });
  }
});

/**
 * Le reste du cours — titres, questions, réponses, explications, libellés —
 * s'affichait lui aussi en anglais dans vingt langues. Chaque texte a
 * désormais sa traduction, et garde les variables que l'écran remplit.
 */

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tree).flatMap(([key, value]) =>
      typeof value === "string"
        ? [[`${prefix}${key}`, value]]
        : Object.entries(flatten(value, `${prefix}${key}.`)),
    ),
  );
}

function course(locale: string): Record<string, string> {
  const { campus } = JSON.parse(
    readFileSync(`${LOCALES_DIR}/${locale}/translation.json`, "utf8"),
  ) as { campus: { aiCurriculum: Tree; aiSkills: Tree } };
  return {
    ...flatten(campus.aiCurriculum, "campus.aiCurriculum."),
    ...flatten(campus.aiSkills, "campus.aiSkills."),
  };
}

/** Textes qu'une traduction peut légitimement écrire comme l'anglais. */
const SAME_AS_ENGLISH: Record<string, string[]> = {
  fr: ["campus.aiCurriculum.correct"],
};

function placeholders(text: string): string[] {
  return (text.match(/\{\{\s*\w+\s*\}\}/g) ?? []).map((token) =>
    token.replace(/\s/g, ""),
  );
}

const ENGLISH_COURSE = course("en");

describe("AI Essentials course", () => {
  test("le cours anglais a bien ses textes", () => {
    expect(Object.keys(ENGLISH_COURSE).length).toBeGreaterThan(80);
  });

  for (const locale of LOCALES.filter((name) => name !== "en")) {
    test(`${locale} : chaque texte du cours est traduit`, () => {
      const translated = course(locale);
      const allowed = SAME_AS_ENGLISH[locale] ?? [];
      const untranslated = Object.keys(ENGLISH_COURSE).filter(
        (key) =>
          translated[key] === ENGLISH_COURSE[key] && !allowed.includes(key),
      );
      expect(untranslated).toEqual([]);
    });
  }

  for (const locale of LOCALES) {
    test(`${locale} : chaque texte garde ses variables`, () => {
      const translated = course(locale);
      const broken = Object.keys(ENGLISH_COURSE).filter(
        (key) =>
          JSON.stringify(placeholders(translated[key] ?? "").sort()) !==
          JSON.stringify(placeholders(ENGLISH_COURSE[key]).sort()),
      );
      expect(broken).toEqual([]);
    });
  }
});
