import React, { useEffect, useMemo, useRef, useState } from "react";
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
import { PageHeader } from "@/components/ui/PageHeader";

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
  <section className="overflow-hidden border border-hairline bg-surface [border-radius:var(--nova-radius-card)]">
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
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

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

  const handleTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft")
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    setTab(tabs[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <div className="mx-auto w-full max-w-[760px] space-y-8">
      <PageHeader
        title={t("campus.settings.title")}
        description={t("campus.settings.generalSubtitle")}
      />

      <div
        className="flex gap-1 overflow-x-auto border-b border-hairline"
        role="tablist"
        aria-label={t("campus.settings.title")}
      >
        {tabs.map((item, index) => (
          <button
            key={item.id}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`campus-settings-tab-${item.id}`}
            aria-controls={`campus-settings-panel-${item.id}`}
            aria-selected={tab === item.id}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => setTab(item.id)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
            className={`min-h-10 shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none ${
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
        <div
          id="campus-settings-panel-general"
          aria-labelledby="campus-settings-tab-general"
          className="space-y-4"
          role="tabpanel"
        >
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
        <div
          id="campus-settings-panel-writing"
          aria-labelledby="campus-settings-tab-writing"
          className="space-y-4"
          role="tabpanel"
        >
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
        <div
          id="campus-settings-panel-campus"
          aria-labelledby="campus-settings-tab-campus"
          className="space-y-4"
          role="tabpanel"
        >
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
        <div
          id="campus-settings-panel-advanced"
          aria-labelledby="campus-settings-tab-advanced"
          className="space-y-4"
          role="tabpanel"
        >
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
