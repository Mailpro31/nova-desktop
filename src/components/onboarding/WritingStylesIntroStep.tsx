import React from "react";
import { useTranslation } from "react-i18next";

import OnboardingStepShell from "./OnboardingStepShell";
import { useSettings } from "../../hooks/useSettings";
import type { LLMPrompt } from "@/bindings";

interface WritingStylesIntroStepProps {
  stepIndex: number;
  stepCount: number;
  onBack: () => void;
  onContinue: () => void;
  onSkip: () => void;
}

/** Nombre de styles montrés : au-delà, l'écran devient un catalogue. */
const MAX_SHOWN = 4;

/**
 * Découverte des **Styles d'écriture** : la manière dont Nova rédige une
 * dictée.
 *
 * Cet écran s'appelait « AI Skills » tant que les deux notions étaient
 * confondues. Il ne le fait plus : les AI Skills sont des actions sur du texte
 * sélectionné, et ils sont expérimentaux. **Les présenter ici les ferait
 * découvrir à un étudiant qui ne peut pas les utiliser** — la première
 * ouverture ne doit montrer que ce qui fonctionne réellement.
 *
 * Source de vérité : les Styles réellement configurés (`post_process_prompts`).
 * Rien n'est écrit en dur ; sans style disponible, l'écran le dit.
 */
export const WritingStylesIntroStep: React.FC<WritingStylesIntroStepProps> = ({
  stepIndex,
  stepCount,
  onBack,
  onContinue,
  onSkip,
}) => {
  const { t } = useTranslation();
  const { getSetting } = useSettings();

  const prompts = (getSetting("post_process_prompts") ?? []) as LLMPrompt[];
  const shown = prompts.slice(0, MAX_SHOWN);

  return (
    <OnboardingStepShell
      title={t("onboarding.writingStyles.introTitle")}
      subtitle={t("onboarding.writingStyles.introSubtitle")}
      stepIndex={stepIndex}
      stepCount={stepCount}
      onBack={onBack}
      onSkip={onSkip}
      onContinue={onContinue}
      continueLabel={t("onboarding.step.continue")}
    >
      {shown.length === 0 ? (
        <p className="text-sm text-text-secondary text-center py-6">
          {t("onboarding.writingStyles.unavailable")}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {shown.map((prompt) => (
            <div
              key={prompt.id}
              className="rounded-card border border-hairline px-3.5 py-3"
            >
              <p className="text-sm font-medium text-text truncate">
                {prompt.name}
              </p>
            </div>
          ))}
        </div>
      )}
    </OnboardingStepShell>
  );
};

export default WritingStylesIntroStep;
