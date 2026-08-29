import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { TierBadge } from "../settings/license/TierBadge";
import { Input } from "../ui/Input";
import OnboardingStepShell from "./OnboardingStepShell";
import { isOrganizationMode } from "@/lib/mode";

type PresetVariable = { key: string; value: string; placeholder: string };

interface QuickVariablesOnboardingProps {
  stepIndex: number;
  stepCount: number;
  onDone: () => void;
}

/**
 * Étape « raccourcis personnels » de l'onboarding : proposer d'enregistrer 2-3
 * variables courantes (nom complet, IBAN, adresse) tout de suite, en s'appuyant
 * sur le même mécanisme que les réglages (`CustomVariable { key, value }`,
 * commande `update_custom_variables` — voir `CustomVariablesSettings.tsx`).
 * Entièrement optionnel : ignorer l'étape ne modifie rien.
 */
const QuickVariablesOnboarding: React.FC<QuickVariablesOnboardingProps> = ({
  stepIndex,
  stepCount,
  onDone,
}) => {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [canUse, setCanUse] = useState(true);

  const [presets, setPresets] = useState<PresetVariable[]>([
    {
      key: t("onboarding.variables.presets.fullName.key"),
      value: "",
      placeholder: t("onboarding.variables.presets.fullName.placeholder"),
    },
    {
      key: t("onboarding.variables.presets.iban.key"),
      value: "",
      placeholder: t("onboarding.variables.presets.iban.placeholder"),
    },
    {
      key: t("onboarding.variables.presets.address.key"),
      value: "",
      placeholder: t("onboarding.variables.presets.address.placeholder"),
    },
  ]);

  useEffect(() => {
    invoke<{ features: Record<string, boolean> }>("get_license_status")
      .then((s) => setCanUse(s.features?.custom_variables ?? true))
      .catch(() => setCanUse(true));
  }, []);

  const updatePreset = (index: number, value: string) => {
    setPresets((rows) =>
      rows.map((row, i) => (i === index ? { ...row, value } : row)),
    );
  };

  const handleContinue = async () => {
    const variables = presets
      .map((p) => ({ key: p.key.trim(), value: p.value.trim() }))
      .filter((p) => p.key && p.value);

    if (variables.length === 0) {
      onDone();
      return;
    }

    setSaving(true);
    try {
      await invoke("update_custom_variables", { variables });
    } catch (error) {
      console.error(
        "Failed to save custom variables during onboarding:",
        error,
      );
      toast.error(t("onboarding.variables.errors.save"));
      // On n'empêche jamais de finir l'onboarding pour autant.
    } finally {
      setSaving(false);
      onDone();
    }
  };

  return (
    <OnboardingStepShell
      title={t("onboarding.variables.title")}
      subtitle={t("onboarding.variables.subtitle")}
      stepIndex={stepIndex}
      stepCount={stepCount}
      onSkip={onDone}
      skipLabel={t("onboarding.step.skip")}
      onContinue={handleContinue}
      continueLabel={t("onboarding.step.continue")}
      continueDisabled={saving}
    >
      <div className="space-y-3">
        <div className="flex justify-center">
          {!isOrganizationMode() && <TierBadge feature="custom_variables" />}
        </div>

        <div className="divide-y divide-hairline overflow-hidden border border-hairline bg-surface [border-radius:var(--nova-radius-card)]">
          {presets.map((preset, i) => (
            <div
              key={preset.key}
              className="grid gap-2 px-4 py-3 sm:grid-cols-[8rem_1fr] sm:items-center sm:gap-3"
            >
              <label
                htmlFor={`onboarding-variable-${i}`}
                className="text-sm font-medium text-text"
              >
                {preset.key}
              </label>
              <Input
                id={`onboarding-variable-${i}`}
                type="text"
                value={preset.value}
                onChange={(e) => updatePreset(i, e.target.value)}
                placeholder={preset.placeholder}
                variant="compact"
                className="flex-1 min-w-0"
                disabled={!canUse}
              />
            </div>
          ))}
        </div>

        <p className="px-2 text-center text-xs leading-relaxed text-text-secondary">
          {t("onboarding.variables.hint")}
        </p>
      </div>
    </OnboardingStepShell>
  );
};

export default QuickVariablesOnboarding;
