/**
 * Préférences de la bulle, propres à ce poste : l'IA préférée et les actions
 * choisies (comptées ici, jamais envoyées). Les fenêtres de Nova partagent ce
 * stockage ; s'il est indisponible, la bulle garde ses choix par défaut.
 */
export const BUBBLE_STORAGE_KEY = "nova.bubble";

export interface BubblePreferences {
  ai: string;
  habits: Record<string, number>;
}

const DEFAULTS: BubblePreferences = { ai: "chatgpt", habits: {} };

export function loadBubblePreferences(): BubblePreferences {
  try {
    const raw = JSON.parse(localStorage.getItem(BUBBLE_STORAGE_KEY) ?? "{}");
    return {
      ai: typeof raw.ai === "string" ? raw.ai : DEFAULTS.ai,
      habits: raw.habits && typeof raw.habits === "object" ? raw.habits : {},
    };
  } catch {
    return { ...DEFAULTS, habits: {} };
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
