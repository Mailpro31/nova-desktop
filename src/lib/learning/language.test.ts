import { describe, expect, test } from "bun:test";

import { catalogLanguageDiffers } from "./language";

/**
 * Les leçons du serveur sont écrites dans une seule langue (`locale` du
 * catalogue). Quand elle diffère de celle de l'interface, la page le dit, au
 * lieu de montrer de l'anglais sans explication dans une interface française.
 */
describe("langue du catalogue et langue de l'interface", () => {
  test("un catalogue anglais dans une interface française est signalé", () => {
    expect(catalogLanguageDiffers("en", "fr")).toBe(true);
  });

  test("seule la langue compte, pas la région", () => {
    expect(catalogLanguageDiffers("en", "en-US")).toBe(false);
    expect(catalogLanguageDiffers("fr-FR", "fr")).toBe(false);
    expect(catalogLanguageDiffers("zh", "zh-TW")).toBe(false);
  });

  test("la casse ne compte pas", () => {
    expect(catalogLanguageDiffers("EN", "en")).toBe(false);
  });

  test("un catalogue sans langue déclarée n'affiche aucun avertissement", () => {
    expect(catalogLanguageDiffers("", "fr")).toBe(false);
    expect(catalogLanguageDiffers("   ", "fr")).toBe(false);
  });
});
