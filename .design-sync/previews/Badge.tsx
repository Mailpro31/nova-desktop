import React from "react";
import { Badge } from "nova-app";

const row: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

export const Variants = () => (
  <div style={row}>
    <Badge>Recommandé</Badge>
    <Badge variant="success">Téléchargé</Badge>
    <Badge variant="secondary">Expérimental</Badge>
  </div>
);

export const InModelRow = () => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      maxWidth: 420,
      fontSize: 14,
    }}
  >
    <span style={{ fontWeight: 500 }}>Parakeet v3</span>
    <Badge variant="success">Téléchargé</Badge>
    <Badge>Recommandé</Badge>
  </div>
);

export const LongLabel = () => (
  <div style={row}>
    <Badge variant="secondary">Nécessite un redémarrage</Badge>
  </div>
);
