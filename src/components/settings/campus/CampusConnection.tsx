import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2 } from "lucide-react";

import { Button } from "@/components/ui";
import CampusOnboarding from "@/components/onboarding/CampusOnboarding";
import { useCampusStatus } from "@/hooks/useCampusStatus";
import { useCampusStore } from "@/stores/campusStore";

/**
 * Lier — ou relier — un compte à son organisation, depuis les réglages.
 *
 * ## Le défaut que cette surface répare
 *
 * La connexion Organization n'existait que dans le parcours de premier
 * lancement. Une fois celui-ci terminé sans avoir lié de compte, il n'y avait
 * **plus aucun chemin** : l'entrée « établissement » de la barre latérale est
 * conditionnée à l'existence d'une organisation, donc cachée précisément quand
 * on cherche à en créer une, et aucune page de réglages n'offrait d'action.
 *
 * Un utilisateur déconnecté se retrouvait ainsi enfermé dehors, sans autre
 * issue que de réinitialiser son installation.
 *
 * ## Le même parcours, pas un second
 *
 * Cet écran ne réimplémente rien : il monte `CampusOnboarding`, exactement le
 * composant du premier lancement — même découverte, même SSO, même step-up. Un
 * second chemin d'authentification aurait été la faute la plus coûteuse à
 * réparer plus tard, et la plus facile à commettre ici.
 *
 * Aucune saisie d'adresse de serveur : l'identifiant d'organisation suffit, et
 * la découverte fait le reste.
 */
export const CampusConnection: React.FC = () => {
  const { t } = useTranslation();
  const { session, connection } = useCampusStatus();
  const organization = useCampusStore((state) => state.context.organization);
  const [connecting, setConnecting] = useState(false);

  // Le parcours complet occupe l'écran, comme au premier lancement : le
  // réduire à une fenêtre modale aurait demandé de le réécrire.
  if (connecting) {
    return (
      <CampusOnboarding
        flowContext="settings"
        onComplete={() => setConnecting(false)}
      />
    );
  }

  const linked = Boolean(session);

  return (
    <section className="space-y-3" aria-labelledby="campus-connection">
      <h2 id="campus-connection" className="text-base font-semibold text-text">
        {t("campusConnection.title")}
      </h2>

      {linked ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-hairline p-4">
          <Building2
            size={18}
            strokeWidth={1.75}
            className="mt-0.5 shrink-0 text-text-secondary"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-text">
              {organization.shortName ?? organization.name}
            </p>
            <p className="mt-0.5 text-sm text-text-secondary">
              {connection === "connected"
                ? t("campusConnection.connected")
                : connection === "local"
                  ? t("campusConnection.local")
                  : t("campusConnection.signedOut")}
            </p>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm text-text-secondary">
            {t("campusConnection.description")}
          </p>
          <Button onClick={() => setConnecting(true)}>
            {t("campusConnection.connect")}
          </Button>
        </>
      )}
    </section>
  );
};
