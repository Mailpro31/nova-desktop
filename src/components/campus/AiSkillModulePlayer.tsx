import React, { useEffect, useState } from "react";
import { Check, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import type { AISkillModule } from "@/lib/aiSkills";

interface AiSkillModulePlayerProps {
  module: AISkillModule;
  moduleNumber: number;
  moduleCount: number;
  onComplete: () => void;
  onContinueLater?: () => void;
  onUseNova?: () => void;
}

export const AiSkillModulePlayer: React.FC<AiSkillModulePlayerProps> = ({
  module,
  moduleNumber,
  moduleCount,
  onComplete,
  onContinueLater,
  onUseNova,
}) => {
  const { t } = useTranslation();
  const lesson = module.lessons[0];
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  useEffect(() => setSelectedOption(null), [module.id]);

  const answered = selectedOption !== null;
  const isCorrect = selectedOption === lesson.question.correctOptionId;

  return (
    <div className="mx-auto flex w-full max-w-[620px] flex-col gap-6 py-2">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4 text-xs font-medium text-text-secondary">
          <span>
            {t("campus.aiCurriculum.modulePosition", {
              current: moduleNumber,
              total: moduleCount,
            })}
          </span>
          <span>
            {t("campus.aiSkills.minutes", { count: module.durationMinutes })}
          </span>
        </div>
        <div
          className="h-1 overflow-hidden rounded-full bg-inset"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={moduleCount}
          aria-valuenow={moduleNumber}
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-200 motion-reduce:transition-none"
            style={{ width: `${(moduleNumber / moduleCount) * 100}%` }}
          />
        </div>
      </div>

      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary">
          {t(module.skillKey)}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-text">
          {t(module.titleKey)}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-text-secondary">
          {t(lesson.ideaKey)}
        </p>
      </header>

      <section className="space-y-4 border-y border-hairline py-5">
        <p className="text-sm leading-relaxed text-text">
          {t(lesson.scenarioKey)}
        </p>
        <h2 className="text-base font-semibold text-text">
          {t(lesson.question.promptKey)}
        </h2>
        <div className="space-y-2" role="radiogroup">
          {lesson.question.options.map((option) => {
            const selected = selectedOption === option.id;
            const correct =
              answered && option.id === lesson.question.correctOptionId;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setSelectedOption(option.id)}
                className={`flex min-h-12 w-full items-start gap-3 border px-4 py-3 text-start text-sm transition-colors duration-150 [border-radius:var(--nova-radius-control)] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none ${
                  correct
                    ? "border-success/50 bg-success/8 text-text"
                    : selected
                      ? "border-accent bg-accent/8 text-text"
                      : "border-hairline bg-surface text-text-secondary hover:border-text-secondary/40"
                }`}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-[11px] font-semibold uppercase">
                  {correct ? <Check size={12} aria-hidden="true" /> : option.id}
                </span>
                <span className="leading-relaxed">{t(option.labelKey)}</span>
              </button>
            );
          })}
        </div>
      </section>

      {answered && (
        <div
          className="flex items-start gap-3 bg-inset px-4 py-3 [border-radius:var(--nova-radius-card)]"
          role="status"
          aria-live="polite"
        >
          <ShieldCheck
            size={18}
            className={isCorrect ? "text-success" : "text-accent"}
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-semibold text-text">
              {isCorrect
                ? t("campus.aiCurriculum.correct")
                : t("campus.aiCurriculum.considerThis")}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-text-secondary">
              {t(lesson.question.explanationKey)}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4">
        {onContinueLater ? (
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={onContinueLater}
          >
            {t("campus.firstRun.continueLater")}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          {onUseNova && (
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={onUseNova}
            >
              {t("campus.firstRun.useNovaNow")}
            </Button>
          )}
          <Button
            type="button"
            variant="primary"
            size="md"
            disabled={!answered}
            onClick={onComplete}
          >
            {t("campus.aiCurriculum.nextModule")}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AiSkillModulePlayer;
