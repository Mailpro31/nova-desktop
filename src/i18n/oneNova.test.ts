import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Un seul Nova, Nova Organisation (décision du 01/10).
 *
 * Les noms de l'édition personnelle — Nova Local, Air, Aura, Apex, Turbo, Pro,
 * Ultra — ne doivent plus apparaître dans ce qu'un élève voit quand le serveur
 * de son école ne répond pas : c'est précisément le moment où l'ancienne
 * édition refaisait surface, sous le nom de son moteur local.
 */

const LOCALES = join(import.meta.dir, "locales");
const PERSONAL_NAMES = /Nova (Local|Air|Aura|Apex|Turbo|Pro|Ultra)\b/;

/** Ce que l'accueil et le parcours affichent quand le poste dicte seul. */
const KEYS_SEEN_WITHOUT_THE_SERVER = [
  "organization.status.local",
  "organization.status.localActive",
  "home.hero.organizationLocal.title",
  "home.hero.organizationLocal.detail",
  "home.engine.local",
  "home.engine.local-fallback",
];

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

describe("sans le serveur, aucun nom de l'édition personnelle", () => {
  for (const locale of readdirSync(LOCALES)) {
    test(locale, () => {
      const dictionary = JSON.parse(
        readFileSync(join(LOCALES, locale, "translation.json"), "utf8"),
      );
      for (const key of KEYS_SEEN_WITHOUT_THE_SERVER) {
        const text = lookup(dictionary, key);
        expect(typeof text).toBe("string");
        expect(text as string).not.toMatch(PERSONAL_NAMES);
      }
    });
  }
});
