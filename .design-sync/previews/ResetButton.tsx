import React from "react";
import { ResetButton } from "nova-app";

const noop = () => {};

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 16,
};

export const Default = () => (
  <div style={row}>
    <ResetButton onClick={noop} ariaLabel="Réinitialiser le raccourci" />
  </div>
);

export const Disabled = () => (
  <div style={row}>
    <ResetButton
      onClick={noop}
      disabled
      ariaLabel="Réinitialiser le raccourci"
    />
  </div>
);

export const WithLabel = () => (
  <div style={row}>
    <ResetButton onClick={noop} ariaLabel="Tout réinitialiser">
      <span style={{ fontSize: 13, padding: "0 4px" }}>Réinitialiser</span>
    </ResetButton>
  </div>
);

export const NextToValue = () => (
  <div style={{ ...row, gap: 8, fontSize: 13 }}>
    <span style={{ opacity: 0.7 }}>Ctrl + Maj + Espace</span>
    <ResetButton onClick={noop} ariaLabel="Réinitialiser le raccourci" />
  </div>
);
