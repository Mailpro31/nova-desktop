import React from "react";
import { SettingsGroup, ToggleSwitch } from "nova-app";

const noop = () => {};

const stack: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  maxWidth: 520,
};

export const States = () => (
  <div style={stack}>
    <ToggleSwitch
      checked
      onChange={noop}
      label="Démarrage automatique"
      description="Lance Nova à l’ouverture de la session."
      descriptionMode="inline"
    />
    <ToggleSwitch
      checked={false}
      onChange={noop}
      label="Mode débogage"
      description="Active les journaux détaillés et les outils de diagnostic."
      descriptionMode="inline"
    />
    <ToggleSwitch
      checked
      onChange={noop}
      disabled
      label="Traduction automatique"
      description="Indisponible avec le modèle de transcription actuel."
      descriptionMode="inline"
    />
  </div>
);

export const Updating = () => (
  <div style={stack}>
    <ToggleSwitch
      checked
      onChange={noop}
      isUpdating
      label="Micro toujours actif"
      description="Application du réglage en cours…"
      descriptionMode="inline"
    />
  </div>
);

export const TooltipDescription = () => (
  <div style={stack}>
    <ToggleSwitch
      checked
      onChange={noop}
      label="Ajouter une espace finale"
      description="Insère une espace après le texte collé, pratique pour dicter plusieurs phrases à la suite."
    />
  </div>
);

export const Grouped = () => (
  <div style={stack}>
    <SettingsGroup title="Sortie">
      <ToggleSwitch
        grouped
        checked
        onChange={noop}
        label="Coller automatiquement"
        description="Colle la transcription dans l’application active."
      />
      <ToggleSwitch
        grouped
        checked={false}
        onChange={noop}
        label="Valider automatiquement"
        description="Envoie la touche Entrée après le collage."
      />
    </SettingsGroup>
  </div>
);
