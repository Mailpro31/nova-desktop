import type { HistoryEntry } from "@/bindings";

export type HistoryBucket = "today" | "yesterday" | "week" | "older";

export interface HistoryGroup {
  bucket: HistoryBucket;
  entries: HistoryEntry[];
}

/** Ordre de lecture : du plus récent au plus ancien. */
const ORDER: HistoryBucket[] = ["today", "yesterday", "week", "older"];

/**
 * Regroupe les dictées par proximité temporelle.
 *
 * Le repère utile n'est pas la date mais la distance : « aujourd'hui » se
 * retrouve d'un coup d'œil, une date complète demande un calcul. Le découpage
 * s'appuie sur les jours **locaux** — deux entrées séparées de deux heures
 * peuvent appartenir à deux jours si minuit passe entre elles, et l'utilisateur
 * les range ainsi.
 *
 * Fonction pure et paramétrée par `now`, pour être testable sans horloge.
 */
export function groupByRecency(
  entries: HistoryEntry[],
  now: Date = new Date(),
): HistoryGroup[] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const dayMs = 86_400_000;

  const buckets = new Map<HistoryBucket, HistoryEntry[]>();
  for (const entry of entries) {
    const at = new Date(entry.timestamp * 1000);
    // Nombre de minuits franchis depuis l'entrée : 0 = aujourd'hui,
    // 1 = hier, quelle que soit l'heure.
    const midnights = Math.floor(
      (startOfToday.getTime() - at.getTime()) / dayMs + 1,
    );

    let bucket: HistoryBucket;
    if (midnights <= 0) bucket = "today";
    else if (midnights === 1) bucket = "yesterday";
    else if (midnights < 7) bucket = "week";
    else bucket = "older";

    const list = buckets.get(bucket);
    if (list) list.push(entry);
    else buckets.set(bucket, [entry]);
  }

  return ORDER.filter((bucket) => buckets.has(bucket)).map((bucket) => ({
    bucket,
    entries: buckets.get(bucket)!,
  }));
}

/**
 * Filtre local sur le texte transcrit.
 *
 * Local par nécessité autant que par principe : l'historique est une base
 * SQLite sur la machine, aucun serveur n'a à connaître ce qui y est cherché.
 * La comparaison ignore la casse et les diacritiques — chercher « reunion »
 * doit trouver « réunion ».
 */
export function filterEntries(
  entries: HistoryEntry[],
  query: string,
): HistoryEntry[] {
  const needle = normalize(query);
  if (!needle) return entries;
  return entries.filter((entry) =>
    normalize(entry.transcription_text).includes(needle),
  );
}

function normalize(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .normalize("NFD")
      // Le découplage accent/lettre de NFD permet de retirer les diacritiques
      // sans table de correspondance.
      .replace(/\p{Diacritic}/gu, "")
  );
}
