import React from "react";
import HandyTextLogo from "../icons/HandyTextLogo";
import { Button } from "../ui/Button";

interface OnboardingStepShellProps {
  title: string;
  subtitle?: string;
  stepIndex: number;
  stepCount: number;
  onSkip?: () => void;
  skipLabel?: string;
  onContinue: () => void;
  continueLabel: string;
  continueDisabled?: boolean;
  children: React.ReactNode;
}

/**
 * Habillage commun aux étapes d'onboarding ajoutées après le choix du modèle
 * (Style, raccourcis personnels, mini-tutoriel) : même logo, même repère de
 * progression à pastilles, même barre de navigation basse. Garde ces écrans
 * visuellement alignés avec `Onboarding.tsx` / `AccessibilityOnboarding.tsx`
 * sans dupliquer la mise en page dans chacun.
 */
const OnboardingStepShell: React.FC<OnboardingStepShellProps> = ({
  title,
  subtitle,
  stepIndex,
  stepCount,
  onSkip,
  skipLabel,
  onContinue,
  continueLabel,
  continueDisabled = false,
  children,
}) => {
  return (
    <div className="flex h-screen w-screen flex-col items-center gap-6 overflow-y-auto px-4 py-8 sm:px-6">
      <div className="flex shrink-0 flex-col items-center gap-4">
        <HandyTextLogo width={132} />
        <div
          className="flex items-center gap-1.5"
          role="progressbar"
          aria-label={title}
          aria-valuemin={1}
          aria-valuemax={stepCount}
          aria-valuenow={stepIndex + 1}
        >
          {Array.from({ length: stepCount }).map((_, i) => (
            <span
              key={i}
              className={`h-1 rounded-full transition-all duration-200 motion-reduce:transition-none ${
                i === stepIndex ? "w-5 bg-logo-primary" : "w-1.5 bg-mid-gray/30"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="flex w-full max-w-[480px] shrink-0 flex-col items-center gap-2 text-center">
        <h1 className="text-[1.75rem] font-semibold leading-[1.15] tracking-[-0.025em] text-text">
          {title}
        </h1>
        {subtitle && (
          <p className="max-w-md text-sm leading-relaxed text-text-secondary">
            {subtitle}
          </p>
        )}
      </div>

      <div className="flex min-h-0 w-full max-w-[480px] flex-1 flex-col">
        {children}
      </div>

      <div className="flex w-full max-w-[480px] shrink-0 items-center justify-between gap-3 border-t border-hairline pt-4">
        {onSkip ? (
          <Button type="button" variant="ghost" size="md" onClick={onSkip}>
            {skipLabel}
          </Button>
        ) : (
          <span />
        )}
        <Button
          type="button"
          variant="primary"
          size="md"
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
