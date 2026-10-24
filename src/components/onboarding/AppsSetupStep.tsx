import React from "react";
import { useTranslation } from "react-i18next";
import { Ellipsis, MessageCircleQuestion, Volume2 } from "lucide-react";

import OnboardingStepShell from "./OnboardingStepShell";
import { AppsSetup } from "../settings/connections/AppsSetup";

interface AppsSetupStepProps {
  stepIndex: number;
  stepCount: number;
  onBack: () => void;
  onContinue: () => void;
  onSkip: () => void;
}

/**
 * Premier lancement : la bulle de sélection, et une application par usage à
 * laquelle se connecter une fois (demande de Sash, 24/10). Connecté d'avance,
 * l'élève n'a jamais de question perdue ni de texte à coller.
 */
export const AppsSetupStep: React.FC<AppsSetupStepProps> = ({
  stepIndex,
  stepCount,
  onBack,
  onContinue,
  onSkip,
}) => {
  const { t } = useTranslation();
  return (
    <OnboardingStepShell
      title={t("bubble.setup.title")}
      subtitle={t("bubble.setup.description")}
      stepIndex={stepIndex}
      stepCount={stepCount}
      onBack={onBack}
      onSkip={onSkip}
      onContinue={onContinue}
      continueLabel={t("onboarding.step.continue")}
    >
      <div className="w-full max-w-[560px] space-y-5">
        {/* La bulle telle qu'elle apparaît sur un texte sélectionné. Une image,
            pas la vraie : la bulle ne s'ouvre pas dans les fenêtres de Nova. */}
        <figure
          className="flex flex-col items-center gap-2.5"
          aria-hidden="true"
        >
          <p className="rounded bg-accent/20 px-1 text-sm text-text">
            {t("bubble.setup.demoText")}
          </p>
          <div className="flex items-center gap-0.5 rounded-full border border-hairline bg-surface p-1 shadow-floating">
            <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] font-medium text-text">
              <MessageCircleQuestion size={16} className="text-accent" />
              {t("bubble.action.explain")}
            </span>
            <span className="flex h-8 w-8 items-center justify-center text-text-secondary">
              <Volume2 size={16} />
            </span>
            <span className="flex h-8 w-8 items-center justify-center text-text-secondary">
              <Ellipsis size={17} />
            </span>
          </div>
          <figcaption className="text-sm text-text-secondary">
            {t("bubble.setup.demoCaption")}
          </figcaption>
        </figure>
        <div className="rounded-card border border-hairline">
          <AppsSetup />
        </div>
        <p className="text-center text-xs text-text-secondary">
          {t("bubble.setup.later")}
        </p>
      </div>
    </OnboardingStepShell>
  );
};

export default AppsSetupStep;
