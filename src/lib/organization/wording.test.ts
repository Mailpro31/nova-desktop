import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

/**
 * Où vit chaque texte, et non plus seulement lequel est servi.
 *
 * `wordingKey` servait déjà le neutre par défaut : le comportement était juste.
 * Le rangement, lui, disait l'inverse — la variante école occupait l'espace
 * principal `organization.*`, et le neutre vivait dans un espace annexe. Tout
 * ce qui lisait une de ces clés sans passer par la table recevait donc du
 * vocabulaire d'école, y compris dans une entreprise : six endroits le
 * faisaient.
 *
 * Désormais l'espace principal porte le défaut, et l'école est une exception
 * nommée comme telle.
 */
describe("où vit chaque texte", () => {
  test("le défaut vit dans l'espace naturel du texte", () => {
    // Chaque texte a un endroit où on le cherche : l'écran d'organisation, la
    // page AI Skills. Le défaut y vit. Un espace annexe nommé d'après le
    // mécanisme plutôt que d'après le sujet n'est l'endroit naturel de rien.
    for (const id of IDS) {
      expect(ORGANIZATION_WORDING[id].organization).not.toStartWith(
        "organizationWording.",
      );
      expect(ORGANIZATION_WORDING[id].organization).not.toStartWith(
        "educationWording.",
      );
    }
  });

  test("l'école est une exception, et elle le dit", () => {
    for (const id of IDS) {
      expect(ORGANIZATION_WORDING[id].education).toStartWith(
        "educationWording.",
      );
    }
  });

  test("l'ancien espace annexe a disparu des deux langues", () => {
    expect((en as Record<string, unknown>).organizationWording).toBeUndefined();
    expect((fr as Record<string, unknown>).organizationWording).toBeUndefined();
  });

  test("la variante école parle bien d'école, sinon la distinction ne sert à rien", () => {
    // Au moins la moitié : quelques textes sont identiques dans les deux
    // registres, et les forcer à différer produirait de la paraphrase.
    const schoolish = IDS.filter((id) =>
      SCHOOL_WORDS.test(String(lookup(fr, ORGANIZATION_WORDING[id].education))),
    );
    expect(schoolish.length).toBeGreaterThanOrEqual(IDS.length / 2);
  });
});

describe("lecture directe, sans passer par la table", () => {
  test("le premier lancement ne choisit plus le vocabulaire sur l'édition", () => {
    // `isBusinessMode()` répond faux tant que rien n'est annoncé : s'en servir
    // pour choisir les mots donnait le registre école à un tenant inconnu.
    const code = readFileSync(
      join(import.meta.dir, "../../components/onboarding/SmartSetupStep.tsx"),
      "utf-8",
    );
    // La propriété est « ne l'appelle plus », pas « ne la nomme plus » :
    // le commentaire qui explique pourquoi elle a disparu doit pouvoir la
    // citer.
    expect(code).not.toContain("isBusinessMode()");
  });
});
