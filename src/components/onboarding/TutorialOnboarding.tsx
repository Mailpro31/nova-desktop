import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { Check, Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { events, type HistoryUpdatePayload } from "@/bindings";
import { useSettings } from "../../hooks/useSettings";
import { useOsType } from "../../hooks/useOsType";
import { formatKeyCombination } from "../../lib/utils/keyboard";
import {
  POLISH_TIMEOUT_MS,
  tutorialPhase,
  type TutorialSignals,
} from "@/lib/tutorialPhase";
import OnboardingStepShell from "./OnboardingStepShell";
import { Kbd } from "@/components/ui/Kbd";

const SAMPLE_SENTENCE =
  "Bonjour, ceci est un essai de dictée avec Nova, virgule pour voir le résultat.";

interface TutorialOnboardingProps {
  stepIndex: number;
  stepCount: number;
  onDone: () => void;
}

/**
 * Mini-tutoriel interactif : l'utilisateur dicte une phrase-test directement
 * dans l'onboarding et voit le résultat s'afficher — un moment « ça marche »
 * avant de terminer la configuration. Aucun réglage ici : on écoute le flux
 * d'historique déjà utilisé par `HistorySettings.tsx`
 * (`events.historyUpdatePayload`), qui reflète la vraie dictée déclenchée par
 * le raccourci clavier réel. Entièrement facultatif — passer l'étape ne
 * modifie rien et ne bloque jamais la fin de l'onboarding.
 *
 * ## Ce que cet écran ne fait plus
 *
 * Il n'attend plus indéfiniment. La roue « Application du Style… » tournait
 * sans délai ni écoute des échecs : une dictée ratée produit une entrée à texte
 * vide (`actions.rs` en enregistre une pour permettre une nouvelle tentative),
 * que cet écran prenait pour une reformulation en cours. La décision est
 * désormais prise par `@/lib/tutorialPhase`, où elle est testée.
 */
const TutorialOnboarding: React.FC<TutorialOnboardingProps> = ({
  stepIndex,
  stepCount,
  onDone,
}) => {
  const { t } = useTranslation();
  const { getSetting } = useSettings();
  const osType = useOsType();

  const [signals, setSignals] = useState<TutorialSignals>({
    rawText: null,
    polishedText: null,
    failed: false,
    polishTimedOut: false,
  });
  const entryIdRef = useRef<number | null>(null);

  const phase = tutorialPhase(signals);

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
        // Une nouvelle tentative repart d'un état propre : un échec précédent
        // ne doit pas condamner la suivante.
        setSignals({
          rawText: payload.entry.transcription_text,
          polishedText: payload.entry.post_processed_text,
          failed: false,
          polishTimedOut: false,
        });
      } else if (
        payload.action === "updated" &&
        payload.entry.id === entryIdRef.current
      ) {
        setSignals((current) => ({
          ...current,
          rawText: payload.entry.transcription_text,
          polishedText:
            payload.entry.post_processed_text ?? current.polishedText,
        }));
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Les échecs que le backend signalait déjà, et que cet écran n'écoutait pas.
  // `transcription-error` couvre la dictée elle-même (y compris l'absence de
  // modèle local) ; `campus-server-unreachable` couvre le serveur.
  useEffect(() => {
    const fail = () => setSignals((current) => ({ ...current, failed: true }));
    const subscriptions = [
      listen("transcription-error", fail),
      listen("campus-server-unreachable", fail),
    ];
    return () => {
      for (const subscription of subscriptions) {
        subscription.then((unlisten) => unlisten());
      }
    };
  }, []);

  // Filet de dernier recours : même sans aucun signal, l'attente est bornée.
  // Un serveur qui ne répond simplement jamais ne doit pas figer l'écran.
  useEffect(() => {
    if (phase !== "polishing") return;
    const timer = window.setTimeout(
      () => setSignals((current) => ({ ...current, polishTimedOut: true })),
      POLISH_TIMEOUT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [phase]);

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
      // Jamais désactivé : cet écran est facultatif, et un échec de dictée ne
      // doit surtout pas retenir quelqu'un dans le parcours.
      continueLabel={
        phase === "polished"
          ? t("onboarding.step.finish")
          : t("onboarding.tutorial.finishAnyway")
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-3 border-y border-hairline px-4 py-5">
          <Kbd className="px-3 text-sm text-accent">{shortcutLabel}</Kbd>
          <p className="max-w-sm text-center text-sm leading-relaxed text-text-secondary">
            {instructions}
          </p>
          <p className="max-w-sm text-center text-xs italic text-text-secondary">
            {t("onboarding.tutorial.suggestion", { sentence: SAMPLE_SENTENCE })}
          </p>
        </div>

        <div className="flex min-h-[110px] flex-col justify-center gap-2 border border-hairline bg-surface px-4 py-4 [border-radius:var(--nova-radius-card)]">
          {phase === "waiting" && (
            <p className="text-center text-sm text-text-secondary">
              {t("onboarding.tutorial.awaiting")}
            </p>
          )}

          {phase === "polishing" && (
            <div className="space-y-2">
              <p className="text-sm text-text/80">{signals.rawText}</p>
              <div className="flex items-center gap-2 text-xs text-text-secondary">
                <Loader2
                  className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
                {t("onboarding.tutorial.polishing")}
              </div>
            </div>
          )}

          {phase === "captured" && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-text">{signals.rawText}</p>
              <p className="text-xs text-text-secondary">
                {t("onboarding.tutorial.styleUnavailable")}
              </p>
            </div>
          )}

          {phase === "polished" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-success">
                <Check className="h-4 w-4" aria-hidden="true" />
                {t("onboarding.tutorial.success")}
              </div>
              <p className="text-sm font-medium text-text">
                {signals.polishedText}
              </p>
              {signals.rawText && signals.rawText !== signals.polishedText && (
                <p className="text-xs text-text-secondary">
                  {t("onboarding.tutorial.originalWas", {
                    text: signals.rawText,
                  })}
                </p>
              )}
            </div>
          )}

          {phase === "failed" && (
            <div className="space-y-2" role="alert">
              <div className="flex items-center gap-2 text-sm font-medium text-danger">
                <TriangleAlert className="h-4 w-4" aria-hidden="true" />
                {t("onboarding.tutorial.failedTitle")}
              </div>
              <p className="text-xs leading-relaxed text-text-secondary">
                {t("onboarding.tutorial.failedBody")}
              </p>
            </div>
          )}
        </div>

        {phase !== "polished" && (
          <div className="flex items-center justify-center gap-1.5 text-xs text-text-secondary">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {t("onboarding.tutorial.hint")}
          </div>
        )}
      </div>
    </OnboardingStepShell>
  );
};

export default TutorialOnboarding;
