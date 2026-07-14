import React from "react";
import { useTranslation } from "react-i18next";
import {
  Cog,
  FlaskConical,
  History,
  Info,
  Sparkles,
  Cpu,
  Palette,
} from "lucide-react";
import HandyTextLogo from "./icons/HandyTextLogo";
import HandyHand from "./icons/HandyHand";
import { useSettings } from "../hooks/useSettings";
import {
  GeneralSettings,
  AdvancedSettings,
  HistorySettings,
  DebugSettings,
  AboutSettings,
  PostProcessingSettings,
  ModelsSettings,
  PersonalizationSettings,
} from "./settings";

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
  icon: React.ComponentType<IconProps>;
  component: React.ComponentType;
  enabled: (settings: any) => boolean;
}

export const SECTIONS_CONFIG = {
  general: {
    labelKey: "sidebar.general",
    icon: HandyHand,
    component: GeneralSettings,
    enabled: () => true,
  },
  models: {
    labelKey: "sidebar.models",
    icon: Cpu,
    component: ModelsSettings,
    enabled: () => true,
  },
  advanced: {
    labelKey: "sidebar.advanced",
    icon: Cog,
    component: AdvancedSettings,
    enabled: () => true,
  },
  history: {
    labelKey: "sidebar.history",
    icon: History,
    component: HistorySettings,
    enabled: () => true,
  },
  postprocessing: {
    labelKey: "sidebar.postProcessing",
    icon: Sparkles,
    component: PostProcessingSettings,
    // Les Styles sont au cœur de Nova : la section est toujours visible ;
    // l'activation de la reformulation se fait via l'interrupteur en tête de
    // la section (plus besoin de passer par Avancé pour la découvrir).
    enabled: () => true,
  },
  personalization: {
    labelKey: "sidebar.personalization",
    icon: Palette,
    component: PersonalizationSettings,
    enabled: () => true,
  },
  debug: {
    labelKey: "sidebar.debug",
    icon: FlaskConical,
    component: DebugSettings,
    enabled: (settings) => settings?.debug_mode ?? false,
  },
  about: {
    labelKey: "sidebar.about",
    icon: Info,
    component: AboutSettings,
    enabled: () => true,
  },
} as const satisfies Record<string, SectionConfig>;

// Icônes carrées colorées façon macOS (Réglages système). Chaque catégorie a
// sa couleur d'identité — ce ne sont PAS des actions (l'accent d'action unique
// reste le bleu #0A84FF, réservé à la sélection). « general » affiche l'orbe
// Nova directement, sans carré.
const SECTION_COLORS: Record<string, string> = {
  general: "",
  models: "#5E5CE6",
  advanced: "#8E8E93",
  history: "#FF9F0A",
  postprocessing: "#BF5AF2",
  personalization: "#FF375F",
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

  const availableSections = Object.entries(SECTIONS_CONFIG)
    .filter(([_, config]) => config.enabled(settings))
    .map(([id, config]) => ({ id: id as SidebarSection, ...config }));

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
              className={`flex gap-2.5 items-center p-1.5 w-full rounded-lg cursor-pointer transition-colors ${
                isActive
                  ? "bg-accent text-white"
                  : "hover:bg-mid-gray/15 hover:opacity-100 opacity-90"
              }`}
              onClick={() => onSectionChange(section.id)}
            >
              {section.id === "general" || !color ? (
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
