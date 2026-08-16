import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { type } from "@tauri-apps/plugin-os";
import {
  BookA,
  Building2,
  Info,
  Keyboard,
  ListFilter,
  MessageSquare,
  Volume2,
} from "lucide-react";
import { MicrophoneSelector } from "../MicrophoneSelector";
import { ShortcutInput } from "../ShortcutInput";
import { OutputDeviceSelector } from "../OutputDeviceSelector";
import { PushToTalk } from "../PushToTalk";
import { AudioFeedback } from "../AudioFeedback";
import { useSettings } from "@/hooks/useSettings";
import { VolumeSlider } from "../VolumeSlider";
import { MuteWhileRecording } from "../MuteWhileRecording";
import { CampusAccountSection } from "./CampusAccountSection";
import { CampusDictionarySection } from "./CampusDictionarySection";
import { CampusSnippetsSection } from "./CampusSnippetsSection";
import { CampusFormattingSection } from "./CampusFormattingSection";
import { Button } from "../../ui/Button";
import { AppDataDirectory } from "../AppDataDirectory";
import { LogDirectory } from "../debug";
import { DebugModeToggle } from "../DebugModeToggle";
import { CampusPrivacySummary } from "@/components/campus/CampusPrivacySummary";
import { ManagedBy } from "@/components/campus/ManagedBy";
import { campusOrganizationLabel } from "@/lib/campusPolicy";
import { useCampusStore } from "@/stores/campusStore";

type CampusSettingsTab = "general" | "writing" | "campus" | "advanced";

interface SettingsSectionProps {
  icon: React.ElementType;
  title: string;
  description?: string;
  children: React.ReactNode;
}

const SettingsSection: React.FC<SettingsSectionProps> = ({
  icon: Icon,
  title,
  description,
  children,
}) => (
  <section className="overflow-hidden rounded-xl border border-hairline bg-white">
    <div className="flex items-start gap-3 border-b border-hairline px-4 py-3.5">
      <Icon
        size={17}
        className="mt-0.5 shrink-0 text-text-secondary"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <div>
        <h2 className="text-sm font-semibold text-text">{title}</h2>
        {description && (
          <p className="mt-0.5 text-xs text-text-secondary">{description}</p>
        )}
      </div>
    </div>
    <div className="p-1">{children}</div>
  </section>
);

export const CampusGeneralSettings: React.FC = () => {
  const { t } = useTranslation();
  const { audioFeedbackEnabled, getSetting } = useSettings();
  const context = useCampusStore((state) => state.context);
  const session = useCampusStore((state) => state.session);
  const pushToTalk = getSetting("push_to_talk");
  const isLinux = type() === "linux";
  const [tab, setTab] = useState<CampusSettingsTab>("general");
  const [version, setVersion] = useState("");

  useEffect(() => {
    void getVersion()
      .then(setVersion)
      .catch(() => setVersion("0.1.2"));
  }, []);

  const hasWritingPreferences =
    context.capabilities.dictionary ||
    context.capabilities.snippets ||
    context.capabilities.formattingRules;
  const tabs = useMemo(
    () =>
      [
        { id: "general" as const, label: t("campus.settings.tabs.general") },
        hasWritingPreferences
          ? ({
              id: "writing" as const,
              label: t("campus.settings.tabs.writing"),
            } as const)
          : null,
        { id: "campus" as const, label: t("campus.settings.tabs.campus") },
        { id: "advanced" as const, label: t("campus.settings.tabs.advanced") },
      ].filter((item): item is NonNullable<typeof item> => item !== null),
    [hasWritingPreferences, t],
  );

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div className="space-y-1 px-1">
        <h1 className="text-3xl font-semibold tracking-tight text-text">
          {t("campus.settings.title")}
        </h1>
        <p className="text-base text-text-secondary">
          {t("campus.settings.generalSubtitle")}
        </p>
      </div>

      <div
        className="flex gap-1 overflow-x-auto border-b border-hairline"
        role="tablist"
        aria-label={t("campus.settings.title")}
      >
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              tab === item.id
                ? "border-accent text-text"
                : "border-transparent text-text-secondary hover:text-text"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "general" && (
        <div className="space-y-4" role="tabpanel">
          <SettingsSection
            icon={Keyboard}
            title={t("campus.settings.shortcuts.title")}
            description={t("campus.settings.shortcuts.description")}
          >
            <ShortcutInput shortcutId="transcribe" grouped={true} />
            <PushToTalk descriptionMode="tooltip" grouped={true} />
            {!isLinux && !pushToTalk && (
              <ShortcutInput shortcutId="cancel" grouped={true} />
            )}
          </SettingsSection>

          <SettingsSection
            icon={Volume2}
            title={t("campus.settings.sound.title")}
            description={t("campus.settings.sound.description")}
          >
            <MicrophoneSelector descriptionMode="tooltip" grouped={true} />
            <MuteWhileRecording descriptionMode="tooltip" grouped={true} />
            <AudioFeedback descriptionMode="tooltip" grouped={true} />
            <OutputDeviceSelector
              descriptionMode="tooltip"
              grouped={true}
              disabled={!audioFeedbackEnabled}
            />
            <VolumeSlider disabled={!audioFeedbackEnabled} />
          </SettingsSection>
        </div>
      )}

      {tab === "writing" && hasWritingPreferences && (
        <div className="space-y-4" role="tabpanel">
          {context.capabilities.dictionary && (
            <SettingsSection
              icon={BookA}
              title={t("campus.dictionary.title")}
              description={t("campus.dictionary.description")}
            >
              <CampusDictionarySection />
            </SettingsSection>
          )}
          {context.capabilities.snippets && (
            <SettingsSection
              icon={MessageSquare}
              title={t("campus.snippets.title")}
              description={t("campus.snippets.description")}
            >
              <CampusSnippetsSection />
            </SettingsSection>
          )}
          {context.capabilities.formattingRules && (
            <SettingsSection
              icon={ListFilter}
              title={t("campus.formatting.title")}
              description={t("campus.formatting.description")}
            >
              <CampusFormattingSection />
            </SettingsSection>
          )}
        </div>
      )}

      {tab === "campus" && (
        <div className="space-y-4" role="tabpanel">
          <SettingsSection
            icon={Building2}
            title={campusOrganizationLabel(context.organization)}
            description={t("campus.settings.account.description")}
          >
            <CampusAccountSection inline={true} />
          </SettingsSection>
          <SettingsSection icon={Info} title={t("campus.page.privacy")}>
            <div className="px-3">
              <CampusPrivacySummary policy={context.privacy} />
            </div>
          </SettingsSection>
          {context.organization.managed && (
            <div className="px-1">
              <ManagedBy
                organizationName={
                  context.organization.shortName ?? context.organization.name
                }
              />
            </div>
          )}
        </div>
      )}

      {tab === "advanced" && (
        <div className="space-y-4" role="tabpanel">
          <SettingsSection
            icon={Info}
            title={t("campus.settings.advanced.title")}
            description={t("campus.settings.advanced.description")}
          >
            <div className="divide-y divide-hairline">
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="text-sm text-text-secondary">
                  {t("settings.about.version.title")}
                </span>
                {/* eslint-disable-next-line i18next/no-literal-string */}
                <span className="font-mono text-sm text-text">v{version}</span>
              </div>
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="text-sm text-text-secondary">
                  {t("campus.account.server")}
                </span>
                <span className="max-w-[65%] break-all text-right font-mono text-xs text-text">
                  {session?.server_url ?? t("campus.status.unavailable")}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="text-sm text-text-secondary">
                  {t("settings.about.sourceCode.title")}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void openUrl("https://novaspeak.app")}
                >
                  {t("settings.about.sourceCode.button")}
                </Button>
              </div>
            </div>
            <AppDataDirectory descriptionMode="tooltip" grouped={true} />
            <LogDirectory grouped={true} />
            <DebugModeToggle descriptionMode="tooltip" grouped={true} />
          </SettingsSection>
        </div>
      )}
    </div>
  );
};

export default CampusGeneralSettings;
