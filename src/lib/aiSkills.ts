export type AISkillLevel = "foundation" | "practitioner" | "advanced";

export interface AISkillQuestionOption {
  id: string;
  labelKey: string;
}

export interface AISkillQuestion {
  id: string;
  promptKey: string;
  options: AISkillQuestionOption[];
  correctOptionId: string;
  explanationKey: string;
}

export interface AISkillLesson {
  id: string;
  ideaKey: string;
  scenarioKey: string;
  question: AISkillQuestion;
}

export interface AISkillModule {
  id: string;
  titleKey: string;
  summaryKey: string;
  skillKey: string;
  durationMinutes: number;
  badgeId?: string;
  lessons: AISkillLesson[];
}

export interface AISkillTrack {
  id: string;
  level: AISkillLevel;
  titleKey: string;
  modules: AISkillModule[];
}

const module = (
  id: string,
  durationMinutes: number,
  correctOptionId: string,
  badgeId?: string,
): AISkillModule => ({
  id,
  titleKey: `campus.aiCurriculum.modules.${id}.title`,
  summaryKey: `campus.aiCurriculum.modules.${id}.summary`,
  skillKey: `campus.aiCurriculum.modules.${id}.skill`,
  durationMinutes,
  badgeId,
  lessons: [
    {
      id: `${id}-lesson`,
      ideaKey: `campus.aiCurriculum.modules.${id}.idea`,
      scenarioKey: `campus.aiCurriculum.modules.${id}.scenario`,
      question: {
        id: `${id}-question`,
        promptKey: `campus.aiCurriculum.modules.${id}.question`,
        options: ["a", "b", "c"].map((optionId) => ({
          id: optionId,
          labelKey: `campus.aiCurriculum.modules.${id}.options.${optionId}`,
        })),
        correctOptionId,
        explanationKey: `campus.aiCurriculum.modules.${id}.explanation`,
      },
    },
  ],
});

export const AI_ESSENTIALS_TRACK: AISkillTrack = {
  id: "ai-essentials",
  level: "foundation",
  titleKey: "campus.aiCurriculum.title",
  modules: [
    module("working-with-ai", 3, "b"),
    module("ask-better", 3, "b"),
    module("verify-output", 4, "b", "verified-thinker"),
    module("confidential-information", 3, "c", "privacy-ready"),
    module("ai-in-engineering", 4, "b", "engineering-ai"),
    module("responsible-use", 3, "c", "ai-foundations"),
  ],
};

export interface AISkillProgress {
  version: 1;
  trackId: string;
  activeModuleId: string | null;
  activeLessonIndex: number;
  completedModuleIds: string[];
  startedAt: string | null;
  completedAt: string | null;
}

export const EMPTY_AI_SKILLS_PROGRESS: AISkillProgress = {
  version: 1,
  trackId: AI_ESSENTIALS_TRACK.id,
  activeModuleId: null,
  activeLessonIndex: 0,
  completedModuleIds: [],
  startedAt: null,
  completedAt: null,
};

function safeIdentity(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
}

export function aiSkillsStorageKey(
  organizationId: string,
  email: string,
): string {
  return `nova-campus-ai-skills-v1:${safeIdentity(organizationId)}:${safeIdentity(email)}`;
}

export function loadAiSkillsProgress(storageKey: string): AISkillProgress {
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey) ?? "null");
    if (value?.version !== 1 || value?.trackId !== AI_ESSENTIALS_TRACK.id) {
      return { ...EMPTY_AI_SKILLS_PROGRESS };
    }
    return {
      ...EMPTY_AI_SKILLS_PROGRESS,
      ...value,
      completedModuleIds: Array.isArray(value.completedModuleIds)
        ? value.completedModuleIds.filter(
            (id: unknown) => typeof id === "string",
          )
        : [],
    };
  } catch {
    return { ...EMPTY_AI_SKILLS_PROGRESS };
  }
}

export function saveAiSkillsProgress(
  storageKey: string,
  progress: AISkillProgress,
): void {
  window.localStorage.setItem(storageKey, JSON.stringify(progress));
}

export type CampusFirstRunStage =
  | "welcome"
  | "ai-skills"
  | "setup"
  | "try-nova"
  | "complete";

export interface CampusFirstRunState {
  version: 1;
  stage: CampusFirstRunStage;
  completed: boolean;
  startedAt: string;
  completedAt: string | null;
}

export function firstRunStorageKey(
  organizationId: string,
  email: string,
): string {
  return `nova-campus-first-run-v1:${safeIdentity(organizationId)}:${safeIdentity(email)}`;
}

export function loadCampusFirstRun(storageKey: string): CampusFirstRunState {
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey) ?? "null");
    if (value?.version === 1 && typeof value.stage === "string") {
      return value as CampusFirstRunState;
    }
  } catch {
    // A damaged local preference must never block Nova.
  }
  return {
    version: 1,
    stage: "welcome",
    completed: false,
    startedAt: new Date().toISOString(),
    completedAt: null,
  };
}

export function saveCampusFirstRun(
  storageKey: string,
  state: CampusFirstRunState,
): void {
  window.localStorage.setItem(storageKey, JSON.stringify(state));
}

export type EducationalHintId =
  | "privacy"
  | "verification"
  | "prompting"
  | "engineering"
  | "context";

export function educationalHintStorageKey(
  organizationId: string,
  email: string,
  hint: EducationalHintId,
): string {
  return `nova-campus-hint-v1:${safeIdentity(organizationId)}:${safeIdentity(email)}:${hint}`;
}
