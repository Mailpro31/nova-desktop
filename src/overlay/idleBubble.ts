/**
 * Taille de la fenêtre de la bulle au repos.
 *
 * La bulle est toujours affichée, au-dessus de toutes les fenêtres. Pleine
 * taille, elle masquait le bas des applications (champ de saisie, boutons) :
 * au repos, elle n'est plus qu'une fine poignée, et ne se déplie qu'au survol
 * ou quand elle a quelque chose à montrer (menu des Styles, suggestion).
 *
 * Les tailles natives correspondantes vivent dans `overlay.rs`
 * (`idle_window_size`) : garder les deux en phase.
 */

/** Hauteur de la fenêtre repliée : la poignée seule. */
export const IDLE_HANDLE_HEIGHT = 14;

/** Hauteur de la pilule dépliée (réglages, orbe, Styles). */
export const IDLE_PILL_HEIGHT = 42;

/** Délai avant de replier la bulle quand la souris l'a quittée. */
export const IDLE_COLLAPSE_DELAY_MS = 600;

export interface IdleBubbleState {
  /** La souris survole la bulle, ou vient de la quitter. */
  expanded: boolean;
  menuOpen: boolean;
  /** Hauteur demandée par le menu des Styles quand il est ouvert. */
  menuHeight: number;
  /** Hauteur de la carte de suggestion, 0 quand aucune n'est affichée. */
  suggestionHeight: number;
}

export function idleWindowHeight(state: IdleBubbleState): number {
  if (state.menuOpen) return state.menuHeight;
  if (state.suggestionHeight > 0) return state.suggestionHeight;
  return state.expanded ? IDLE_PILL_HEIGHT : IDLE_HANDLE_HEIGHT;
}
