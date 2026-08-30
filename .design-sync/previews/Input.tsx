import React from "react";
import { Input } from "nova-app";

const stack: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  maxWidth: 360,
};

export const Variants = () => (
  <div style={stack}>
    <Input defaultValue="Nova" placeholder="Nom affiché" />
    <Input variant="compact" defaultValue="12" placeholder="Secondes" />
  </div>
);

export const Placeholder = () => (
  <div style={stack}>
    <Input placeholder="Ajouter un mot au lexique…" />
  </div>
);

export const Disabled = () => (
  <div style={stack}>
    <Input defaultValue="Ctrl + Espace" disabled />
  </div>
);

export const Numeric = () => (
  <div style={{ ...stack, maxWidth: 120 }}>
    <Input type="number" defaultValue={300} min={0} max={3600} step={30} />
  </div>
);
