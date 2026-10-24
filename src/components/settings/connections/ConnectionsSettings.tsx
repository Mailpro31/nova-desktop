import React from "react";
import { useTranslation } from "react-i18next";

import { PageHeader } from "../../shell/PageHeader";
import { OrganizationPersonalizationSection } from "../general/OrganizationGeneralSettings";

/**
 * Ce que Nova relie à d'autres applications, en un seul endroit (n° 25, 33).
 * L'emploi du temps y vient des Réglages, avec le lien déjà enregistré.
 */
export const ConnectionsSettings: React.FC = () => {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader
        title={t("sidebar.connections")}
        description={t("connections.description")}
      />
      <OrganizationPersonalizationSection section="timetable" />
    </>
  );
};
