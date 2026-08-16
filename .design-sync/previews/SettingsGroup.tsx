import React from "react";
import {
  SettingContainer,
  SettingsGroup,
  Slider,
  ToggleSwitch,
} from "nova-app";

const noop = () => {};

export const WithTitle = () => (
  <div style={{ maxWidth: 560 }}>
    <SettingsGroup
      title="Enregistrement"
      description="Comportement du micro pendant la dictée."
    >
      <ToggleSwitch
        grouped
        checked
        onChange={noop}
        label="Appuyer pour parler"
        description="Maintenir le raccourci pour enregistrer, le relâcher pour transcrire."
      />
      <ToggleSwitch
        grouped
        checked={false}
        onChange={noop}
        label="Couper les autres sources"
        description="Met en sourdine la lecture audio du système pendant l’enregistrement."
      />
      <ToggleSwitch
        grouped
        checked
        onChange={noop}
        label="Retour sonore"
        description="Joue un son court au début et à la fin de l’enregistrement."
      />
    </SettingsGroup>
  </div>
);

export const Untitled = () => (
  <div style={{ maxWidth: 560 }}>
    <SettingsGroup>
      <SettingContainer
        grouped
        title="Modèle de transcription"
        description="Modèle exécuté localement pour convertir la voix en texte."
        descriptionMode="inline"
      >
        <span style={{ fontSize: 13, opacity: 0.7 }}>Parakeet v3</span>
      </SettingContainer>
      <SettingContainer
        grouped
        title="Périphérique d’entrée"
        description="Microphone utilisé pour la dictée."
        descriptionMode="inline"
      >
        <span style={{ fontSize: 13, opacity: 0.7 }}>MacBook Pro</span>
      </SettingContainer>
    </SettingsGroup>
  </div>
);

export const MixedControls = () => (
  <div style={{ maxWidth: 560 }}>
    <SettingsGroup title="Audio">
      <ToggleSwitch
        grouped
        checked
        onChange={noop}
        label="Détection d’activité vocale"
        description="Filtre les silences avant d’envoyer l’audio au modèle."
      />
      <Slider
        grouped
        label="Volume du retour sonore"
        description="Niveau des sons de début et de fin d’enregistrement."
        descriptionMode="inline"
        min={0}
        max={1}
        step={0.05}
        value={0.6}
        formatValue={(v) => `${Math.round(v * 100)} %`}
        onChange={noop}
      />
    </SettingsGroup>
  </div>
);
