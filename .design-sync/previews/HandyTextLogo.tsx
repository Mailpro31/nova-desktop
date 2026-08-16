import React from "react";
import { HandyTextLogo } from "nova-app";

// Verrou de marque : l'orbe Nova suivi du mot-symbole « Nova ». Nom de fichier
// historique, comme HandyHand.

const stack: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 20,
  alignItems: "flex-start",
};

export const Default = () => (
  <div style={stack}>
    <HandyTextLogo />
  </div>
);

export const Sizes = () => (
  <div style={stack}>
    <HandyTextLogo width={120} />
    <HandyTextLogo width={180} />
    <HandyTextLogo width={260} />
  </div>
);

export const OnSurface = () => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 32,
      borderRadius: 13,
      border: "1px solid rgb(128 128 128 / 0.2)",
      maxWidth: 360,
    }}
  >
    <HandyTextLogo width={200} />
  </div>
);
