import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Les clés de traduction d'une organisation : leur espace de noms, et leur usage.
 *
 * ## L'espace de noms
 *
 * Il s'appelait `organization.*`. Nova sert une école comme une entreprise sous un
 * seul mode organisation, et un préfixe qui dit « campus » a coûté cher : deux
 * fonctions — le mode réunion et Nova Commands — ont été réservées à
 * l'éducation par des commentaires qui s'appuyaient sur ce vocabulaire, alors
 * qu'aucune raison technique ne le justifiait. Le nom oriente la lecture, donc
 * il change.
 *
 * ## L'usage
 *
 * Relevé le 14 septembre 2026 : une centaine de clés ne correspondaient plus à
 * aucun écran. Traduites en 22 langues, elles faisaient croire à des textes
 * vivants, et chaque relecture de traduction les payait.
 *
 * Une clé est lue si son chemin complet apparaît dans le code, ou si le code
 * construit son préfixe à la volée (`organization.updates.${…}`).
 */

type Tree = { [key: string]: string | Tree };

const NAMESPACES = ["organization", "organizationConnection"] as const;

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

function english(): Tree {
  return JSON.parse(
    readFileSync("src/i18n/locales/en/translation.json", "utf8"),
  ) as Tree;
}

function locales(): string[] {
  return readdirSync("src/i18n/locales");
}

describe("espace de noms des clés d'organisation", () => {
  test("plus aucune langue ne porte d'espace de noms « campus »", () => {
    const remaining = locales().filter((locale) => {
      const tree = JSON.parse(
        readFileSync(`src/i18n/locales/${locale}/translation.json`, "utf8"),
      ) as Tree;
      return Object.keys(tree).some((key) => key.startsWith("campus"));
    });
    expect(remaining).toEqual([]);
  });

  test("plus aucun appel du code ne vise une clé « campus. »", () => {
    const code = [...sources("src"), ...sources("src-tauri/src")].join("\n");
    const calls = [...code.matchAll(/[`"']campus\.[A-Za-z0-9_.]+/g)]
      .map((match) => match[0])
      // `include_str!("campus.rs")` n'est pas une clé de traduction : c'est un
      // fichier source, qui sera renommé avec les autres, pas ici.
      .filter((literal) => !literal.endsWith(".rs"));
    expect(calls).toEqual([]);
  });

  test("les deux espaces de noms existent, et dans chaque langue", () => {
    for (const locale of locales()) {
      const tree = JSON.parse(
        readFileSync(`src/i18n/locales/${locale}/translation.json`, "utf8"),
      ) as Tree;
      for (const namespace of NAMESPACES) {
        expect(`${locale}: ${namespace in tree}`).toBe(`${locale}: true`);
      }
    }
  });

  test("le renommage n'a perdu aucune clé", () => {
    // 197 clés sous `campus` et 6 sous `campusConnection`, relevées avant le
    // renommage : un plancher, pas un compte. Ajouter une clé est normal ;
    // repasser sous ce nombre voudrait dire que le renommage, ou une reprise
    // ultérieure, en a perdu.
    const tree = english();
    expect(keys(tree.organization as Tree).length).toBeGreaterThanOrEqual(197);
    expect(
      keys(tree.organizationConnection as Tree).length,
    ).toBeGreaterThanOrEqual(6);
  });
});

describe("usage des clés d'organisation", () => {
  test("chaque clé est utilisée par le code", () => {
    const code = [...sources("src"), ...sources("src-tauri/src")].join("\n");
    const dynamicPrefixes = [
      ...code.matchAll(
        /[`"']((?:organization|organizationConnection)\.[A-Za-z0-9_.]*?)\$\{/g,
      ),
    ].map((match) => match[1]);

    const unused = keys(english())
      .filter((key) =>
        NAMESPACES.some((namespace) => key.startsWith(`${namespace}.`)),
      )
      .filter(
        (key) =>
          !code.includes(key) &&
          !dynamicPrefixes.some((prefix) => key.startsWith(prefix)),
      );
    expect(unused).toEqual([]);
  });
});
