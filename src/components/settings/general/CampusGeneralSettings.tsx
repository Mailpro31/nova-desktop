import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Keyboard,
  Volume2,
  User,
  CircleDot,
  Eye,
  EyeOff,
  Info,
  BookA,
  MessageSquare,
  ListFilter,
} from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { MicrophoneSelector } from "../MicrophoneSelector";
import { ShortcutInput } from "../ShortcutInput";
import { OutputDeviceSelector } from "../OutputDeviceSelector";
import { PushToTalk } from "../PushToTalk";
import { AudioFeedback } from "../AudioFeedback";
import { useSettings } from "../../../hooks/useSettings";
import { VolumeSlider } from "../VolumeSlider";
import { MuteWhileRecording } from "../MuteWhileRecording";
import { CampusAccountSection } from "./CampusAccountSection";
import { CampusDictionarySection } from "./CampusDictionarySection";
import { CampusSnippetsSection } from "./CampusSnippetsSection";
import { CampusFormattingSection } from "./CampusFormattingSection";
import { useCampusBubbleStore } from "@/stores/campusBubbleStore";
import { Button } from "../../ui/Button";
import { AppDataDirectory } from "../AppDataDirectory";
import { LogDirectory } from "../debug";
import { DebugModeToggle } from "../DebugModeToggle";
import { type } from "@tauri-apps/plugin-os";

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
  <div className="bg-white rounded-3xl border border-hairline shadow-sm overflow-hidden">
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
  </div>
);

export const CampusGeneralSettings: React.FC = () => {
  const { t } = useTranslation();
  const { audioFeedbackEnabled, getSetting } = useSettings();
  const pushToTalk = getSetting("push_to_talk");
  const isLinux = type() === "linux";

  return (
    <div className="max-w-3xl w-full mx-auto space-y-5">
      <div className="px-1 space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight text-text">
          {t("sidebar.general")}
        </h1>
        <p className="text-base text-text-secondary">
          {t("campus.settings.generalSubtitle")}
        </p>
      </div>

      <SectionCard
        icon={Keyboard}
        title={t("campus.settings.shortcuts.title")}
        description={t("campus.settings.shortcuts.description")}
      >
        <ShortcutInput shortcutId="transcribe" grouped={true} />
        <PushToTalk descriptionMode="tooltip" grouped={true} />
        {!isLinux && !pushToTalk && (
          <ShortcutInput shortcutId="cancel" grouped={true} />
        )}
      </SectionCard>

      <SectionCard
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
      </SectionCard>

      <SectionCard
        icon={BookA}
        title={t("campus.dictionary.title")}
        description={t("campus.dictionary.description")}
      >
        <CampusDictionarySection />
      </SectionCard>

      <SectionCard
        icon={MessageSquare}
        title={t("campus.snippets.title")}
        description={t("campus.snippets.description")}
      >
        <CampusSnippetsSection />
      </SectionCard>

      <SectionCard
        icon={ListFilter}
        title={t("campus.formatting.title")}
        description={t("campus.formatting.description")}
      >
        <CampusFormattingSection />
      </SectionCard>

      <SectionCard
        icon={User}
        title={t("campus.settings.account.title")}
        description={t("campus.settings.account.description")}
      >
        <CampusAccountSection inline={true} />
      </SectionCard>

      <BubbleSettingsCard />

      <AboutSectionCard />
    </div>
  );
};

const BubbleSettingsCard: React.FC = () => {
  const { t } = useTranslation();
  const { visible, setVisible, resetPosition } = useCampusBubbleStore();

  return (
    <SectionCard
      icon={CircleDot}
      title={t("campus.settings.bubble.title")}
      description={t("campus.settings.bubble.description")}
    >
      <div className="px-4 py-3 space-y-3">
        <p className="text-sm text-text-secondary">
          {t("campus.settings.bubble.helper")}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setVisible(!visible)}
            className="inline-flex items-center gap-1.5"
          >
            {visible ? <EyeOff size={14} /> : <Eye size={14} />}
            {visible
              ? t("campus.settings.bubble.hide")
              : t("campus.settings.bubble.show")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={resetPosition}
            className="inline-flex items-center gap-1.5"
          >
            {t("campus.settings.bubble.resetPosition")}
          </Button>
        </div>
      </div>
    </SectionCard>
  );
};

const AboutSectionCard: React.FC = () => {
  const { t } = useTranslation();
  const [version, setVersion] = useState("");

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion("0.1.2"));
  }, []);

  return (
    <SectionCard
      icon={Info}
      title={t("sidebar.about")}
      description={t("campus.settings.aboutSubtitle")}
    >
      <div className="p-1">
        <div className="px-4 py-3 flex items-center justify-between border-b border-hairline">
          <span className="text-sm text-text-secondary">
            {t("settings.about.version.title")}
          </span>
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <span className="text-sm font-mono">v{version}</span>
        </div>
        <div className="px-4 py-3 flex items-center justify-between border-b border-hairline">
          <span className="text-sm text-text-secondary">
            {t("settings.about.sourceCode.title")}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => openUrl("https://novaspeak.app")}
          >
            {t("settings.about.sourceCode.button")}
          </Button>
        </div>
        <AppDataDirectory descriptionMode="tooltip" grouped={true} />
        <LogDirectory grouped={true} />
        <DebugModeToggle descriptionMode="tooltip" grouped={true} />
      </div>
    </SectionCard>
  );
};

export default CampusGeneralSettings;
