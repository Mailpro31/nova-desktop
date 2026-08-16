import React from "react";
import { SettingsGroup, TextDisplay } from "nova-app";

const stack: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  maxWidth: 520,
};

export const Default = () => (
  <div style={stack}>
    <TextDisplay
      label="Modèle actif"
      description="Modèle de transcription actuellement chargé en mémoire."
      value="parakeet-tdt-0.6b-v3"
      descriptionMode="inline"
    />
  </div>
);

export const Copyable = () => (
  <div style={stack}>
    <TextDisplay
      label="Identifiant d’installation"
      description="À joindre à un rapport de bogue pour retrouver les journaux correspondants."
      value="9f4c1ad2-70be-4e39-a1cb-2ce55a0c8d71"
      descriptionMode="inline"
      copyable
      monospace
    />
  </div>
);

export const Empty = () => (
  <div style={stack}>
    <TextDisplay
      label="Dernière transcription"
      description="Texte produit lors du dernier enregistrement."
      value=""
      placeholder="Aucune transcription pour l’instant"
      descriptionMode="inline"
    />
  </div>
);

export const Grouped = () => (
  <div style={stack}>
    <SettingsGroup title="Diagnostic">
      <TextDisplay
        grouped
        label="Version de Nova"
        description="Version de l’application installée."
        value="1.0.36"
        descriptionMode="inline"
      />
      <TextDisplay
        grouped
        label="Accélération"
        description="Backend de calcul utilisé pour l’inférence."
        value="Vulkan"
        descriptionMode="inline"
      />
    </SettingsGroup>
  </div>
);
