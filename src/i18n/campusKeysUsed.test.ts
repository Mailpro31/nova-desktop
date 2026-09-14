import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Toute clé `campus.*` des traductions doit être lue par le code.
 *
 * Relevé le 14 septembre 2026 : une centaine de clés `campus.*` ne
 * correspondaient plus à aucun écran. Traduites en 22 langues, elles faisaient
 * croire à des textes vivants, et chaque relecture de traduction les payait.
 *
 * Une clé est lue si son chemin complet apparaît dans le code, ou si le code
 * construit son préfixe à la volée (`campus.updates.${…}`).
 */

type Tree = { [key: string]: string | Tree };

function keys(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, node]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof node === "string" ? [path] : keys(node, path);
  });
}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === "i18n" || name === "node_modules" ? [] : sources(path);
    }
    const code = /\.(ts|tsx|rs)$/.test(name) && !/\.test\.tsx?$/.test(name);
    return code ? [readFileSync(path, "utf8")] : [];
  });
}

describe("clés de traduction campus", () => {
  test("chaque clé campus.* est utilisée par le code", () => {
    const english = JSON.parse(
      readFileSync("src/i18n/locales/en/translation.json", "utf8"),
    ) as Tree;
    const code = [...sources("src"), ...sources("src-tauri/src")].join("\n");
    const dynamicPrefixes = [
      ...code.matchAll(/[`"'](campus\.[A-Za-z0-9_.]*?)\$\{/g),
    ].map((match) => match[1]);

    const unused = keys(english)
      .filter((key) => key.startsWith("campus."))
      .filter(
        (key) =>
          !code.includes(key) &&
          !dynamicPrefixes.some((prefix) => key.startsWith(prefix)),
      );
    expect(unused).toEqual([]);
  });
});
