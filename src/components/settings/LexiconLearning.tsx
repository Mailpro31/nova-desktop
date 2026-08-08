import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { useSettings } from "../../hooks/useSettings";
import { ToggleSwitch } from "../ui/ToggleSwitch";

interface LexiconLearningProps {
  descriptionMode?: "tooltip" | "inline";
  grouped?: boolean;
}

/**
 * Apprentissage progressif du lexique : quand il est actif, Nova repère les
 * noms propres et termes techniques récurrents des dictées et les PROPOSE
 * (jamais en silence) pour enrichir le lexique personnel. Ce réglage ne fait
 * que contrôler la proposition ; l'ajout reste toujours une décision explicite
 * de l'utilisateur (voir LexiconSuggestions).
 */
export const LexiconLearning: React.FC<LexiconLearningProps> = ({
  descriptionMode = "tooltip",
  grouped = false,
}) => {
  const { t } = useTranslation();
  const { settings, refreshSettings } = useSettings();
  const [enabled, setEnabled] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    setEnabled(settings?.lexicon_learning_enabled ?? true);
  }, [settings]);

  const change = async (next: boolean) => {
    setEnabled(next);
    setUpdating(true);
    try {
      await invoke("change_lexicon_learning_setting", { enabled: next });
      await refreshSettings();
    } catch {
      setEnabled(!next);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <ToggleSwitch
      checked={enabled}
      onChange={change}
      isUpdating={updating}
      label={t("lexiconLearning.title")}
      description={t("lexiconLearning.description")}
      descriptionMode={descriptionMode}
      grouped={grouped}
    />
  );
};
