import { useEffect, useState } from "react";

import {
  events,
  type DictationErrorKind,
  type DictationState,
  type LLMPrompt,
} from "@/bindings";
import { isOrganizationMode } from "@/lib/mode";
import { hasMilestone } from "@/lib/milestones";
import { useCampusStatus } from "../../../hooks/useCampusStatus";
import { useDictationState } from "../../../hooks/useDictationState";
import { useSettings } from "../../../hooks/useSettings";
import { useSystemReadiness } from "../../../hooks/useSystemReadiness";
import type { OrbState } from "./NovaOrb";
import type { SidebarSection } from "../../Sidebar";

/**
 * Situation du héros, dérivée de l'état système réel.
 *
 * L'ordre du calcul est l'ordre de gravité : ce qui empêche de dicter passe
 * avant ce qui le dégrade, qui passe avant ce qui va bien.
 *
 * Une dictée en cours passe **avant tout le reste** : c'est le seul moment où
 * l'utilisateur regarde l'écran en attendant quelque chose. Une permission
 * manquante peut patienter six secondes.
 *
 * L'état vient de `dictation-state`, diffusé par le moteur. L'accueil le
 * reflète et ne le pilote pas.
 */
export type HeroSituation =
  | "listening"
  | "processing"
  | "insertionFailed"
  | "checking"
  | "permissionsNeeded"
  | "microphoneMissing"
  | "modelMissing"
  | "shortcutMissing"
  | "campusLocal"
  | "ready";

export interface ChecklistItem {
  id: string;
  labelKey: string;
  done: boolean;
  /** Destination atteinte au clic ; absente quand rien n'y mène utilement. */
  target?: SidebarSection;
}

export interface HomeState {
  loaded: boolean;
  situation: HeroSituation;
  orb: OrbState;
  /** Raccourci de dictée, `null` s'il n'en existe aucun. */
  shortcut: string | null;
  /** Nom du style actif, déjà résolu (« Automatique » inclus). */
  styleName: string | null;
  /** Libellé du moteur actif, ou `null` s'il n'est pas déterminé. */
  engineKey: "campus" | "local-fallback" | "local" | null;
  microphoneName: string | null;
  lastDictationAt: number | null;
  checklist: ChecklistItem[];
  /** `true` tant que la liste apporte encore quelque chose. */
  showChecklist: boolean;
  /** Accueil pédagogique tant que l'utilisateur n'a pas pris ses marques. */
  isNewUser: boolean;
}

/** En dessous de ce reste, la liste a fait son travail et s'efface. */
const CHECKLIST_HIDE_WHEN_REMAINING = 0;

export function useHomeState(): HomeState {
  const readiness = useSystemReadiness();
  const dictation = useDictationState();
  const { getSetting } = useSettings();
  const { session, connection } = useCampusStatus();
  const campusMode = isOrganizationMode();

  // L'horodatage est réactualisé par les événements d'historique plutôt que
  // par un sondage : l'accueil est affiché souvent et longtemps.
  const [lastDictationAt, setLastDictationAt] = useState<number | null>(null);
  useEffect(() => {
    setLastDictationAt(readiness.lastDictationAt);
  }, [readiness.lastDictationAt]);

  useEffect(() => {
    const unlisten = events.historyUpdatePayload.listen((event) => {
      if (event.payload.action === "added") {
        setLastDictationAt(event.payload.entry.timestamp);
      }
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  const prompts = (getSetting("post_process_prompts") ?? []) as LLMPrompt[];
  const selectedPromptId =
    getSetting("post_process_selected_prompt_id") ?? "auto";
  const styleName =
    selectedPromptId === "auto"
      ? null
      : (prompts.find((p) => p.id === selectedPromptId)?.name ?? null);

  // Nova Commands doit être réellement utilisable pour figurer dans la liste :
  // sinon on proposerait à un étudiant une étape qu'il ne peut pas franchir.
  const commandsAvailable =
    campusMode && (getSetting("nova_commands_enabled") ?? false);

  const situation = deriveSituation({
    dictation: dictation.state,
    dictationError: dictation.error,
    loaded: readiness.loaded,
    permissions: readiness.permissions,
    microphoneName: readiness.microphoneName,
    needsModelDownload: readiness.needsModelDownload,
    shortcut: readiness.shortcut,
    campusLocal: campusMode && connection === "local",
  });

  const checklist: ChecklistItem[] = [];
  if (campusMode) {
    checklist.push({
      id: "campus_connected",
      labelKey: "home.checklist.campus",
      done: session !== null,
    });
  }
  checklist.push(
    {
      id: "voice_ready",
      labelKey: "home.checklist.voice",
      done:
        readiness.permissions === "ready" &&
        readiness.microphoneName !== null &&
        !readiness.needsModelDownload,
      target: "configuration",
    },
    {
      id: "first_dictation",
      labelKey: "home.checklist.firstDictation",
      done: readiness.hasDictated,
    },
    {
      // Dérivé, non stocké : le style par défaut est « auto », donc en avoir
      // choisi un autre *est* l'accomplissement. Aucun jalon à écrire.
      id: "style_chosen",
      labelKey: "home.checklist.style",
      done: selectedPromptId !== "auto",
      target: "postprocessing",
    },
  );
  if (commandsAvailable) {
    checklist.push({
      id: "first_ai_skill_used",
      labelKey: "home.checklist.aiSkill",
      done: hasMilestone("first_ai_skill_used"),
      target: "aiskills",
    });
  }

  const remaining = checklist.filter((item) => !item.done).length;
  const showChecklist =
    readiness.loaded && remaining > CHECKLIST_HIDE_WHEN_REMAINING;

  return {
    loaded: readiness.loaded,
    situation,
    orb: ORB_BY_SITUATION[situation],
    shortcut: readiness.shortcut,
    styleName,
    // `local-missing` n'est pas un moteur actif mais l'absence de moteur : le
    // héros le dit déjà, une rangée « Moteur : manquant » serait un doublon.
    engineKey:
      readiness.engineLabel === "local-missing"
        ? null
        : (readiness.engineLabel as HomeState["engineKey"]),
    microphoneName: readiness.microphoneName,
    lastDictationAt,
    checklist,
    showChecklist,
    // « Nouveau » se lit dans l'usage, pas dans un drapeau : quelqu'un qui a
    // déjà dicté connaît le geste et n'a plus besoin qu'on le lui explique.
    isNewUser: !readiness.hasDictated,
  };
}

interface SituationInput {
  dictation: DictationState;
  dictationError: DictationErrorKind | null;
  loaded: boolean;
  permissions: string;
  microphoneName: string | null;
  needsModelDownload: boolean;
  shortcut: string | null;
  campusLocal: boolean;
}

/** Exporté pour être testable sans monter React ni la couche Tauri. */
export function deriveSituation(input: SituationInput): HeroSituation {
  // Ce qui se passe maintenant prime sur ce qui manque en général.
  if (input.dictation === "listening") return "listening";
  if (input.dictation === "processing") return "processing";
  if (input.dictation === "error") {
    // Un micro défaillant est déjà couvert par les situations ci-dessous, et
    // avec une consigne plus complète. Seul l'échec d'insertion apporte ici
    // une information que rien d'autre ne donne : le texte est récupérable.
    if (input.dictationError === "insertion") return "insertionFailed";
  }
  if (!input.loaded) return "checking";
  if (input.permissions === "action-needed") return "permissionsNeeded";
  if (input.microphoneName === null) return "microphoneMissing";
  if (input.needsModelDownload) return "modelMissing";
  if (!input.shortcut) return "shortcutMissing";
  // Dégradé, pas bloquant : la dictée fonctionne toujours en local.
  if (input.campusLocal) return "campusLocal";
  return "ready";
}

const ORB_BY_SITUATION: Record<HeroSituation, OrbState> = {
  listening: "listening",
  processing: "processing",
  insertionFailed: "attention",
  checking: "checking",
  permissionsNeeded: "attention",
  microphoneMissing: "attention",
  modelMissing: "attention",
  shortcutMissing: "attention",
  campusLocal: "degraded",
  ready: "ready",
};
