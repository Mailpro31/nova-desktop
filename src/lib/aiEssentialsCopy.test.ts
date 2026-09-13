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
