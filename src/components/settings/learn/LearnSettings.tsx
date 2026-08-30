import React, { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";

import { PageHeader } from "../../shell/PageHeader";
import LessonView from "./LessonView";
import {
  lessonsIndex,
  overallProgress,
  pillarSummaries,
  recommendedLesson,
  statusOf,
  type LearningCatalog,
  type ProgressSnapshot,
} from "@/lib/learning/model";
import { useLearningStore } from "@/stores/learningStore";

/**
 * Learn — la page d'accueil.
 *
 * Trois piliers, ce qu'il y a à reprendre, et une progression sobre. Pas de
 * classement, pas de série à ne pas rompre, pas de points : Learn aide à
 * devenir meilleur avec l'IA, il ne cherche pas à faire revenir.
 *
 * Rien ici n'appelle un modèle. Ouvrir Learn lit un catalogue statique et une
 * progression ; l'inférence n'intervient que dans un bloc qui l'exige
 * explicitement.
 */

const PILLAR_ORDER = ["use_ai", "learn_ai", "adapt_ai"];

const LessonRow: React.FC<{
  title: string;
  minutes: number;
  status: string;
  onOpen: () => void;
}> = ({ title, minutes, status, onOpen }) => {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-mid-gray/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm text-text">{title}</span>
        <span className="block text-xs text-text-secondary">
          {t("learn.lesson.minutes", { count: minutes })}
          {status === "completed" ? ` · ${t("learn.status.completed")}` : ""}
          {status === "in_progress" ? ` · ${t("learn.status.inProgress")}` : ""}
        </span>
      </span>
      <ChevronRight
        size={16}
        className="shrink-0 text-text-secondary"
        aria-hidden
      />
    </button>
  );
};

const Home: React.FC<{
  catalog: LearningCatalog;
  progress: ProgressSnapshot | null;
  onOpen: (lessonId: string) => void;
}> = ({ catalog, progress, onOpen }) => {
  const { t } = useTranslation();
  const overall = overallProgress(catalog, progress);
  const summaries = pillarSummaries(catalog, progress);
  const next = useMemo(
    () => recommendedLesson(catalog, progress),
    [catalog, progress],
  );
  const index = useMemo(() => lessonsIndex(catalog), [catalog]);
  const resuming =
    next !== null && statusOf(progress, next.lesson.id) === "in_progress";

  const ordered = [...summaries].sort(
    (a, b) => PILLAR_ORDER.indexOf(a.pillar) - PILLAR_ORDER.indexOf(b.pillar),
  );

  return (
    <div className="space-y-6">
      {next && (
        <section className="rounded-lg border border-mid-gray/20 p-4">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-text-secondary">
            {resuming ? t("learn.continue") : t("learn.recommended")}
          </p>
          <h3 className="text-sm font-medium text-text">{next.lesson.title}</h3>
          <p className="mt-0.5 text-sm text-text-secondary">
            {next.lesson.description}
          </p>
          <button
            type="button"
            onClick={() => onOpen(next.lesson.id)}
            className="mt-3 rounded-chip bg-accent px-3.5 py-1.5 text-sm text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {resuming ? t("learn.resume") : t("learn.start")}
          </button>
        </section>
      )}

      <p className="text-sm text-text-secondary">
        {t("learn.progress.summary", {
          completed: overall.completed,
          total: overall.total,
        })}
      </p>

      {ordered.map((summary) => {
        const path = catalog.paths.find((item) => item.id === summary.pathId);
        if (!path) return null;
        const lessons = [...path.modules]
          .sort((a, b) => a.order - b.order)
          .flatMap((module) =>
            [...module.lessons].sort((a, b) => a.order - b.order),
          );
        return (
          <section key={summary.pathId} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-medium text-text">{summary.title}</h3>
              <span className="shrink-0 text-xs text-text-secondary">
                {t("learn.progress.summary", {
                  completed: summary.completed,
                  total: summary.total,
                })}
              </span>
            </div>
            <p className="text-sm text-text-secondary">{summary.description}</p>
            <div className="mt-1 divide-y divide-mid-gray/10 rounded-lg border border-mid-gray/15">
              {lessons.map((lesson) => (
                <LessonRow
                  key={lesson.id}
                  title={lesson.title}
                  minutes={lesson.estimated_minutes}
                  status={statusOf(progress, lesson.id)}
                  onOpen={() => onOpen(lesson.id)}
                />
              ))}
            </div>
          </section>
        );
      })}

      {index.size === 0 && (
        <p className="text-sm text-text-secondary">{t("learn.empty")}</p>
      )}
    </div>
  );
};

export const LearnSettings: React.FC = () => {
  const { t } = useTranslation();
  const catalog = useLearningStore((store) => store.catalog);
  const catalogState = useLearningStore((store) => store.catalogState);
  const progress = useLearningStore((store) => store.progress);
  const activeLessonId = useLearningStore((store) => store.activeLessonId);
  const loadCatalog = useLearningStore((store) => store.loadCatalog);
  const loadProgress = useLearningStore((store) => store.loadProgress);
  const openLesson = useLearningStore((store) => store.openLesson);

  useEffect(() => {
    void loadCatalog();
    void loadProgress();
  }, [loadCatalog, loadProgress]);

  const active = useMemo(() => {
    if (!catalog || !activeLessonId) return null;
    return lessonsIndex(catalog).get(activeLessonId) ?? null;
  }, [catalog, activeLessonId]);

  return (
    <>
      <PageHeader title={t("learn.title")} description={t("learn.subtitle")} />
      <div className="px-1 pb-8">
        {catalogState === "loading" && !catalog && (
          <p className="text-sm text-text-secondary">{t("learn.loading")}</p>
        )}
        {catalogState === "error" && !catalog && (
          // Message simple, sans trace technique : la personne ne peut rien
          // faire d'une pile d'appels, et l'action utile tient en une phrase.
          <p className="text-sm text-text-secondary">
            {t("learn.error.catalog")}
          </p>
        )}
        {catalog && active && (
          // `key` : chaque leçon repart de son propre état de reprise, sans
          // effet de resynchronisation.
          <LessonView
            key={active.lesson.id}
            lesson={active.lesson}
            onBack={() => openLesson(null)}
          />
        )}
        {catalog && !active && (
          <Home catalog={catalog} progress={progress} onOpen={openLesson} />
        )}
      </div>
    </>
  );
};

export default LearnSettings;
