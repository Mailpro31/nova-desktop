import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

/**
 * Les textes du cours AI Essentials — titres, questions, réponses,
 * explications, libellés — s'affichaient en anglais dans vingt langues. Chaque
 * texte a désormais sa traduction, et garde les variables que l'écran remplit.
 *
 * La présentation du cours (sa description, sa progression « 0 of 6 modules
 * completed ») vivait dans Apprendre. Ses modules y sont devenus des leçons du
 * catalogue : ces textes ont été retirés, et ne sont donc plus vérifiés ici.
 */

const LOCALES_DIR = "src/i18n/locales";
const LOCALES = readdirSync(LOCALES_DIR);

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
  test("toutes les langues sont présentes", () => {
    expect(LOCALES).toHaveLength(22);
  });

  test("le cours anglais a bien ses textes", () => {
    // 67 textes affichés par le cours au premier lancement. Le seuil était 80
    // tant que les 13 textes de sa présentation dans Apprendre (description,
    // progression, niveaux, boutons) existaient ; ils ont été retirés avec elle.
    expect(Object.keys(ENGLISH_COURSE).length).toBeGreaterThanOrEqual(67);
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
