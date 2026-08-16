import React from "react";
import { useTranslation } from "react-i18next";

import { PageHeader } from "../../shell/PageHeader";
import StylesList from "./StylesList";

/**
 * Styles d'écriture — distribution campus.
 *
 * La page ne contient plus que le choix lui-même : la configuration du moteur
 * de reformulation est fournie par l'établissement et n'a rien à faire ici.
 *
 * Aucun Style n'est présenté comme distribué par l'établissement : le serveur
 * n'en distribue aucun aujourd'hui. Les règles de formatage campus, qui
 * existent bien, sont un autre système et vivent dans Réglages — les
 * transformer en Styles serait une invention.
 */
export const CampusStylesSettings: React.FC = () => {
  const { t } = useTranslation();

  return (
    <>
      <PageHeader
        title={t("campus.styles.title")}
        description={t("campus.styles.subtitle")}
      />
      <StylesList />
    </>
  );
};

export default CampusStylesSettings;
