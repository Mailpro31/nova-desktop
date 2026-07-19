import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { ToggleSwitch } from "../../ui/ToggleSwitch";
import { TierBadge, getStatus } from "../license/TierBadge";
import { useSettings } from "../../../hooks/useSettings";

/**
 * Réglages « Lecture de contexte ». Deux interrupteurs :
 *  - lecture du texte de la fenêtre active (rapide, local) — nourrit la
 *    reformulation avec la situation (le mail auquel on répond, la conversation) ;
 *  - lecture visuelle avancée (image de l'écran → IA en ligne), réservée Nova
 *    Ultra et sans effet si la lecture de contexte est éteinte.
 *
 * Les champs sont absents des bindings tant que le build Rust n'a pas régénéré
 * les types → lecture souple (cast) + écriture via `invoke` brut, exactement
 * comme AutoStyleSettings.
 */
export const ContextReadingSettings: React.FC = () => {
  const { t } = useTranslation();
  const { settings, refreshSettings } = useSettings();
  const [enabled, setEnabled] = useState(false);
  const [visual, setVisual] = useState(false);
  const [canVisual, setCanVisual] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const s = settings as unknown as {
      context_reading_enabled?: boolean;
      context_visual_enabled?: boolean;
    } | null;
    setEnabled(s?.context_reading_enabled ?? false);
    setVisual(s?.context_visual_enabled ?? false);
  }, [settings]);

  // La lecture visuelle passe par le moteur en ligne (Turbo) → même verrou que
  // la fonctionnalité `online_engine` (Nova Ultra).
  useEffect(() => {
    getStatus().then((st) =>
      setCanVisual(st ? (st.features?.online_engine ?? false) : true),
    );
  }, []);

  const persist = async (nextEnabled: boolean, nextVisual: boolean) => {
    const visualFinal = nextEnabled && nextVisual;
    setSaving(true);
    setEnabled(nextEnabled);
    setVisual(visualFinal);
    try {
      await invoke("update_context_reading_config", {
        enabled: nextEnabled,
        visual: visualFinal,
      });
      await refreshSettings();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <SettingsGroup
        title={t("settings.postProcessing.contextReading.title")}
        description={t("settings.postProcessing.contextReading.description")}
      >
        <ToggleSwitch
          checked={enabled}
          onChange={(v) => persist(v, v ? visual : false)}
          isUpdating={saving}
          label={t("settings.postProcessing.contextReading.enableLabel")}
          description={t(
            "settings.postProcessing.contextReading.enableDescription",
          )}
          descriptionMode="inline"
          grouped={true}
        />
        <ToggleSwitch
          checked={enabled && visual && canVisual}
          onChange={(v) => persist(enabled, v)}
          disabled={!enabled || !canVisual}
          isUpdating={saving}
          label={t("settings.postProcessing.contextReading.visualLabel")}
          description={t(
            "settings.postProcessing.contextReading.visualDescription",
          )}
          descriptionMode="inline"
          grouped={true}
        />
      </SettingsGroup>

      <div className="px-4 space-y-1">
        <TierBadge feature="online_engine" />
        <p className="text-xs text-mid-gray/70">
          {t("settings.postProcessing.contextReading.privacyNote")}
        </p>
        <p className="text-xs text-mid-gray/70">
          {t("settings.postProcessing.contextReading.experimentalNote")}
        </p>
      </div>
    </div>
  );
};

export default ContextReadingSettings;
