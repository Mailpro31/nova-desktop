import { describe, expect, test } from "bun:test";

import {
  applyReadingComfort,
  DEFAULT_READING_COMFORT,
  parseReadingComfort,
  readingComfortStyle,
} from "./readingComfort";

/**
 * Les réglages de lecture d'un élève dys.
 *
 * Seuls ceux dont l'effet est établi : la taille du texte, et l'espacement des
 * lettres, des mots et des lignes. Le niveau le plus large reprend les valeurs
 * du critère WCAG 1.4.12 — celles qu'une interface doit supporter sans rien
 * perdre.
 */

describe("lecture des réglages enregistrés", () => {
  test("rien d'enregistré, ou un contenu abîmé : les réglages d'origine", () => {
    for (const raw of [null, undefined, "", "pas du json", 42, [], "{}"]) {
      expect(parseReadingComfort(raw)).toEqual(DEFAULT_READING_COMFORT);
    }
  });

  test("un réglage partiel complète les autres par défaut", () => {
    expect(parseReadingComfort(JSON.stringify({ spacing: "wider" }))).toEqual({
      ...DEFAULT_READING_COMFORT,
      spacing: "wider",
    });
  });

  test("une valeur inconnue est ignorée, pas propagée", () => {
    expect(
      parseReadingComfort(
        JSON.stringify({ textSize: "géant", spacing: 3, font: "comic" }),
      ),
    ).toEqual(DEFAULT_READING_COMFORT);
  });

  test("la vitesse de lecture reste dans des bornes audibles", () => {
    expect(
      parseReadingComfort(JSON.stringify({ speechRate: 9 })).speechRate,
    ).toBe(1.5);
    expect(
      parseReadingComfort(JSON.stringify({ speechRate: 0.1 })).speechRate,
    ).toBe(0.5);
    expect(
      parseReadingComfort(JSON.stringify({ speechRate: "vite" })).speechRate,
    ).toBe(DEFAULT_READING_COMFORT.speechRate);
  });
});

describe("ce que les réglages changent à l'écran", () => {
  test("la taille du texte agrandit toute l'interface", () => {
    expect(readingComfortStyle({ ...DEFAULT_READING_COMFORT }).fontSize).toBe(
      "15px",
    );
    expect(
      readingComfortStyle({ ...DEFAULT_READING_COMFORT, textSize: "large" })
        .fontSize,
    ).toBe("17px");
    expect(
      readingComfortStyle({ ...DEFAULT_READING_COMFORT, textSize: "larger" })
        .fontSize,
    ).toBe("19px");
  });

  test("l'espacement le plus large reprend les valeurs WCAG 1.4.12", () => {
    const style = readingComfortStyle({
      ...DEFAULT_READING_COMFORT,
      spacing: "wider",
    });
    expect(style.letterSpacing).toBe("0.12em");
    expect(style.wordSpacing).toBe("0.16em");
    expect(Number(style.lineHeight)).toBeGreaterThanOrEqual(1.5);
  });

  test("sans réglage, rien n'est imposé à l'interface", () => {
    const style = readingComfortStyle(DEFAULT_READING_COMFORT);
    expect(style.letterSpacing).toBeNull();
    expect(style.wordSpacing).toBeNull();
    expect(style.lineHeight).toBeNull();
  });

  test("les réglages sont posés sur la racine du document", () => {
    const set = new Map<string, string>();
    const removed: string[] = [];
    const root = {
      dataset: {} as Record<string, string>,
      style: {
        setProperty: (name: string, value: string) => set.set(name, value),
        removeProperty: (name: string) => {
          removed.push(name);
          return "";
        },
      },
    };

    applyReadingComfort(
      {
        ...DEFAULT_READING_COMFORT,
        textSize: "large",
        spacing: "wide",
        font: "readable",
      },
      root,
    );

    expect(root.dataset.readingSpacing).toBe("wide");
    expect(root.dataset.readingFont).toBe("readable");
    expect(set.get("--reading-font-size")).toBe("17px");
    expect(set.get("--reading-letter-spacing")).toBe("0.05em");
  });
});
