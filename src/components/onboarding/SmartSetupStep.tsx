import React from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check } from "lucide-react";

import OnboardingStepShell from "./OnboardingStepShell";
import { formatKeyCombination } from "../../lib/utils/keyboard";
import { useOsType } from "../../hooks/useOsType";
import { isOrganizationMode } from "@/lib/mode";
import { useOrganizationContext } from "@/hooks/useOrganizationContext";
import type { OrganizationType } from "@/lib/organization/model";
import { wordingKey } from "@/lib/organization/wording";
import type { SystemReadiness } from "../../hooks/useSystemReadiness";

interface SmartSetupStepProps {
  readiness: SystemReadiness;
  stepIndex: number;
  stepCount: number;
  onBack?: () => void;
  onAccept: () => void;
  onCustomize: () => void;
}

type RowTone = "ok" | "warn";

interface Row {
  label: string;
  value: string;
  tone: RowTone;
}

/**
 * Configuration recommandée.
 *
 * Chaque ligne provient d'une sonde réelle (`useSystemReadiness`) : micro
 * effectivement sélectionné, joignabilité du serveur, raccourci enregistré,
 * langue choisie. **Aucune analyse n'est simulée** — une information
 * indisponible s'affiche comme telle plutôt que d'être inventée.
 *
 * L'action principale termine la configuration en un clic ; « Personnaliser »
 * n'ouvre que les quelques décisions qui changent réellement l'usage.
 */
export const SmartSetupStep: React.FC<SmartSetupStepProps> = ({
  readiness,
  stepIndex,
  stepCount,
  onBack,
  onAccept,
  onCustomize,
}) => {
  const { t } = useTranslation();
  const osType = useOsType();
  const organizationMode = isOrganizationMode();
  // Les mots suivent ce que le serveur a annoncé, jamais l'édition :
  // `isBusinessMode` répond faux tant que rien n'est annoncé, et s'en
  // servir donnait le registre école à un tenant dont on ne savait rien.
  const { organization } = useOrganizationContext();

  const rows: Row[] = [
    {
      label: t("onboarding.smartSetup.row.microphone"),
      value:
        readiness.microphoneName ?? t("onboarding.smartSetup.value.notSet"),
      tone: readiness.microphone === "ready" ? "ok" : "warn",
    },
    {
      label: t("onboarding.smartSetup.row.engine"),
      value: engineLabel(
        readiness,
        organizationMode,
        organization?.type ?? null,
        t,
      ),
      // « En cours de vérification » n'est pas un avertissement : tant que la
      // sonde n'a pas répondu, on n'annonce ni succès ni repli.
      tone: readiness.engine === "degraded" ? "warn" : "ok",
    },
    {
      label: t("onboarding.smartSetup.row.shortcut"),
      value: readiness.shortcut
        ? formatKeyCombination(readiness.shortcut, osType)
        : t("onboarding.smartSetup.value.notSet"),
      tone: readiness.shortcut ? "ok" : "warn",
    },
    {
      label: t("onboarding.smartSetup.row.language"),
      value:
        readiness.language ?? t("onboarding.smartSetup.value.autoDetected"),
      tone: "ok",
    },
  ];

  return (
    <OnboardingStepShell
      title={t("onboarding.smartSetup.title")}
      subtitle={t("onboarding.smartSetup.subtitle")}
      stepIndex={stepIndex}
      stepCount={stepCount}
      onBack={onBack}
      onSkip={onCustomize}
      skipLabel={t("onboarding.smartSetup.customize")}
      onContinue={onAccept}
      continueLabel={t("onboarding.smartSetup.use")}
    >
      <div className="rounded-card border border-hairline px-4">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-6 py-3 border-b border-hairline last:border-b-0"
          >
            <span className="text-sm text-text-secondary shrink-0">
              {row.label}
            </span>
            <span
              className={`flex items-center gap-2 text-sm font-medium text-right ${
                row.tone === "ok" ? "text-text" : "text-warning"
              }`}
            >
              {row.tone === "ok" ? (
                <Check
                  size={14}
                  strokeWidth={2}
                  className="text-success shrink-0"
                  aria-hidden="true"
                />
              ) : (
                <AlertTriangle
                  size={14}
                  strokeWidth={2}
                  className="shrink-0"
                  aria-hidden="true"
                />
              )}
              <span className="truncate">{row.value}</span>
            </span>
          </div>
        ))}
      </div>
    </OnboardingStepShell>
  );
};

function engineLabel(
  readiness: SystemReadiness,
  organizationMode: boolean,
  organizationType: OrganizationType | null,
  t: (key: string) => string,
): string {
  if (organizationMode) {
    if (readiness.engineLabel === "campus") {
      return t(wordingKey("statusConnected", organizationType));
    }
    if (readiness.engineLabel === "local-fallback") {
      // Le repli local se dit pareil partout : c'est Nova qui tourne
      // sur le poste, pas une propriété de l'organisation.
      return t("organization.status.localActive");
    }
    // Sonde encore en cours, ou session absente : on le dit plutôt que de
    // laisser croire à un repli local qui n'a pas eu lieu.
    return t("organization.account.checking");
  }
  return readiness.engine === "ready"
    ? t("onboarding.smartSetup.value.localEngine")
    : t("onboarding.smartSetup.value.notSet");
}

export default SmartSetupStep;
