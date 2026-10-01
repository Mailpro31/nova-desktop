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

/**
 * Les trois Styles présentés à l'élève, dans cet ordre : celui que le mode
 * automatique choisit partout, celui du cours, et l'e-mail. Les autres restent
 * dans les Réglages : à la première ouverture, un écran n'est pas un catalogue.
 */
const FEATURED_STYLE_IDS = [
  "nova_style_everyday",
  "nova_style_course_notes",
  "nova_style_email",
];

/**
 * Découverte des **Styles d'écriture** : la manière dont Nova rédige une
 * dictée.
 *
 * Refait le 01/10 à la demande de Sash. L'écran montrait les quatre premiers
 * Styles enregistrés, au hasard de leur ordre, sans dire ce qu'ils faisaient,
 * sur des cartes qui semblaient cliquables. Il montre maintenant ce que Nova
 * fait vraiment : un avant/après sur une reprise, le mode automatique, et
 * trois Styles décrits.
 *
 * Source de vérité des Styles : ceux réellement configurés
 * (`post_process_prompts`) ; un Style absent n'est pas présenté.
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
  const featured = FEATURED_STYLE_IDS.map((id) =>
    prompts.find((prompt) => prompt.id === id),
  ).filter((prompt): prompt is LLMPrompt => prompt !== undefined);

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
      <div className="w-full max-w-[560px] space-y-6">
        <figure className="rounded-card border border-hairline overflow-hidden">
          <div className="px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
              {t("onboarding.writingStyles.saidLabel")}
            </p>
            <p className="mt-1.5 text-sm text-text-secondary">
              {t("onboarding.writingStyles.said")}
            </p>
          </div>
          <div className="px-4 py-3 border-t border-hairline bg-accent/10">
            <p className="text-xs font-medium uppercase tracking-wide text-accent">
              {t("onboarding.writingStyles.writtenLabel")}
            </p>
            <p className="mt-1.5 text-base font-medium text-text">
              {t("onboarding.writingStyles.written")}
            </p>
          </div>
        </figure>

        <p className="text-sm leading-relaxed text-text-secondary text-center">
          {t("onboarding.writingStyles.automatic")}
        </p>

        {featured.length === 0 ? (
          <p className="text-sm text-text-secondary text-center py-2">
            {t("onboarding.writingStyles.unavailable")}
          </p>
        ) : (
          <ul
            aria-label={t("onboarding.writingStyles.stylesLabel")}
            className="divide-y divide-hairline rounded-card border border-hairline"
          >
            {featured.map((prompt) => (
              <li key={prompt.id} className="px-4 py-3">
                <p className="text-sm font-semibold text-text">{prompt.name}</p>
                <p className="mt-0.5 text-sm text-text-secondary">
                  {t(`organization.styles.descriptions.${prompt.id}`, "")}
                </p>
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-text-secondary text-center">
          {t("onboarding.writingStyles.changeLater")}
        </p>
      </div>
    </OnboardingStepShell>
  );
};

export default WritingStylesIntroStep;
