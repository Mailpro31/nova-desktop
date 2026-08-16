import React from "react";
import { useTranslation } from "react-i18next";

import { PageHeader } from "../../shell/PageHeader";
import NovaCommandsExperiment from "./NovaCommandsExperiment";
import PreviewBadge from "./PreviewBadge";
import { useSettings } from "../../../hooks/useSettings";
import { useCampusStatus } from "../../../hooks/useCampusStatus";
import { isCampusMode } from "@/lib/mode";
import {
  ASK_NOVA,
  NOVA_COMMAND_SKILLS,
  type NovaCommandSkillInfo,
} from "@/lib/commands/catalog";

/** Les quatre étapes du parcours, dans l'ordre où elles se produisent. */
const HOW_IT_WORKS = [
  "aiSkills.how.select",
  "aiSkills.how.open",
  "aiSkills.how.choose",
  "aiSkills.how.review",
];

/**
 * AI Skills — les actions que Nova exécute sur du contenu sélectionné.
 *
 * Le modèle mental est « je sélectionne → Nova agit », distinct des **Styles**
 * (« je contrôle comment Nova écrit ma dictée »). Cette page présentait
 * auparavant les Styles projetés en Skills, faute de moteur d'action ; le
 * moteur existe désormais et la projection a été supprimée.
 *
 * La page est **descriptive**. Aucune action ne s'y déclenche : un Skill a
 * besoin d'une sélection dans une autre application, donc d'un raccourci. Rien
 * n'est donc cliquable ici, et rien ne peut être lancé par mégarde.
 *
 * Nom, description et icône viennent du catalogue, jamais du JSX : la page et
 * la palette montrent forcément la même chose.
 */
export const AiSkillsSettings: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting } = useSettings();
  const { connection } = useCampusStatus();

  const campusMode = isCampusMode();
  const debugMode = getSetting("debug_mode") ?? false;
  const offline = campusMode && connection === "local";

  return (
    <>
      <PageHeader
        title={t("aiSkills.title")}
        description={t("aiSkills.subtitle")}
        actions={
          // Traitement discret plutôt qu'un bandeau d'avertissement : la
          // fonctionnalité est en cours de test, pas dangereuse.
          <PreviewBadge
            label={t("aiSkills.preview")}
            hint={t("aiSkills.previewHint")}
          />
        }
      />

      <section aria-labelledby="ai-skills-essentials">
        <h2
          id="ai-skills-essentials"
          className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-secondary"
        >
          {t("aiSkills.essentials")}
        </h2>
        <ul className="flex flex-col">
          {NOVA_COMMAND_SKILLS.map((skill) => (
            <SkillRow key={skill.id} skill={skill} />
          ))}
        </ul>
      </section>

      {/* L'instruction libre vient après les actions prédéfinies : elle est un
          complément, pas la porte d'entrée. */}
      <section className="mt-[24px]">
        <ul className="flex flex-col">
          <SkillRow skill={ASK_NOVA} />
        </ul>
      </section>

      <section className="mt-[32px] border-t border-hairline pt-[24px]">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">
          {t("aiSkills.howItWorks")}
        </h2>
        <ol className="flex flex-col gap-2">
          {HOW_IT_WORKS.map((key, index) => (
            <li key={key} className="flex items-baseline gap-3">
              <span
                aria-hidden="true"
                className="w-4 shrink-0 text-xs tabular-nums text-text-secondary"
              >
                {index + 1}
              </span>
              <span className="text-sm leading-relaxed text-text-secondary">
                {t(key)}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* Formulation strictement descriptive : le texte sélectionné part vers
          le serveur de l'établissement. Rien n'est affirmé sur le chiffrement
          ni sur la conservation, faute de garantie technique à citer. */}
      <p className="mt-[24px] text-xs leading-relaxed text-text-secondary">
        {offline ? t("aiSkills.privacyOffline") : t("aiSkills.privacy")}
      </p>

      {campusMode && debugMode && <NovaCommandsExperiment />}
    </>
  );
};

/**
 * Ligne de Skill : icône, nom, intention. Compacte et sans surface propre —
 * quatre entrées n'ont pas besoin de quatre cartes, et une couleur par Skill
 * transformerait une liste calme en nuancier.
 */
const SkillRow: React.FC<{ skill: NovaCommandSkillInfo }> = ({ skill }) => {
  const { t } = useTranslation();
  const Icon = skill.icon;

  return (
    <li className="flex items-start gap-3 border-b border-hairline py-2.5 last:border-b-0">
      <Icon
        size={17}
        strokeWidth={1.75}
        className="mt-0.5 shrink-0 text-text-secondary"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text">{t(skill.nameKey)}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-text-secondary">
          {t(skill.descriptionKey)}
        </p>
      </div>
    </li>
  );
};

export default AiSkillsSettings;
