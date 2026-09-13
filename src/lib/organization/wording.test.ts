import { describe, expect, test } from "bun:test";

import en from "@/i18n/locales/en/translation.json";
import fr from "@/i18n/locales/fr/translation.json";
import {
  announcedTypeFrom,
  ORGANIZATION_WORDING,
  wordingKey,
  type WordingId,
} from "./wording";

/**
 * Le vocabulaire d'une organisation suit ce que son serveur a annoncé.
 *
 * Une école peut parler de Campus et d'établissement ; une entreprise, ou un
 * serveur qui ne s'est pas encore identifié, lit un vocabulaire neutre. Le poste
 * ne devine rien : ni préférence locale, ni repli sur « éducation ».
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

/** Ce qu'un texte neutre ne doit jamais dire, en anglais comme en français. */
const SCHOOL_WORDS =
  /campus|institution|school|academic|établissement|école|académique/i;

const IDS = Object.keys(ORGANIZATION_WORDING) as WordingId[];

describe("nature annoncée par le serveur", () => {
  test("/api/me l'emporte sur /api/config", () => {
    expect(announcedTypeFrom("business", "education")).toBe("business");
  });

  test("/api/config suffit tant que /api/me n'a rien dit", () => {
    expect(announcedTypeFrom(null, "education")).toBe("education");
    expect(announcedTypeFrom(undefined, "business")).toBe("business");
  });

  test("rien d'annoncé : aucune nature, et surtout pas Campus par défaut", () => {
    expect(announcedTypeFrom(null, null)).toBeNull();
    expect(announcedTypeFrom(undefined, undefined)).toBeNull();
    expect(announcedTypeFrom("school", "")).toBeNull();
  });
});

describe("clé de vocabulaire", () => {
  test("une école garde le vocabulaire Campus", () => {
    for (const id of IDS) {
      expect(wordingKey(id, "education")).toBe(
        ORGANIZATION_WORDING[id].education,
      );
    }
  });

  test("une entreprise et un serveur muet reçoivent le vocabulaire neutre", () => {
    for (const id of IDS) {
      expect(wordingKey(id, "business")).toBe(
        ORGANIZATION_WORDING[id].organization,
      );
      expect(wordingKey(id, null)).toBe(ORGANIZATION_WORDING[id].organization);
    }
  });

  test("chaque clé existe en anglais et en français", () => {
    for (const id of IDS) {
      for (const key of [
        ORGANIZATION_WORDING[id].education,
        ORGANIZATION_WORDING[id].organization,
      ]) {
        expect(typeof lookup(en, key)).toBe("string");
        expect(typeof lookup(fr, key)).toBe("string");
      }
    }
  });

  test("le vocabulaire neutre ne parle jamais d'école", () => {
    for (const id of IDS) {
      const key = ORGANIZATION_WORDING[id].organization;
      expect(String(lookup(en, key))).not.toMatch(SCHOOL_WORDS);
      expect(String(lookup(fr, key))).not.toMatch(SCHOOL_WORDS);
    }
  });
});
