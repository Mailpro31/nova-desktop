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

/**
 * Libellé du Style d'une entrée, tel que l'historique doit l'afficher.
 *
 * Nova enregistre avec chaque dictée le **texte complet de la consigne** du
 * Style, pas son nom. L'historique l'affichait tel quel : une consigne interne
 * de plusieurs paragraphes au-dessus de la dictée. On retrouve donc le nom du
 * Style à partir de sa consigne ; un nom déjà enregistré s'affiche tel quel ; et
 * une consigne qui ne correspond plus à aucun Style n'est jamais montrée.
 */
export function historyStyleLabel(
  stored: string | null,
  styles: readonly { name: string; prompt: string }[],
): string | null {
  const value = stored?.trim();
  if (!value) return null;
  const byPrompt = styles.find((style) => style.prompt.trim() === value);
  if (byPrompt) return byPrompt.name;
  const byName = styles.find((style) => style.name.trim() === value);
  if (byName) return byName.name;
  // Ni consigne connue ni nom connu : un libellé court d'une ligne peut
  // s'afficher, une consigne jamais.
  return value.length <= 60 && !value.includes("\n") ? value : null;
}

/**
 * Dictées écrites avec un Style donné, dans leur ordre d'origine.
 *
 * Même rapprochement que `historyStyleLabel` : ce qui est enregistré est la
 * consigne du Style (ou, parfois, son nom). Un Style absent des réglages ne
 * retient rien — on ne devine pas une consigne qu'on ne connaît plus.
 */
export function entriesForStyle(
  entries: HistoryEntry[],
  styles: readonly { id: string; name: string; prompt: string }[],
  styleId: string,
): HistoryEntry[] {
  const style = styles.find((item) => item.id === styleId);
  if (!style) return [];
  const prompt = style.prompt.trim();
  const name = style.name.trim();
  return entries.filter((entry) => {
    const stored = entry.post_process_prompt?.trim();
    return stored === prompt || stored === name;
  });
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
