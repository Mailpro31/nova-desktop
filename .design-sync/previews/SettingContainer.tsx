import React from "react";
import { Button, Input, SettingContainer, SettingsGroup } from "nova-app";

const stack: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  maxWidth: 560,
};

export const HorizontalInline = () => (
  <div style={stack}>
    <SettingContainer
      title="Dossier des modèles"
      description="Emplacement où Nova stocke les modèles téléchargés."
      descriptionMode="inline"
      layout="horizontal"
    >
      <Button variant="secondary" size="sm">
        Ouvrir
      </Button>
    </SettingContainer>
  </div>
);

export const HorizontalTooltip = () => (
  <div style={stack}>
    <SettingContainer
      title="Raccourci global"
      description="Combinaison de touches qui démarre et arrête l’enregistrement, où que vous soyez."
      layout="horizontal"
    >
      <Input variant="compact" defaultValue="Ctrl + Maj + Espace" />
    </SettingContainer>
  </div>
);

export const Stacked = () => (
  <div style={stack}>
    <SettingContainer
      title="Mots personnalisés"
      description="Termes que le modèle doit reconnaître en priorité, séparés par des virgules."
      descriptionMode="inline"
      layout="stacked"
    >
      <Input defaultValue="Nova, Parakeet, Tauri" style={{ width: "100%" }} />
    </SettingContainer>
  </div>
);

export const Disabled = () => (
  <div style={stack}>
    <SettingContainer
      title="Traduction vers l’anglais"
      description="Indisponible avec le modèle de transcription actuel."
      descriptionMode="inline"
      layout="horizontal"
      disabled
    >
      <Button variant="secondary" size="sm" disabled>
        Configurer
      </Button>
    </SettingContainer>
  </div>
);

export const Grouped = () => (
  <div style={stack}>
    <SettingsGroup title="Stockage">
      <SettingContainer
        grouped
        title="Dossier des modèles"
        description="Emplacement des modèles téléchargés."
        descriptionMode="inline"
      >
        <Button variant="secondary" size="sm">
          Ouvrir
        </Button>
      </SettingContainer>
      <SettingContainer
        grouped
        title="Journaux"
        description="Fichiers de diagnostic conservés localement."
        descriptionMode="inline"
      >
        <Button variant="secondary" size="sm">
          Ouvrir
        </Button>
      </SettingContainer>
    </SettingsGroup>
  </div>
);
