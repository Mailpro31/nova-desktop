import React from "react";
import { useTranslation } from "react-i18next";
import { Blocks, Keyboard, SpellCheck, Star, TextSelect } from "lucide-react";

import { commands } from "@/bindings";

import { PageHeader } from "../../shell/PageHeader";
import {
  OrganizationPersonalizationSection,
  SectionCard,
} from "../general/OrganizationGeneralSettings";
import { SelectionBubbleSettings } from "../general/SelectionBubbleSettings";
import { AppsSetup } from "./AppsSetup";
import { ConnectedApps } from "./ConnectedApps";

/**
 * Ce que Nova relie à d'autres applications, en un seul endroit (n° 25, 33) :
 * la bulle de sélection, les applications choisies pour chaque usage, toutes
 * celles qu'elle atteint, et l'emploi du temps.
 */
const LOCAL_APPS = ["antidote", "lexibar"] as const;
type LocalApp = (typeof LOCAL_APPS)[number];

export const ConnectionsSettings: React.FC = () => {
  const { t } = useTranslation();
  const [missing, setMissing] = React.useState<LocalApp | null>(null);
  const openLocal = async (app: LocalApp) => {
    const result = await commands.openInstalledApp(app);
    setMissing(result.status === "ok" && !result.data ? app : null);
  };
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
          icon={Star}
          title={t("bubble.setup.title")}
          description={t("bubble.setup.description")}
        >
          <AppsSetup />
        </SectionCard>
        <SectionCard
          icon={Blocks}
          title={t("bubble.apps.title")}
          description={t("bubble.apps.description")}
        >
          <ConnectedApps />
        </SectionCard>
        <SectionCard
          icon={Keyboard}
          title={t("connections.windows.title")}
          description={t("connections.windows.description")}
        >
          <button
            type="button"
            onClick={() => void commands.openWindowsTypingSettings()}
            className="rounded-control border border-hairline px-3 py-1.5 text-sm text-text transition-colors duration-[120ms] hover:bg-mid-gray/10 cursor-pointer"
          >
            {t("connections.windows.open")}
          </button>
        </SectionCard>
        <SectionCard
          icon={SpellCheck}
          title={t("connections.local.title")}
          description={t("connections.local.description")}
        >
          <div className="flex flex-wrap items-center gap-2">
            {LOCAL_APPS.map((app) => (
              <button
                key={app}
                type="button"
                onClick={() => void openLocal(app)}
                className="rounded-control border border-hairline px-3 py-1.5 text-sm text-text transition-colors duration-[120ms] hover:bg-mid-gray/10 cursor-pointer"
              >
                {t(`connections.local.${app}`)}
              </button>
            ))}
          </div>
          {missing && (
            <p role="status" className="mt-2 text-sm text-mid-gray">
              {t("connections.local.missing", {
                app: t(`connections.local.${missing}`),
              })}
            </p>
          )}
        </SectionCard>
        <OrganizationPersonalizationSection section="timetable" />
      </div>
    </>
  );
};
