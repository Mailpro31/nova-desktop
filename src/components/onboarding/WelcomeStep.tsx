import React from "react";
import { useTranslation } from "react-i18next";

import { Button } from "../ui/Button";
import HandyHand from "../icons/HandyHand";
import { useOrganization } from "../../hooks/useOrganization";
import { isOrganizationMode } from "@/lib/mode";

interface WelcomeStepProps {
  onContinue: () => void;
}

/**
 * Premier écran du parcours : une phrase, une action.
 *
 * L'établissement n'est mentionné que s'il est réellement connu, sous
 * l'action et en texte secondaire — Nova reste la marque, l'école n'est pas
 * mise en avant.
 */
export const WelcomeStep: React.FC<WelcomeStepProps> = ({ onContinue }) => {
  const { t } = useTranslation();
  const organization = useOrganization();
  const showOrganization = isOrganizationMode() && organization !== null;

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center gap-5 bg-background text-text px-6 text-center">
      <HandyHand width={64} height={64} />

      <div className="flex flex-col items-center gap-2 max-w-[440px]">
        <h1 className="text-[26px] font-semibold tracking-[-0.015em] leading-tight">
          {t("onboarding.welcome.title")}
        </h1>
        <p className="text-sm text-text-secondary leading-relaxed">
          {t("onboarding.welcome.subtitle")}
        </p>
      </div>

      <Button variant="primary" size="lg" onClick={onContinue} autoFocus>
        {t("onboarding.step.continue")}
      </Button>

      {showOrganization && (
        <p className="text-xs text-text-secondary">
          {t("onboarding.welcome.providedBy", {
            organization: organization.name,
          })}
        </p>
      )}
    </div>
  );
};

export default WelcomeStep;
