import { describe, expect, test } from "bun:test";

import en from "@/i18n/locales/en/translation.json";
import fr from "@/i18n/locales/fr/translation.json";
import { homeEngineLabelKey } from "./engineLabel";

/**
 * La rangée « Moteur » de l'accueil.
 *
 * Mesuré en démonstration le 29/09 : elle affichait la clé brute
 * `home.engine.campus`. La clé de traduction avait été renommée, le code non,
 * et rien ne vérifiait que la clé demandée existait. Ce test le vérifie.
 */

function lookup(dictionary: unknown, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[part]
          : undefined,
      dictionary,
    );
}

const ENGINES = ["campus", "local-fallback", "local"] as const;
const TYPES = ["education", "business", null] as const;

describe("la rangée Moteur de l'accueil", () => {
  test("une école lit le serveur de son établissement", () => {
    expect(homeEngineLabelKey("campus", "education")).toBe(
      "educationWording.engineServer",
    );
  });

  test("toute autre organisation lit un libellé neutre", () => {
    expect(homeEngineLabelKey("campus", "business")).toBe(
      "home.engine.organization",
    );
    expect(homeEngineLabelKey("campus", null)).toBe("home.engine.organization");
  });

  test("le moteur local se dit pareil partout", () => {
    expect(homeEngineLabelKey("local", "education")).toBe("home.engine.local");
    expect(homeEngineLabelKey("local-fallback", null)).toBe(
      "home.engine.local-fallback",
    );
  });

  test("chaque libellé existe, en anglais comme en français", () => {
    for (const engine of ENGINES) {
      for (const type of TYPES) {
        const key = homeEngineLabelKey(engine, type);
        expect(typeof lookup(en, key)).toBe("string");
        expect(typeof lookup(fr, key)).toBe("string");
      }
    }
  });
});
