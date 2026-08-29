import { useCallback, useEffect, useState } from "react";
import { platform } from "@tauri-apps/plugin-os";
import {
  checkAccessibilityPermission,
  checkMicrophonePermission,
} from "tauri-plugin-macos-permissions-api";

import { commands } from "@/bindings";
import { isOrganizationMode } from "@/lib/mode";
import { useSettings } from "./useSettings";
import { useSettingsStore } from "@/stores/settingsStore";
import { useCampusStatus } from "./useCampusStatus";

export type ReadinessState =
  | "checking"
  | "ready"
  | "action-needed"
  | "degraded";

export interface SystemReadiness {
  /** Toutes les sondes ont répondu. */
  loaded: boolean;
  permissions: ReadinessState;
  /** Micro effectivement sélectionné, `null` si aucun périphérique. */
  microphoneName: string | null;
  microphone: ReadinessState;
  /** Moteur de transcription : serveur d'établissement ou modèle local. */
  engine: ReadinessState;
  engineLabel: string | null;
  /** `true` quand un modèle local doit être téléchargé avant de dicter. */
  needsModelDownload: boolean;
  shortcut: string | null;
  language: string | null;
  /** Au moins une dictée existe déjà dans l'historique. */
  hasDictated: boolean;
  /**
   * Horodatage (secondes) de la dictée la plus récente, `null` s'il n'y en a
   * aucune. Vient de la même sonde que `hasDictated` — aucun appel de plus.
   */
  lastDictationAt: number | null;
  refresh: () => void;
}

/**
 * Photographie de l'état réel du système, à la source du parcours adaptatif.
 *
 * Rien n'est déduit d'une préférence enregistrée : chaque valeur vient d'une
 * sonde réelle (permission système, périphériques audio, modèles présents sur
 * disque, joignabilité du serveur, historique). C'est ce qui permet de sauter
 * une étape déjà satisfaite plutôt que de la reposer.
 */
export function useSystemReadiness(): SystemReadiness {
  const { settings, getSetting } = useSettings();
  const audioDevices = useSettingsStore((s) => s.audioDevices);
  const refreshAudioDevices = useSettingsStore((s) => s.refreshAudioDevices);
  const { connection, session } = useCampusStatus();

  const [permissions, setPermissions] = useState<ReadinessState>("checking");
  const [hasDictated, setHasDictated] = useState(false);
  const [lastDictationAt, setLastDictationAt] = useState<number | null>(null);
  const [models, setModels] = useState<
    { id: string; is_downloaded: boolean }[] | null
  >(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  // ── Permissions : la sonde diffère par plateforme.
  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      try {
        const current = platform();
        if (current === "macos") {
          const [accessibility, microphone] = await Promise.all([
            checkAccessibilityPermission(),
            checkMicrophonePermission(),
          ]);
          if (!cancelled) {
            setPermissions(
              accessibility && microphone ? "ready" : "action-needed",
            );
          }
          return;
        }
        if (current === "windows") {
          const status = await commands.getWindowsMicrophonePermissionStatus();
          if (!cancelled) {
            setPermissions(
              status.supported && status.overall_access === "denied"
                ? "action-needed"
                : "ready",
            );
          }
          return;
        }
        // Linux et autres : aucune permission applicative à demander.
        if (!cancelled) setPermissions("ready");
      } catch {
        // Sonde impossible : on n'invente pas un refus, on laisse passer et
        // l'erreur réelle surgira au premier enregistrement.
        if (!cancelled) setPermissions("ready");
      }
    };
    void probe();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  useEffect(() => {
    void refreshAudioDevices();
  }, [refreshAudioDevices, tick]);

  // ── Une dictée a-t-elle déjà eu lieu ? L'historique fait foi.
  useEffect(() => {
    let cancelled = false;
    commands
      .getHistoryEntries(null, 1)
      .then((result) => {
        if (cancelled) return;
        if (result.status === "ok") {
          const latest = result.data.entries[0] ?? null;
          setHasDictated(latest !== null);
          setLastDictationAt(latest?.timestamp ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHasDictated(false);
          setLastDictationAt(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  // ── Modèles locaux : pertinent hors campus uniquement.
  useEffect(() => {
    if (isOrganizationMode()) {
      setModels([]);
      return;
    }
    let cancelled = false;
    commands
      .getAvailableModels()
      .then((result) => {
        if (cancelled) return;
        if (result.status === "ok") setModels(result.data);
      })
      .catch(() => {
        if (!cancelled) setModels([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const campusMode = isOrganizationMode();
  const selectedMicrophone = getSetting("selected_microphone") ?? null;
  const microphoneName = selectedMicrophone ?? audioDevices[0]?.name ?? null;

  const hasDownloadedModel = (models ?? []).some((m) => m.is_downloaded);
  const needsModelDownload =
    !campusMode && models !== null && !hasDownloadedModel;

  const engine: ReadinessState = campusMode
    ? connection === "connected"
      ? "ready"
      : connection === "local"
        ? "degraded"
        : "checking"
    : models === null
      ? "checking"
      : hasDownloadedModel
        ? "ready"
        : "action-needed";

  const engineLabel = campusMode
    ? session
      ? connection === "connected"
        ? "campus"
        : "local-fallback"
      : null
    : hasDownloadedModel
      ? "local"
      : "local-missing";

  const bindings = getSetting("bindings") as
    | Record<string, { current_binding?: string }>
    | undefined;

  return {
    loaded: settings !== null && permissions !== "checking" && models !== null,
    permissions,
    microphoneName,
    microphone: audioDevices.length > 0 ? "ready" : "action-needed",
    engine,
    engineLabel,
    needsModelDownload,
    shortcut: bindings?.["transcribe"]?.current_binding ?? null,
    language: (getSetting("selected_language") as string | undefined) ?? null,
    hasDictated,
    lastDictationAt,
    refresh,
  };
}
