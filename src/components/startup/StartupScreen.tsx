import React from "react";
import { useTranslation } from "react-i18next";
import { relaunch } from "@tauri-apps/plugin-process";

import { Button } from "@/components/ui/Button";

/**
 * Les deux visages de l'attente au démarrage.
 *
 * Ils existent pour une raison unique et suffisante : une fenêtre WebView qui
 * ne rend rien est blanche, et une fenêtre blanche ne dit ni « patiente » ni
 * « quelque chose a échoué ». Ces écrans disent l'un ou l'autre.
 */

/** Attente normale : brève, silencieuse, sans texte alarmant. */
export const StartupLoading: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div
      className="flex h-screen w-screen flex-col items-center justify-center gap-4"
      role="status"
      aria-live="polite"
    >
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      <p className="text-sm text-text-secondary">{t("startup.loading")}</p>
    </div>
  );
};

interface StalledProps {
  /**
   * Ce qui n'a pas répondu, en clair. Affiché tel quel : sur un poste neuf
   * c'est la seule information exploitable dont dispose l'utilisateur.
   */
  detail?: string | null;
}

/**
 * L'attente a trop duré.
 *
 * On ne prétend pas savoir pourquoi — on dit ce qu'on attendait, où regarder,
 * et on propose la seule action qui ait une chance d'aider : relancer.
 */
export const StartupStalled: React.FC<StalledProps> = ({ detail }) => {
  const { t } = useTranslation();
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-5 px-8 text-center">
      <div className="max-w-[520px] space-y-3">
        <h1 className="text-xl font-semibold text-text">
          {t("startup.stalledTitle")}
        </h1>
        <p className="text-sm leading-relaxed text-text-secondary">
          {t("startup.stalledBody")}
        </p>
        {detail ? (
          <p className="break-words rounded-control bg-mid-gray/10 px-3 py-2 text-left font-mono text-xs text-text-secondary">
            {detail}
          </p>
        ) : null}
        <p className="text-xs text-text-secondary">{t("startup.logHint")}</p>
      </div>
      <Button
        type="button"
        variant="primary"
        size="lg"
        onClick={() => {
          // `relaunch` peut échouer (processus verrouillé) : on retombe alors
          // sur un rechargement de la vue, qui rejoue toutes les sondes.
          relaunch().catch(() => window.location.reload());
        }}
      >
        {t("startup.retry")}
      </Button>
    </div>
  );
};
