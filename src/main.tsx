import React from "react";
import ReactDOM from "react-dom/client";
import { platform } from "@tauri-apps/plugin-os";
import App from "./App";
import { AppErrorBoundary } from "./components/startup/AppErrorBoundary";
import {
  applyTheme,
  getStoredTheme,
  syncThemeFromSettings,
} from "./lib/utils/theme";
import { initOrbTheme } from "./lib/orbTheme";
import { initReadingComfort } from "./lib/readingComfort";
import { reportUiError } from "./lib/reportUiError";

// Set platform before render so CSS can scope per-platform (e.g. scrollbar styles)
document.documentElement.dataset.platform = platform();

// Apply the last-known theme synchronously before render to avoid a flash of
// the wrong palette, then reconcile with the persisted setting once it loads.
applyTheme(getStoredTheme());
syncThemeFromSettings();

// Applique la teinte d'orbe choisie (personnalisation Nova Ultra) et se
// réabonne aux changements provenant des autres fenêtres.
initOrbTheme();

// Réglages de lecture (taille, espacement, police) avant le premier rendu : un
// élève qui a choisi un texte espacé ne doit pas voir l'interface sauter.
initReadingComfort();

// Les exceptions que rien n'a rattrapées partent comme les plantages Rust (5.2).
window.addEventListener("error", (event) => reportUiError(event.error));
window.addEventListener("unhandledrejection", (event) =>
  reportUiError(event.reason),
);

// Initialize i18n
import "./i18n";

// Initialize model store (loads models and sets up event listeners)
import { useModelStore } from "./stores/modelStore";
useModelStore.getState().initialize();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {/* Une exception de rendu démonterait l'arbre et laisserait la WebView
        vide. Le filet la rend visible et rapportable. */}
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);
