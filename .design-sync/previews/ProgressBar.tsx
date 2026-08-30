import React from "react";
import { ProgressBar } from "nova-app";

const stack: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  maxWidth: 420,
};

export const Sizes = () => (
  <div style={stack}>
    <ProgressBar size="small" progress={[{ id: "s", percentage: 35 }]} />
    <ProgressBar size="medium" progress={[{ id: "m", percentage: 60 }]} />
    <ProgressBar size="large" progress={[{ id: "l", percentage: 85 }]} />
  </div>
);

export const WithLabelAndSpeed = () => (
  <div style={stack}>
    <ProgressBar
      size="large"
      showLabel
      showSpeed
      progress={[
        {
          id: "parakeet",
          percentage: 72,
          label: "Parakeet v3",
          speed: 4.2,
        },
      ]}
    />
  </div>
);

export const MultipleDownloads = () => (
  <div style={stack}>
    {/* En mode multiple, le composant n'affiche pas les libellés : il rend une
        mini-barre par élément (le libellé passe en `title`) suivie du décompte
        des téléchargements en cours. */}
    <ProgressBar
      size="medium"
      progress={[
        { id: "encoder", percentage: 100, label: "Encodeur" },
        { id: "decoder", percentage: 64, label: "Décodeur" },
        { id: "tokenizer", percentage: 12, label: "Tokeniseur" },
      ]}
    />
  </div>
);

export const Complete = () => (
  <div style={stack}>
    <ProgressBar
      size="large"
      showLabel
      progress={[{ id: "done", percentage: 100, label: "Whisper Turbo" }]}
    />
  </div>
);
