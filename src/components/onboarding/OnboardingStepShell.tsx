import React from "react";
import HandyTextLogo from "../icons/HandyTextLogo";

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
    <div className="h-screen w-screen flex flex-col items-center p-6 gap-5 overflow-y-auto">
      <div className="flex flex-col items-center gap-3 shrink-0">
        <HandyTextLogo width={140} />
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {Array.from({ length: stepCount }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === stepIndex ? "w-5 bg-logo-primary" : "w-1.5 bg-mid-gray/30"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="max-w-[560px] w-full flex flex-col items-center gap-1 text-center shrink-0">
        <h2 className="text-xl font-semibold text-text">{title}</h2>
        {subtitle && (
          <p className="text-sm text-text/60 max-w-md">{subtitle}</p>
        )}
      </div>

      <div className="max-w-[560px] w-full flex-1 min-h-0 flex flex-col">
        {children}
      </div>

      <div className="max-w-[560px] w-full flex items-center justify-between shrink-0 pt-2">
        {onSkip ? (
          <button
            type="button"
            onClick={onSkip}
            className="text-sm font-medium text-text/50 hover:text-text/80 transition-colors px-2 py-2"
          >
            {skipLabel}
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onContinue}
          disabled={continueDisabled}
          className="px-5 py-2 rounded-lg bg-logo-primary hover:bg-logo-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
        >
          {continueLabel}
        </button>
      </div>
    </div>
  );
};

export default OnboardingStepShell;
