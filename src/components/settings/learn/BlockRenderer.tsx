import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Lightbulb, Sparkles } from "lucide-react";

import type { LearningBlock } from "@/lib/learning/model";
import { isKnownBlockType } from "@/lib/learning/model";
import { useLearningStore, IDLE_EXERCISE } from "@/stores/learningStore";

/**
 * Le moteur de rendu d'une leçon.
 *
 * Un seul composant pour tous les types de blocs. Un composant React par leçon
 * aurait dupliqué la même logique neuf fois et rendu impossible d'ajouter un
 * type de contenu sans redéployer l'application — soit exactement ce que le
 * catalogue versionné cherche à éviter.
 *
 * Un type inconnu ne disparaît pas de la page : il se signale. Un bloc absent
 * en silence laisserait croire que la leçon est complète alors qu'il en manque
 * un morceau, et personne ne saurait qu'il faut mettre Nova à jour.
 *
 * Les textes du contenu viennent du catalogue, pas de l'i18n : ce sont des
 * données, pas des libellés d'interface. Les libellés, eux, sont traduits.
 */

interface BlockProps {
  block: LearningBlock;
  /** Signale que le bloc a été traité — c'est ce qui fait avancer la leçon. */
  onSettled: (blockId: string) => void;
  settled: boolean;
}

function text(content: Record<string, unknown>, key: string): string {
  const value = content[key];
  return typeof value === "string" ? value : "";
}

/** Paragraphes séparés par une ligne vide, sans jamais interpréter de HTML. */
const Prose: React.FC<{ body: string }> = ({ body }) => (
  <>
    {body.split("\n\n").map((paragraph, index) => (
      <p key={index} className="text-sm leading-relaxed text-text-secondary">
        {paragraph}
      </p>
    ))}
  </>
);

const Callout: React.FC<{
  tone: "tip" | "warning";
  body: string;
  label: string;
}> = ({ tone, body, label }) => {
  const Icon = tone === "warning" ? AlertTriangle : Lightbulb;
  return (
    <div
      className={`flex gap-3 rounded-lg border p-3 ${
        tone === "warning"
          ? "border-amber-500/30 bg-amber-500/5"
          : "border-mid-gray/20 bg-mid-gray/5"
      }`}
    >
      <Icon
        size={16}
        className="mt-0.5 shrink-0 text-text-secondary"
        aria-hidden
      />
      <div className="space-y-2">
        <span className="sr-only">{label}</span>
        <Prose body={body} />
      </div>
    </div>
  );
};

const MultipleChoice: React.FC<BlockProps> = ({ block, onSettled }) => {
  const { t } = useTranslation();
  const [chosen, setChosen] = useState<string | null>(null);
  const content = block.content;
  const options = Array.isArray(content.options)
    ? (content.options as Array<{ id: string; label: string }>)
    : [];
  const correct = text(content, "correct_option_id");
  const answered = chosen !== null;
  const right = chosen === correct;

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium text-text">
        {text(content, "question")}
      </legend>
      <div className="space-y-2">
        {options.map((option) => {
          const isChosen = chosen === option.id;
          const isCorrect = option.id === correct;
          // L'état ne repose jamais sur la seule couleur : un préfixe textuel
          // dit la même chose, et il est lu par un lecteur d'écran.
          const marker = !answered
            ? ""
            : isCorrect
              ? `${t("learn.quiz.correct")} — `
              : isChosen
                ? `${t("learn.quiz.incorrect")} — `
                : "";
          return (
            <button
              key={option.id}
              type="button"
              disabled={answered}
              aria-pressed={isChosen}
              onClick={() => {
                setChosen(option.id);
                onSettled(block.id);
              }}
              className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                answered && isCorrect
                  ? "border-emerald-500/40 bg-emerald-500/5 text-text"
                  : answered && isChosen
                    ? "border-mid-gray/40 bg-mid-gray/10 text-text"
                    : "border-mid-gray/20 text-text-secondary hover:bg-mid-gray/8"
              }`}
            >
              <span>
                {marker}
                {option.label}
              </span>
            </button>
          );
        })}
      </div>
      {answered && (
        <p
          role="status"
          className="text-sm leading-relaxed text-text-secondary"
        >
          <span className="font-medium text-text">
            {right ? t("learn.quiz.correct") : t("learn.quiz.incorrect")}.{" "}
          </span>
          {text(content, "explanation")}
        </p>
      )}
    </fieldset>
  );
};

const PromptExercise: React.FC<BlockProps> = ({ block, onSettled }) => {
  const { t } = useTranslation();
  const content = block.content;
  const [answer, setAnswer] = useState(text(content, "starting_text"));
  const [revealed, setRevealed] = useState(false);
  const fieldId = `learn-prompt-${block.id}`;

  return (
    <div className="space-y-3">
      <label htmlFor={fieldId} className="block text-sm font-medium text-text">
        {text(content, "instruction")}
      </label>
      {text(content, "hint") && (
        <p className="text-xs text-text-secondary">{text(content, "hint")}</p>
      )}
      <textarea
        id={fieldId}
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        rows={4}
        className="w-full resize-y rounded-lg border border-mid-gray/20 bg-transparent p-3 text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      />
      <button
        type="button"
        disabled={answer.trim() === ""}
        onClick={() => {
          setRevealed(true);
          onSettled(block.id);
        }}
        className="rounded-chip bg-mid-gray/12 px-3 py-1.5 text-sm text-text transition-colors hover:bg-mid-gray/20 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {t("learn.exercise.compare")}
      </button>
      {revealed && (
        <div className="rounded-lg border border-mid-gray/20 p-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-text-secondary">
            {t("learn.exercise.sample")}
          </p>
          <Prose body={text(content, "sample_answer")} />
        </div>
      )}
    </div>
  );
};

const AiExercise: React.FC<BlockProps> = ({ block, onSettled }) => {
  const { t } = useTranslation();
  const content = block.content;
  const [answer, setAnswer] = useState(text(content, "starting_text"));
  const state = useLearningStore(
    (store) => store.exercises[block.id] ?? IDLE_EXERCISE,
  );
  const runExercise = useLearningStore((store) => store.runExercise);
  const exerciseId = text(content, "exercise_id");
  const fieldId = `learn-ai-${block.id}`;

  return (
    <div className="space-y-3">
      <label htmlFor={fieldId} className="block text-sm font-medium text-text">
        {text(content, "instruction")}
      </label>
      {text(content, "hint") && (
        <p className="text-xs text-text-secondary">{text(content, "hint")}</p>
      )}
      <textarea
        id={fieldId}
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        rows={4}
        className="w-full resize-y rounded-lg border border-mid-gray/20 bg-transparent p-3 text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      />
      <button
        type="button"
        disabled={answer.trim() === "" || state.status === "running"}
        onClick={async () => {
          // Le poste envoie un identifiant et un texte. L'instruction
          // pédagogique reste sur le serveur : il n'existe ici aucun paramètre
          // par lequel on pourrait la remplacer.
          await runExercise(block.id, exerciseId, answer);
          onSettled(block.id);
        }}
        className="inline-flex items-center gap-2 rounded-chip bg-accent px-3 py-1.5 text-sm text-white transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Sparkles size={14} aria-hidden />
        {state.status === "running"
          ? t("learn.exercise.running")
          : t("learn.exercise.askNova")}
      </button>
      <div aria-live="polite">
        {state.status === "done" && state.feedback && (
          <div className="rounded-lg border border-mid-gray/20 p-3">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-text-secondary">
              {t("learn.exercise.feedback")}
            </p>
            <Prose body={state.feedback} />
          </div>
        )}
        {state.status === "error" && (
          // Une panne du moteur n'empêche pas de lire le reste de la leçon :
          // seul ce bloc porte l'erreur, et il dit quoi faire.
          <p className="text-sm text-text-secondary">
            {t("learn.exercise.unavailable")}
          </p>
        )}
      </div>
    </div>
  );
};

export const BlockRenderer: React.FC<BlockProps> = (props) => {
  const { t } = useTranslation();
  const { block } = props;
  const content = block.content;

  if (!isKnownBlockType(block.type)) {
    // Se signaler plutôt que disparaître : un bloc manquant en silence
    // laisserait croire que la leçon est complète.
    return (
      <p className="rounded-lg border border-dashed border-mid-gray/30 p-3 text-sm text-text-secondary">
        {t("learn.block.unsupported")}
      </p>
    );
  }

  switch (block.type) {
    case "text":
      return (
        <div className="space-y-2">
          {text(content, "heading") && (
            <h3 className="text-sm font-medium text-text">
              {text(content, "heading")}
            </h3>
          )}
          <Prose body={text(content, "body")} />
        </div>
      );

    case "example":
      return (
        <div className="rounded-lg border border-mid-gray/20 p-3">
          {text(content, "label") && (
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-text-secondary">
              {text(content, "label")}
            </p>
          )}
          <Prose body={text(content, "body")} />
        </div>
      );

    case "comparison":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          {(["worse", "better"] as const).map((side) => (
            <div
              key={side}
              className="rounded-lg border border-mid-gray/20 p-3"
            >
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-text-secondary">
                {text(content, `${side}_label`) ||
                  t(
                    side === "worse"
                      ? "learn.compare.worse"
                      : "learn.compare.better",
                  )}
              </p>
              <p className="text-sm leading-relaxed text-text">
                {text(content, side)}
              </p>
            </div>
          ))}
          {text(content, "note") && (
            <p className="text-xs text-text-secondary sm:col-span-2">
              {text(content, "note")}
            </p>
          )}
        </div>
      );

    case "tip":
      return (
        <Callout
          tone="tip"
          body={text(content, "body")}
          label={t("learn.block.tip")}
        />
      );

    case "warning":
      return (
        <Callout
          tone="warning"
          body={text(content, "body")}
          label={t("learn.block.warning")}
        />
      );

    case "reflection":
      return (
        <div className="rounded-lg border border-mid-gray/20 p-3">
          <p className="text-sm font-medium text-text">
            {text(content, "prompt")}
          </p>
          {text(content, "hint") && (
            <p className="mt-1 text-xs text-text-secondary">
              {text(content, "hint")}
            </p>
          )}
        </div>
      );

    case "question":
    case "multiple_choice":
      return <MultipleChoice {...props} />;

    case "prompt_exercise":
      return <PromptExercise {...props} />;

    case "ai_exercise":
      return <AiExercise {...props} />;

    case "takeaway":
      return (
        <div className="rounded-lg bg-mid-gray/8 p-3">
          <p className="mb-0.5 text-xs font-medium uppercase tracking-wide text-text-secondary">
            {t("learn.block.takeaway")}
          </p>
          <p className="text-sm leading-relaxed text-text">
            {text(content, "body")}
          </p>
        </div>
      );

    default:
      return null;
  }
};

export default BlockRenderer;
