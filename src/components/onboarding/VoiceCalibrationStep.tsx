import React, { useState } from "react";
import { useTranslation } from "react-i18next";

import OnboardingStepShell from "./OnboardingStepShell";
import { Button } from "../ui/Button";
import { commands, type MisheardWord } from "@/bindings";
import { useSettings } from "@/hooks/useSettings";
import { isOrganizationMode } from "@/lib/mode";
import {
  CALIBRATION_PHRASES,
  calibrationTerms,
  summarizeCalibration,
  type CalibrationResult,
} from "@/lib/voiceCalibration";

interface VoiceCalibrationStepProps {
  stepIndex: number;
  stepCount: number;
  onBack?: () => void;
  onSkip?: () => void;
  onDone: () => void;
}

type Phase =
  | { kind: "intro" }
  | { kind: "ready"; index: number }
  | { kind: "listening"; index: number }
  | { kind: "analysing"; index: number }
  | { kind: "heard"; index: number; result: CalibrationResult }
  | { kind: "summary" }
  | { kind: "saving" };

const correctionKey = (word: MisheardWord) => `${word.heard}→${word.expected}`;

/**
 * Le calibrage de la voix : l'élève lit quelques phrases de cours, Nova mesure
 * ce qu'il entend et ce qu'il comprend, et propose ses réglages.
 *
 * ## Ce que l'élève contrôle
 *
 * Rien n'est appliqué avant le dernier écran, et chaque correction y est une
 * case qu'il peut décocher. Il voit, phrase par phrase, ce que Nova a compris :
 * c'est aussi ce qui lui apprend à quoi s'attendre en classe.
 *
 * ## Pourquoi « comme en classe »
 *
 * L'élève dictera ses notes à voix basse. Un calibrage fait à pleine voix
 * réglerait le gain pour une voix qu'il n'aura pas en cours.
 */
export const VoiceCalibrationStep: React.FC<VoiceCalibrationStepProps> = ({
  stepIndex,
  stepCount,
  onBack,
  onSkip,
  onDone,
}) => {
  const { t } = useTranslation();
  const { getSetting, updateSetting } = useSettings();
  const [phase, setPhase] = useState<Phase>({ kind: "intro" });
  const [results, setResults] = useState<CalibrationResult[]>([]);
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const total = CALIBRATION_PHRASES.length;
  const summary = summarizeCalibration(results, calibrationTerms());

  const startListening = async (index: number) => {
    setError(null);
    const started = await commands.startVoiceCalibrationSample();
    if (started.status === "error") {
      setError(t("onboarding.voiceCalibration.errorMicrophone"));
      return;
    }
    setPhase({ kind: "listening", index });
  };

  const stopListening = async (index: number) => {
    setPhase({ kind: "analysing", index });
    const finished = await commands.finishVoiceCalibrationSample(
      CALIBRATION_PHRASES[index].text,
    );
    if (finished.status === "error") {
      setError(t("onboarding.voiceCalibration.errorAnalysis"));
      setPhase({ kind: "ready", index });
      return;
    }
    setResults((previous) => [...previous, finished.data]);
    setPhase({ kind: "heard", index, result: finished.data });
  };

  const goNext = (index: number) => {
    if (index + 1 < total) setPhase({ kind: "ready", index: index + 1 });
    else setPhase({ kind: "summary" });
  };

  const save = async () => {
    setPhase({ kind: "saving" });
    await commands.setInputGain(summary.gain);
    const accepted = summary.corrections.filter(
      (word) => !rejected.has(correctionKey(word)),
    );
    if (isOrganizationMode()) {
      // Le vocabulaire de l'organisation sert aussi d'amorce au moteur de
      // transcription : la correction aide avant même d'être appliquée.
      for (const word of accepted) {
        await commands.learnOrganizationDictionary(word.heard, word.expected);
      }
    } else if (accepted.length > 0) {
      const existing = getSetting("custom_words") ?? [];
      const additions = accepted
        .map((word) => word.expected)
        .filter((term) => !existing.includes(term));
      if (additions.length > 0) {
        await updateSetting("custom_words", [...existing, ...additions]);
      }
    }
    onDone();
  };

  const toggle = (word: MisheardWord) => {
    setRejected((previous) => {
      const next = new Set(previous);
      const key = correctionKey(word);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (phase.kind === "intro") {
    return (
      <OnboardingStepShell
        title={t("onboarding.voiceCalibration.title")}
        subtitle={t("onboarding.voiceCalibration.subtitle")}
        stepIndex={stepIndex}
        stepCount={stepCount}
        onBack={onBack}
        onSkip={onSkip}
        onContinue={() => setPhase({ kind: "ready", index: 0 })}
        continueLabel={t("onboarding.voiceCalibration.start")}
      >
        <ul className="flex flex-col gap-2 text-sm text-text-secondary leading-relaxed">
          <li>{t("onboarding.voiceCalibration.tipQuiet")}</li>
          <li>{t("onboarding.voiceCalibration.tipPlace")}</li>
          <li>
            {t("onboarding.voiceCalibration.tipDuration", { count: total })}
          </li>
        </ul>
      </OnboardingStepShell>
    );
  }

  if (phase.kind === "summary" || phase.kind === "saving") {
    const gainDb = Math.round(20 * Math.log10(summary.gain));
    return (
      <OnboardingStepShell
        title={t("onboarding.voiceCalibration.summaryTitle")}
        stepIndex={stepIndex}
        stepCount={stepCount}
        onContinue={save}
        continueLabel={t("onboarding.voiceCalibration.save")}
        continueDisabled={phase.kind === "saving"}
      >
        <div className="flex flex-col gap-4 text-sm leading-relaxed">
          <p className="text-text">
            {gainDb > 0
              ? t("onboarding.voiceCalibration.gainRaised", { db: gainDb })
              : t("onboarding.voiceCalibration.gainUnchanged")}
          </p>
          {!summary.voiceStandsOut && (
            <p className="rounded-card border border-hairline px-3.5 py-3 text-text">
              {t("onboarding.voiceCalibration.tooNoisy")}
            </p>
          )}
          {summary.corrections.length === 0 ? (
            <p className="text-text-secondary">
              {t("onboarding.voiceCalibration.noCorrection")}
            </p>
          ) : (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-text">
                {t("onboarding.voiceCalibration.correctionsIntro")}
              </legend>
              {summary.corrections.map((word) => (
                <label
                  key={correctionKey(word)}
                  className="flex items-start gap-3 rounded-card border border-hairline px-3.5 py-3 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={!rejected.has(correctionKey(word))}
                    onChange={() => toggle(word)}
                  />
                  <span className="text-text">
                    {t("onboarding.voiceCalibration.correction", {
                      expected: word.expected,
                      heard: word.heard,
                    })}
                  </span>
                </label>
              ))}
            </fieldset>
          )}
        </div>
      </OnboardingStepShell>
    );
  }

  const index = phase.index;
  const phrase = CALIBRATION_PHRASES[index];

  return (
    <OnboardingStepShell
      title={t("onboarding.voiceCalibration.readTitle", {
        current: index + 1,
        total,
      })}
      subtitle={t("onboarding.voiceCalibration.readSubtitle")}
      stepIndex={stepIndex}
      stepCount={stepCount}
      onSkip={onSkip}
      onContinue={() => goNext(index)}
      continueLabel={
        index + 1 < total
          ? t("onboarding.voiceCalibration.next")
          : t("onboarding.voiceCalibration.finish")
      }
      continueDisabled={phase.kind !== "heard"}
    >
      <div className="flex flex-col gap-5">
        <p
          lang="fr"
          className="rounded-card border border-hairline px-5 py-5 text-xl leading-loose tracking-[0.01em] text-text"
        >
          {phrase.text}
        </p>

        <div className="flex justify-center">
          {phase.kind === "ready" && (
            <Button
              type="button"
              variant="primary"
              size="lg"
              onClick={() => startListening(index)}
            >
              {t("onboarding.voiceCalibration.record")}
            </Button>
          )}
          {phase.kind === "listening" && (
            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={() => stopListening(index)}
            >
              {t("onboarding.voiceCalibration.stop")}
            </Button>
          )}
          {phase.kind === "heard" && (
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={() => {
                setResults((previous) => previous.slice(0, -1));
                setPhase({ kind: "ready", index });
              }}
            >
              {t("onboarding.voiceCalibration.retry")}
            </Button>
          )}
        </div>

        <div aria-live="polite" className="text-sm leading-relaxed">
          {phase.kind === "listening" && (
            <p className="text-center text-text-secondary">
              {t("onboarding.voiceCalibration.listening")}
            </p>
          )}
          {phase.kind === "analysing" && (
            <p className="text-center text-text-secondary">
              {t("onboarding.voiceCalibration.analysing")}
            </p>
          )}
          {phase.kind === "heard" && (
            <div className="flex flex-col gap-1">
              <p className="text-text-secondary">
                {t("onboarding.voiceCalibration.heardLabel")}
              </p>
              <p className="text-text">
                {phase.result.heard ||
                  t("onboarding.voiceCalibration.heardNothing")}
              </p>
            </div>
          )}
          {error && <p className="text-center text-text">{error}</p>}
        </div>
      </div>
    </OnboardingStepShell>
  );
};

export default VoiceCalibrationStep;
