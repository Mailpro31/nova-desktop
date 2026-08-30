import React from "react";
import { useTranslation } from "react-i18next";

import { Button } from "../ui/Button";
import HandyHand from "../icons/HandyHand";

interface OnboardingStepShellProps {
  title: string;
  subtitle?: string;
  /** Rang affiché ; `-1` masque le repère (écrans techniques). */
  stepIndex: number;
  stepCount: number;
  onBack?: () => void;
  onSkip?: () => void;
  skipLabel?: string;
  onContinue: () => void;
  continueLabel: string;
  continueDisabled?: boolean;
  children?: React.ReactNode;
}

/**
 * Habillage commun à toutes les étapes du parcours de première ouverture.
 *
 * Une question par écran, une action principale, au plus une action
 * secondaire — la hiérarchie demandée par la planche de fondation. Le repère
 * de progression ne compte que les étapes visibles par l'utilisateur : une
 * permission système ou un téléchargement n'entrent pas dans le décompte.
 */
const OnboardingStepShell: React.FC<OnboardingStepShellProps> = ({
  title,
  subtitle,
  stepIndex,
  stepCount,
  onBack,
  onSkip,
  skipLabel,
  onContinue,
  continueLabel,
  continueDisabled = false,
  children,
}) => {
  const { t } = useTranslation();
  const showProgress = stepIndex >= 0 && stepCount > 1;

  return (
    <div className="h-screen w-screen flex flex-col items-center bg-background text-text px-6 py-8 gap-6 overflow-y-auto">
      <div className="flex flex-col items-center gap-4 shrink-0">
        <HandyHand width={40} height={40} />
        {showProgress && (
          <div
            className="flex items-center gap-1.5"
            role="progressbar"
            aria-label={title}
            aria-valuenow={stepIndex + 1}
            aria-valuemin={1}
            aria-valuemax={stepCount}
          >
            {Array.from({ length: stepCount }).map((_, i) => (
              <span
                key={i}
                className={`h-1 rounded-full transition-all duration-[180ms] motion-reduce:transition-none ${
                  i === stepIndex ? "w-5 bg-accent" : "w-1 bg-mid-gray/30"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="max-w-[520px] w-full flex flex-col items-center gap-2 text-center shrink-0">
        <h1 className="text-[26px] font-semibold tracking-[-0.015em] leading-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-text-secondary leading-relaxed max-w-[440px]">
            {subtitle}
          </p>
        )}
      </div>

      {children && (
        <div className="max-w-[520px] w-full flex-1 min-h-0 flex flex-col">
          {children}
        </div>
      )}

      <div className="max-w-[520px] w-full flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-1">
          {onBack && (
            <Button type="button" variant="ghost" size="md" onClick={onBack}>
              {t("onboarding.back")}
            </Button>
          )}
          {onSkip && (
            <Button type="button" variant="ghost" size="md" onClick={onSkip}>
              {skipLabel ?? t("onboarding.step.skip")}
            </Button>
          )}
        </div>
        <Button
          type="button"
          variant="primary"
          size="lg"
          onClick={onContinue}
          disabled={continueDisabled}
        >
          {continueLabel}
        </Button>
      </div>
    </div>
  );
};

export default OnboardingStepShell;
