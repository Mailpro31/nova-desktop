import React, { useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Check, Lock } from "lucide-react";
import { toast } from "sonner";
import { invoke } from "@tauri-apps/api/core";
import { useSettings } from "../../hooks/useSettings";
import { styleColor } from "../../lib/styleColors";
import OnboardingStepShell from "./OnboardingStepShell";

const AUTO_STYLE_ID = "auto";

interface StyleOnboardingProps {
  stepIndex: number;
  stepCount: number;
  onDone: () => void;
}

/**
 * Étape « Style » de l'onboarding : Automatique (Nova choisit le Style selon
 * l'application active, Pro/Ultra seulement) ou un Style précis toujours appliqué.
 * S'appuie sur le même mécanisme que les réglages (`post_process_selected_prompt_id` /
 * `AUTO_STYLE_ID`) — voir `PostProcessingSettingsPrompts`. N'écrit le réglage
 * que si l'utilisateur change réellement de choix, pour ne jamais bloquer la
 * suite si l'écriture échoue (cf. garde-fou « jamais de plantage »).
 */
const StyleOnboarding: React.FC<StyleOnboardingProps> = ({
  stepIndex,
  stepCount,
  onDone,
}) => {
  const { t } = useTranslation();
  const { getSetting, updateSetting } = useSettings();

  const prompts = getSetting("post_process_prompts") || [];
  const persistedPromptId = getSetting("post_process_selected_prompt_id");
  const [features, setFeatures] = useState<Record<string, boolean>>({});

  useEffect(() => {
    invoke<{ features: Record<string, boolean> }>("get_license_status")
      .then((st) => setFeatures(st.features ?? {}))
      .catch(() => setFeatures({}));
  }, []);

  const hasAutoStyleAccess = features["all_styles"] ?? false;
  const defaultStyleForTier = hasAutoStyleAccess ? AUTO_STYLE_ID : "default_improve_transcriptions";
  const initialIsAuto =
    !persistedPromptId
      ? hasAutoStyleAccess
      : persistedPromptId === AUTO_STYLE_ID && hasAutoStyleAccess;

  const [mode, setMode] = useState<"auto" | "manual">(
    initialIsAuto ? "auto" : "manual",
  );
  const defaultManualId = !initialIsAuto && persistedPromptId
    ? persistedPromptId
    : prompts.find(p => p.id === "default_improve_transcriptions")?.id ||
      prompts[0]?.id ||
      "";
  const [manualPromptId, setManualPromptId] = useState<string>(defaultManualId);
  const [saving, setSaving] = useState(false);

  const targetPromptId = useMemo(
    () => (mode === "auto" ? AUTO_STYLE_ID : manualPromptId),
    [mode, manualPromptId],
  );

  const persist = async () => {
    // Rien à écrire si le choix final correspond déjà à ce qui est enregistré
    // (c'est le cas par défaut pour une nouvelle installation : Automatique
    // est déjà le réglage de départ) — évite un aller-retour inutile.
    if (!targetPromptId || targetPromptId === (persistedPromptId ?? "")) {
      return;
    }
    setSaving(true);
    try {
      await updateSetting("post_process_selected_prompt_id", targetPromptId);
    } catch (error) {
      console.error("Failed to set selected Style during onboarding:", error);
      toast.error(t("onboarding.style.errors.save"));
      // On continue quand même : ce choix reste modifiable dans les réglages.
    } finally {
      setSaving(false);
    }
  };

  const handleContinue = async () => {
    await persist();
    onDone();
  };

  return (
    <OnboardingStepShell
      title={t("onboarding.style.title")}
      subtitle={t("onboarding.style.subtitle")}
      stepIndex={stepIndex}
      stepCount={stepCount}
      onSkip={onDone}
      skipLabel={t("onboarding.step.skip")}
      onContinue={handleContinue}
      continueLabel={t("onboarding.step.continue")}
      continueDisabled={saving || (mode === "manual" && !manualPromptId)}
    >
      <div className="space-y-3 overflow-y-auto pb-1">
        <button
          type="button"
          onClick={() => hasAutoStyleAccess && setMode("auto")}
          disabled={!hasAutoStyleAccess}
          className={`w-full text-left flex items-start gap-3 rounded-xl px-4 py-3 border-2 transition-all duration-150 ${
            !hasAutoStyleAccess ? "opacity-50 cursor-not-allowed" : ""
          } ${
            mode === "auto"
              ? "border-logo-primary/60 bg-logo-primary/10"
              : "border-mid-gray/20 hover:border-logo-primary/40"
          }`}
        >
          <span
            className="w-3 h-3 rounded-full mt-1 shrink-0"
            style={{ background: styleColor(AUTO_STYLE_ID) }}
            aria-hidden="true"
          />
          <span className="flex-1 min-w-0">
            <span className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-text">
                {t("onboarding.style.auto.title")}
              </span>
              {!hasAutoStyleAccess ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-500/20 text-red-400">
                  <Lock className="w-3 h-3" aria-hidden="true" />
                  {t("license.requiresTier", { tier: "NOVA PRO" })}
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-logo-primary/20 text-logo-primary">
                  {t("onboarding.style.recommended")}
                </span>
              )}
            </span>
            <span className="block text-sm text-text/60 mt-0.5">
              {t("onboarding.style.auto.description")}
            </span>
          </span>
          {mode === "auto" && (
            <Check className="w-5 h-5 text-logo-primary shrink-0 mt-0.5" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setMode("manual")}
          className={`w-full text-left flex items-start gap-3 rounded-xl px-4 py-3 border-2 transition-all duration-150 ${
            mode === "manual"
              ? "border-logo-primary/60 bg-logo-primary/10"
              : "border-mid-gray/20 hover:border-logo-primary/40"
          }`}
        >
          <span className="flex-1 min-w-0">
            <span className="font-semibold text-text">
              {t("onboarding.style.manual.title")}
            </span>
            <span className="block text-sm text-text/60 mt-0.5">
              {t("onboarding.style.manual.description")}
            </span>
          </span>
          {mode === "manual" && (
            <Check className="w-5 h-5 text-logo-primary shrink-0 mt-0.5" />
          )}
        </button>

        {mode === "manual" && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            {prompts.map((prompt) => (
              <button
                key={prompt.id}
                type="button"
                onClick={() => setManualPromptId(prompt.id)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 border-2 text-left transition-all duration-150 ${
                  manualPromptId === prompt.id
                    ? "border-logo-primary/60 bg-logo-primary/10"
                    : "border-mid-gray/20 hover:border-logo-primary/40"
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: styleColor(prompt.id) }}
                  aria-hidden="true"
                />
                <span className="text-sm font-medium text-text truncate flex-1">
                  {prompt.name}
                </span>
                {manualPromptId === prompt.id && (
                  <Check className="w-4 h-4 text-logo-primary shrink-0" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </OnboardingStepShell>
  );
};

export default StyleOnboarding;
