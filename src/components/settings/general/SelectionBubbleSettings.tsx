import React, { useState } from "react";
import { useTranslation } from "react-i18next";

import { ToggleSwitch } from "../../ui/ToggleSwitch";
import { SettingContainer } from "../../ui/SettingContainer";
import { useSettings } from "../../../hooks/useSettings";
import { CONNECTIONS } from "@/lib/bubble/connections";
import {
  loadBubblePreferences,
  saveBubblePreferences,
} from "@/lib/bubble/preferences";

/** La bulle de sélection : l'allumer, et choisir l'IA qu'elle ouvre. */
export const SelectionBubbleSettings: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting, updateSetting, isUpdating } = useSettings();
  const [ai, setAi] = useState(() => loadBubblePreferences().ai);
  const enabled = getSetting("selection_bubble_enabled") ?? true;

  const choose = (id: string) => {
    setAi(id);
    saveBubblePreferences({ ...loadBubblePreferences(), ai: id });
  };

  return (
    <>
      <ToggleSwitch
        checked={enabled}
        onChange={(value) => updateSetting("selection_bubble_enabled", value)}
        isUpdating={isUpdating("selection_bubble_enabled")}
        label={t("bubble.settings.enabled")}
        description={t("bubble.settings.enabledDescription")}
        descriptionMode="tooltip"
        grouped={true}
      />
      <SettingContainer
        title={t("bubble.settings.preferredAi")}
        description={t("bubble.settings.preferredAiDescription")}
        layout="stacked"
        grouped={true}
        disabled={!enabled}
      >
        <div role="radiogroup" className="mt-2 flex flex-wrap gap-1.5">
          {CONNECTIONS.filter((c) => c.group === "ai").map((connection) => {
            const selected = connection.id === ai;
            return (
              <button
                key={connection.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={!enabled}
                onClick={() => choose(connection.id)}
                className={`flex items-center gap-2 rounded-full border py-1.5 pe-3 ps-2 text-sm transition-colors duration-[120ms] cursor-pointer disabled:cursor-default disabled:opacity-60 ${
                  selected
                    ? "border-accent bg-accent/10 text-text"
                    : "border-hairline text-text-secondary hover:border-accent/40"
                }`}
              >
                {connection.logo ? (
                  <img
                    src={connection.logo}
                    alt=""
                    width={18}
                    height={18}
                    className="rounded-[4px]"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    style={{ background: connection.color }}
                    className="flex h-[18px] w-[18px] items-center justify-center rounded-[4px] text-[11px] font-semibold text-white"
                  >
                    {connection.name.charAt(0)}
                  </span>
                )}
                {connection.name}
              </button>
            );
          })}
        </div>
      </SettingContainer>
    </>
  );
};
