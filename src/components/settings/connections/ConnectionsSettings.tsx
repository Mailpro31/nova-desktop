import React from "react";
import { useTranslation } from "react-i18next";
import { Blocks, TextSelect } from "lucide-react";

import { PageHeader } from "../../shell/PageHeader";
import {
  OrganizationPersonalizationSection,
  SectionCard,
} from "../general/OrganizationGeneralSettings";
import { SelectionBubbleSettings } from "../general/SelectionBubbleSettings";
import { ConnectedApps } from "./ConnectedApps";

/**
 * Ce que Nova relie à d'autres applications, en un seul endroit (n° 25, 33) :
 * la bulle de sélection, les applications qu'elle atteint, et l'emploi du
 * temps, venu des Réglages avec le lien déjà enregistré.
 */
export const ConnectionsSettings: React.FC = () => {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader
        title={t("sidebar.connections")}
        description={t("connections.description")}
      />
      <div className="space-y-5">
        <SectionCard
          icon={TextSelect}
          title={t("bubble.settings.title")}
          description={t("bubble.settings.description")}
        >
          <SelectionBubbleSettings />
        </SectionCard>
        <SectionCard
          icon={Blocks}
          title={t("bubble.apps.title")}
          description={t("bubble.apps.description")}
        >
          <ConnectedApps />
        </SectionCard>
        <OrganizationPersonalizationSection section="timetable" />
      </div>
    </>
  );
};
