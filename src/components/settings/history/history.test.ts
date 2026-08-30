import { describe, expect, test } from "bun:test";

import en from "../../../i18n/locales/en/translation.json";
import { filterEntries, groupByRecency } from "./useHistoryGroups";
import type { HistoryEntry } from "@/bindings";

/** Référence fixe : mardi 12 mars 2024, 10 h locales. */
const NOW = new Date(2024, 2, 12, 10, 0, 0);

function entry(id: number, at: Date, text = "texte"): HistoryEntry {
  return {
    id,
    file_name: `rec-${id}.wav`,
    timestamp: Math.floor(at.getTime() / 1000),
    saved: false,
    title: "",
    transcription_text: text,
    post_processed_text: null,
    post_process_prompt: null,
    post_process_requested: false,
  };
}

const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

describe("regroupement par proximité", () => {
  test("le découpage suit les minuits locaux, pas les 24 heures", () => {
    // 23 h plus tôt tombe la veille : deux entrées proches dans le temps
    // peuvent appartenir à deux jours, et l'utilisateur les range ainsi.
    const groups = groupByRecency(
      [entry(1, hoursAgo(1)), entry(2, hoursAgo(23))],
      NOW,
    );
    expect(groups.map((g) => g.bucket)).toEqual(["today", "yesterday"]);
  });

  test("les quatre tranches sont ordonnées du plus récent au plus ancien", () => {
    const groups = groupByRecency(
      [
        entry(1, hoursAgo(2)),
        entry(2, hoursAgo(26)),
        entry(3, hoursAgo(72)),
        entry(4, hoursAgo(24 * 30)),
      ],
      NOW,
    );
    expect(groups.map((g) => g.bucket)).toEqual([
      "today",
      "yesterday",
      "week",
      "older",
    ]);
  });

  test("une tranche vide n'apparaît pas", () => {
    const groups = groupByRecency([entry(1, hoursAgo(1))], NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0].bucket).toBe("today");
  });

  test("chaque tranche a un libellé traduit", () => {
    for (const bucket of ["today", "yesterday", "week", "older"] as const) {
      expect(typeof en.history.group[bucket]).toBe("string");
    }
  });
});

describe("recherche locale", () => {
  const entries = [
    entry(1, NOW, "Compte rendu de réunion"),
    entry(2, NOW, "Liste de courses"),
  ];

  test("une requête vide ne filtre rien", () => {
    expect(filterEntries(entries, "   ")).toHaveLength(2);
  });

  test("la casse est ignorée", () => {
    expect(filterEntries(entries, "COURSES")).toHaveLength(1);
  });

  test("les accents sont ignorés dans les deux sens", () => {
    // Chercher « reunion » doit trouver « réunion » : personne ne tape les
    // accents dans un champ de recherche.
    expect(filterEntries(entries, "reunion")).toHaveLength(1);
    expect(filterEntries(entries, "réunion")).toHaveLength(1);
  });

  test("une requête sans correspondance ne renvoie rien", () => {
    expect(filterEntries(entries, "facture")).toHaveLength(0);
  });
});
