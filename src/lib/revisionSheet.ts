import type { HistoryEntry } from "@/bindings";
import { inCourseOrder, noteText, splitMarker } from "./revisionExport";

/**
 * La fiche de révision d'un cours : uniquement ce que l'élève a dicté et
 * marqué, rangé par sorte, chaque ligne rattachée à la diapositive en cours.
 *
 * Elle est extractive par principe. Aucun modèle ne la rédige : un résumé
 * généré pourrait glisser une formule fausse ou une date déplacée, et l'élève
 * réviserait l'erreur. Ici, chaque phrase est celle qu'il a dite.
 *
 * Le texte rendu est du Markdown simple (titres `##`, listes `-`) : copié par
 * `copy_formatted_text`, il arrive dans Word ou OneNote avec de vrais titres
 * et de vraies listes (`rich_paste`).
 */

/** Les sortes de la fiche, dans l'ordre où on révise. */
export const SHEET_SECTIONS = [
  { key: "important", marks: ["⚠"] },
  { key: "definitions", marks: ["📘"] },
  { key: "theorems", marks: ["📐"] },
  { key: "formulas", marks: ["🔢"] },
  { key: "methods", marks: ["🛠"] },
  { key: "keyPoints", marks: ["📌"] },
  { key: "examples", marks: ["🧪", "✍"] },
  { key: "remarks", marks: ["💬"] },
  // Ce qui reste à faire après le cours.
  { key: "toReview", marks: ["🔁"] },
  { key: "questions", marks: ["❓"] },
  { key: "diagrams", marks: ["✏"] },
  { key: "lostTrack", marks: ["⏸"] },
] as const;

export type SheetSectionKey = (typeof SHEET_SECTIONS)[number]["key"];

export interface SheetLabels {
  /** Le titre de la fiche, le cours compris. */
  title: string;
  sections: Record<SheetSectionKey, string>;
  /** « Diapo 12 » tel que l'élève l'a dit, pour rattacher une ligne. */
  slide: (label: string) => string;
  /** Ce qui s'affiche quand rien n'a été marqué. */
  empty: string;
}

function mark(label: string): string {
  return [...label][0] ?? "";
}

/**
 * La fiche, en Markdown simple. Une ligne porte le texte exact de l'élève ;
 * un bloc numéroté (« Exemple 2 ») garde son numéro ; un repère sans texte
 * (« J'ai décroché ») donne son heure. La diapositive en cours, si l'élève en
 * a dit une, est ajoutée entre parenthèses.
 */
export function revisionSheet(
  entries: HistoryEntry[],
  labels: SheetLabels,
  clock: (timestamp: number) => string,
): string {
  const lines = new Map<SheetSectionKey, string[]>();
  let slide: string | null = null;

  for (const entry of inCourseOrder(entries)) {
    const marked = splitMarker(noteText(entry));
    if (!marked) continue;
    const symbol = mark(marked.label);
    if (symbol === "🖼") {
      slide = marked.label.replace(/^🖼️?\s*/u, "");
      continue;
    }
    const section = SHEET_SECTIONS.find((s) =>
      (s.marks as readonly string[]).includes(symbol),
    );
    if (!section) continue;
    // « 🧪 Exemple 2 » : le numéro est gardé, le symbole non.
    const numbered = /\s\d+$/u.test(marked.label)
      ? `${marked.label.replace(/^\S+\s+/u, "")} : `
      : "";
    const text = marked.body
      ? `${numbered}${marked.body}`
      : `${numbered}${clock(entry.timestamp)}`.replace(/ : $/u, "");
    const where = slide ? ` (${labels.slide(slide)})` : "";
    lines.set(section.key, [
      ...(lines.get(section.key) ?? []),
      `- ${text.replace(/\s*\n\s*/gu, " ")}${where}`,
    ]);
  }

  const out = [`# ${labels.title}`, ""];
  if (lines.size === 0) {
    out.push(labels.empty, "");
    return out.join("\n");
  }
  for (const section of SHEET_SECTIONS) {
    const items = lines.get(section.key);
    if (!items) continue;
    out.push(`## ${labels.sections[section.key]}`, ...items, "");
  }
  return out.join("\n");
}
