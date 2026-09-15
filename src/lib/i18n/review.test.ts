import { describe, expect, test } from "bun:test";

import {
  flatten,
  formatReport,
  placeholdersOf,
  reviewLanguage,
  tagsOf,
} from "./review";

/**
 * Revue croisée des traductions : ce qui se vérifie sans lire la langue.
 *
 * Une variable `{{model}}` perdue en route affiche un titre amputé ; une balise
 * `<1>` disparue casse un composant `Trans` ; un texte vide laisse un bouton
 * muet. Ces défauts se détectent mécaniquement, dans les 21 langues, à chaque
 * modification. Le texte laissé en anglais, lui, est un signal : il est compté
 * et listé par langue, sauf pour les noms qui ne se traduisent pas.
 */

const reference = new Map([
  ["title", "{{model}} Settings"],
  ["count", "{{count}} new, {{total}} total"],
  ["rich", "<strong>Nova</strong> is ready"],
  ["button", "Save"],
  ["model", "Whisper Small"],
  ["time", "12:00"],
]);

describe("placeholders and tags", () => {
  test("placeholders are read with or without inner spaces", () => {
    expect(placeholdersOf("Hello {{ name }}, {{count}} new")).toEqual([
      "count",
      "name",
    ]);
  });

  test("tags are read by name, numbered Trans tags included", () => {
    expect(tagsOf("<strong>Nova</strong> and <1>more</1>")).toEqual([
      "1",
      "1",
      "strong",
      "strong",
    ]);
  });
});

describe("a language under review", () => {
  const translated = (overrides: Record<string, string>) =>
    new Map([
      ["title", "Paramètres de {{model}}"],
      ["count", "{{total}} au total, {{count}} nouveaux"],
      ["rich", "<strong>Nova</strong> est prêt"],
      ["button", "Enregistrer"],
      ["model", "Whisper Small"],
      ["time", "12:00"],
      ...Object.entries(overrides),
    ]);

  test("a faithful translation has no finding, placeholders may move", () => {
    const result = reviewLanguage(
      reference,
      translated({}),
      new Set(["model"]),
    );
    expect(result.errors).toEqual([]);
    expect(result.untranslated).toEqual([]);
  });

  test("a dropped placeholder is an error", () => {
    const result = reviewLanguage(
      reference,
      translated({ title: "Paramètres" }),
      new Set(),
    );
    expect(result.errors).toContainEqual({
      key: "title",
      kind: "placeholder",
      expected: ["model"],
      found: [],
    });
  });

  test("a renamed placeholder is an error", () => {
    const result = reviewLanguage(
      reference,
      translated({ count: "{{nombre}} nouveaux, {{total}} au total" }),
      new Set(),
    );
    expect(result.errors.map((error) => [error.key, error.kind])).toEqual([
      ["count", "placeholder"],
    ]);
  });

  test("a lost tag is an error", () => {
    const result = reviewLanguage(
      reference,
      translated({ rich: "Nova est prêt" }),
      new Set(),
    );
    expect(result.errors.map((error) => [error.key, error.kind])).toEqual([
      ["rich", "tag"],
    ]);
  });

  test("an empty text is an error", () => {
    const result = reviewLanguage(
      reference,
      translated({ button: "  " }),
      new Set(),
    );
    expect(result.errors.map((error) => [error.key, error.kind])).toEqual([
      ["button", "empty"],
    ]);
  });

  test("text left in English is listed, except names kept on purpose and wordless text", () => {
    const result = reviewLanguage(
      reference,
      translated({ button: "Save" }),
      new Set(["model"]),
    );
    expect(result.untranslated).toEqual(["button"]);
    expect(result.errors).toEqual([]);
  });

  test("a key missing from the translation is not reviewed twice", () => {
    const partial = translated({});
    partial.delete("button");
    expect(
      reviewLanguage(reference, partial, new Set(["model"])).errors,
    ).toEqual([]);
  });
});

describe("flattening and report", () => {
  test("nested keys become dotted paths", () => {
    expect([...flatten({ a: { b: "x", c: { d: "y" } }, e: "z" })]).toEqual([
      ["a.b", "x"],
      ["a.c.d", "y"],
      ["e", "z"],
    ]);
  });

  test("the report gives one row per language and details what to fix", () => {
    const report = formatReport({
      ar: {
        errors: [
          { key: "title", kind: "placeholder", expected: ["model"], found: [] },
        ],
        untranslated: ["button"],
      },
      fr: { errors: [], untranslated: [] },
    });
    expect(report).toContain("| ar | 1 | 1 |");
    expect(report).toContain("| fr | 0 | 0 |");
    expect(report).toContain("`title`");
    expect(report).toContain("`button`");
  });
});
