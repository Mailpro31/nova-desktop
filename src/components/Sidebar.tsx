import React, { lazy } from "react";
import { useTranslation } from "react-i18next";
import {
  Cog,
  CreditCard,
  FlaskConical,
  History,
  Info,
  Sparkles,
  Palette,
  Users,
  Building2,
  BookOpen,
} from "lucide-react";
import HandyTextLogo from "./icons/HandyTextLogo";
import HandyHand from "./icons/HandyHand";
import { useSettings } from "../hooks/useSettings";
import { isCampusMode } from "@/lib/mode";

const HomeSettings = lazy(() =>
  import("./settings/home/HomeSettings").then((module) => ({
    default: module.HomeSettings,
  })),
);
const ConfigurationSettings = lazy(() =>
  import("./settings/configuration/ConfigurationSettings").then((module) => ({
    default: module.ConfigurationSettings,
  })),
);
const CampusOrganizationSettings = lazy(() =>
  import("./settings/campus/CampusOrganizationSettings").then((module) => ({
    default: module.CampusOrganizationSettings,
  })),
);
const CampusAiSkills = lazy(() =>
  import("./settings/campus/CampusAiSkills").then((module) => ({
    default: module.CampusAiSkills,
  })),
);
const PostProcessingSettings = lazy(() =>
  import("./settings/post-processing/PostProcessingSettings").then(
    (module) => ({
      default: module.PostProcessingSettings,
    }),
  ),
);
const PersonalizationSettings = lazy(() =>
  import("./settings/personalization/PersonalizationSettings").then(
    (module) => ({
      default: module.PersonalizationSettings,
    }),
  ),
);
const AccountSettings = lazy(() =>
  import("./settings/account/AccountSettings").then((module) => ({
    default: module.AccountSettings,
  })),
);
const HistorySettings = lazy(() =>
  import("./settings/history/HistorySettings").then((module) => ({
    default: module.HistorySettings,
  })),
);
const DebugSettings = lazy(() =>
  import("./settings/debug/DebugSettings").then((module) => ({
    default: module.DebugSettings,
  })),
);
const MeetingSettings = lazy(() =>
  import("./settings/meeting/MeetingSettings").then((module) => ({
    default: module.MeetingSettings,
  })),
);
const AboutSettings = lazy(() =>
  import("./settings/about/AboutSettings").then((module) => ({
    default: module.AboutSettings,
  })),
);

export type SidebarSection = keyof typeof SECTIONS_CONFIG;

interface IconProps {
  width?: number | string;
  height?: number | string;
  size?: number | string;
  className?: string;
  [key: string]: any;
}

interface SectionConfig {
  labelKey: string;
  campusLabelKey: string | undefined;
  icon: React.ComponentType<IconProps>;
  component: React.ComponentType;
  enabled: (settings: any) => boolean;
  campusVisible: boolean;
}

export const SECTIONS_CONFIG = {
  home: {
    labelKey: "sidebar.home",
    campusLabelKey: undefined,
    icon: HandyHand,
    component: HomeSettings,
    enabled: () => true,
    campusVisible: true,
  },
  configuration: {
    labelKey: "sidebar.configuration",
    campusLabelKey: "campus.settings.title",
    icon: Cog,
    // Regroupe les anciennes sections Général / Modèles / Avancé sous une
    // seule entrée (sous-onglets internes, voir ConfigurationSettings).
    component: ConfigurationSettings,
    enabled: () => true,
    campusVisible: true,
  },
  campus: {
    labelKey: "campus.navigation.campus",
    campusLabelKey: "campus.navigation.campus",
    icon: Building2,
    component: CampusOrganizationSettings,
    enabled: () => false,
    campusVisible: true,
  },
  aiSkills: {
    labelKey: "campus.aiSkills.title",
    campusLabelKey: "campus.aiSkills.title",
    icon: BookOpen,
    component: CampusAiSkills,
    enabled: () => false,
    campusVisible: true,
  },
  postprocessing: {
    labelKey: "sidebar.postProcessing",
    campusLabelKey: "sidebar.styles",
    icon: Sparkles,
    component: PostProcessingSettings,
    // Les Styles sont au cœur de Nova : la section est toujours visible ;
    // l'activation de la reformulation se fait via l'interrupteur en tête de
    // la section (plus besoin de passer par Avancé pour la découvrir).
    enabled: () => true,
    campusVisible: true,
  },
  meeting: {
    labelKey: "sidebar.meeting",
    campusLabelKey: undefined,
    icon: Users,
    component: MeetingSettings,
    enabled: () => true,
    campusVisible: false,
  },
  personalization: {
    labelKey: "sidebar.personalization",
    campusLabelKey: "sidebar.personalization",
    icon: Palette,
    component: PersonalizationSettings,
    enabled: () => true,
    campusVisible: true,
  },
  account: {
    labelKey: "sidebar.account",
    campusLabelKey: undefined,
    icon: CreditCard,
    // Palier actif, licence, comparatif des paliers (anciennement au bas de
    // la section À propos).
    component: AccountSettings,
    enabled: () => true,
    campusVisible: false,
  },
  history: {
    labelKey: "sidebar.history",
    campusLabelKey: undefined,
    icon: History,
    component: HistorySettings,
    enabled: () => true,
    campusVisible: true,
  },
  debug: {
    labelKey: "sidebar.debug",
    campusLabelKey: undefined,
    icon: FlaskConical,
    component: DebugSettings,
    enabled: (settings) => settings?.debug_mode ?? false,
    campusVisible: false,
  },
  about: {
    labelKey: "sidebar.about",
    campusLabelKey: undefined,
    icon: Info,
    component: AboutSettings,
    enabled: () => true,
    campusVisible: false,
  },
} as const satisfies Record<string, SectionConfig>;

// Ordre des entrées de la sidebar en mode campus.
// Campus keeps the common path first, with administration one level deeper.
export const CAMPUS_SIDEBAR_ORDER: SidebarSection[] = [
  "home",
  "aiSkills",
  "postprocessing",
  "personalization",
  "history",
  "campus",
  "configuration",
];

// Libellé affiché pour une section en mode campus (priorité au libellé campus).
export function getCampusLabelKey(section: SidebarSection): string {
  const config = SECTIONS_CONFIG[section];
  return config.campusLabelKey ?? config.labelKey;
}

// Legacy category colors used by the Personal shell. CampusNavigation keeps
// its iconography neutral and reserves Nova blue for selection and actions.
export const SECTION_COLORS: Record<string, string> = {
  home: "",
  configuration: "#8E8E93",
  campus: "#0A84FF",
  aiSkills: "#0A84FF",
  postprocessing: "#BF5AF2",
  meeting: "#30D158",
  personalization: "#FF375F",
  account: "#5E5CE6",
  history: "#FF9F0A",
  debug: "#30D158",
  about: "#64D2FF",
};

interface SidebarProps {
  activeSection: SidebarSection;
  onSectionChange: (section: SidebarSection) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSectionChange,
}) => {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const campusMode = isCampusMode();

  const availableSections = Object.entries(SECTIONS_CONFIG)
    .filter(([_, config]) => {
      if (campusMode) {
        return config.campusVisible;
      }
      return config.enabled(settings);
    })
    .map(([id, config]) => ({
      id: id as SidebarSection,
      ...config,
      labelKey:
        campusMode && config.campusLabelKey
          ? config.campusLabelKey
          : config.labelKey,
    }))
    .sort((a, b) => {
      if (!campusMode) return 0; // personal mode keeps definition order
      const ia = CAMPUS_SIDEBAR_ORDER.indexOf(a.id);
      const ib = CAMPUS_SIDEBAR_ORDER.indexOf(b.id);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });

  if (campusMode) {
    return (
      <div className="flex flex-col w-44 h-full bg-background border-e border-hairline items-start px-3 py-4 gap-6">
        <div className="flex items-center gap-2 px-2">
          <HandyHand width={32} height={32} />
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <span className="text-lg font-semibold tracking-tight">Nova</span>
        </div>
        <div className="flex flex-col w-full gap-1">
          {availableSections.map((section) => {
            const Icon = section.icon;
            const isActive = activeSection === section.id;

            return (
              <button
                key={section.id}
                type="button"
                className={`flex gap-3 items-center px-3 py-2 w-full rounded-xl text-sm font-medium transition-colors text-left ${
                  isActive
                    ? "bg-mid-gray/15 text-text"
                    : "text-text-secondary hover:bg-mid-gray/10 hover:text-text"
                }`}
                onClick={() => onSectionChange(section.id)}
              >
                <Icon size={18} className="shrink-0" strokeWidth={1.75} />
                <span className="truncate">{t(section.labelKey)}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-40 h-full bg-sidebar border-e border-hairline items-center px-2">
      <HandyTextLogo width={120} className="m-4" />
      <div className="flex flex-col w-full items-center gap-0.5 pt-2 border-t border-hairline">
        {availableSections.map((section) => {
          const Icon = section.icon;
          const isActive = activeSection === section.id;
          const color = SECTION_COLORS[section.id];

          return (
            <div
              key={section.id}
              className={`flex gap-2.5 items-center p-1.5 w-full rounded-[10px] cursor-pointer transition-colors ${
                isActive
                  ? "bg-accent text-white"
                  : "hover:bg-mid-gray/15 hover:opacity-100 opacity-90"
              }`}
              onClick={() => onSectionChange(section.id)}
            >
              {section.id === "home" || !color ? (
                <Icon width={26} height={26} className="shrink-0" />
              ) : (
                <span
                  className="shrink-0 flex items-center justify-center rounded-[6px]"
                  style={{ width: 26, height: 26, background: color }}
                >
                  <Icon width={16} height={16} className="text-white" />
                </span>
              )}
              <p
                className="text-sm font-medium truncate"
                title={t(section.labelKey)}
              >
                {t(section.labelKey)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};
