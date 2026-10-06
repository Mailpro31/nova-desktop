import { describe, expect, test } from "bun:test";
import type { HistoryEntry } from "@/bindings";
import { revisionSheet, type SheetLabels } from "./revisionSheet";

let next = 0;
function entry(text: string, at: number): HistoryEntry {
  next += 1;
  return {
    id: next,
    file_name: `handy-${at}.wav`,
    timestamp: at,
    saved: false,
    title: "",
    transcription_text: text,
    post_processed_text: null,
    post_process_prompt: null,
    post_process_requested: false,
  } as HistoryEntry;
}

const LABELS: SheetLabels = {
  title: "Fiche — Mécanique des fluides",
  sections: {
    important: "Important",
    definitions: "Définitions",
    theorems: "Théorèmes et propriétés",
    formulas: "Formules",
    methods: "Méthodes",
    keyPoints: "À retenir",
    examples: "Exemples et exercices",
    remarks: "Remarques",
    toReview: "À revoir",
    questions: "Questions à poser",
    diagrams: "Schémas à reprendre",
    lostTrack: "Moments où j'ai décroché",
  },
  slide: (label) => label,
  empty: "Aucun repère dans ce cours.",
};

const clock = (at: number) => `t${at}`;

describe("fiche de révision", () => {
  test("les repères sont rangés par sorte, avec la diapositive en cours", () => {
    const sheet = revisionSheet(
      [
        // L'historique rend le plus récent d'abord.
        entry("⏸ J'ai décroché", 1070),
        entry("🔁 À revoir : Le théorème de Bernoulli.", 1060),
        entry("🔢 Formule : Re = ρVL/μ", 1050),
        entry("🧪 Exemple 2 : Un écoulement dans une conduite.", 1045),
        entry("🖼 Diapo 13", 1040),
        entry(
          "📘 Définition : La viscosité est la résistance d'un fluide à l'écoulement.",
          1030,
        ),
        entry("Le cours commence par les fluides parfaits.", 1020),
        entry("🖼 Diapo 12 : Les fluides réels.", 1010),
      ],
      LABELS,
      clock,
    );
    expect(sheet).toBe(
      [
        "# Fiche — Mécanique des fluides",
        "",
        "## Définitions",
        "- La viscosité est la résistance d'un fluide à l'écoulement. (Diapo 12)",
        "",
        "## Formules",
        "- Re = ρVL/μ (Diapo 13)",
        "",
        "## Exemples et exercices",
        "- Exemple 2 : Un écoulement dans une conduite. (Diapo 13)",
        "",
        "## À revoir",
        "- Le théorème de Bernoulli. (Diapo 13)",
        "",
        "## Moments où j'ai décroché",
        "- t1070 (Diapo 13)",
        "",
      ].join("\n"),
    );
  });

  test("le texte de l'élève n'est jamais réécrit", () => {
    const said =
      "📌 À retenir : Δ = b² − 4ac, et   si Δ < 0 pas de racine réelle.";
    const sheet = revisionSheet([entry(said, 1)], LABELS, clock);
    expect(sheet).toContain(
      "- Δ = b² − 4ac, et   si Δ < 0 pas de racine réelle.",
    );
  });

  test("une dictée sans repère n'entre pas dans la fiche", () => {
    expect(revisionSheet([entry("Le cours commence.", 1)], LABELS, clock)).toBe(
      "# Fiche — Mécanique des fluides\n\nAucun repère dans ce cours.\n",
    );
  });

  test("sans diapositive dite, aucune parenthèse", () => {
    const sheet = revisionSheet(
      [entry("❓ Question : Pourquoi le signe change ?", 1)],
      LABELS,
      clock,
    );
    expect(sheet).toContain("- Pourquoi le signe change ?\n");
  });
});
