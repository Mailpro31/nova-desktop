import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Info, Globe, FolderOpen, FileText, Bug } from "lucide-react";
import { AppDataDirectory } from "../AppDataDirectory";
import { LogDirectory } from "../debug";
import { DebugModeToggle } from "../DebugModeToggle";
import { Button } from "../../ui/Button";
import { PageHeader } from "../../ui/PageHeader";

interface SectionCardProps {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
}

const SectionCard: React.FC<SectionCardProps> = ({
  icon: Icon,
  title,
  description,
  children,
}) => (
  <section className="overflow-hidden border border-hairline bg-surface [border-radius:var(--nova-radius-card)] [box-shadow:var(--nova-shadow-sm)]">
    <div className="px-5 py-4 border-b border-hairline">
      <div className="flex items-center gap-2.5">
        <Icon size={18} className="text-text-secondary" strokeWidth={1.75} />
        <div>
          <h2 className="text-base font-semibold text-text">{title}</h2>
          <p className="text-xs text-text-secondary">{description}</p>
        </div>
      </div>
    </div>
    <div className="p-1">{children}</div>
  </section>
);

export const CampusAboutSettings: React.FC = () => {
  const { t } = useTranslation();
  const [version, setVersion] = useState("");

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const appVersion = await getVersion();
        setVersion(appVersion);
      } catch (error) {
        console.error("Failed to get app version:", error);
        setVersion("0.1.2");
      }
    };

    fetchVersion();
  }, []);

  return (
    <div className="mx-auto w-full max-w-[760px] space-y-5">
      <PageHeader
        title={t("sidebar.about")}
        description={t("campus.settings.aboutSubtitle")}
      />

      <SectionCard
        icon={Info}
        title={t("settings.about.version.title")}
        description={t("settings.about.version.description")}
      >
        <div className="px-4 py-3">
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <span className="text-sm font-mono">v{version}</span>
        </div>
      </SectionCard>

      <SectionCard
        icon={Globe}
        title={t("settings.about.sourceCode.title")}
        description={t("settings.about.sourceCode.description")}
      >
        <div className="px-4 py-3">
          <Button
            variant="secondary"
            size="md"
            onClick={() => openUrl("https://novaspeak.app")}
          >
            {t("settings.about.sourceCode.button")}
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        icon={FolderOpen}
        title={t("settings.about.appDataDirectory.title")}
        description={t("settings.about.appDataDirectory.description")}
      >
        <AppDataDirectory descriptionMode="tooltip" grouped={true} />
      </SectionCard>

      <SectionCard
        icon={FileText}
        title={t("settings.debug.logDirectory.title")}
        description={t("settings.debug.logDirectory.description")}
      >
        <LogDirectory grouped={true} />
      </SectionCard>

      <SectionCard
        icon={Bug}
        title={t("settings.about.debugMode.title")}
        description={t("settings.about.debugMode.description")}
      >
        <DebugModeToggle descriptionMode="tooltip" grouped={true} />
      </SectionCard>
    </div>
  );
};

export default CampusAboutSettings;
