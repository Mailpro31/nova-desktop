import React, { useState } from "react";
import { useTranslation } from "react-i18next";

import HandyTextLogo from "../icons/HandyTextLogo";
import { Button } from "../ui/button";
import {
  rememberEditionChoice,
  rememberOrganizationKindIntent,
  type OrganizationKindIntent,
} from "@/lib/organization";

/**
 * Le premier écran d'un paquet unifié : personnel, ou d'organisation ?
 *
 * ## Pourquoi c'est une porte et non une étape
 *
 * Le parcours d'accueil fige sa liste d'étapes dès que l'état système est
 * connu. Un choix pris **dans** ce parcours arriverait trop tard : la liste
 * serait déjà arrêtée et l'étape de connexion Organization n'y figurerait pas.
 * Cet écran est donc rendu avant le parcours, et le parcours n'est calculé
 * qu'une fois la réponse connue.
 *
 * ## Ce que le second écran veut dire, et ne veut pas dire
 *
 * « Campus » ou « Entreprise » n'est qu'une **intention** : elle oriente les
 * fournisseurs proposés et le vocabulaire, rien d'autre. La nature réelle de
 * l'organisation est décidée par le tenant vérifié, et si le serveur contredit
 * l'intention, c'est le serveur qui gagne — sans message d'erreur, parce que
 * l'utilisateur n'a rien fait de mal : il a exprimé une attente, pas un droit.
 *
 * ## Personnel ne contacte rien
 *
 * Choisir « Personnel » n'émet aucune requête. C'est la propriété que le test
 * de non-régression vérifie, et la raison pour laquelle ce choix précède tout
 * le reste du parcours.
 */

interface EditionChoiceProps {
  /** Appelé une fois le choix enregistré, pour que le parcours se calcule. */
  onChosen: () => void;
}

const EditionChoice: React.FC<EditionChoiceProps> = ({ onChosen }) => {
  const { t } = useTranslation();
  const [step, setStep] = useState<"edition" | "kind">("edition");

  const choosePersonal = () => {
    rememberEditionChoice("personal");
    onChosen();
  };

  const chooseKind = (kind: OrganizationKindIntent) => {
    // L'intention d'abord, l'édition ensuite : `onChosen` déclenche le calcul
    // du parcours, qui lit les deux.
    rememberOrganizationKindIntent(kind);
    rememberEditionChoice("organization");
    onChosen();
  };

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-8 overflow-y-auto px-6 py-8">
      <HandyTextLogo width={160} />

      {step === "edition" ? (
        <>
          <div className="max-w-[480px] space-y-3 text-center">
            <h1 className="text-[1.75rem] font-semibold leading-[1.15] tracking-[-0.025em] text-text">
              {t("edition.choice.title")}
            </h1>
            <p className="text-sm leading-relaxed text-text-secondary">
              {t("edition.choice.subtitle")}
            </p>
          </div>

          <div className="flex w-full max-w-[480px] flex-col gap-3">
            <button
              type="button"
              onClick={choosePersonal}
              className="rounded-lg border border-mid-gray/30 bg-background p-4 text-left transition-colors hover:border-mid-gray/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <span className="block text-sm font-medium text-text">
                {t("edition.choice.personal.title")}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-text-secondary">
                {t("edition.choice.personal.description")}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStep("kind")}
              className="rounded-lg border border-mid-gray/30 bg-background p-4 text-left transition-colors hover:border-mid-gray/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <span className="block text-sm font-medium text-text">
                {t("edition.choice.organization.title")}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-text-secondary">
                {t("edition.choice.organization.description")}
              </span>
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="max-w-[480px] space-y-3 text-center">
            <h1 className="text-[1.75rem] font-semibold leading-[1.15] tracking-[-0.025em] text-text">
              {t("edition.choice.kind.title")}
            </h1>
            <p className="text-sm leading-relaxed text-text-secondary">
              {t("edition.choice.kind.subtitle")}
            </p>
          </div>

          <div className="flex w-full max-w-[480px] flex-col gap-3">
            <button
              type="button"
              onClick={() => chooseKind("campus")}
              className="rounded-lg border border-mid-gray/30 bg-background p-4 text-left transition-colors hover:border-mid-gray/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <span className="block text-sm font-medium text-text">
                {t("edition.choice.kind.campus.title")}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-text-secondary">
                {t("edition.choice.kind.campus.description")}
              </span>
            </button>

            <button
              type="button"
              onClick={() => chooseKind("business")}
              className="rounded-lg border border-mid-gray/30 bg-background p-4 text-left transition-colors hover:border-mid-gray/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <span className="block text-sm font-medium text-text">
                {t("edition.choice.kind.business.title")}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-text-secondary">
                {t("edition.choice.kind.business.description")}
              </span>
            </button>
          </div>

          <Button type="button" variant="ghost" onClick={() => setStep("edition")}>
            {t("common.back")}
          </Button>
        </>
      )}
    </div>
  );
};

export default EditionChoice;
