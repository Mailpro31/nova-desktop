import { getStoredTheme, THEME_STORAGE_KEY } from "@/lib/utils/theme";

/**
 * Thème de la bulle : celui de Nova, et celui de Windows seulement quand Nova
 * le suit.
 *
 * La bulle est une fenêtre à part. Elle ne recevait jamais le thème choisi dans
 * Nova, et ses règles sombres suivaient Windows : Nova en clair et Windows en
 * sombre donnaient des icônes blanches sur une carte claire — l'étoile des
 * Styles et l'engrenage disparaissaient.
 */
export function resolveOverlayTheme(
  stored: string,
  systemPrefersDark: boolean,
): "light" | "dark" {
  if (stored === "light" || stored === "dark") return stored;
  return systemPrefersDark ? "dark" : "light";
}

/**
 * Applique le thème à la bulle et le tient à jour : un changement fait dans les
 * réglages arrive par l'événement `storage` (même origine que la fenêtre
 * principale), un changement de Windows par la media query.
 */
export function initOverlayTheme(): void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const apply = () => {
    // `getStoredTheme` applique déjà la règle Campus (clair imposé).
    document.documentElement.dataset.theme = resolveOverlayTheme(
      getStoredTheme(),
      media.matches,
    );
  };
  apply();
  window.addEventListener("storage", (event) => {
    if (event.key === THEME_STORAGE_KEY) apply();
  });
  media.addEventListener("change", apply);
}
