import React from "react";
import { AudioPlayer } from "nova-app";

const stack: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  maxWidth: 420,
};

export const Idle = () => (
  <div style={stack}>
    <AudioPlayer src="/recordings/2026-08-16T09-12-04.wav" />
  </div>
);

export const InHistoryRow = () => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 8,
      maxWidth: 480,
      padding: 12,
      borderRadius: 13,
      border: "1px solid rgb(128 128 128 / 0.2)",
    }}
  >
    <p style={{ fontSize: 14, lineHeight: 1.5 }}>
      « Rappelle-moi de relire le compte rendu avant la réunion de jeudi. »
    </p>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <span style={{ fontSize: 12, opacity: 0.6 }}>16 août, 09:12</span>
      <AudioPlayer src="/recordings/2026-08-16T09-12-04.wav" />
    </div>
  </div>
);
