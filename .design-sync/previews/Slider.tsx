import React from "react";
import { SettingsGroup, Slider } from "nova-app";

const noop = () => {};

const stack: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  maxWidth: 520,
};

export const Default = () => (
  <div style={stack}>
    <Slider
      label="Sensibilité de la détection vocale"
      description="Plus la valeur est élevée, plus Nova exige un signal net pour démarrer la transcription."
      descriptionMode="inline"
      min={0}
      max={1}
      step={0.05}
      value={0.45}
      onChange={noop}
    />
  </div>
);

export const FormattedValue = () => (
  <div style={stack}>
    <Slider
      label="Délai de déchargement du modèle"
      description="Durée d’inactivité avant que le modèle soit retiré de la mémoire."
      descriptionMode="inline"
      min={0}
      max={600}
      step={30}
      value={300}
      formatValue={(v) => `${Math.round(v / 60)} min`}
      onChange={noop}
    />
  </div>
);

export const WithoutValue = () => (
  <div style={stack}>
    <Slider
      label="Volume du retour sonore"
      description="Niveau des sons de début et de fin d’enregistrement."
      descriptionMode="inline"
      min={0}
      max={1}
      step={0.05}
      value={0.8}
      showValue={false}
      onChange={noop}
    />
  </div>
);

export const Disabled = () => (
  <div style={stack}>
    <Slider
      label="Gain du microphone"
      description="Indisponible tant qu’aucun périphérique d’entrée n’est sélectionné."
      descriptionMode="inline"
      min={0}
      max={2}
      step={0.1}
      value={1}
      disabled
      formatValue={(v) => `${v.toFixed(1)}×`}
      onChange={noop}
    />
  </div>
);

export const Grouped = () => (
  <div style={stack}>
    <SettingsGroup title="Transcription">
      <Slider
        grouped
        label="Seuil de silence"
        description="Durée de silence qui termine un segment."
        min={0}
        max={3}
        step={0.1}
        value={1.2}
        formatValue={(v) => `${v.toFixed(1)} s`}
        onChange={noop}
      />
    </SettingsGroup>
  </div>
);
