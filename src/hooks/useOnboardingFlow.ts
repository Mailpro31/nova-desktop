import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { isOrganizationMode } from "@/lib/mode";
import { advanceFrom } from "@/lib/onboarding/advance";
import {
  isSkipped,
  markSkipped,
  setStatus,
  type SkippableStep,
} from "@/lib/onboarding/progress";
import type { SystemReadiness } from "./useSystemReadiness";

export type OnboardingStepId =
  | "permissions"
  | "campus"
  | "welcome"
  | "model"
  | "smartSetup"
  | "writingStyles"
  | "firstDictation";

/** Étapes qu'on ne peut pas ignorer : sans elles, Nova ne fonctionne pas. */
const REQUIRED: OnboardingStepId[] = ["permissions", "campus", "model"];

export interface OnboardingFlow {
  /** `false` tant que la liste n'est pas arrêtée : ne rien rendre avant. */
  initialized: boolean;
  /** Étapes réellement à parcourir, dans l'ordre. */
  steps: OnboardingStepId[];
  current: OnboardingStepId | null;
  index: number;
  /** Rang affiché à l'utilisateur, hors étapes techniques. */
  displayIndex: number;
  displayCount: number;
  canSkip: boolean;
  canGoBack: boolean;
  next: () => void;
  back: () => void;
  skip: () => void;
}

interface Options {
  readiness: SystemReadiness;
  hasCampusSession: boolean;
  /**
   * `false` pour quelqu'un qui utilisait déjà Nova : il ne verra que les
   * étapes correctives (permission révoquée, session expirée, modèle absent),
   * jamais la présentation ni la configuration initiale.
   * `null` tant que l'état n'est pas connu.
   */
  isFirstRun: boolean | null;
  onFinished: () => void;
}

/**
 * Parcours adaptatif : la liste des étapes est **calculée depuis l'état réel**
 * du système, pas figée dans le code.
 *
 * Une permission déjà accordée, une session campus valide, un modèle déjà
 * présent, une dictée déjà effectuée : chacune de ces conditions retire son
 * étape. Un utilisateur revenant sur une machine configurée peut donc n'avoir
 * qu'un seul écran à voir — ou aucun.
 */
export function useOnboardingFlow({
  readiness,
  hasCampusSession,
  isFirstRun,
  onFinished,
}: Options): OnboardingFlow {
  const campusMode = isOrganizationMode();

  // La liste est **figée** dès que l'état système est connu. La recalculer en
  // continu ferait disparaître l'écran courant au moment précis où
  // l'utilisateur vient d'en satisfaire la condition : accorder la permission
  // ferait sauter l'écran de permission avant même son accusé de réception.
  const [frozen, setFrozen] = useState<OnboardingStepId[] | null>(null);

  const computed = useMemo<OnboardingStepId[]>(() => {
    if (!readiness.loaded || isFirstRun === null) return [];

    const pending: OnboardingStepId[] = [];

    // Étapes correctives : elles s'appliquent à tout le monde, y compris à un
    // utilisateur de longue date dont la permission a été révoquée ou dont la
    // session campus a expiré.
    if (readiness.permissions === "action-needed") pending.push("permissions");
    if (campusMode && !hasCampusSession) pending.push("campus");
    if (readiness.needsModelDownload) pending.push("model");

    // Le reste n'appartient qu'à la première ouverture.
    if (!isFirstRun) return pending;

    // L'accueil vient après l'authentification : c'est elle qui donne le nom
    // de l'établissement affiché sur cet écran. Il précède en revanche toute
    // configuration — on explique ce qu'est Nova avant de proposer un réglage.
    pending.push("welcome");
    pending.push("smartSetup");

    if (!isSkipped("writingStyles")) pending.push("writingStyles");
    if (!readiness.hasDictated && !isSkipped("firstDictation")) {
      pending.push("firstDictation");
    }

    return pending;
  }, [readiness, isFirstRun, campusMode, hasCampusSession]);

  useEffect(() => {
    if (frozen === null && readiness.loaded && isFirstRun !== null) {
      setFrozen(computed);
    }
  }, [frozen, computed, readiness.loaded, isFirstRun]);

  const steps = frozen ?? [];
  const [index, setIndex] = useState(0);

  const finish = useCallback(() => {
    setStatus("completed");
    onFinished();
  }, [onFinished]);

  // La mise a jour de l'index ne fait que calculer. Les deux effets qu'elle
  // portait -- enregistrer l'avancement, prevenir l'application -- sont
  // desormais des effets : React peut rejouer une fonction de mise a jour, et
  // ni l'ecriture d'un reglage ni la fin du parcours ne doivent avoir lieu
  // deux fois, ni au milieu d'un rendu.
  const advance = useCallback(() => {
    setIndex((i) => advanceFrom(i, steps.length).index);
  }, [steps.length]);

  const finished = useRef(false);

  useEffect(() => {
    // A l'ouverture, rien n'a encore ete parcouru : ni avancement a noter, ni
    // parcours a clore pour quelqu'un qui n'a rien vu.
    if (steps.length === 0 || index === 0) return;
    if (index < steps.length) {
      setStatus("in_progress");
      return;
    }
    if (finished.current) return;
    finished.current = true;
    finish();
  }, [index, steps.length, finish]);

  const back = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  const current = steps[index] ?? null;
  const canSkip = current !== null && !REQUIRED.includes(current);

  const skip = useCallback(() => {
    if (current && !REQUIRED.includes(current)) {
      markSkipped(current as SkippableStep);
    }
    advance();
  }, [current, advance]);

  // Les écrans techniques (permissions, connexion, téléchargement) ne sont pas
  // comptés : afficher « étape 2 sur 6 » à quelqu'un qui n'a fait qu'accorder
  // un droit système donne le sentiment d'un formulaire interminable.
  const countable = steps.filter((s) => !REQUIRED.includes(s));
  const displayCount = countable.length;
  const displayIndex = current ? countable.indexOf(current) : -1;

  return {
    initialized: frozen !== null,
    steps,
    current,
    index,
    displayIndex,
    displayCount,
    canSkip,
    canGoBack: index > 0,
    next: advance,
    back,
    skip,
  };
}
