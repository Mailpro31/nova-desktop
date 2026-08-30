import React from "react";
import { TranscriptionIcon } from "nova-app";

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 24,
};

export const Sizes = () => (
  <div style={row}>
    <TranscriptionIcon width={16} height={16} />
    <TranscriptionIcon width={24} height={24} />
    <TranscriptionIcon width={40} height={40} />
    <TranscriptionIcon width={64} height={64} />
  </div>
);

export const Colors = () => (
  <div style={row}>
    <TranscriptionIcon width={32} height={32} />
    <TranscriptionIcon width={32} height={32} color="var(--color-accent)" />
    <TranscriptionIcon
      width={32}
      height={32}
      color="var(--color-text-secondary)"
    />
  </div>
);

export const InEmptyState = () => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 12,
      padding: 24,
      textAlign: "center",
      maxWidth: 320,
    }}
  >
    <TranscriptionIcon width={48} height={48} color="var(--color-mid-gray)" />
    <p style={{ fontSize: 14, opacity: 0.7 }}>
      Aucune transcription pour l’instant. Maintenez le raccourci global pour
      dicter.
    </p>
  </div>
);
