import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * Le français ne doit pas dire « établissement » là où l'anglais dit
 * « organization ».
 *
 * Mesuré dans Nova 1.0.37 : le vocabulaire et les règles partagés par une
 * organisation s'affichaient « Vocabulaire de l'établissement », « Règles de
 * l'établissement ». L'anglais dit « Organization vocabulary » : ces écrans
 * servent aussi les entreprises, qui lisaient alors le vocabulaire d'une école.
 */

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ""): Map<string, string> {
  const found = new Map<string, string>();
  for (const [key, node] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof node === "string") found.set(path, node);
    else for (const [p, v] of leaves(node, path)) found.set(p, v);
  }
  return found;
}

const load = (locale: string) =>
  leaves(
    JSON.parse(
      readFileSync(`src/i18n/locales/${locale}/translation.json`, "utf8"),
    ) as Tree,
  );

describe("vocabulaire d'organisation en français", () => {
  test("aucun texte « organization » n'est traduit par « établissement »", () => {
    const english = load("en");
    const french = load("fr");
    const mistranslated = [...english]
      .filter(([, text]) => /organi[sz]ation/i.test(text))
      .map(([key]) => key)
      .filter((key) => /établissement/i.test(french.get(key) ?? ""));
    expect(mistranslated).toEqual([]);
  });
});
