import React from "react";
import { Alert } from "nova-app";

const stack: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  maxWidth: 560,
};

export const Variants = () => (
  <div style={stack}>
    <Alert variant="error">
      Le modèle Whisper Large n’a pas pu être chargé : mémoire GPU insuffisante.
      Choisissez un modèle plus léger dans les réglages.
    </Alert>
    <Alert variant="warning">
      Aucun microphone n’a été détecté. La transcription restera inactive tant
      qu’un périphérique d’entrée n’est pas sélectionné.
    </Alert>
    <Alert variant="info">
      La détection d’activité vocale filtre les silences avant la transcription
      : les enregistrements très courts peuvent être ignorés.
    </Alert>
    <Alert variant="success">
      Modèle Parakeet téléchargé et vérifié. La transcription hors ligne est
      prête.
    </Alert>
  </div>
);

export const ShortMessage = () => (
  <div style={stack}>
    <Alert variant="error">Permission d’accessibilité refusée.</Alert>
  </div>
);

export const Contained = () => (
  <div
    style={{
      maxWidth: 560,
      borderRadius: 13,
      overflow: "hidden",
      border: "1px solid rgb(128 128 128 / 0.2)",
    }}
  >
    <Alert variant="warning" contained>
      Le raccourci global est déjà utilisé par une autre application. Nova ne
      pourra pas démarrer l’enregistrement tant qu’il n’est pas modifié.
    </Alert>
  </div>
);
