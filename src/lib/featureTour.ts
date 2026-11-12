/**
 * Visite guidée des fonctionnalités de Nova.
 *
 * Même choix que `lib/onboarding/progress.ts` : « déjà vue » est une
 * préférence d'affichage, donc `localStorage` plutôt qu'un réglage Rust.
 */
import type { SidebarSection } from "@/components/Sidebar";

const KEY = "nova.featureTour.v1";
export const TOUR_REPLAY_EVENT = "nova:replay-feature-tour";

/** Une carte = une fonctionnalité réellement présente dans la barre latérale ou les réglages. */
export interface TourCard {
  id: string;
  /** Section à ouvrir avec le bouton « Ouvrir » ; absent = pas de bouton. */
  section?: SidebarSection;
}

export const TOUR_CARDS: TourCard[] = [
  { id: "dictation", section: "home" },
  { id: "voiceCommands" },
  { id: "styles", section: "postprocessing" },
  { id: "commands", section: "aiskills" },
  { id: "aiSkills", section: "aiskilltools" },
  { id: "reader", section: "reader" },
  { id: "dictionary", section: "configuration" },
  { id: "courseNotes", section: "configuration" },
  { id: "notes", section: "notes" },
  { id: "prompts", section: "prompts" },
  { id: "meeting", section: "meeting" },
  { id: "learn", section: "learn" },
  { id: "history", section: "history" },
  { id: "connections", section: "connections" },
];

/**
 * Les cartes dont la section est présente sur ce poste. Sans section, ou sur
 * « configuration » (Réglages, toujours atteignable), la carte reste.
 */
export function tourCardsFor(
  isVisible: (section: SidebarSection) => boolean,
): TourCard[] {
  return TOUR_CARDS.filter(
    (c) => !c.section || c.section === "configuration" || isVisible(c.section),
  );
}

export function isTourSeen(): boolean {
  try {
    return localStorage.getItem(KEY) === "seen";
  } catch {
    // Stockage indisponible : mieux vaut ne pas harceler à chaque lancement.
    return true;
  }
}

/** Appelé par « Passer », « Terminer », Échap et à la fermeture. */
export function markTourSeen(): void {
  try {
    localStorage.setItem(KEY, "seen");
  } catch {
    // Sans stockage, la visite n'est de toute façon jamais lancée seule.
  }
}

/** Bouton « Revoir la visite » des réglages. */
export function requestTourReplay(): void {
  window.dispatchEvent(new Event(TOUR_REPLAY_EVENT));
}
