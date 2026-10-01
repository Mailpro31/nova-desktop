import React, { useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { commands } from "@/bindings";
import { useSettings } from "@/hooks/useSettings";
import { gainInDecibels } from "@/lib/voiceCalibration";
import { VoiceCalibrationStep } from "../onboarding/VoiceCalibrationStep";
import { Button } from "../ui/Button";
import { SettingContainer } from "../ui/SettingContainer";

/**
 * « Ma voix » : refaire le calibrage, ou revenir au niveau d'origine.
 *
 * ## Pourquoi dans les réglages
 *
 * Le calibrage n'avait lieu qu'à la première ouverture. Un poste déjà installé
 * n'y avait donc jamais accès, et un élève qui change de micro, de salle ou de
 * manière de parler ne pouvait pas le refaire.
 *
 * ## Pourquoi un bouton « Réinitialiser »
 *
 * Un gain mal calibré — lu trop bas un jour de fatigue — relèverait aussi le
 * bruit de chaque dictée suivante. Revenir en arrière doit tenir en un clic,
 * sans refaire huit phrases.
 */
export const VoiceCalibrationSetting: React.FC<{ grouped?: boolean }> = ({
  grouped = false,
}) => {
  const { t } = useTranslation();
  const { getSetting, refreshSettings } = useSettings();
  const [open, setOpen] = useState(false);
  const decibels = gainInDecibels(getSetting("input_gain"));

  const close = async () => {
    setOpen(false);
    await refreshSettings();
  };

  const reset = async () => {
    await commands.setInputGain(1);
    await refreshSettings();
  };

  return (
    <>
      <SettingContainer
        title={t("settings.voiceCalibration.title")}
        description={
          decibels > 0
            ? t("settings.voiceCalibration.descriptionGain", { db: decibels })
            : t("settings.voiceCalibration.descriptionNone")
        }
        descriptionMode="inline"
        grouped={grouped}
      >
        <div className="flex items-center gap-2">
          {decibels > 0 && (
            <Button variant="ghost" size="sm" onClick={reset}>
              {t("settings.voiceCalibration.reset")}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            {t("settings.voiceCalibration.recalibrate")}
          </Button>
        </div>
      </SettingContainer>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 bg-background">
            <VoiceCalibrationStep
              stepIndex={-1}
              stepCount={0}
              onSkip={close}
              skipLabel={t("common.cancel")}
              onDone={close}
            />
          </div>,
          document.body,
        )}
    </>
  );
};

export default VoiceCalibrationSetting;
