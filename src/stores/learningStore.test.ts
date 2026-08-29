import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * Le store Learn, sous les pannes.
 *
 * Ce qui vaut d'être testé ici n'est pas le chemin heureux — il se voit — mais
 * ce qui arrive quand le serveur ne répond pas. Une progression effacée par une
 * coupure réseau serait la pire réponse possible à un problème temporaire, et
 * une panne du moteur d'inférence ne doit pas emporter la leçon avec elle.
 *
 * Les commandes Tauri sont simulées : ce sont elles qui échouent, et c'est la
 * réaction du store qu'on mesure.
 */

const calls: { name: string; args: unknown[] }[] = [];
let catalogResult: unknown;
let progressResult: unknown;
let updateResult: unknown;
let feedbackResult: unknown;

// `mock.module` remplace le module pour tout le processus de test : les autres
// fichiers importent aussi `events` depuis `@/bindings`, et un mock qui ne
// rendrait que `commands` les casserait sans rapport avec ce qu'ils vérifient.
const realBindings = await import("@/bindings");

mock.module("@/bindings", () => ({
  ...realBindings,
  commands: {
    fetchLearningCatalog: async () => {
      calls.push({ name: "catalog", args: [] });
      return catalogResult;
    },
    fetchLearningProgress: async () => {
      calls.push({ name: "progress", args: [] });
      return progressResult;
    },
    updateLearningProgress: async (...args: unknown[]) => {
      calls.push({ name: "update", args });
      return updateResult;
    },
    requestLearningFeedback: async (...args: unknown[]) => {
      calls.push({ name: "feedback", args });
      return feedbackResult;
    },
  },
}));

const { useLearningStore } = await import("./learningStore");

const CATALOG = {
  catalog_version: 1,
  locale: "en",
  paths: [
    {
      id: "use-ai",
      pillar: "use_ai",
      title: "Use AI",
      description: "d",
      icon: null,
      order: 1,
      tags: [],
      modules: [
        {
          id: "m",
          title: "m",
          description: "d",
          order: 1,
          lessons: [
            {
              id: "l1",
              title: "l",
              description: "d",
              estimated_minutes: 3,
              difficulty: "beginner",
              order: 1,
              version: 1,
              tags: [],
              blocks: [
                { id: "a", type: "text", order: 1, content: {} },
                { id: "b", type: "takeaway", order: 2, content: {} },
              ],
            },
          ],
        },
      ],
    },
  ],
};

function entry(overrides: Record<string, unknown> = {}) {
  return {
    lesson_id: "l1",
    status: "in_progress",
    lesson_version: 1,
    completed_blocks: ["a"],
    last_block_id: "b",
    started_at: 1,
    updated_at: 2,
    completed_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  calls.length = 0;
  useLearningStore.getState().reset();
  catalogResult = { status: "ok", data: CATALOG };
  progressResult = { status: "ok", data: { catalog_version: 1, lessons: [] } };
  updateResult = { status: "ok", data: entry() };
  feedbackResult = {
    status: "ok",
    data: { exercise_id: "e1", feedback: "Deux phrases utiles." },
  };
});

describe("catalogue", () => {
  test("il se charge et devient disponible", async () => {
    await useLearningStore.getState().loadCatalog();
    expect(useLearningStore.getState().catalogState).toBe("ready");
    expect(useLearningStore.getState().catalog?.paths).toHaveLength(1);
  });

  test("une panne laisse un état d'erreur, pas un catalogue vide silencieux", async () => {
    catalogResult = { status: "error", error: "LEARNING_UNAVAILABLE" };
    await useLearningStore.getState().loadCatalog();
    expect(useLearningStore.getState().catalogState).toBe("error");
    expect(useLearningStore.getState().catalog).toBeNull();
  });
});

describe("progression", () => {
  test("une lecture ratée ne remplace pas ce qui était déjà connu", async () => {
    // Sinon une coupure réseau ferait apparaître toutes les leçons comme
    // jamais commencées.
    await useLearningStore.getState().loadProgress();
    useLearningStore.setState({
      progress: { catalog_version: 1, lessons: [entry()] },
    });
    progressResult = { status: "error", error: "NETWORK" };
    await useLearningStore.getState().loadProgress();
    expect(useLearningStore.getState().progress?.lessons).toHaveLength(1);
  });

  test("l'écriture avance l'état local avant la réponse du serveur", async () => {
    await useLearningStore.getState().recordProgress("l1", ["a"], "b");
    const stored = useLearningStore.getState().progress?.lessons[0];
    expect(stored?.completed_blocks).toEqual(["a"]);
    expect(useLearningStore.getState().progressOutOfSync).toBe(false);
  });

  test("une écriture échouée conserve la progression et le signale", async () => {
    updateResult = { status: "error", error: "NETWORK" };
    await useLearningStore.getState().recordProgress("l1", ["a"], "b");
    const stored = useLearningStore.getState().progress?.lessons[0];
    expect(stored?.completed_blocks).toEqual(["a"]);
    expect(useLearningStore.getState().progressOutOfSync).toBe(true);
  });

  test("le poste n'annonce jamais un état, seulement ce qu'il a traité", async () => {
    await useLearningStore.getState().recordProgress("l1", ["a"], "b");
    const update = calls.find((call) => call.name === "update");
    expect(update?.args).toEqual(["l1", ["a"], "b"]);
  });

  test("la réponse du serveur fait autorité sur l'état", async () => {
    updateResult = { status: "ok", data: entry({ status: "completed" }) };
    await useLearningStore.getState().recordProgress("l1", ["a", "b"], "b");
    expect(useLearningStore.getState().progress?.lessons[0].status).toBe(
      "completed",
    );
  });
});

describe("exercice IA", () => {
  test("il passe par l'identifiant, jamais par une instruction", async () => {
    await useLearningStore.getState().runExercise("blk", "e1", "ma demande");
    const call = calls.find((item) => item.name === "feedback");
    expect(call?.args).toEqual(["e1", "ma demande"]);
  });

  test("le retour arrive sur le bloc qui l'a demandé", async () => {
    await useLearningStore.getState().runExercise("blk", "e1", "x");
    const state = useLearningStore.getState().exercises["blk"];
    expect(state.status).toBe("done");
    expect(state.feedback).toBe("Deux phrases utiles.");
  });

  test("une panne du moteur reste confinée au bloc", async () => {
    // La leçon doit rester lisible : seul l'exercice porte l'erreur.
    feedbackResult = { status: "error", error: "AI_RUNTIME_UNAVAILABLE" };
    await useLearningStore.getState().runExercise("blk", "e1", "x");
    expect(useLearningStore.getState().exercises["blk"].status).toBe("error");
    expect(useLearningStore.getState().exercises["blk"].errorCode).toBe(
      "AI_RUNTIME_UNAVAILABLE",
    );
    expect(useLearningStore.getState().catalogState).not.toBe("error");
  });

  test("deux exercices ne se marchent pas dessus", async () => {
    await useLearningStore.getState().runExercise("un", "e1", "x");
    feedbackResult = { status: "error", error: "AI_RUNTIME_TIMEOUT" };
    await useLearningStore.getState().runExercise("deux", "e1", "y");
    expect(useLearningStore.getState().exercises["un"].status).toBe("done");
    expect(useLearningStore.getState().exercises["deux"].status).toBe("error");
  });

  test("aucun texte libre ne reste dans le store après coup", async () => {
    // Le store garde le retour, pas ce qui a été écrit : rien ne justifierait
    // de conserver la réponse d'un apprenant après l'avoir affichée.
    await useLearningStore.getState().runExercise("blk", "e1", "SENTINELLE_42");
    expect(JSON.stringify(useLearningStore.getState())).not.toContain(
      "SENTINELLE_42",
    );
  });
});
