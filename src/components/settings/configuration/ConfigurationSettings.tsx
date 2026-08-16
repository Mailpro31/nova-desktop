import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { GeneralSettings } from "../general/GeneralSettings";
import {
  CampusGeneralSettings,
  CampusPersonalizationSections,
  CampusAdvancedSections,
} from "../general/CampusGeneralSettings";
import { AppLanguageSelector } from "../AppLanguageSelector";
import { ThemeSelector } from "../ThemeSelector";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { PageHeader } from "../../shell/PageHeader";
import { ModelsSettings } from "../models/ModelsSettings";
import { AdvancedSettings } from "../advanced/AdvancedSettings";
import { PersonalizationSettings } from "../personalization/PersonalizationSettings";
import { isCampusMode } from "@/lib/mode";

type ConfigTab =
  | "general"
  | "voice"
  | "performance"
  | "advanced"
  | "personalization";

const ALL_TABS: { id: ConfigTab; labelKey: string }[] = [
  { id: "general", labelKey: "sidebar.general" },
  { id: "performance", labelKey: "sidebar.models" },
  { id: "advanced", labelKey: "sidebar.advanced" },
];

/**
 * Quatre catégories nommées d'après ce que l'utilisateur cherche, pas d'après
 * l'architecture : Général (ce qui concerne l'application), Voix (tout ce qui
 * touche à la dictée), Personnalisation (ce qu'il apporte lui-même), Avancé
 * (ce qu'on n'ouvre qu'en cas de problème).
 *
 * L'identité campus et la déconnexion n'y figurent pas : elles ont leur
 * destination propre, atteinte par le bloc bas de la barre latérale.
 */
const CAMPUS_TABS: { id: ConfigTab; labelKey: string }[] = [
  { id: "general", labelKey: "sidebar.general" },
  { id: "voice", labelKey: "settingsNav.voice" },
  { id: "personalization", labelKey: "sidebar.personalization" },
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
  const campusMode = isCampusMode();
  const tabs = campusMode ? CAMPUS_TABS : ALL_TABS;
  const [tab, setTab] = useState<ConfigTab>("general");

  return (
    // La largeur vient de l'app shell ; la répéter contraignait la colonne
    // deux fois, comme sur Styles avant l'étape 7.
    <div className="space-y-6">
      <PageHeader title={t("sidebar.settings")} />
      {tabs.length > 1 && (
        <div
          className="inline-flex items-center gap-0.5 p-0.5 rounded-full"
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
                className={`px-3.5 py-1.5 text-sm font-medium rounded-full transition-colors cursor-pointer ${
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
        (campusMode ? <CampusGeneralTab /> : <GeneralSettings />)}
      {tab === "voice" && <CampusGeneralSettings />}
      {tab === "performance" && <ModelsSettings />}
      {tab === "advanced" &&
        (campusMode ? <CampusAdvancedSections /> : <AdvancedSettings />)}
      {tab === "personalization" && (
        <>
          <PersonalizationSettings />
          {campusMode && <CampusPersonalizationSections />}
        </>
      )}
    </div>
  );
};

/**
 * « Général » en campus : ce qui concerne l'application elle-même. La langue
 * et le thème vivaient dans Personnalisation, aux côtés de l'orbe et des
 * variables — deux registres différents sous un même onglet.
 */
const CampusGeneralTab: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <SettingsGroup title={t("settings.general.title")}>
        <AppLanguageSelector descriptionMode="tooltip" grouped={true} />
        <ThemeSelector descriptionMode="tooltip" grouped={true} />
      </SettingsGroup>
    </div>
  );
};

export default ConfigurationSettings;
