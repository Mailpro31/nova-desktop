import React from "react";
import { CancelIcon } from "nova-app";

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 24,
};

export const Sizes = () => (
  <div style={row}>
    <CancelIcon width={16} height={16} />
    <CancelIcon width={24} height={24} />
    <CancelIcon width={40} height={40} />
  </div>
);

export const Colors = () => (
  <div style={row}>
    <CancelIcon width={28} height={28} />
    <CancelIcon width={28} height={28} color="var(--color-danger)" />
    <CancelIcon width={28} height={28} color="var(--color-text-secondary)" />
  </div>
);

export const InCancelAction = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
    <CancelIcon width={16} height={16} color="var(--color-danger)" />
    <span>Annuler l’enregistrement</span>
  </div>
);
