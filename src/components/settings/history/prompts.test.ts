import { describe, expect, test } from "bun:test";

import { entriesForStyle } from "./useHistoryGroups";
import type { HistoryEntry } from "@/bindings";

/**
 * Les prompts écrits par Nova se retrouvent sans fouiller l'historique.
 *
 * Le Style « Prompt IA » transforme une dictée en prompt structuré (objectif,
 * contexte, contraintes). Ces prompts restaient mélangés à toutes les autres
 * dictées de l'historique, alors qu'on les cherche pour les réutiliser.
 */

const PROMPT_STYLE = {
  id: "nova_style_prompt",
  name: "Prompt IA",
  prompt:
    "Tu es le moteur de reformulation de Nova. Transforme la dictée en prompt.",
};
const EMAIL_STYLE = {
  id: "nova_style_email",
  name: "E-mail",
  prompt: "Tu es le moteur de reformulation de Nova. Rédige un e-mail.",
};
const STYLES = [PROMPT_STYLE, EMAIL_STYLE];

function entry(id: number, stored: string | null): HistoryEntry {
  return {
    id,
    file_name: `rec-${id}.wav`,
    timestamp: 1_700_000_000 + id,
    saved: false,
    title: "",
    transcription_text: `dictée ${id}`,
    post_processed_text: null,
    post_process_prompt: stored,
    post_process_requested: stored !== null,
  };
}

describe("dictées écrites avec un Style donné", () => {
  test("seules les dictées du Style demandé sont gardées, dans leur ordre", () => {
    const entries = [
      entry(1, PROMPT_STYLE.prompt),
      entry(2, EMAIL_STYLE.prompt),
      entry(3, null),
      entry(4, `  ${PROMPT_STYLE.prompt}\n`),
    ];
    expect(
      entriesForStyle(entries, STYLES, "nova_style_prompt").map((e) => e.id),
    ).toEqual([1, 4]);
  });

  test("un nom de Style enregistré compte aussi", () => {
    expect(
      entriesForStyle([entry(1, "Prompt IA")], STYLES, "nova_style_prompt"),
    ).toHaveLength(1);
  });

  test("un Style absent des réglages ne retient rien", () => {
    expect(
      entriesForStyle(
        [entry(1, PROMPT_STYLE.prompt)],
        [EMAIL_STYLE],
        "nova_style_prompt",
      ),
    ).toEqual([]);
  });
});
