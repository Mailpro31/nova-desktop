import React from "react";
import { useTranslation } from "react-i18next";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { useSettings } from "../../hooks/useSettings";

interface DebugModeToggleProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

// Rend le mode débogage DÉCOUVRABLE. Il s'active historiquement via un raccourci
// caché (Ctrl+Maj+D) — introuvable sans le connaître. Cet interrupteur, placé
// dans « À propos » à côté des autres outils techniques (logs, données), l'ouvre
// d'un clic ; la description rappelle aussi le raccourci pour ceux qui préfèrent.
export const DebugModeToggle: React.FC<DebugModeToggleProps> = React.memo(
  ({ descriptionMode = "tooltip", grouped = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting, isUpdating } = useSettings();

    const enabled = getSetting("debug_mode") ?? false;

    return (
      <ToggleSwitch
        checked={enabled}
        onChange={(value) => updateSetting("debug_mode", value)}
        isUpdating={isUpdating("debug_mode")}
        label={t("settings.about.debugMode.title")}
        description={t("settings.about.debugMode.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
      />
    );
  },
);
