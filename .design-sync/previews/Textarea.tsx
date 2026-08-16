import React from "react";
import { Textarea } from "nova-app";

const stack: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  maxWidth: 480,
};

export const Default = () => (
  <div style={stack}>
    <Textarea
      defaultValue={
        "Tu es un assistant de reformulation. Corrige la ponctuation et les fautes de la transcription sans en changer le sens, et conserve la langue d’origine."
      }
    />
  </div>
);

export const Compact = () => (
  <div style={stack}>
    <Textarea
      variant="compact"
      defaultValue={"Nova, Parakeet, Whisper, Tauri"}
    />
  </div>
);

export const Placeholder = () => (
  <div style={stack}>
    <Textarea placeholder="Décrivez le style de reformulation attendu…" />
  </div>
);
