import React from "react";
import { HandyHand } from "nova-app";

// HandyHand est l'orbe « bille de verre » de Nova (le nom de fichier est
// historique). Le dégradé est piloté par les variables --orb-s0…--orb-s4, qui
// ont des valeurs de repli intégrées : l'orbe rend correctement sans réglage.

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 24,
};

export const Sizes = () => (
  <div style={row}>
    <HandyHand width={24} height={24} />
    <HandyHand width={48} height={48} />
    <HandyHand width={96} height={96} />
  </div>
);

export const Default = () => (
  <div style={row}>
    <HandyHand />
  </div>
);

export const InAppHeader = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
    <HandyHand width={32} height={32} />
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span style={{ fontSize: 15, fontWeight: 600 }}>Nova</span>
      <span style={{ fontSize: 12, opacity: 0.6 }}>Prêt à transcrire</span>
    </div>
  </div>
);
