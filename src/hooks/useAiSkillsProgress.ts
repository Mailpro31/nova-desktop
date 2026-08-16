import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AI_ESSENTIALS_TRACK,
  EMPTY_AI_SKILLS_PROGRESS,
  aiSkillsStorageKey,
  loadAiSkillsProgress,
  saveAiSkillsProgress,
  type AISkillProgress,
} from "@/lib/aiSkills";

export function useAiSkillsProgress(
  organizationId: string,
  email: string,
  trackProgress = true,
) {
  const storageKey = useMemo(
    () => aiSkillsStorageKey(organizationId, email),
    [email, organizationId],
  );
  const [progress, setProgress] = useState<AISkillProgress>(() =>
    trackProgress
      ? loadAiSkillsProgress(storageKey)
      : { ...EMPTY_AI_SKILLS_PROGRESS },
  );

  useEffect(() => {
    setProgress(
      trackProgress
        ? loadAiSkillsProgress(storageKey)
        : { ...EMPTY_AI_SKILLS_PROGRESS },
    );
  }, [storageKey, trackProgress]);

  const update = useCallback(
    (updater: (current: AISkillProgress) => AISkillProgress) => {
      setProgress((current) => {
        const next = updater(current);
        if (trackProgress) saveAiSkillsProgress(storageKey, next);
        return next;
      });
    },
    [storageKey, trackProgress],
  );

  const startModule = useCallback(
    (moduleId: string) =>
      update((current) => ({
        ...current,
        activeModuleId: moduleId,
        activeLessonIndex: 0,
        startedAt: current.startedAt ?? new Date().toISOString(),
      })),
    [update],
  );

  const completeModule = useCallback(
    (moduleId: string) =>
      update((current) => {
        const completedModuleIds = current.completedModuleIds.includes(moduleId)
          ? current.completedModuleIds
          : [...current.completedModuleIds, moduleId];
        const allComplete =
          completedModuleIds.length >= AI_ESSENTIALS_TRACK.modules.length;
        const nextModule = AI_ESSENTIALS_TRACK.modules.find(
          (item) => !completedModuleIds.includes(item.id),
        );
        return {
          ...current,
          completedModuleIds,
          activeModuleId: nextModule?.id ?? null,
          activeLessonIndex: 0,
          completedAt: allComplete
            ? (current.completedAt ?? new Date().toISOString())
            : null,
        };
      }),
    [update],
  );

  return { progress, startModule, completeModule };
}
