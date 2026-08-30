import React from "react";
import { PathDisplay } from "nova-app";

const noop = () => {};

const stack: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  maxWidth: 520,
};

export const Default = () => (
  <div style={stack}>
    <PathDisplay
      path="/Users/sasha/Library/Application Support/computer.nova.app"
      onOpen={noop}
    />
  </div>
);

// Accolades obligatoires pour le chemin Windows : un attribut JSX entre
// guillemets ne traite pas les séquences d'échappement et « \\ » s'afficherait
// littéralement.
export const LongPath = () => (
  <div style={stack}>
    <PathDisplay
      path={
        "C:\\Users\\sasha\\AppData\\Roaming\\computer.nova.app\\models\\parakeet-tdt-0.6b-v3"
      }
      onOpen={noop}
    />
  </div>
);

export const Disabled = () => (
  <div style={stack}>
    <PathDisplay
      path="/var/log/nova/transcription.log"
      onOpen={noop}
      disabled
    />
  </div>
);
