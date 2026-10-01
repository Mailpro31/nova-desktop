import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

/**
 * « Campus » n'est plus un nom de Nova.
 *
 * Vu en testant la 1.0.47 : l'écran Organisation affichait « Connexion :
 * Campus connecté », la déconnexion demandait « Se déconnecter de Nova
 * Campus ? », et l'accueil restait en anglais (« Welcome to Nova Campus »)
 * dans vingt langues. Il n'y a qu'un Nova, celui de l'organisation.
 */
type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ""): [string, string][] {
  return Object.entries(tree).flatMap(([key, node]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof node === "string" ? [[path, node]] : leaves(node, path);
  });
}

// Le mot, et ses translittérations déjà vues dans les traductions.
const CAMPUS =
  /campus|kampus|kampüs|кампус|キャンパス|캠퍼스|校园|校園|الحرم|קמפוס|क्याम्पस/i;

describe("aucun « Campus » à l'écran", () => {
  for (const locale of readdirSync("src/i18n/locales")) {
    test(locale, () => {
      const tree = JSON.parse(
        readFileSync(`src/i18n/locales/${locale}/translation.json`, "utf8"),
      ) as Tree;
      const found = leaves(tree)
        .filter(([, text]) => CAMPUS.test(text))
        .map(([key, text]) => `${key} = ${text}`);
      expect(found).toEqual([]);
    });
  }
});
