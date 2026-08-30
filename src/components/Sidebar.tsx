import React, { lazy } from "react";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  Building2,
  Cog,
  CreditCard,
  FlaskConical,
  GraduationCap,
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
import { isCampusMode, isOrganizationMode } from "@/lib/mode";
import { useCapability } from "../hooks/useOrganizationContext";

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
const LearnSettings = lazy(() =>
  import("./settings/learn/LearnSettings").then((module) => ({
    default: module.LearnSettings,
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
  learn: {
    // Learn — les trois piliers, les micro-leçons, la progression.
    //
    // `enabled` ne demande pas quelle édition est installée : Learn appartient
    // au Nova Core et vaut pour Personal comme pour une organisation. C'est la
    // capacité `learning` qui décide, et une policy peut la fermer.
    labelKey: "sidebar.learn",
    campusLabelKey: undefined,
    icon: GraduationCap,
    component: LearnSettings,
    enabled: () => true,
    campusVisible: true,
  },
  aiskills: {
    // La palette Nova Commands et le catalogue de skills intégrés. Cet écran
    // portait le libellé « Learn » alors qu'il en ouvrait un autre : deux
    // entrées disaient « AI Skills » et une troisième promettait Learn sans
    // le montrer. Chaque entrée nomme désormais ce qu'elle ouvre.
    labelKey: "sidebar.novaCommands",
    campusLabelKey: undefined,
    icon: BookOpen,
    component: AiSkillsSettings,
    // Éducation uniquement, et c'est bien `isCampusMode()` ici : le catalogue
    // intégré que cet écran présente est une piste fournie par l'établissement.
    // Une entreprise n'en a pas — elle a des AI Skills exécutables, qui sont
    // l'entrée suivante. Décision Business conservée telle quelle : le
    // renommage en « Nova Commands » a corrigé le libellé, pas le périmètre.
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
    // Toute organisation : le catalogue vient des Organization Packages, qu'une
    // école et une entreprise publient de la même façon.
    enabled: () => isOrganizationMode(),
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
 * Destinations principales d'un poste d'organisation — quatre ou cinq, pas
 * davantage. L'organisation et les réglages vivent dans le bloc bas, séparés
 * visuellement : accessibles en permanence sans occuper le même rang.
 */
// La navigation suit cette liste, pas l'ensemble des sections declarees :
// ajouter une entree a `SECTIONS_CONFIG` ne suffit pas a la faire apparaitre
// ici. C'est volontaire — l'ordre compte — mais c'est aussi ce qui a fait
// disparaitre « AI Skills » lors de la recette de la Phase 31B.
//
// L'ordre est fixe ; la visibilite de chaque entree reste decidee par son
// `enabled`, ce qui retire « Learn » a une organisation qui n'est pas un
// etablissement sans qu'une seconde liste ait a etre tenue a jour.
const ORGANIZATION_PRIMARY: SidebarSection[] = [
  "home",
  "learn",
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
  // La barre latérale gérée vaut pour toute organisation — école comme
  // entreprise. Ce qui reste propre à l'une ou l'autre se décide entrée par
  // entrée, dans `SECTIONS_CONFIG.enabled`.
  const organizationMode = isOrganizationMode();
  const organization = useOrganization();
  const { connection } = useCampusStatus();
  // Learn se masque quand la capacité est fermée. La question posée est « cette
  // capacité est-elle ouverte ? », pas « quelle édition est installée ? » : une
  // organisation qui ferme Learn le ferme pour tout le monde, et Personal le
  // garde sans qu'aucune condition d'édition n'ait à l'énoncer.
  const learningOpen = useCapability("learning");
  const visible = (id: SidebarSection) => id !== "learn" || learningOpen;

  if (organizationMode) {
    return (
      <nav className="flex flex-col w-[208px] shrink-0 h-full bg-sidebar border-e border-hairline px-3 py-4 gap-1">
        <div className="flex items-center gap-2.5 px-2.5 pb-4">
          <HandyHand width={24} height={24} />
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <span className="text-[15px] font-semibold tracking-[-0.01em] text-text">
            Nova
          </span>
        </div>

        {/* Deux filtres, deux questions distinctes. `enabled` dit si l'entree
            existe pour ce poste — une ecole, une entreprise, toute
            organisation ; `visible` dit si la capacite qui la porte est
            ouverte. Learn passe le premier partout et se ferme sur le second
            quand la policy le decide. */}
        {ORGANIZATION_PRIMARY.filter(
          (id) => SECTIONS_CONFIG[id].enabled(settings) && visible(id),
        ).map((id) => {
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
    .filter(
      ([id, config]) =>
        config.enabled(settings) && visible(id as SidebarSection),
    )
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
