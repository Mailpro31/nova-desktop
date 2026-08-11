import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Loader2, Sparkles } from "lucide-react";
import { events, type HistoryUpdatePayload } from "@/bindings";
import { useSettings } from "../../hooks/useSettings";
import { useOsType } from "../../hooks/useOsType";
import { formatKeyCombination } from "../../lib/utils/keyboard";
import OnboardingStepShell from "./OnboardingStepShell";

const SAMPLE_SENTENCE =
  "Bonjour, ceci est un essai de dictée avec Nova, virgule pour voir le résultat.";

interface TutorialOnboardingProps {
  stepIndex: number;
  stepCount: number;
  onDone: () => void;
}

type TutorialPhase = "waiting" | "captured" | "polished";

/**
 * Mini-tutoriel interactif : l'utilisateur dicte une phrase-test directement
 * dans l'onboarding et voit le résultat s'afficher — un moment « ça marche »
 * avant de terminer la configuration. Aucun réglage ici : on écoute juste le
 * flux d'historique déjà utilisé par `HistorySettings.tsx`
 * (`events.historyUpdatePayload`), qui reflète la vraie dictée déclenchée par
 * le raccourci clavier réel. Entièrement facultatif — passer l'étape ne
 * modifie rien et ne bloque jamais la fin de l'onboarding.
 */
const TutorialOnboarding: React.FC<TutorialOnboardingProps> = ({
  stepIndex,
  stepCount,
  onDone,
}) => {
  const { t } = useTranslation();
  const { getSetting } = useSettings();
  const osType = useOsType();

  const [phase, setPhase] = useState<TutorialPhase>("waiting");
  const [rawText, setRawText] = useState("");
  const [polishedText, setPolishedText] = useState("");
  const entryIdRef = useRef<number | null>(null);

  const binding = getSetting("bindings")?.["transcribe"];
  const shortcutLabel = binding
    ? formatKeyCombination(binding.current_binding, osType)
    : "…";
  const pushToTalk = getSetting("push_to_talk") ?? true;

  useEffect(() => {
    const unlisten = events.historyUpdatePayload.listen((event) => {
      const payload: HistoryUpdatePayload = event.payload;
      if (payload.action === "added") {
        entryIdRef.current = payload.entry.id;
        setRawText(payload.entry.transcription_text);
        if (payload.entry.post_processed_text) {
          setPolishedText(payload.entry.post_processed_text);
          setPhase("polished");
        } else {
          setPhase("captured");
        }
      } else if (
        payload.action === "updated" &&
        payload.entry.id === entryIdRef.current
      ) {
        setRawText(payload.entry.transcription_text);
        if (payload.entry.post_processed_text) {
          setPolishedText(payload.entry.post_processed_text);
          setPhase("polished");
        }
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const instructions = pushToTalk
    ? t("onboarding.tutorial.instructionsPushToTalk", {
        shortcut: shortcutLabel,
      })
    : t("onboarding.tutorial.instructionsToggle", {
        shortcut: shortcutLabel,
      });

  return (
    <OnboardingStepShell
      title={t("onboarding.tutorial.title")}
      subtitle={t("onboarding.tutorial.subtitle")}
      stepIndex={stepIndex}
      stepCount={stepCount}
      onSkip={onDone}
      skipLabel={t("onboarding.tutorial.skip")}
      onContinue={onDone}
      continueLabel={
        phase === "polished"
          ? t("onboarding.step.finish")
          : t("onboarding.tutorial.finishAnyway")
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-mid-gray/20 px-4 py-5">
          <span className="px-3 py-1.5 rounded-md border border-logo-primary/50 bg-logo-primary/10 text-sm font-semibold text-logo-primary">
            {shortcutLabel}
          </span>
          <p className="text-sm text-text/70 text-center max-w-sm">
            {instructions}
          </p>
          <p className="text-xs text-text/45 italic text-center max-w-sm">
            {t("onboarding.tutorial.suggestion", { sentence: SAMPLE_SENTENCE })}
          </p>
        </div>

        <div className="rounded-xl border border-mid-gray/20 px-4 py-4 min-h-[110px] flex flex-col justify-center gap-2">
          {phase === "waiting" && (
            <p className="text-sm text-text/50 text-center">
              {t("onboarding.tutorial.awaiting")}
            </p>
          )}

          {phase === "captured" && (
            <div className="space-y-2">
              <p className="text-sm text-text/80">{rawText}</p>
              <div className="flex items-center gap-2 text-xs text-text/50">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {t("onboarding.tutorial.polishing")}
              </div>
            </div>
          )}

          {phase === "polished" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
                <Check className="w-4 h-4" />
                {t("onboarding.tutorial.success")}
              </div>
              <p className="text-sm text-text font-medium">{polishedText}</p>
              {rawText && rawText !== polishedText && (
                <p className="text-xs text-text/40">
                  {t("onboarding.tutorial.originalWas", { text: rawText })}
                </p>
              )}
            </div>
          )}
        </div>

        {phase !== "polished" && (
          <div className="flex items-center gap-1.5 justify-center text-xs text-text/40">
            <Sparkles className="w-3.5 h-3.5" />
            {t("onboarding.tutorial.hint")}
          </div>
        )}
      </div>
    </OnboardingStepShell>
  );
};

export default TutorialOnboarding;
