import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Check } from "lucide-react";

import BlockRenderer from "./BlockRenderer";
import type { LearningLesson } from "@/lib/learning/model";
import {
  completionIsEarned,
  isInteractiveBlock,
  orderedBlocks,
  progressOf,
} from "@/lib/learning/model";
import { useLearningStore } from "@/stores/learningStore";

/**
 * Une leçon, du début à la fin.
 *
 * Les blocs sont affichés progressivement : on avance en lisant, plutôt que de
 * dérouler un mur de texte. Ce qui a déjà été fait lors d'une visite
 * précédente est restauré — fermer Nova au milieu d'une leçon et revenir doit
 * reprendre au bon endroit, pas tout recommencer.
 *
 * La complétion n'est jamais décidée ici. Le poste dit ce qui a été traité ; le
 * serveur en déduit l'état. Le bouton de fin n'est proposé que lorsque la
 * règle locale — la même que celle du serveur — est satisfaite, pour ne pas
 * offrir une action qui serait refusée.
 */

interface LessonViewProps {
  lesson: LearningLesson;
  onBack: () => void;
}

export const LessonView: React.FC<LessonViewProps> = ({ lesson, onBack }) => {
  const { t } = useTranslation();
  const blocks = useMemo(() => orderedBlocks(lesson), [lesson]);
  const progress = useLearningStore((store) => store.progress);
  const recordProgress = useLearningStore((store) => store.recordProgress);
  const outOfSync = useLearningStore((store) => store.progressOutOfSync);

  const stored = progressOf(progress, lesson.id);
  // La reprise part de ce que le serveur connaît. Si la leçon a changé de
  // version depuis, les blocs disparus ont déjà été écartés côté serveur.
  //
  // L'état initial suffit : le parent remonte ce composant à chaque leçon
  // (`key`), donc il n'y a pas d'état à resynchroniser après coup — et pas
  // d'effet dont les dépendances mentiraient.
  const [settled, setSettled] = useState<string[]>(
    () => stored?.completed_blocks ?? [],
  );
  const [visible, setVisible] = useState(() => {
    const seen = new Set(stored?.completed_blocks ?? []);
    const firstUnseen = blocks.findIndex((block) => !seen.has(block.id));
    return firstUnseen === -1 ? blocks.length : Math.max(1, firstUnseen + 1);
  });

  const settledSet = new Set(settled);
  const shown = blocks.slice(0, visible);
  const current = blocks[visible - 1];
  // Un bloc interactif doit avoir été traité avant qu'on puisse continuer ;
  // sinon la leçon se traverserait sans jamais rien faire.
  const blockedOnCurrent =
    current !== undefined &&
    isInteractiveBlock(current.type) &&
    !settledSet.has(current.id);
  const atEnd = visible >= blocks.length;
  const canComplete = completionIsEarned(lesson, [
    ...settled,
    ...(atEnd ? [blocks[blocks.length - 1].id] : []),
  ]);
  const completed = stored?.status === "completed";

  const settle = (blockId: string) => {
    setSettled((previous) =>
      previous.includes(blockId) ? previous : [...previous, blockId],
    );
  };

  const advance = () => {
    const next = Math.min(visible + 1, blocks.length);
    setVisible(next);
    const reached = blocks[next - 1];
    const seen = Array.from(new Set([...settled, blocks[visible - 1].id]));
    setSettled(seen);
    void recordProgress(lesson.id, seen, reached?.id ?? null);
  };

  const finish = () => {
    const seen = Array.from(
      new Set([...settled, blocks[blocks.length - 1].id]),
    );
    setSettled(seen);
    void recordProgress(lesson.id, seen, blocks[blocks.length - 1].id);
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-chip px-2 py-1 text-sm text-text-secondary transition-colors hover:bg-mid-gray/8 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <ArrowLeft size={14} aria-hidden />
          {t("learn.back")}
        </button>
        <h2 className="text-lg font-medium text-text">{lesson.title}</h2>
        <p className="text-sm text-text-secondary">{lesson.description}</p>
        <p className="text-xs text-text-secondary">
          {t("learn.lesson.minutes", { count: lesson.estimated_minutes })}
          {completed ? ` · ${t("learn.status.completed")}` : ""}
        </p>
      </div>

      <ol className="space-y-5">
        {shown.map((block) => (
          <li key={block.id} className="list-none">
            <BlockRenderer
              block={block}
              onSettled={settle}
              settled={settledSet.has(block.id)}
            />
          </li>
        ))}
      </ol>

      {outOfSync && (
        // La progression locale est conservée : une panne de réseau ne doit
        // pas effacer ce qui vient d'être fait.
        <p role="status" className="text-xs text-text-secondary">
          {t("learn.progress.notSynced")}
        </p>
      )}

      <div className="flex items-center gap-3 border-t border-mid-gray/15 pt-4">
        {!atEnd ? (
          <button
            type="button"
            onClick={advance}
            disabled={blockedOnCurrent}
            className="rounded-chip bg-accent px-3.5 py-1.5 text-sm text-white transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {t("learn.lesson.continue")}
          </button>
        ) : (
          <button
            type="button"
            onClick={finish}
            disabled={!canComplete || completed}
            className="inline-flex items-center gap-2 rounded-chip bg-accent px-3.5 py-1.5 text-sm text-white transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Check size={14} aria-hidden />
            {completed ? t("learn.status.completed") : t("learn.lesson.finish")}
          </button>
        )}
        {blockedOnCurrent && (
          <p className="text-xs text-text-secondary">
            {t("learn.lesson.answerFirst")}
          </p>
        )}
      </div>
    </div>
  );
};

export default LessonView;
