import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { Radio, Square, Users } from "lucide-react";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { TierBadge, getStatus } from "../license/TierBadge";

// Fonctionnalité réservée à Nova Ultra (miroir de `feature_min_tier`, Rust). Le
// backend reste l'autorité : la commande refuse aussi le démarrage sans le
// palier. Ici on grise l'UI pour ne pas « mentir » (convention CLAUDE.md).
const MEETING_FEATURE = "meeting_mode";

// Le consentement des participants n'est demandé qu'UNE fois (décision produit) ;
// ce drapeau local mémorise que l'utilisateur l'a acquitté.
const CONSENT_KEY = "nova.meeting.consented";

// Miroir de `commands::meeting::MeetingReport` (Rust).
interface MeetingReport {
  report: string;
  transcribed: number;
  skipped: number;
}
interface MeetingStartInfo {
  process: string;
}

// Codes d'erreur stables renvoyés par les commandes (voir commands/meeting.rs +
// meeting_capture). Tout code inconnu retombe sur un message générique.
const ERROR_KEYS = [
  "no_meeting_app",
  "already_running",
  "no_active_meeting",
  "unavailable",
  "no_audio",
  "stream_error",
  "requires_ultra",
  "internal",
] as const;

type Phase = "idle" | "starting" | "recording" | "stopping" | "done";

// Miroir de `meeting_capture::SWITCH_GRACE_PERIOD` (Rust), réutilisée par
// `start_meeting`. Le bouton vit dans les Réglages, qui ont donc le focus au
// clic : le backend attend ce délai avant de lire la fenêtre au premier plan.
// Ce compte à rebours n'est qu'un affichage — le délai côté Rust fait foi.
const SWITCH_GRACE_SECONDS = 3;

const hasConsented = (): boolean => {
  try {
    return localStorage.getItem(CONSENT_KEY) === "1";
  } catch {
    return false;
  }
};

export const MeetingSettings: React.FC = () => {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>("idle");
  const [process, setProcess] = useState("");
  const [report, setReport] = useState<MeetingReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  // `null` tant que le statut n'est pas chargé : on ne grise pas avant de savoir.
  const [locked, setLocked] = useState<boolean | null>(null);
  const [switchCountdown, setSwitchCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    },
    [],
  );

  useEffect(() => {
    let alive = true;
    getStatus().then((s) => {
      if (alive)
        setLocked(s ? !(s.features?.[MEETING_FEATURE] ?? true) : false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const errorMessage = (raw: unknown): string => {
    const code = String(raw ?? "");
    const known = ERROR_KEYS.find((k) => code === k);
    return t(`meeting.errors.${known ?? "internal"}`);
  };

  const beginCapture = async () => {
    setError(null);
    setReport(null);
    setPhase("starting");
    setSwitchCountdown(SWITCH_GRACE_SECONDS);

    // Purement visuel : le vrai délai est côté Rust (`SWITCH_GRACE_PERIOD`).
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
      const info = await invoke<MeetingStartInfo>("start_meeting");
      setProcess(info.process);
      setPhase("recording");
    } catch (e) {
      setError(errorMessage(e));
      setPhase("idle");
    } finally {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    }
  };

  // Démarrage : passe par le consentement au tout premier usage, sinon direct.
  const onStart = () => {
    if (hasConsented()) {
      void beginCapture();
    } else {
      setConsentChecked(false);
      setConsentOpen(true);
    }
  };

  const onConsentConfirm = () => {
    if (!consentChecked) return;
    try {
      localStorage.setItem(CONSENT_KEY, "1");
    } catch {
      // Sans persistance, le pire cas est de redemander : acceptable.
    }
    setConsentOpen(false);
    void beginCapture();
  };

  const onStop = async () => {
    setPhase("stopping");
    try {
      const result = await invoke<MeetingReport>("stop_meeting", {
        youLabel: t("meeting.speakerYou"),
        othersLabel: t("meeting.speakerOthers"),
      });
      setReport(result);
      setPhase("done");
    } catch (e) {
      setError(errorMessage(e));
      setPhase("idle");
    }
  };

  const recording = phase === "recording" || phase === "stopping";

  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <SettingsGroup
        title={t("meeting.title")}
        description={t("meeting.description")}
      >
        {/* Bloc gaté : grisé et inerte tant que le palier manque — l'UI ne
            « ment » pas (convention CLAUDE.md). Le badge indique le palier. */}
        <div
          className={`p-4 space-y-4 ${locked ? "opacity-40 pointer-events-none select-none" : ""}`}
        >
          {locked && (
            <div className="flex justify-start">
              <TierBadge feature={MEETING_FEATURE} />
            </div>
          )}
          {/* Bandeau de capture active — visible tant que la réunion tourne. */}
          {recording && (
            <div className="flex items-center gap-3 rounded-[10px] border border-red-500/40 bg-red-500/10 px-4 py-3">
              <Radio className="w-4 h-4 text-red-500 shrink-0" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {t("meeting.capturing", { app: process })}
                </p>
                <p className="text-xs text-mid-gray mt-0.5">
                  {t("meeting.capturingHint")}
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-mid-gray min-w-0">
              <Users className="w-4 h-4 shrink-0" aria-hidden />
              <span>{t("meeting.readyHint")}</span>
            </div>
            {recording ? (
              <Button
                type="button"
                variant="danger"
                size="md"
                disabled={phase === "stopping"}
                onClick={onStop}
                className="shrink-0 inline-flex items-center gap-2"
              >
                <Square className="w-3.5 h-3.5" aria-hidden />
                {phase === "stopping"
                  ? t("meeting.finishing")
                  : t("meeting.finish")}
              </Button>
            ) : (
              <Button
                type="button"
                variant="primary"
                size="md"
                disabled={phase === "starting"}
                onClick={onStart}
                className="shrink-0"
              >
                {phase === "starting"
                  ? switchCountdown > 0
                    ? t("meeting.switchIn", { seconds: switchCountdown })
                    : t("meeting.starting")
                  : t("meeting.start")}
              </Button>
            )}
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          {phase === "done" && report && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">
                  {t("meeting.reportTitle")}
                </h3>
                <span className="text-xs text-mid-gray">
                  {t("meeting.reportMeta", {
                    transcribed: report.transcribed,
                    skipped: report.skipped,
                  })}
                </span>
              </div>
              {report.report.trim() ? (
                <pre className="text-sm whitespace-pre-wrap rounded-[10px] border border-hairline bg-inset p-4 font-sans leading-relaxed">
                  {report.report}
                </pre>
              ) : (
                <p className="text-sm text-mid-gray">
                  {t("meeting.reportEmpty")}
                </p>
              )}
            </div>
          )}
        </div>
      </SettingsGroup>

      <Dialog
        open={consentOpen}
        onOpenChange={setConsentOpen}
        title={t("meeting.consent.title")}
        description={t("meeting.consent.subtitle")}
        closeLabel={t("meeting.consent.cancel")}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={() => setConsentOpen(false)}
            >
              {t("meeting.consent.cancel")}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              disabled={!consentChecked}
              onClick={onConsentConfirm}
            >
              {t("meeting.consent.confirm")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm leading-relaxed">{t("meeting.consent.body")}</p>
          <label className="flex items-start gap-2.5 rounded-[10px] border border-hairline bg-inset p-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 accent-[var(--color-accent)] w-4 h-4 shrink-0"
              checked={consentChecked}
              onChange={(e) => setConsentChecked(e.target.checked)}
            />
            <span className="text-sm leading-relaxed">
              {t("meeting.consent.checkbox")}
            </span>
          </label>
        </div>
      </Dialog>
    </div>
  );
};
