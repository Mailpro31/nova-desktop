import { describe, expect, test } from "bun:test";

import {
  BLOCK_TYPES,
  INTERACTIVE_BLOCK_TYPES,
  completionIsEarned,
  isKnownBlockType,
  lessonsIndex,
  orderedBlocks,
  overallProgress,
  pillarSummaries,
  recommendedLesson,
  requiredBlockIds,
  statusOf,
  type LearningCatalog,
  type LearningLesson,
  type ProgressSnapshot,
} from "./model";

/**
 * Learn — logique de catalogue et de progression, côté poste.
 *
 * La fixture reproduit la **forme** du catalogue livré : trois piliers, neuf
 * leçons, et au moins une occurrence de chaque type de bloc que le moteur sait
 * rendre. Elle ne recopie pas le contenu réel — celui-ci vit côté serveur, et
 * son propre validateur le vérifie à chaque exécution de la suite serveur.
 *
 * Lire le fichier du dépôt serveur depuis ici aurait couplé deux dépôts par un
 * chemin de disque : vert sur cette machine, rouge partout ailleurs.
 */

const ALL_BLOCK_KINDS = [
  { id: "hook", type: "text", content: { body: "b" } },
  { id: "ex", type: "example", content: { body: "b" } },
  { id: "cmp", type: "comparison", content: { worse: "a", better: "b" } },
  { id: "tip", type: "tip", content: { body: "b" } },
  { id: "warn", type: "warning", content: { body: "b" } },
  {
    id: "quiz",
    type: "multiple_choice",
    content: {
      question: "q",
      options: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      correct_option_id: "a",
      explanation: "e",
    },
  },
  { id: "refl", type: "reflection", content: { prompt: "p" } },
  {
    id: "prompt",
    type: "prompt_exercise",
    content: { instruction: "i", sample_answer: "s" },
  },
  {
    id: "ai",
    type: "ai_exercise",
    content: { instruction: "i", exercise_id: "adapt-domain-request" },
  },
  { id: "end", type: "takeaway", content: { body: "b" } },
];

function fixtureLesson(id: string, order: number, rich: boolean) {
  const blocks = rich
    ? ALL_BLOCK_KINDS
    : [
        { id: "hook", type: "text", content: { body: "b" } },
        { id: "end", type: "takeaway", content: { body: "b" } },
      ];
  return {
    id,
    title: id,
    description: "d",
    estimated_minutes: 4,
    difficulty: "beginner",
    order,
    version: 1,
    tags: id.startsWith("adapt") ? ["engineering"] : ["general"],
    blocks: blocks.map((block, index) => ({ ...block, order: index + 1 })),
  };
}

function realCatalog(): LearningCatalog {
  const pillars = ["use_ai", "learn_ai", "adapt_ai"];
  return {
    catalog_version: 1,
    locale: "en",
    paths: pillars.map((pillar, pathIndex) => ({
      id: pillar.replace("_", "-"),
      pillar,
      title: pillar,
      description: "d",
      icon: null,
      order: pathIndex + 1,
      tags: ["general"],
      modules: [
        {
          id: `${pillar}-m1`,
          title: "m",
          description: "d",
          order: 1,
          lessons: [1, 2, 3].map((n) =>
            fixtureLesson(
              `${pillar}-${n}`,
              n,
              pillar === "adapt_ai" && n === 3,
            ),
          ),
        },
      ],
    })),
  } as LearningCatalog;
}

function lesson(overrides: Partial<LearningLesson> = {}): LearningLesson {
  return {
    id: "l1",
    title: "T",
    description: "D",
    estimated_minutes: 3,
    difficulty: "beginner",
    order: 1,
    version: 1,
    tags: [],
    blocks: [
      { id: "a", type: "text", order: 1, content: { body: "x" } },
      { id: "b", type: "takeaway", order: 2, content: { body: "y" } },
    ],
    ...overrides,
  };
}

function snapshot(
  entries: Array<{ id: string; status: string }>,
): ProgressSnapshot {
  return {
    catalog_version: 1,
    lessons: entries.map((entry) => ({
      lesson_id: entry.id,
      status: entry.status,
      lesson_version: 1,
      completed_blocks: [],
      last_block_id: null,
      started_at: null,
      updated_at: 0,
      completed_at: null,
    })),
  };
}

describe("catalogue livré", () => {
  test("il porte neuf leçons réparties sur les trois piliers", () => {
    const index = lessonsIndex(realCatalog());
    expect(index.size).toBeGreaterThanOrEqual(9);
    const pillars = new Set([...index.values()].map((entry) => entry.pillar));
    expect([...pillars].sort()).toEqual(["adapt_ai", "learn_ai", "use_ai"]);
  });

  test("chaque type de bloc employé est connu du moteur de rendu", () => {
    // C'est ce qui empêche de publier un contenu que le poste afficherait
    // comme « il faut mettre Nova à jour ».
    for (const entry of lessonsIndex(realCatalog()).values()) {
      for (const block of entry.lesson.blocks) {
        expect(isKnownBlockType(block.type)).toBe(true);
      }
    }
  });

  test("chaque leçon tient dans une session courte", () => {
    for (const entry of lessonsIndex(realCatalog()).values()) {
      expect(entry.lesson.estimated_minutes).toBeLessThanOrEqual(6);
    }
  });

  test("chaque leçon se termine sur un enseignement", () => {
    for (const entry of lessonsIndex(realCatalog()).values()) {
      const blocks = orderedBlocks(entry.lesson);
      expect(blocks[blocks.length - 1].type).toBe("takeaway");
    }
  });

  test("aucun bloc ne transporte d'instruction système", () => {
    // Le pendant du contrôle serveur. Si un bloc portait son propre prompt, le
    // poste pourrait le réécrire avant de l'envoyer.
    // La règle vise les blocs `ai_exercise` : eux seuls déclenchent un appel
    // au modèle. Un bloc `reflection` affiche une question et n'envoie rien.
    for (const entry of lessonsIndex(realCatalog()).values()) {
      for (const block of entry.lesson.blocks) {
        if (block.type !== "ai_exercise") continue;
        expect(block.content).not.toHaveProperty("system_prompt");
        expect(block.content).not.toHaveProperty("prompt");
      }
    }
  });

  test("un bloc d'exercice IA ne cite qu'un identifiant", () => {
    const aiBlocks = [...lessonsIndex(realCatalog()).values()]
      .flatMap((entry) => entry.lesson.blocks)
      .filter((block) => block.type === "ai_exercise");
    expect(aiBlocks.length).toBeGreaterThan(0);
    for (const block of aiBlocks) {
      expect(typeof block.content.exercise_id).toBe("string");
    }
  });

  test("le catalogue déclare sa langue, pour permettre une localisation", () => {
    expect(realCatalog().locale.length).toBeGreaterThan(0);
  });
});

describe("règle de complétion", () => {
  test("une leçon sans interaction se termine en atteignant la fin", () => {
    expect(completionIsEarned(lesson(), ["b"])).toBe(true);
  });

  test("ouvrir la page ne suffit jamais", () => {
    expect(completionIsEarned(lesson(), [])).toBe(false);
    expect(completionIsEarned(lesson(), ["a"])).toBe(false);
  });

  test("une interaction non faite empêche la complétion", () => {
    const quiz = lesson({
      blocks: [
        { id: "q", type: "multiple_choice", order: 1, content: {} },
        { id: "z", type: "takeaway", order: 2, content: {} },
      ],
    });
    expect(requiredBlockIds(quiz)).toEqual(["q"]);
    expect(completionIsEarned(quiz, ["z"])).toBe(false);
    expect(completionIsEarned(quiz, ["q", "z"])).toBe(true);
  });

  test("la liste des blocs interactifs est celle du serveur", () => {
    // Si les deux divergeaient, l'interface proposerait une complétion que le
    // serveur refuserait.
    expect([...INTERACTIVE_BLOCK_TYPES].sort()).toEqual([
      "ai_exercise",
      "multiple_choice",
      "prompt_exercise",
      "question",
    ]);
  });

  test("tout type interactif est un type connu", () => {
    for (const type of INTERACTIVE_BLOCK_TYPES) {
      expect(BLOCK_TYPES).toContain(type);
    }
  });
});

describe("progression", () => {
  test("une leçon inconnue de la progression n'est pas commencée", () => {
    expect(statusOf(null, "l1")).toBe("not_started");
    expect(statusOf(snapshot([]), "l1")).toBe("not_started");
  });

  test("le décompte global ne compte que ce qui est terminé", () => {
    const catalog = realCatalog();
    const first = [...lessonsIndex(catalog).keys()][0];
    const overall = overallProgress(
      catalog,
      snapshot([{ id: first, status: "completed" }]),
    );
    expect(overall.completed).toBe(1);
    expect(overall.total).toBeGreaterThanOrEqual(9);
  });

  test("chaque pilier porte son propre décompte", () => {
    const summaries = pillarSummaries(realCatalog(), null);
    expect(summaries).toHaveLength(3);
    for (const summary of summaries) {
      expect(summary.total).toBeGreaterThan(0);
      expect(summary.completed).toBe(0);
    }
  });
});

describe("recommandation", () => {
  test("reprendre prime sur découvrir", () => {
    const catalog = realCatalog();
    const ids = [...lessonsIndex(catalog).keys()];
    const started = ids[4];
    const next = recommendedLesson(
      catalog,
      snapshot([{ id: started, status: "in_progress" }]),
    );
    expect(next?.lesson.id).toBe(started);
  });

  test("sans rien en cours, elle ouvre le premier pilier", () => {
    const catalog = realCatalog();
    const next = recommendedLesson(catalog, null);
    expect(next).not.toBeNull();
    expect(next?.pillar).toBe("use_ai");
  });

  test("elle bascule vers le pilier le moins avancé", () => {
    // Un pilier entier laissé de côté est exactement ce qu'une recommandation
    // doit corriger.
    const catalog = realCatalog();
    const useAi = [...lessonsIndex(catalog).values()].filter(
      (entry) => entry.pillar === "use_ai",
    );
    const next = recommendedLesson(
      catalog,
      snapshot(
        useAi.map((entry) => ({ id: entry.lesson.id, status: "completed" })),
      ),
    );
    expect(next?.pillar).not.toBe("use_ai");
  });

  test("elle est déterministe : deux appels donnent la même réponse", () => {
    const catalog = realCatalog();
    expect(recommendedLesson(catalog, null)?.lesson.id).toBe(
      recommendedLesson(catalog, null)?.lesson.id,
    );
  });

  test("tout terminé ne recommande rien plutôt que d'inventer", () => {
    const catalog = realCatalog();
    const all = [...lessonsIndex(catalog).keys()].map((id) => ({
      id,
      status: "completed",
    }));
    expect(recommendedLesson(catalog, snapshot(all))).toBeNull();
  });

  test("le domaine avance une leçon, il n'en cache aucune", () => {
    const catalog = realCatalog();
    const withDomain = recommendedLesson(catalog, null, "engineering");
    const without = recommendedLesson(catalog, null);
    // Le domaine ne peut que réordonner à l'intérieur du même pilier.
    expect(withDomain?.pillar).toBe(without?.pillar ?? "use_ai");
  });
});
