import React, { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CheckCircle2, CircleAlert, CircleX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/Button";
import { SettingContainer } from "../../ui/SettingContainer";

// Miroir de `meeting_capture::MeetingCaptureProbe` (Rust). `reason` est un code
// stable traduit ici — les messages Windows ne sont pas localisés et l'app parle
// 24 langues ; `detail` est le message technique brut, affiché tel quel.
interface ProbeResult {
  supported: boolean;
  process: string;
  meeting_app_detected: boolean;
  captured_ms: number;
  peak_level: number;
  silent: boolean;
  reason: string | null;
  detail: string | null;
}

type Outcome = "ok" | "warning" | "error";

const OUTCOME_ICON = {
  ok: CheckCircle2,
  warning: CircleAlert,
  error: CircleX,
} as const;

const OUTCOME_COLOR: Record<Outcome, string> = {
  ok: "text-green-500",
  warning: "text-amber-500",
  error: "text-red-500",
};

// Codes renvoyés par le backend. Tout code inconnu retombe sur « stream_error »,
// pour qu'une version future du backend n'affiche jamais une ligne vide.
const KNOWN_REASONS = [
  "no_meeting_app",
  "unavailable",
  "no_audio",
  "stream_error",
  "internal",
] as const;

// Miroir de `meeting_capture::SWITCH_GRACE_PERIOD` (Rust) : le bouton vit dans
// la fenêtre Réglages, qui a donc le focus au clic. Le backend attend ce délai
// avant de lire la fenêtre au premier plan ; ce compte à rebours n'est qu'un
// affichage — c'est le délai côté Rust qui fait foi. Garder synchronisé si l'un
// des deux change.
const SWITCH_GRACE_SECONDS = 3;

export const MeetingCaptureProbe: React.FC<{
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}> = ({ descriptionMode = "tooltip", grouped = false }) => {
  const { t } = useTranslation();
  const [result, setResult] = useState<ProbeResult | null>(null);
  const [failure, setFailure] = useState(false);
  const [running, setRunning] = useState(false);
  const [switchCountdown, setSwitchCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    },
    [],
  );

  const run = async () => {
    setRunning(true);
    setFailure(false);
    setSwitchCountdown(SWITCH_GRACE_SECONDS);

    // Purement visuel : le vrai délai est côté Rust (`SWITCH_GRACE_PERIOD`).
    // S'arrête de lui-même à 0 ; le clean-up ci-dessus couvre le démontage.
    countdownRef.current = setInterval(() => {
      setSwitchCountdown((n) => {
        if (n <= 1 && countdownRef.current) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
        }
        return Math.max(0, n - 1);
      });
    }, 1000);

    try {
      setResult(await invoke<ProbeResult>("probe_meeting_capture"));
    } catch {
      // La commande elle-même n'a pas répondu : on le dit plutôt que de laisser
      // le panneau sur un résultat périmé.
      setResult(null);
      setFailure(true);
    } finally {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      setRunning(false);
    }
  };

  const describe = (): { outcome: Outcome; message: string } => {
    if (failure || !result) {
      return {
        outcome: "error",
        message: t("settings.debug.meetingCapture.results.internal"),
      };
    }
    if (result.supported && result.silent) {
      return {
        outcome: "warning",
        message: t("settings.debug.meetingCapture.results.silent", {
          process: result.process,
        }),
      };
    }
    if (result.supported) {
      return {
        outcome: "ok",
        message: t("settings.debug.meetingCapture.results.working", {
          process: result.process,
          seconds: (result.captured_ms / 1000).toFixed(1),
          level: Math.round(result.peak_level * 100),
        }),
      };
    }
    const reason = KNOWN_REASONS.find((code) => code === result.reason);
    return {
      outcome: reason === "no_meeting_app" ? "warning" : "error",
      message: t(
        `settings.debug.meetingCapture.results.${reason ?? "stream_error"}`,
      ),
    };
  };

  const shown = result || failure ? describe() : null;
  const Icon = shown ? OUTCOME_ICON[shown.outcome] : null;

  return (
    <SettingContainer
      title={t("settings.debug.meetingCapture.title")}
      description={t("settings.debug.meetingCapture.description")}
      descriptionMode={descriptionMode}
      grouped={grouped}
      layout="stacked"
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-mid-gray max-w-lg">
            {t("settings.debug.meetingCapture.privacy")}
          </p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={running}
            onClick={run}
            className="shrink-0"
          >
            {running
              ? switchCountdown > 0
                ? t("settings.debug.meetingCapture.switchIn", {
                    seconds: switchCountdown,
                  })
                : t("settings.debug.meetingCapture.running")
              : t("settings.debug.meetingCapture.run")}
          </Button>
        </div>

        {shown && Icon && (
          <div className="flex items-start gap-2 text-xs">
            <Icon
              className={`w-4 h-4 shrink-0 mt-px ${OUTCOME_COLOR[shown.outcome]}`}
              aria-hidden="true"
            />
            <div className="min-w-0 space-y-1">
              <p>{shown.message}</p>
              {result?.detail && (
                <p className="font-mono text-[11px] text-mid-gray break-all">
                  {result.detail}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </SettingContainer>
  );
};
