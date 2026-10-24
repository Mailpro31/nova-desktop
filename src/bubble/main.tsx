import React from "react";
import ReactDOM from "react-dom/client";
import SelectionBubble from "./SelectionBubble";
import "@/App.css";
import "@/i18n";
import { initOverlayTheme } from "@/overlay/overlayTheme";
import { initReadingComfort } from "@/lib/readingComfort";

// Même thème et mêmes réglages de lecture que Nova : la bulle est lue par un
// élève qui a peut-être choisi une police et un espacement adaptés.
initOverlayTheme();
initReadingComfort();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <SelectionBubble />
  </React.StrictMode>,
);
