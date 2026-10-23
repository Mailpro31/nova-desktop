import { beforeAll, describe, expect, test } from "bun:test";
import i18next from "i18next";

import fr from "@/i18n/locales/fr/translation.json";
import { formatKeyCombination } from "./keyboard";

/**
 * Le raccourci s'affichait « ctrl_right » sur l'accueil et l'historique
 * (BUGS-A-CORRIGER n° 26) : le composant montrait la valeur brute des réglages.
 */
beforeAll(async () => {
  await i18next.init({ lng: "fr", resources: { fr: { translation: fr } } });
});

describe("formatKeyCombination", () => {
  test("a right-hand key reads in French", () => {
    expect(formatKeyCombination("ctrl_right", "windows")).toBe("Ctrl droit");
  });

  test("a combination keeps each key readable", () => {
    expect(formatKeyCombination("shift_left+space", "windows")).toBe(
      "Maj gauche + Espace",
    );
  });

  test("a function key is upper case", () => {
    expect(formatKeyCombination("f9", "windows")).toBe("F9");
  });
});
