import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { relaunch } from "@tauri-apps/plugin-process";

import { SettingContainer } from "../ui/SettingContainer";
import { Button } from "../ui/Button";

/**
 * Redémarrer Nova sans passer par le système.
 *
 * Fermer l'application ne suffit pas toujours à la redémarrer : elle continue
 * de vivre dans la barre des tâches, et il faut savoir l'y trouver. Ce bouton
 * évite cette connaissance.
 *
 * `relaunch()` peut échouer — processus verrouillé, mise à jour en cours. On
 * retombe alors sur un rechargement de la fenêtre, qui rejoue le démarrage de
 * l'interface : moins complet, mais jamais un bouton qui ne fait rien.
 */
export const RestartApp: React.FC<{ grouped?: boolean }> = ({
  grouped = false,
}) => {
  const { t } = useTranslation();
  const [restarting, setRestarting] = useState(false);

  return (
    <SettingContainer
      title={t("settings.about.restart.title")}
      description={t("settings.about.restart.description")}
      grouped={grouped}
    >
      <Button
        variant="secondary"
        size="sm"
        disabled={restarting}
        onClick={() => {
          setRestarting(true);
          relaunch().catch(() => window.location.reload());
        }}
      >
        {t("settings.about.restart.button")}
      </Button>
    </SettingContainer>
  );
};
