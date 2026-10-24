/**
 * Préférences de la bulle, propres à ce poste : l'application choisie pour
 * chaque usage, celles où l'élève s'est connecté, et les actions choisies
 * (comptées ici, jamais envoyées). Les fenêtres de Nova partagent ce
 * stockage ; s'il est indisponible, la bulle garde ses choix par défaut.
 */
export const BUBBLE_STORAGE_KEY = "nova.bubble";

/** Les usages pour lesquels l'élève choisit une application. */
export type ChosenGroup = "ai" | "translate" | "notes" | "agenda";
export const CHOSEN_GROUPS: ChosenGroup[] = [
  "ai",
  "translate",
  "notes",
  "agenda",
];

export interface BubblePreferences {
  /**
   * L'application de chaque usage. Par défaut, celles du compte Microsoft de
   * l'école (décision de Sash, 24/10) : déjà connectées, sans limite d'âge.
   */
  apps: Record<ChosenGroup, string>;
  /** Les applications où l'élève dit s'être connecté. */
  connected: string[];
  habits: Record<string, number>;
}

const DEFAULT_APPS: Record<ChosenGroup, string> = {
  ai: "copilot",
  translate: "deepl",
  notes: "onenote",
  agenda: "outlook-calendar",
};

export function loadBubblePreferences(): BubblePreferences {
  try {
    const raw = JSON.parse(localStorage.getItem(BUBBLE_STORAGE_KEY) ?? "{}");
    return {
      // `ai` seul : le format d'avant le 24/10 au soir.
      apps: {
        ...DEFAULT_APPS,
        ...(typeof raw.ai === "string" ? { ai: raw.ai } : {}),
        ...raw.apps,
      },
      connected: Array.isArray(raw.connected) ? raw.connected : [],
      habits: raw.habits && typeof raw.habits === "object" ? raw.habits : {},
    };
  } catch {
    return { apps: { ...DEFAULT_APPS }, connected: [], habits: {} };
  }
}

export function saveBubblePreferences(preferences: BubblePreferences): void {
  try {
    localStorage.setItem(BUBBLE_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Stockage indisponible : le choix vaut pour cette fois.
  }
}

export function countHabit(id: string): void {
  const preferences = loadBubblePreferences();
  preferences.habits[id] = (preferences.habits[id] ?? 0) + 1;
  saveBubblePreferences(preferences);
}
