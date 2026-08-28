import React, { lazy } from "react";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  Building2,
  Cog,
  CreditCard,
  FlaskConical,
  History,
  House,
  Info,
  Settings,
  Sparkles,
  Palette,
  Users,
} from "lucide-react";
import HandyTextLogo from "./icons/HandyTextLogo";
import HandyHand from "./icons/HandyHand";
import { useSettings } from "../hooks/useSettings";
import { useCampusStatus } from "../hooks/useCampusStatus";
import { useOrganization } from "../hooks/useOrganization";
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
const OrganizationAiSkills = lazy(() =>
  import("./settings/ai-skills/OrganizationAiSkills").then((module) => ({
    default: module.OrganizationAiSkills,
  })),
);

const AiSkillsSettings = lazy(() =>
  import("./settings/ai-skills/AiSkillsSettings").then((module) => ({
    default: module.AiSkillsSettings,
  })),
);
const CampusOrganizationSettings = lazy(() =>
  import("./settings/organization/CampusOrganizationSettings").then(
    (module) => ({
      default: module.CampusOrganizationSettings,
    }),
  ),
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
    icon: House,
    component: HomeSettings,
    enabled: () => true,
    campusVisible: true,
  },
  aiskills: {
    // Cet écran présente une piste d'apprentissage — modules, exercice,
    // progression. C'est du Learn, et le libellé le dit désormais : deux
    // entrées nommées « AI Skills » auraient été indiscernables.
    labelKey: "sidebar.learn",
    campusLabelKey: undefined,
    icon: BookOpen,
    component: AiSkillsSettings,
    // Campus uniquement : le contenu vient de l'établissement.
    enabled: () => isCampusMode(),
    campusVisible: true,
  },
  aiskilltools: {
    // Les vraies actions IA, exécutables. Distinctes de l'apprentissage :
    // « apprendre à écrire une consigne » et « appliquer une consigne » ne se
    // cherchent pas au même moment.
    labelKey: "sidebar.aiSkills",
    campusLabelKey: undefined,
    icon: Sparkles,
    component: OrganizationAiSkills,
    enabled: () => isCampusMode(),
    campusVisible: true,
  },
  configuration: {
    labelKey: "sidebar.configuration",
    campusLabelKey: "sidebar.settings",
    icon: Cog,
    component: ConfigurationSettings,
    enabled: () => true,
    campusVisible: true,
  },
  postprocessing: {
    labelKey: "sidebar.postProcessing",
    campusLabelKey: "sidebar.styles",
    icon: Sparkles,
    component: PostProcessingSettings,
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
    campusLabelKey: undefined,
    icon: Palette,
    component: PersonalizationSettings,
    enabled: () => true,
    // En campus, la personnalisation vit dans Réglages (onglet dédié) :
    // la navigation principale reste à quatre destinations.
    campusVisible: false,
  },
  account: {
    labelKey: "sidebar.account",
    campusLabelKey: undefined,
    icon: CreditCard,
    component: AccountSettings,
    enabled: () => true,
    campusVisible: false,
  },
  organization: {
    labelKey: "sidebar.organization",
    campusLabelKey: undefined,
    icon: Building2,
    component: CampusOrganizationSettings,
    // Atteinte par le bloc bas de la barre latérale, pas par la liste
    // principale — l'établissement est accessible sans être une destination
    // de premier plan.
    enabled: () => false,
    campusVisible: true,
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

/**
 * Destinations principales du mode campus — quatre, pas davantage.
 * L'établissement et les réglages vivent dans le bloc bas, séparés
 * visuellement : accessibles en permanence sans occuper le même rang.
 */
// En mode Campus la navigation suit cette liste, pas l'ensemble des sections
// declarees : ajouter une entree a `SECTIONS_CONFIG` ne suffit pas a la faire
// apparaitre ici. C'est volontaire — l'ordre compte — mais c'est aussi ce qui
// a fait disparaitre « AI Skills » lors de la recette de la Phase 31B.
const CAMPUS_PRIMARY: SidebarSection[] = [
  "home",
  "aiskilltools",
  "aiskills",
  "postprocessing",
  "history",
];

/** Taille et graisse d'icône uniques dans toute la navigation. */
const ICON_SIZE = 18;
const ICON_STROKE = 1.75;

interface NavItemProps {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

/**
 * Rangée de navigation. État actif volontairement sobre : fond neutre léger
 * et texte plein, jamais un aplat bleu — l'accent reste la couleur d'action.
 */
const NavItem: React.FC<NavItemProps> = ({
  label,
  active,
  onClick,
  children,
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-current={active ? "page" : undefined}
    className={`flex w-full items-center gap-2.5 h-[34px] px-2.5 rounded-chip text-left text-sm transition-colors duration-[120ms] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
      active
        ? "bg-mid-gray/12 text-text font-medium"
        : "text-text-secondary hover:bg-mid-gray/8 hover:text-text"
    }`}
  >
    {children}
    <span className="truncate">{label}</span>
  </button>
);

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
  const organization = useOrganization();
  const { connection } = useCampusStatus();

  if (campusMode) {
    return (
      <nav className="flex flex-col w-[208px] shrink-0 h-full bg-sidebar border-e border-hairline px-3 py-4 gap-1">
        <div className="flex items-center gap-2.5 px-2.5 pb-4">
          <HandyHand width={24} height={24} />
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <span className="text-[15px] font-semibold tracking-[-0.01em] text-text">
            Nova
          </span>
        </div>

        {CAMPUS_PRIMARY.map((id) => {
          const config = SECTIONS_CONFIG[id];
          const Icon = config.icon;
          return (
            <NavItem
              key={id}
              label={t(config.campusLabelKey ?? config.labelKey)}
              active={activeSection === id}
              onClick={() => onSectionChange(id)}
            >
              <Icon
                size={ICON_SIZE}
                strokeWidth={ICON_STROKE}
                className="shrink-0"
              />
            </NavItem>
          );
        })}

        <div className="flex-1" />

        {/* Bloc bas : établissement puis réglages, séparés des destinations
            produit par un filet. Deux lignes compactes, jamais une carte. */}
        <div className="pt-3 mt-1 border-t border-hairline flex flex-col gap-1">
          {organization && (
            <button
              type="button"
              onClick={() => onSectionChange("organization")}
              aria-current={
                activeSection === "organization" ? "page" : undefined
              }
              className={`flex w-full items-start gap-2.5 px-2.5 py-2 rounded-chip text-left transition-colors duration-[120ms] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                activeSection === "organization"
                  ? "bg-mid-gray/12"
                  : "hover:bg-mid-gray/8"
              }`}
            >
              <Building2
                size={ICON_SIZE}
                strokeWidth={ICON_STROKE}
                className="shrink-0 mt-0.5 text-text-secondary"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[13px] font-medium text-text">
                    {organization.name}
                  </span>
                  {/* Représentation unique du statut dans toute l'app. */}
                  <span
                    aria-hidden="true"
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      connection === "connected"
                        ? "bg-success"
                        : connection === "local"
                          ? "bg-warning"
                          : "bg-mid-gray/50"
                    }`}
                  />
                </span>
                <span className="block truncate text-[11px] text-text-secondary mt-0.5">
                  {connection === "local"
                    ? t("campus.status.localActive")
                    : t("campus.organization.managedBy", {
                        organization: organization.shortName,
                      })}
                </span>
              </span>
            </button>
          )}

          <NavItem
            label={t("sidebar.settings")}
            active={activeSection === "configuration"}
            onClick={() => onSectionChange("configuration")}
          >
            <Settings
              size={ICON_SIZE}
              strokeWidth={ICON_STROKE}
              className="shrink-0"
            />
          </NavItem>
        </div>
      </nav>
    );
  }

  // ── Mode personnel : liste et ordre inchangés, seule la présentation suit
  // la planche de fondation (état actif sobre, tokens, icônes homogènes).
  const availableSections = Object.entries(SECTIONS_CONFIG)
    .filter(([, config]) => config.enabled(settings))
    .map(([id, config]) => ({ id: id as SidebarSection, ...config }));

  return (
    <nav className="flex flex-col w-[208px] shrink-0 h-full bg-sidebar border-e border-hairline px-3 py-4 gap-1">
      <div className="px-2.5 pb-4">
        <HandyTextLogo width={110} />
      </div>

      {availableSections.map((section) => {
        const Icon = section.icon;
        return (
          <NavItem
            key={section.id}
            label={t(section.labelKey)}
            active={activeSection === section.id}
            onClick={() => onSectionChange(section.id)}
          >
            <Icon
              size={ICON_SIZE}
              strokeWidth={ICON_STROKE}
              className="shrink-0"
            />
          </NavItem>
        );
      })}
    </nav>
  );
};
