import { create } from "zustand";

import { commands } from "@/bindings";
import type {
  LearningCatalog,
  LessonProgress,
  ProgressSnapshot,
} from "@/lib/learning/model";

/**
 * État de Learn.
 *
 * Quatre choses distinctes, tenues séparément parce qu'elles échouent
 * séparément : le catalogue, la progression, la leçon ouverte, et l'exercice en
 * cours. Un moteur d'inférence indisponible ne doit pas empêcher de lire le
 * reste d'une leçon — c'est possible seulement si l'état de l'exercice ne
 * contamine pas celui de la leçon.
 *
 * La progression locale n'est **jamais** détruite par un échec de
 * synchronisation. Une panne réseau qui effacerait ce que quelqu'un vient de
 * faire serait la pire réponse possible à un problème temporaire.
 */

export type LoadState = "idle" | "loading" | "ready" | "error";

export interface ExerciseState {
  status: "idle" | "running" | "done" | "error";
  feedback: string | null;
  errorCode: string | null;
}

export const IDLE_EXERCISE: ExerciseState = {
  status: "idle",
  feedback: null,
  errorCode: null,
};

interface LearningState {
  catalog: LearningCatalog | null;
  catalogState: LoadState;
  catalogError: string | null;

  progress: ProgressSnapshot | null;
  progressState: LoadState;
  /** Vrai quand la dernière écriture n'a pas pu atteindre le serveur. */
  progressOutOfSync: boolean;

  activeLessonId: string | null;
  exercises: Record<string, ExerciseState>;

  loadCatalog: () => Promise<void>;
  loadProgress: () => Promise<void>;
  openLesson: (lessonId: string | null) => void;
  recordProgress: (
    lessonId: string,
    completedBlocks: string[],
    lastBlockId: string | null,
  ) => Promise<void>;
  runExercise: (
    blockId: string,
    exerciseId: string,
    text: string,
  ) => Promise<void>;
  resetExercise: (blockId: string) => void;
  reset: () => void;
}

function mergeProgress(
  snapshot: ProgressSnapshot | null,
  entry: LessonProgress,
  catalogVersion: number,
): ProgressSnapshot {
  const lessons = (snapshot?.lessons ?? []).filter(
    (item) => item.lesson_id !== entry.lesson_id,
  );
  return {
    catalog_version: snapshot?.catalog_version ?? catalogVersion,
    lessons: [...lessons, entry].sort((a, b) =>
      a.lesson_id.localeCompare(b.lesson_id),
    ),
  };
}

/**
 * Progression avancée localement, en attendant que le serveur confirme.
 *
 * `status` reste celui que le serveur avait donné : le poste n'a pas à décider
 * qu'une leçon est terminée. Il note seulement ce qui a été vu, pour que la
 * reprise soit juste même si l'écriture a échoué.
 */
function localAdvance(
  snapshot: ProgressSnapshot | null,
  lessonId: string,
  completedBlocks: string[],
  lastBlockId: string | null,
): ProgressSnapshot {
  const existing = snapshot?.lessons.find(
    (item) => item.lesson_id === lessonId,
  );
  const merged = Array.from(
    new Set([...(existing?.completed_blocks ?? []), ...completedBlocks]),
  );
  const entry: LessonProgress = {
    lesson_id: lessonId,
    status: existing?.status ?? "in_progress",
    lesson_version: existing?.lesson_version ?? 0,
    completed_blocks: merged,
    last_block_id: lastBlockId,
    started_at: existing?.started_at ?? Date.now() / 1000,
    updated_at: Date.now() / 1000,
    completed_at: existing?.completed_at ?? null,
  };
  return mergeProgress(snapshot, entry, snapshot?.catalog_version ?? 0);
}

function errorCode(err: unknown): string {
  const text = typeof err === "string" ? err : String(err);
  const match = text.match(/[A-Z][A-Z_]{4,}/);
  return match ? match[0] : "UNKNOWN";
}

export const useLearningStore = create<LearningState>((set, get) => ({
  catalog: null,
  catalogState: "idle",
  catalogError: null,
  progress: null,
  progressState: "idle",
  progressOutOfSync: false,
  activeLessonId: null,
  exercises: {},

  loadCatalog: async () => {
    if (get().catalogState === "loading") return;
    set({ catalogState: "loading", catalogError: null });
    try {
      const result = await commands.fetchLearningCatalog();
      if (result.status === "error") throw result.error;
      set({ catalog: result.data, catalogState: "ready" });
    } catch (err) {
      set({ catalogState: "error", catalogError: errorCode(err) });
    }
  },

  loadProgress: async () => {
    set({ progressState: "loading" });
    try {
      const result = await commands.fetchLearningProgress();
      if (result.status === "error") throw result.error;
      set({
        progress: result.data,
        progressState: "ready",
        progressOutOfSync: false,
      });
    } catch {
      // La progression déjà connue reste affichée. Une lecture ratée n'est pas
      // une raison de faire croire que rien n'a été fait.
      set({ progressState: "error" });
    }
  },

  openLesson: (lessonId) => set({ activeLessonId: lessonId }),

  recordProgress: async (lessonId, completedBlocks, lastBlockId) => {
    // On avance localement d'abord : l'interface répond immédiatement, et si
    // l'écriture échoue on garde quand même ce qui vient d'être fait.
    set((state) => ({
      progress: localAdvance(
        state.progress,
        lessonId,
        completedBlocks,
        lastBlockId,
      ),
    }));
    try {
      const result = await commands.updateLearningProgress(
        lessonId,
        completedBlocks,
        lastBlockId,
      );
      if (result.status === "error") throw result.error;
      set((state) => ({
        progress: mergeProgress(
          state.progress,
          result.data,
          state.catalog?.catalog_version ?? 0,
        ),
        progressOutOfSync: false,
      }));
    } catch {
      set({ progressOutOfSync: true });
    }
  },

  runExercise: async (blockId, exerciseId, text) => {
    set((state) => ({
      exercises: {
        ...state.exercises,
        [blockId]: { status: "running", feedback: null, errorCode: null },
      },
    }));
    try {
      const result = await commands.requestLearningFeedback(exerciseId, text);
      if (result.status === "error") throw result.error;
      set((state) => ({
        exercises: {
          ...state.exercises,
          [blockId]: {
            status: "done",
            feedback: result.data.feedback,
            errorCode: null,
          },
        },
      }));
    } catch (err) {
      set((state) => ({
        exercises: {
          ...state.exercises,
          [blockId]: {
            status: "error",
            feedback: null,
            errorCode: errorCode(err),
          },
        },
      }));
    }
  },

  resetExercise: (blockId) =>
    set((state) => ({
      exercises: { ...state.exercises, [blockId]: IDLE_EXERCISE },
    })),

  reset: () =>
    set({
      catalog: null,
      catalogState: "idle",
      catalogError: null,
      progress: null,
      progressState: "idle",
      progressOutOfSync: false,
      activeLessonId: null,
      exercises: {},
    }),
}));
