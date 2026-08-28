import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Play, Building2 } from "lucide-react";
import { toast } from "sonner";

import { Button, PageHeader, Textarea } from "@/components/ui";
import { CampusApi, type OrganizationSkillEntry } from "@/lib/campusApi";
import { loadCampusSession } from "@/lib/campusSession";
import { useCampusStore } from "@/stores/campusStore";

/**
 * AI Skills — les actions IA réellement exécutables.
 *
 * ## Pourquoi un écran distinct de « AI Essentials »
 *
 * L'écran existant présente une piste d'apprentissage : des modules, un
 * exercice, une progression. C'est du **Learn**. Un AI Skill, lui, est un
 * outil : on lui donne un texte, il produit un résultat.
 *
 * Les réunir sous un même écran aurait mélangé « apprendre à écrire une
 * consigne » et « appliquer une consigne », deux choses que l'utilisateur ne
 * cherche pas au même moment.
 *
 * ## Built-in et Organization
 *
 * La structure prévoit les deux. Aujourd'hui, **aucun Skill intégré n'existe** :
 * les six modules livrés avec Nova — « Ask better », « Verifying AI outputs » —
 * sont des contenus pédagogiques sans instruction, donc rien à exécuter. Les
 * afficher ici les ferait passer pour des outils qu'ils ne sont pas.
 *
 * ## L'instruction ne quitte jamais le serveur
 *
 * Le poste envoie un identifiant et un texte. C'est le serveur qui retrouve
 * l'instruction dans le package actif — sans quoi le catalogue publié ne serait
 * qu'une suggestion.
 */
export const OrganizationAiSkills: React.FC = () => {
  const { t } = useTranslation();
  const skills = useCampusStore((state) => state.organizationCatalog?.skills);
  const organizationSkills: OrganizationSkillEntry[] = skills ?? [];

  return (
    <div className="mx-auto w-full max-w-[760px] space-y-8">
      <PageHeader
        title={t("aiSkillTools.title")}
        description={t("aiSkillTools.subtitle")}
      />

      <section aria-labelledby="ai-skills-builtin">
        <h2
          id="ai-skills-builtin"
          className="text-base font-semibold text-text"
        >
          {t("aiSkillTools.builtin")}
        </h2>
        {/* Dire qu'il n'y en a pas encore, plutôt que d'afficher des modules
            d'apprentissage en les faisant passer pour des outils. */}
        <p className="px-2 py-2 text-sm text-text-secondary">
          {t("aiSkillTools.noBuiltin")}
        </p>
      </section>

      <section aria-labelledby="ai-skills-organization">
        <h2
          id="ai-skills-organization"
          className="text-base font-semibold text-text"
        >
          {t("aiSkillTools.organization")}
        </h2>
        {organizationSkills.length === 0 ? (
          <p className="px-2 py-2 text-sm text-text-secondary">
            {t("aiSkillTools.noOrganization")}
          </p>
        ) : (
          <ul className="space-y-3">
            {organizationSkills.map((skill) => (
              <li key={skill.id}>
                <SkillCard skill={skill} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

const SkillCard: React.FC<{ skill: OrganizationSkillEntry }> = ({ skill }) => {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    const session = await loadCampusSession();
    if (!session) {
      toast.error(t("aiSkillTools.signedOut"));
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const response = await new CampusApi(session.server_url).runSkill(
        skill.id,
        text,
      );
      setResult(response.text);
    } catch {
      // Le serveur refuse aussi quand la policy est fermée : le message reste
      // le même, parce que la personne n'a rien à corriger de son côté.
      toast.error(t("aiSkillTools.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-hairline p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-text">{skill.title}</h3>
          {skill.summary && (
            <p className="mt-0.5 text-sm text-text-secondary">
              {skill.summary}
            </p>
          )}
        </div>
        {/* La provenance, dite et pas seulement suggérée par la section. */}
        <span className="flex shrink-0 items-center gap-1 text-xs text-text-secondary">
          <Building2 size={13} aria-hidden="true" />
          {t("aiSkillTools.fromOrganization")}
        </span>
      </div>

      {(skill.practice || skill.steps.length > 0) && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-text-secondary">
            {t("aiSkillTools.howToUse")}
          </summary>
          {skill.practice && (
            <p className="mt-2 text-sm text-text-secondary">{skill.practice}</p>
          )}
          {skill.steps.length > 0 && (
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-text-secondary">
              {skill.steps.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
          )}
        </details>
      )}

      <Textarea
        className="mt-3"
        rows={4}
        value={text}
        placeholder={t("aiSkillTools.inputPlaceholder")}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="mt-2 flex justify-end">
        <Button
          size="sm"
          disabled={busy || text.trim().length === 0}
          onClick={() => void run()}
        >
          <Play size={14} aria-hidden="true" />
          {busy ? t("aiSkillTools.running") : t("aiSkillTools.run")}
        </Button>
      </div>

      {result !== null && (
        <div className="mt-3 rounded-md bg-mid-gray/40 p-3">
          <p className="whitespace-pre-wrap text-sm text-text">{result}</p>
        </div>
      )}
    </div>
  );
};
