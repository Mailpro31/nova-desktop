import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

import { flatten, reviewLanguage } from "@/lib/i18n/review";

/**
 * Les 21 traductions, relues contre l'anglais à chaque modification.
 *
 * Mesuré sur `main` : l'arabe traduisait « {{model}} Settings » sans la
 * variable, et le titre des réglages de modèle perdait le nom du modèle. Aucun
 * contrôle ne le voyait — `check:translations` ne compare que les clés.
 */

const LOCALES = "src/i18n/locales";

const load = (locale: string) =>
  flatten(
    JSON.parse(readFileSync(`${LOCALES}/${locale}/translation.json`, "utf8")),
  );

describe("translation review", () => {
  test("no language breaks a placeholder or a tag, or leaves a text empty", () => {
    const english = load("en");
    const broken: Record<string, string[]> = {};
    for (const locale of readdirSync(LOCALES).filter((name) => name !== "en")) {
      const errors = reviewLanguage(english, load(locale), new Set()).errors;
      if (errors.length > 0) {
        broken[locale] = errors.map((error) => `${error.kind}:${error.key}`);
      }
    }
    expect(broken).toEqual({});
  });
});
