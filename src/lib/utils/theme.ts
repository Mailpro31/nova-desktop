import { commands, type Theme } from "@/bindings";

/**
 * Appearance theme handling.
 *
 * Handy already ships a full light palette and a full dark palette (see
 * `App.css`). This module lets the user pick which one is used instead of
 * always following the OS:
 *  - `system` removes the override so the `prefers-color-scheme` media query
 *    governs (the historical behaviour).
 *  - `light` / `dark` set `data-theme` on the document root, whose
 *    higher-specificity CSS selectors win over the media query.
 *
 * The choice is persisted in `AppSettings` (source of truth) and mirrored to
 * localStorage so it can be applied synchronously on boot, before React mounts,
 * avoiding a flash of the wrong palette.
 */

export const THEME_STORAGE_KEY = "handy.theme";

export const THEME_OPTIONS: Theme[] = ["system", "light", "dark"];

const isTheme = (value: unknown): value is Theme =>
  value === "system" || value === "light" || value === "dark";

/** Apply a theme to the document root and remember it for the next launch. */
export const applyTheme = (theme: Theme): void => {
  // Le thème choisi s'applique partout, école comprise. Un établissement
  // imposait jusqu'ici le thème clair, alors que le sélecteur restait affiché
  // dans son onglet Général : l'élève choisissait un thème, et Nova l'ignorait.
  // Pour un élève dys, pouvoir passer en sombre est un réglage d'accessibilité,
  // pas une coquetterie.
  const effectiveTheme: Theme = theme;
  const root = document.documentElement;
  if (effectiveTheme === "system") {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = effectiveTheme;
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, effectiveTheme);
  } catch {
    // localStorage may be unavailable (e.g. private mode); the setting still
    // persists in AppSettings, so this only costs a one-frame flash on boot.
  }
};

/** Read the last-applied theme for synchronous boot-time application. */
export const getStoredTheme = (): Theme => {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (isTheme(stored)) return stored;
  } catch {
    // ignore
  }
  return "system";
};

/** Apply the persisted theme from AppSettings (the source of truth). */
export const syncThemeFromSettings = async (): Promise<void> => {
  try {
    const result = await commands.getAppSettings();
    if (result.status === "ok") {
      const theme: Theme = result.data.theme ?? "system";
      applyTheme(theme);
    }
  } catch (e) {
    console.warn("Failed to sync theme from settings:", e);
  }
};
