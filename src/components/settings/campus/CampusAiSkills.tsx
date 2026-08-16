import React, { useMemo, useState } from "react";
import {
  BadgeCheck,
  Check,
  ChevronRight,
  GraduationCap,
  LockKeyhole,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { AiSkillModulePlayer } from "@/components/campus/AiSkillModulePlayer";
import { Button, PageHeader } from "@/components/ui";
import { useAiSkillsProgress } from "@/hooks/useAiSkillsProgress";
import { AI_ESSENTIALS_TRACK } from "@/lib/aiSkills";
import { useCampusStore } from "@/stores/campusStore";

export const CampusAiSkills: React.FC = () => {
  const { t, i18n } = useTranslation();
  const session = useCampusStore((state) => state.session);
  const organization = useCampusStore((state) => state.context.organization);
  const trackProgress = useCampusStore(
    (state) => state.context.aiSkillsPolicy.trackProgress,
  );
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const { progress, startModule, completeModule } = useAiSkillsProgress(
    organization.id,
    session?.email ?? "anonymous",
    trackProgress,
  );

  const activeModule = useMemo(
    () =>
      AI_ESSENTIALS_TRACK.modules.find((item) => item.id === activeModuleId) ??
      null,
    [activeModuleId],
  );
  const completedCount = progress.completedModuleIds.length;
  const percentage = Math.round(
    (completedCount / AI_ESSENTIALS_TRACK.modules.length) * 100,
  );

  if (activeModule) {
    const moduleIndex = AI_ESSENTIALS_TRACK.modules.findIndex(
      (item) => item.id === activeModule.id,
    );
    return (
      <AiSkillModulePlayer
        module={activeModule}
        moduleNumber={moduleIndex + 1}
        moduleCount={AI_ESSENTIALS_TRACK.modules.length}
        onContinueLater={() => setActiveModuleId(null)}
        onComplete={() => {
          completeModule(activeModule.id);
          setActiveModuleId(null);
        }}
      />
    );
  }

  const nextModule =
    AI_ESSENTIALS_TRACK.modules.find(
      (item) => !progress.completedModuleIds.includes(item.id),
    ) ?? AI_ESSENTIALS_TRACK.modules[0];

  return (
    <div className="mx-auto w-full max-w-[760px] space-y-8">
      <PageHeader
        eyebrow={t("campus.aiCurriculum.levels.foundation")}
        title={t("campus.aiSkills.title")}
        description={t("campus.aiSkills.description")}
        actions={
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={() => {
              startModule(nextModule.id);
              setActiveModuleId(nextModule.id);
            }}
          >
            {completedCount > 0 &&
            completedCount < AI_ESSENTIALS_TRACK.modules.length
              ? t("campus.aiCurriculum.continue")
              : t("campus.aiCurriculum.start")}
          </Button>
        }
      />

      <section className="space-y-3 border-y border-hairline py-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-text">
              {t("campus.aiCurriculum.levels.foundation")}
            </h2>
            <p className="mt-0.5 text-sm text-text-secondary">
              {t("campus.aiSkills.progress", {
                completed: completedCount,
                total: AI_ESSENTIALS_TRACK.modules.length,
              })}
            </p>
          </div>
          <span className="text-sm font-semibold tabular-nums text-text">
            {percentage}%
          </span>
        </div>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-inset"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percentage}
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-200 motion-reduce:transition-none"
            style={{ width: `${percentage}%` }}
          />
        </div>
        {progress.completedAt && (
          <p className="flex items-center gap-2 text-xs text-text-secondary">
            <BadgeCheck size={15} aria-hidden="true" />
            {t("campus.aiCurriculum.foundationCompleted", {
              date: new Intl.DateTimeFormat(i18n.language, {
                dateStyle: "medium",
              }).format(new Date(progress.completedAt)),
            })}
          </p>
        )}
      </section>

      <section aria-labelledby="ai-skills-modules-title">
        <h2
          id="ai-skills-modules-title"
          className="text-base font-semibold text-text"
        >
          {t("campus.aiCurriculum.modulesTitle")}
        </h2>
        <div className="mt-3 divide-y divide-hairline border-y border-hairline">
          {AI_ESSENTIALS_TRACK.modules.map((item, index) => {
            const complete = progress.completedModuleIds.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  startModule(item.id);
                  setActiveModuleId(item.id);
                }}
                className="flex min-h-16 w-full items-center gap-3 px-1 py-3 text-start transition-colors duration-150 hover:bg-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    complete
                      ? "bg-success text-white"
                      : "bg-inset text-text-secondary"
                  }`}
                >
                  {complete ? (
                    <Check size={14} aria-hidden="true" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-text">
                    {t(item.titleKey)}
                  </span>
                  <span className="mt-0.5 block text-xs text-text-secondary">
                    {t(item.skillKey)} ·{" "}
                    {t("campus.aiSkills.minutes", {
                      count: item.durationMinutes,
                    })}
                  </span>
                </span>
                <span className="text-xs font-medium text-text-secondary">
                  {complete
                    ? t("campus.aiSkills.completed")
                    : t("campus.aiCurriculum.next")}
                </span>
                <ChevronRight
                  size={15}
                  className="text-text-secondary"
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
      </section>

      <section
        className="grid gap-3 sm:grid-cols-3"
        aria-label={t("campus.aiCurriculum.mastery")}
      >
        {(["foundation", "practitioner", "advanced"] as const).map(
          (level, index) => (
            <div
              key={level}
              className="border border-hairline bg-surface p-4 [border-radius:var(--nova-radius-card)]"
            >
              {index === 0 ? (
                <GraduationCap
                  size={18}
                  className="text-accent"
                  aria-hidden="true"
                />
              ) : (
                <LockKeyhole
                  size={17}
                  className="text-text-secondary"
                  aria-hidden="true"
                />
              )}
              <h3 className="mt-3 text-sm font-semibold text-text">
                {t(`campus.aiCurriculum.levels.${level}`)}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                {index === 0
                  ? t("campus.aiCurriculum.foundationDescription")
                  : t("campus.aiCurriculum.futureLevel")}
              </p>
            </div>
          ),
        )}
      </section>
    </div>
  );
};

export default CampusAiSkills;
