import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { GeneralSettings } from "../general/GeneralSettings";
import { ModelsSettings } from "../models/ModelsSettings";
import { AdvancedSettings } from "../advanced/AdvancedSettings";
import { isCampusMode } from "@/lib/mode";

type ConfigTab = "general" | "performance" | "advanced";

const ALL_TABS: { id: ConfigTab; labelKey: string }[] = [
  { id: "general", labelKey: "sidebar.general" },
  { id: "performance", labelKey: "sidebar.models" },
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
  const tabs = campusMode
    ? ALL_TABS.filter((item) => item.id === "general")
    : ALL_TABS;
  const [tab, setTab] = useState<ConfigTab>("general");

  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
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

      {tab === "general" && <GeneralSettings />}
      {tab === "performance" && <ModelsSettings />}
      {tab === "advanced" && <AdvancedSettings />}
    </div>
  );
};

export default ConfigurationSettings;
