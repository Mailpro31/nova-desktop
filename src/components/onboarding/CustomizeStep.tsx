import React from "react";
import { useTranslation } from "react-i18next";

import OnboardingStepShell from "./OnboardingStepShell";
import { SettingsGroup } from "../ui/SettingsGroup";
import { MicrophoneSelector } from "../settings/MicrophoneSelector";
import { LanguageSelector } from "../settings/LanguageSelector";
import { ShortcutInput } from "../settings/ShortcutInput";

interface CustomizeStepProps {
  stepIndex: number;
  stepCount: number;
  onBack: () => void;
  onContinue: () => void;
}

/**
 * Configuration manuelle — quatre décisions, pas les réglages complets.
 *
 * Les contrôles sont les composants de réglage réels de Nova : ils écrivent
 * dans les mêmes clés que la section Réglages, donc rien n'est à re-saisir
 * ensuite et aucune logique n'est dupliquée ici.
 */
export const CustomizeStep: React.FC<CustomizeStepProps> = ({
  stepIndex,
  stepCount,
  onBack,
  onContinue,
}) => {
  const { t } = useTranslation();

  return (
    <OnboardingStepShell
      title={t("onboarding.customize.title")}
      subtitle={t("onboarding.customize.subtitle")}
      stepIndex={stepIndex}
      stepCount={stepCount}
      onBack={onBack}
      onContinue={onContinue}
      continueLabel={t("onboarding.step.continue")}
    >
      <SettingsGroup>
        <MicrophoneSelector grouped descriptionMode="inline" />
        <LanguageSelector grouped descriptionMode="inline" />
        <ShortcutInput shortcutId="transcribe" grouped />
      </SettingsGroup>
    </OnboardingStepShell>
  );
};

export default CustomizeStep;
