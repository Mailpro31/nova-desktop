import React from "react";
import { ResetIcon } from "nova-app";

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 24,
};

export const Sizes = () => (
  <div style={row}>
    <ResetIcon width={16} height={16} />
    <ResetIcon width={24} height={24} />
    <ResetIcon width={40} height={40} />
  </div>
);

// Attention : `ResetIcon` déclare une prop `color` mais ne l'applique pas — le
// tracé est toujours dessiné en `currentColor`. La couleur se pilote donc
// depuis le parent, via la propriété CSS `color`.
export const InheritedColor = () => (
  <div style={row}>
    <span style={{ display: "inline-flex" }}>
      <ResetIcon width={28} height={28} />
    </span>
    <span style={{ display: "inline-flex", color: "var(--color-accent)" }}>
      <ResetIcon width={28} height={28} />
    </span>
    <span style={{ display: "inline-flex", color: "var(--color-danger)" }}>
      <ResetIcon width={28} height={28} />
    </span>
  </div>
);

export const InResetAction = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
    <ResetIcon width={16} height={16} />
    <span>Rétablir la valeur par défaut</span>
  </div>
);
