import { looksFrench } from "@/lib/commands/catalog";
import { connectionById, fits, wordCount } from "./connections";

/**
 * Les actions de la bulle : celles que Nova fait lui-même (réponse dans la
 * bulle), et `open:<id>` pour une application connectée.
 */
export type NovaActionId =
  | "explain"
  | "summarize"
  | "simplify"
  | "words"
  | "improve"
  | "translate"
  | "quiz";

export const NOVA_ACTIONS: NovaActionId[] = [
  "explain",
  "summarize",
  "simplify",
  "words",
  "improve",
  "translate",
  "quiz",
];

export interface TextTraits {
  words: number;
  formula: boolean;
  foreign: boolean;
  date: boolean;
  long: boolean;
  editable: boolean;
}

const FORMULA =
  /\d\s*[+\-*/^=]\s*[\d(a-z]|[=√∫∑∂≤≥≈π]|\b(sin|cos|tan|log|ln|exp|lim)\s*\(/i;
const DATE =
  /(?<![\p{L}\d])((?:le|du|au)\s+\d{1,2}\/\d{1,2}|\d{1,2}\/\d{1,2}\/\d{2,4}|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|demain|\d{1,2}\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)|à rendre|a rendre)(?![\p{L}\d])/iu;

export function traits(text: string, editable: boolean): TextTraits {
  const words = wordCount(text);
  const date = DATE.test(text);
  return {
    words,
    // « le 12/11 » est une date, pas une division ; « 1/2 » reste une fraction.
    formula: !date && text.length <= 300 && FORMULA.test(text),
    // Sur trois mots, la langue ne se juge pas : pas de traduction proposée d'office.
    foreign: words >= 4 && !looksFrench(text),
    date,
    long: text.length > 600,
    editable,
  };
}

/**
 * Les trois actions proposées d'office, choisies en local, sans IA :
 * prévisibles, la même sélection donne les mêmes propositions. Tout le reste
 * est dans « Plus ». Lire à voix haute est toujours là, à part.
 *
 * `habits` compte les actions choisies sur ce poste : une action souvent
 * choisie (3 fois au moins) prend la troisième place si le texte lui convient.
 */
export function suggest(
  text: string,
  t: TextTraits,
  habits: Record<string, number> = {},
): string[] {
  const base = baseSuggestions(t);
  const favourite = Object.entries(habits)
    .filter(
      ([id, count]) => count >= 3 && !base.includes(id) && applies(id, text),
    )
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return favourite ? [base[0], base[1], favourite[0]] : base;
}

function baseSuggestions(t: TextTraits): string[] {
  if (t.editable) return ["improve", "simplify", "translate"];
  if (t.formula) return ["explain", "open:wolfram", "open:youtube"];
  if (t.words <= 3) {
    return t.foreign
      ? ["translate", "explain", "open:wiktionary"]
      : ["explain", "open:synonyms", "open:larousse"];
  }
  if (t.foreign) return ["translate", "explain", "summarize"];
  if (t.date) return ["open:outlook-calendar", "explain", "simplify"];
  if (t.long) return ["summarize", "explain", "quiz"];
  return ["explain", "simplify", "words"];
}

export function applies(id: string, text: string): boolean {
  if (!id.startsWith("open:")) return NOVA_ACTIONS.includes(id as NovaActionId);
  const connection = connectionById(id.slice(5));
  return !!connection && fits(connection, text);
}
