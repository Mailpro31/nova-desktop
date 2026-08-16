import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Keyboard,
  Volume2,
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
import { CampusDictionarySection } from "./CampusDictionarySection";
import { CampusSnippetsSection } from "./CampusSnippetsSection";
import { CampusFormattingSection } from "./CampusFormattingSection";
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
  <div className="bg-surface rounded-3xl border border-hairline shadow-sm overflow-hidden">
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
    // Largeur et marges viennent de l'app shell.
    <div className="space-y-5">
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
    </div>
  );
};

/**
 * Ce que l'utilisateur apporte à la dictée : son vocabulaire, ses raccourcis
 * vocaux, ses règles de formatage. Trois systèmes proches — la page les
 * nomme donc par ce qu'ils font, pas par leur table.
 */
export const CampusPersonalizationSections: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
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
    </div>
  );
};

/**
 * Diagnostics : version, dossiers, mode debug. Plus technique que le reste,
 * et assumé comme tel — c'est ce qu'on ouvre quand on cherche un problème.
 *
 * L'identité campus et la déconnexion **n'y sont plus** : elles vivent une
 * seule fois, sur la page Établissement.
 */
export const CampusAdvancedSections: React.FC = () => <AboutSectionCard />;

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
