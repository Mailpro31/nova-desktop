/**
 * Learn — modèle de contenu et de progression.
 *
 * Ces types décrivent ce que le serveur envoie. Ils ne le redéfinissent pas :
 * le catalogue est validé côté serveur, et le poste ne réinvente pas ce
 * contrôle. Ce qu'il fait, lui, c'est refuser d'afficher ce qu'il ne comprend
 * pas — un type de bloc inconnu se signale plutôt que de disparaître
 * silencieusement de la page.
 *
 * Learn appartient au Nova Core. Rien ici ne cite une édition : c'est la
 * capacité `learning` qui décide, exactement comme `aiSkills` ou `dictation`.
 */

export const PILLARS = ["use_ai", "learn_ai", "adapt_ai"] as const;
export type Pillar = (typeof PILLARS)[number];

export const BLOCK_TYPES = [
  "text",
  "example",
  "comparison",
  "tip",
  "warning",
  "question",
  "multiple_choice",
  "reflection",
  "prompt_exercise",
  "ai_exercise",
  "takeaway",
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

/**
 * Blocs qui exigent une interaction pour que la leçon compte comme terminée.
 *
 * La même liste existe côté serveur, et c'est **lui** qui tranche : celle-ci
 * ne sert qu'à afficher honnêtement ce qu'il reste à faire. Si les deux
 * divergeaient, l'interface promettrait une complétion que le serveur
 * refuserait — d'où le test qui les compare.
 */
export const INTERACTIVE_BLOCK_TYPES: readonly BlockType[] = [
  "multiple_choice",
  "question",
  "prompt_exercise",
  "ai_exercise",
];

export type LessonStatus = "not_started" | "in_progress" | "completed";

export interface LearningBlock {
  id: string;
  type: string;
  order: number;
  content: Record<string, unknown>;
}

export interface LearningLesson {
  id: string;
  title: string;
  description: string;
  estimated_minutes: number;
  difficulty: string;
  order: number;
  version: number;
  tags: string[];
  blocks: LearningBlock[];
}

export interface LearningModule {
  id: string;
  title: string;
  description: string;
  order: number;
  lessons: LearningLesson[];
}

export interface LearningPath {
  id: string;
  pillar: string;
  title: string;
  description: string;
  icon: string | null;
  order: number;
  tags: string[];
  modules: LearningModule[];
}

export interface LearningCatalog {
  catalog_version: number;
  locale: string;
  paths: LearningPath[];
}

export interface LessonProgress {
  lesson_id: string;
  status: string;
  lesson_version: number;
  completed_blocks: string[];
  last_block_id: string | null;
  started_at: number | null;
  updated_at: number;
  completed_at: number | null;
}

export interface ProgressSnapshot {
  catalog_version: number;
  lessons: LessonProgress[];
}

/** Une leçon avec le chemin et le module qui la portent. */
export interface LessonLocation {
  lesson: LearningLesson;
  moduleId: string;
  pathId: string;
  pillar: string;
}

export function isKnownBlockType(type: string): type is BlockType {
  return (BLOCK_TYPES as readonly string[]).includes(type);
}

export function isInteractiveBlock(type: string): boolean {
  return (INTERACTIVE_BLOCK_TYPES as readonly string[]).includes(type);
}

/** Toutes les leçons du catalogue, indexées, dans l'ordre de lecture. */
export function lessonsIndex(
  catalog: LearningCatalog,
): Map<string, LessonLocation> {
  const index = new Map<string, LessonLocation>();
  for (const path of [...catalog.paths].sort((a, b) => a.order - b.order)) {
    for (const module of [...path.modules].sort((a, b) => a.order - b.order)) {
      for (const lesson of [...module.lessons].sort(
        (a, b) => a.order - b.order,
      )) {
        index.set(lesson.id, {
          lesson,
          moduleId: module.id,
          pathId: path.id,
          pillar: path.pillar,
        });
      }
    }
  }
  return index;
}

export function orderedBlocks(lesson: LearningLesson): LearningBlock[] {
  return [...lesson.blocks].sort((a, b) => a.order - b.order);
}

/**
 * Les blocs qu'il faut avoir traités pour terminer la leçon.
 *
 * Ouvrir la page ne suffit pas : une leçon terminée doit vouloir dire quelque
 * chose.
 */
export function requiredBlockIds(lesson: LearningLesson): string[] {
  return orderedBlocks(lesson)
    .filter((block) => isInteractiveBlock(block.type))
    .map((block) => block.id);
}

/**
 * La leçon peut-elle passer à `completed` ?
 *
 * Réponse locale, pour l'affichage seulement. Le serveur applique la même
 * règle et c'est la sienne qui fait foi — celle-ci évite simplement de
 * présenter comme terminable une leçon qui ne l'est pas.
 */
export function completionIsEarned(
  lesson: LearningLesson,
  completedBlockIds: readonly string[],
): boolean {
  const blocks = orderedBlocks(lesson);
  if (blocks.length === 0) return false;
  const seen = new Set(completedBlockIds);
  if (!seen.has(blocks[blocks.length - 1].id)) return false;
  return requiredBlockIds(lesson).every((id) => seen.has(id));
}

export function statusOf(
  progress: ProgressSnapshot | null,
  lessonId: string,
): LessonStatus {
  const entry = progress?.lessons.find((item) => item.lesson_id === lessonId);
  if (!entry) return "not_started";
  if (entry.status === "completed" || entry.status === "in_progress") {
    return entry.status;
  }
  return "not_started";
}

export function progressOf(
  progress: ProgressSnapshot | null,
  lessonId: string,
): LessonProgress | null {
  return progress?.lessons.find((item) => item.lesson_id === lessonId) ?? null;
}

export interface PillarSummary {
  pillar: string;
  pathId: string;
  title: string;
  description: string;
  /** Rang du chemin dans le catalogue. Départage les piliers à égalité. */
  order: number;
  total: number;
  completed: number;
}

export function pillarSummaries(
  catalog: LearningCatalog,
  progress: ProgressSnapshot | null,
): PillarSummary[] {
  return [...catalog.paths]
    .sort((a, b) => a.order - b.order)
    .map((path) => {
      const lessons = path.modules.flatMap((module) => module.lessons);
      return {
        pillar: path.pillar,
        pathId: path.id,
        title: path.title,
        description: path.description,
        order: path.order,
        total: lessons.length,
        completed: lessons.filter(
          (lesson) => statusOf(progress, lesson.id) === "completed",
        ).length,
      };
    });
}

export function overallProgress(
  catalog: LearningCatalog,
  progress: ProgressSnapshot | null,
): { completed: number; total: number } {
  const lessons = [...lessonsIndex(catalog).values()];
  return {
    completed: lessons.filter(
      (entry) => statusOf(progress, entry.lesson.id) === "completed",
    ).length,
    total: lessons.length,
  };
}

/**
 * Ce qu'il faut proposer ensuite.
 *
 * Déterministe et explicable, dans cet ordre :
 *
 * 1. la leçon commencée et non finie — reprendre prime sur découvrir ;
 * 2. sinon, la première leçon non faite du pilier le moins avancé, ce qui
 *    évite de laisser un pilier entier de côté ;
 * 3. à égalité, l'ordre du catalogue tranche.
 *
 * Aucun modèle n'intervient. Une recommandation qu'on ne sait pas expliquer
 * n'aide personne à s'y fier, et elle coûterait un appel d'inférence à
 * l'ouverture d'un écran qui doit être instantané.
 */
export function recommendedLesson(
  catalog: LearningCatalog,
  progress: ProgressSnapshot | null,
  domain?: string | null,
): LessonLocation | null {
  const index = lessonsIndex(catalog);
  const entries = [...index.values()];
  if (entries.length === 0) return null;

  const inProgress = entries.find(
    (entry) => statusOf(progress, entry.lesson.id) === "in_progress",
  );
  if (inProgress) return inProgress;

  const summaries = pillarSummaries(catalog, progress).filter(
    (summary) => summary.completed < summary.total,
  );
  if (summaries.length === 0) return null;

  const ratio = (summary: PillarSummary) =>
    summary.total === 0 ? 1 : summary.completed / summary.total;
  // À égalité, l'ordre du catalogue tranche. Trier sur l'identifiant aurait
  // fait décider l'alphabet : « adapt-ai » serait passé avant « use-ai », et le
  // premier pilier proposé n'aurait plus été le premier pilier.
  const leastAdvanced = [...summaries].sort(
    (a, b) => ratio(a) - ratio(b) || a.order - b.order,
  )[0];

  const candidates = entries.filter(
    (entry) =>
      entry.pathId === leastAdvanced.pathId &&
      statusOf(progress, entry.lesson.id) !== "completed",
  );
  // Le domaine choisi n'écarte jamais une leçon, il en avance une. Filtrer
  // dessus cacherait du contenu à cause d'une préférence donnée en deux
  // secondes.
  if (domain) {
    const matching = candidates.find((entry) =>
      entry.lesson.tags.includes(domain),
    );
    if (matching) return matching;
  }
  return candidates[0] ?? null;
}

/** Domaines proposés pour Adapt AI. Aucune donnée personnelle n'est demandée. */
export const DOMAINS = [
  "general",
  "student",
  "engineering",
  "developer",
  "creator",
  "marketing",
  "management",
] as const;
export type Domain = (typeof DOMAINS)[number];
