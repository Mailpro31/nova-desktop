import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { OrganizationConnectionSettings } from "../organization/OrganizationConnectionSettings";
import { GeneralSettings } from "../general/GeneralSettings";
import {
  OrganizationGeneralSettings,
  OrganizationPersonalizationSection,
  OrganizationAdvancedSections,
  PERSONALIZATION_SECTIONS,
  type PersonalizationSection,
} from "../general/OrganizationGeneralSettings";
import { AppLanguageSelector } from "../AppLanguageSelector";
import { ThemeSelector } from "../ThemeSelector";
import { ReadingComfortSettings } from "../ReadingComfortSettings";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { PageHeader } from "../../shell/PageHeader";
import { ModelsSettings } from "../models/ModelsSettings";
import { AdvancedSettings } from "../advanced/AdvancedSettings";
import { PersonalizationSettings } from "../personalization/PersonalizationSettings";
import { isOrganizationMode } from "@/lib/mode";

type ConfigTab =
  | "general"
  | "voice"
  | "performance"
  | "advanced"
  | "personalization"
  | PersonalizationSection;

const ALL_TABS: { id: ConfigTab; labelKey: string }[] = [
  { id: "general", labelKey: "sidebar.general" },
  { id: "performance", labelKey: "sidebar.models" },
  { id: "advanced", labelKey: "sidebar.advanced" },
];

/**
 * Des catégories nommées d'après ce que l'utilisateur cherche, pas d'après
 * l'architecture : Général (l'application et la bulle), Voix (tout ce qui
 * touche à la dictée), puis chacun de ce qu'il apporte lui-même — dictionnaire,
 * snippets vocaux, repères, emploi du temps, règles de formatage — à un clic,
 * et Avancé (ce qu'on n'ouvre qu'en cas de problème).
 *
 * Retour de Sash (12/10) : rangés ensemble sous « Personnalisation », les
 * snippets et les règles de formatage n'apparaissaient qu'après un long
 * défilement, sous la bulle et le dictionnaire.
 *
 * L'identité campus et la déconnexion n'y figurent pas : elles ont leur
 * destination propre, atteinte par le bloc bas de la barre latérale.
 */
const CAMPUS_TABS: { id: ConfigTab; labelKey: string }[] = [
  { id: "general", labelKey: "sidebar.general" },
  { id: "voice", labelKey: "settingsNav.voice" },
  ...(Object.keys(PERSONALIZATION_SECTIONS) as PersonalizationSection[]).map(
    (id) => ({ id, labelKey: PERSONALIZATION_SECTIONS[id].titleKey }),
  ),
  { id: "advanced", labelKey: "sidebar.advanced" },
];

/**
 * « Configuration » regroupe les anciennes sections Général / Modèles /
 * Avancé sous une seule entrée de barre latérale, avec un sélecteur segmenté
 * compact pour naviguer entre les trois. Aucun réglage ni clé de
 * configuration n'a bougé — seule la présentation change.
 */
export const ConfigurationSettings: React.FC = () => {
  const { t } = useTranslation();
  const organizationMode = isOrganizationMode();
  const tabs = organizationMode ? CAMPUS_TABS : ALL_TABS;
  const [selectedTab, setTab] = useState<ConfigTab>("general");
  // Une fonction que l'organisation referme pendant qu'on la consulte ne reste
  // pas affichée : on revient sur Général.
  const tab = tabs.some(({ id }) => id === selectedTab)
    ? selectedTab
    : "general";

  return (
    // La largeur vient de l'app shell ; la répéter contraignait la colonne
    // deux fois, comme sur Styles avant l'étape 7.
    <div className="space-y-6">
      <PageHeader title={t("sidebar.settings")} />
      {tabs.length > 1 && (
        // Les onglets passent à la ligne quand la fenêtre est étroite plutôt
        // que de défiler et de couper le dernier. Rayon de 18 px : une pilule
        // sur une ligne (36 px de haut), un rectangle arrondi sur plusieurs.
        <div
          className="inline-flex max-w-full flex-wrap items-center gap-0.5 p-0.5 rounded-[18px]"
          style={{ background: "var(--color-inset)" }}
          role="tablist"
        >
          {tabs.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(item.id)}
                className={`shrink-0 px-3.5 py-1.5 text-sm font-medium rounded-full transition-colors cursor-pointer ${
                  active
                    ? "bg-accent text-white"
                    : "text-text-secondary hover:text-text"
                }`}
              >
                {t(item.labelKey)}
              </button>
            );
          })}
        </div>
      )}

      {tab === "general" &&
        (organizationMode ? <OrganizationGeneralTab /> : <GeneralSettings />)}
      {tab === "voice" && <OrganizationGeneralSettings />}
      {tab === "performance" && <ModelsSettings />}
      {tab === "advanced" &&
        (organizationMode ? (
          <OrganizationAdvancedSections />
        ) : (
          <AdvancedSettings />
        ))}
      {tab === "personalization" && <PersonalizationSettings />}
      {tab in PERSONALIZATION_SECTIONS && (
        <OrganizationPersonalizationSection
          section={tab as PersonalizationSection}
        />
      )}
    </div>
  );
};

/**
 * « Général » en campus : ce qui concerne l'application elle-même. La langue
 * et le thème vivaient dans Personnalisation, aux côtés de l'orbe et des
 * variables — deux registres différents sous un même onglet.
 */
const OrganizationGeneralTab: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <SettingsGroup title={t("settings.general.title")}>
        <AppLanguageSelector descriptionMode="tooltip" grouped={true} />
        <ThemeSelector descriptionMode="tooltip" grouped={true} />
      </SettingsGroup>
      <ReadingComfortSettings />
      {/* La bulle : son apparence et quand elle s'affiche. */}
      <PersonalizationSettings embedded />
      {/* Toujours rendu, lié ou non : c'est la seule surface d'où l'on peut
          rattacher un compte, et la cacher tant qu'aucune organisation
          n'existe la rendait inatteignable au moment où elle sert. */}
      <OrganizationConnectionSettings />
    </div>
  );
};

export default ConfigurationSettings;
