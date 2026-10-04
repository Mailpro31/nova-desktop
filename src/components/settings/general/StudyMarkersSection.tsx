import React from "react";
import { useTranslation } from "react-i18next";
import { Lightbulb } from "lucide-react";

/**
 * Ce que l'élève peut dire, et ce que Nova écrit. Les déclencheurs sont ceux
 * de `src-tauri/src/rewrite/spoken_marks.rs` : ils se disent dans la langue
 * de la dictée, pas dans celle de l'interface.
 */
export const STUDY_MARKERS: ReadonlyArray<{ said: string; written: string }> = [
  { said: "Important", written: "⚠ Important" },
  { said: "À revoir", written: "🔁 À revoir" },
  { said: "Question", written: "❓ Question" },
  { said: "Définition", written: "📘 Définition" },
  { said: "J'ai décroché", written: "⏸ J'ai décroché" },
  { said: "Schéma à reprendre", written: "✏ Schéma à reprendre" },
];

/** Les blocs de cours ; les exemples et les exercices se numérotent seuls. */
export const COURSE_BLOCKS: ReadonlyArray<{
  said: string;
  written: string;
  numbered?: boolean;
}> = [
  { said: "Théorème", written: "📐 Théorème" },
  { said: "Propriété", written: "📐 Propriété" },
  { said: "À retenir", written: "📌 À retenir" },
  { said: "Méthode", written: "🛠 Méthode" },
  { said: "Remarque", written: "💬 Remarque" },
  { said: "Exemple", written: "🧪 Exemple", numbered: true },
  { said: "Exercice", written: "✍ Exercice", numbered: true },
];

/** Une formule dictée, et ce que Nova écrit, par règles fixes. */
export const FORMULA_EXAMPLE = {
  said: "Formule, delta égale b au carré moins quatre a c",
  written: "🔢 Formule : Δ = b² − 4ac",
};

/** Quelques mots de maths compris dans une formule (`spoken_maths.rs`). */
export const FORMULA_WORDS: ReadonlyArray<{ said: string; written: string }> = [
  { said: "au carré", written: "²" },
  { said: "racine carrée de", written: "√" },
  { said: "fois", written: "×" },
  { said: "sur", written: "/" },
  { said: "plus ou moins", written: "±" },
  { said: "différent de", written: "≠" },
  { said: "tend vers", written: "→" },
  { said: "alpha", written: "α" },
  { said: "delta", written: "Δ" },
  { said: "pi", written: "π" },
  { said: "indice", written: "x₁" },
  { said: "mètres par seconde", written: "m/s" },
];

const NUMBERING_HINT = " 1, 2, 3…";

export const LAYOUT_COMMANDS: ReadonlyArray<string> = [
  "À la ligne",
  "Point à la ligne",
  "Nouveau paragraphe",
];

export const ENGLISH_MARKERS: ReadonlyArray<string> = [
  "Important",
  "To review",
  "Question",
  "Definition",
  "I lost track",
  "Diagram to redo",
  "Theorem",
  "Property",
  "Key point",
  "Method",
  "Example",
  "Exercise",
  "New line",
  "New paragraph",
];

export const StudyMarkersSection: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="space-y-4 px-4 py-3">
      <div className="flex items-start gap-2.5 border-s-2 border-accent bg-accent/5 px-3 py-2.5">
        <Lightbulb size={16} className="text-accent shrink-0 mt-0.5" />
        <p className="text-xs text-text-secondary leading-relaxed">
          {t("organization.studyMarkers.rule", {
            example: "Important, la dérivée d'une constante est nulle.",
          })}
        </p>
      </div>

      <dl className="divide-y divide-hairline border-y border-hairline">
        {STUDY_MARKERS.map(({ said, written }) => (
          <div
            key={said}
            className="flex min-h-11 items-center justify-between gap-3 px-2 py-2"
          >
            <dt className="text-sm font-semibold text-text">« {said} »</dt>
            <dd className="text-sm text-text-secondary">{written}</dd>
          </div>
        ))}
      </dl>

      <div className="space-y-2">
        <h4 className="text-xs font-medium text-text">
          {t("organization.studyMarkers.blocksTitle")}
        </h4>
        <dl className="divide-y divide-hairline border-y border-hairline">
          {COURSE_BLOCKS.map(({ said, written, numbered }) => (
            <div
              key={said}
              className="flex min-h-11 items-center justify-between gap-3 px-2 py-2"
            >
              <dt className="text-sm font-semibold text-text">« {said} »</dt>
              <dd className="text-sm text-text-secondary">
                {numbered ? written + NUMBERING_HINT : written}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-text-secondary leading-relaxed">
          {t("organization.studyMarkers.numbering", { example: "Exemple 3" })}
        </p>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-medium text-text">
          {t("organization.studyMarkers.formulaTitle")}
        </h4>
        <p className="text-xs text-text-secondary leading-relaxed">
          {t("organization.studyMarkers.formula", {
            said: FORMULA_EXAMPLE.said,
            written: FORMULA_EXAMPLE.written,
          })}
        </p>
        <p className="text-xs text-text-secondary leading-relaxed">
          {FORMULA_WORDS.map(
            ({ said, written }) => `« ${said} » ${written}`,
          ).join(" · ")}
        </p>
      </div>

      <div className="space-y-1">
        <h4 className="text-xs font-medium text-text">
          {t("organization.studyMarkers.layoutTitle")}
        </h4>
        <p className="text-xs text-text-secondary leading-relaxed">
          {LAYOUT_COMMANDS.map((command) => `« ${command} »`).join(" · ")}
        </p>
      </div>

      <p className="text-xs text-text-secondary leading-relaxed">
        {t("organization.studyMarkers.search", { marker: "À revoir" })}
      </p>
      <p className="text-xs text-text-secondary leading-relaxed">
        {t("organization.studyMarkers.english", {
          phrases: ENGLISH_MARKERS.join(", "),
        })}
      </p>
    </div>
  );
};
