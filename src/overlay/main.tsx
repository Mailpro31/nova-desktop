import React from "react";
import ReactDOM from "react-dom/client";
import RecordingOverlay from "./RecordingOverlay";
import "@/i18n";
import { initOrbTheme } from "@/lib/orbTheme";
import { initOverlayTheme } from "./overlayTheme";

// L'overlay est une fenêtre séparée : il applique la même teinte d'orbe et
// suit les changements faits depuis les réglages (via l'événement `storage`).
initOrbTheme();
// Même principe pour le thème clair/sombre : celui de Nova, pas seulement
// celui de Windows.
initOverlayTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RecordingOverlay />
  </React.StrictMode>,
);
