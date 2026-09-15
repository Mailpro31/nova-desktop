import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";

import {
  expandKeptKeys,
  flatten,
  formatReport,
  reviewLanguage,
  type LanguageReview,
} from "../src/lib/i18n/review";

/**
 * Revue croisée des traductions, avec un rapport par langue.
 *
 * Écrit `docs/translation-review.md` et échoue si une langue casse une
 * variable, une balise ou laisse un texte vide. Le texte resté en anglais est
 * listé, sans faire échouer : il se corrige par section, pas d'un coup.
 */

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const localesDir = path.join(root, "src", "i18n", "locales");

const load = (locale: string) =>
  flatten(
    JSON.parse(
      fs.readFileSync(
        path.join(localesDir, locale, "translation.json"),
        "utf8",
      ),
    ),
  );

const english = load("en");
const kept = JSON.parse(
  fs.readFileSync(
    path.join(root, "src", "i18n", "kept-in-english.json"),
    "utf8",
  ),
) as { keys: string[] };
const keep = expandKeptKeys(kept.keys, english.keys());

const results: Record<string, LanguageReview> = {};
for (const locale of fs
  .readdirSync(localesDir)
  .filter((name) => name !== "en")
  .sort()) {
  results[locale] = reviewLanguage(english, load(locale), keep);
}

const reportPath = path.join(root, "docs", "translation-review.md");
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
// Mis en forme par Prettier avant d'etre ecrit : le rapport regenere reste
// conforme a `format:check`, quel que soit le nombre de lignes du tableau.
fs.writeFileSync(
  reportPath,
  await format(formatReport(results), { filepath: reportPath }),
);

const broken = Object.values(results).reduce(
  (total, result) => total + result.errors.length,
  0,
);
const left = Object.values(results).reduce(
  (total, result) => total + result.untranslated.length,
  0,
);
console.log(
  `Translation review: ${broken} broken, ${left} left in English across ${Object.keys(results).length} languages.`,
);
console.log(`Report: ${path.relative(root, reportPath)}`);
process.exit(broken > 0 ? 1 : 0);
