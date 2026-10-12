import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Keyboard,
  Volume2,
  Info,
  BookA,
  MessageSquare,
  ListFilter,
  Bookmark,
  CalendarDays,
} from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { MicrophoneSelector } from "../MicrophoneSelector";
import { VoiceCalibrationSetting } from "../VoiceCalibrationSetting";
import { ShortcutInput } from "../ShortcutInput";
import { OutputDeviceSelector } from "../OutputDeviceSelector";
import { PushToTalk } from "../PushToTalk";
import { AudioFeedback } from "../AudioFeedback";
import { useSettings } from "../../../hooks/useSettings";
import { useOrganizationWording } from "../../../hooks/useOrganizationWording";
import { VolumeSlider } from "../VolumeSlider";
import { MuteWhileRecording } from "../MuteWhileRecording";
import { OrganizationDictionarySection } from "./OrganizationDictionarySection";
import { OrganizationSnippetsSection } from "./OrganizationSnippetsSection";
import { OrganizationFormattingSection } from "./OrganizationFormattingSection";
import { StudyMarkersSection } from "./StudyMarkersSection";
import { TimetableSection } from "./TimetableSection";
import { Button } from "../../ui/Button";
import { AppDataDirectory } from "../AppDataDirectory";
import { LogDirectory } from "../debug";
import { RestartApp } from "../RestartApp";
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

export const OrganizationGeneralSettings: React.FC = () => {
  const { t } = useTranslation();
  const { audioFeedbackEnabled, getSetting } = useSettings();
  const pushToTalk = getSetting("push_to_talk");
  const isLinux = type() === "linux";

  return (
    // Largeur et marges viennent de l'app shell.
    <div className="space-y-5">
      <SectionCard
        icon={Volume2}
        title={t("organization.settings.sound.title")}
        description={t("organization.settings.sound.description")}
      >
        <MicrophoneSelector descriptionMode="tooltip" grouped={true} />
        <VoiceCalibrationSetting grouped={true} />
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
        title={t("organization.settings.shortcuts.title")}
        description={t("organization.settings.shortcuts.description")}
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

/** Les sections de ce que l'élève apporte à la dictée, une par onglet. */
export type PersonalizationSection =
  | "dictionary"
  | "snippets"
  | "studyMarkers"
  | "timetable"
  | "formatting";

// Les clés restent écrites en entier : `organizationKeysUsed.test.ts` les
// cherche dans le code.
export const PERSONALIZATION_SECTIONS: Record<
  PersonalizationSection,
  {
    icon: React.ElementType;
    body: React.FC;
    titleKey: string;
    descriptionKey: string;
  }
> = {
  dictionary: {
    icon: BookA,
    body: OrganizationDictionarySection,
    titleKey: "organization.dictionary.title",
    descriptionKey: "organization.dictionary.description",
  },
  snippets: {
    icon: MessageSquare,
    body: OrganizationSnippetsSection,
    titleKey: "organization.snippets.title",
    descriptionKey: "organization.snippets.description",
  },
  studyMarkers: {
    icon: Bookmark,
    body: StudyMarkersSection,
    titleKey: "organization.studyMarkers.title",
    descriptionKey: "organization.studyMarkers.description",
  },
  timetable: {
    icon: CalendarDays,
    body: TimetableSection,
    titleKey: "organization.timetable.title",
    descriptionKey: "organization.timetable.description",
  },
  formatting: {
    icon: ListFilter,
    body: OrganizationFormattingSection,
    titleKey: "organization.formatting.title",
    descriptionKey: "organization.formatting.description",
  },
};

/**
 * Ce que l'utilisateur apporte à la dictée : son vocabulaire, ses raccourcis
 * vocaux, ses repères, son emploi du temps, ses règles de formatage. Chacun a
 * son onglet : empilés sur une seule page, les snippets et les règles de
 * formatage n'apparaissaient qu'après un long défilement (retour de Sash,
 * 12/10).
 */
export const OrganizationPersonalizationSection: React.FC<{
  section: PersonalizationSection;
}> = ({ section }) => {
  const { t } = useTranslation();
  const {
    icon,
    body: Body,
    titleKey,
    descriptionKey,
  } = PERSONALIZATION_SECTIONS[section];
  return (
    <SectionCard
      icon={icon}
      title={t(titleKey)}
      description={t(descriptionKey)}
    >
      <Body />
    </SectionCard>
  );
};

/**
 * Diagnostics : version et dossiers. Plus technique que le reste,
 * et assumé comme tel — c'est ce qu'on ouvre quand on cherche un problème.
 *
 * L'identité campus et la déconnexion **n'y sont plus** : elles vivent une
 * seule fois, sur la page Établissement.
 */
export const OrganizationAdvancedSections: React.FC = () => (
  <AboutSectionCard />
);

const AboutSectionCard: React.FC = () => {
  const { t } = useTranslation();
  const word = useOrganizationWording();
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
      description={word("aboutSubtitle")}
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
        <RestartApp grouped={true} />
      </div>
    </SectionCard>
  );
};

export default OrganizationGeneralSettings;
