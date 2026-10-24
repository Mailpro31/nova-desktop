import React from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

import { ToggleSwitch } from "../../ui/ToggleSwitch";
import { SettingContainer } from "../../ui/SettingContainer";
import { useSettings } from "../../../hooks/useSettings";

/** La bulle de sélection : l'allumer, et les applications où elle se tait. */
export const SelectionBubbleSettings: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting, updateSetting, isUpdating } = useSettings();
  const enabled = getSetting("selection_bubble_enabled") ?? true;
  const blocklist = getSetting("selection_bubble_blocklist") ?? [];

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
      {blocklist.length > 0 && (
        <SettingContainer
          title={t("bubble.settings.blocked")}
          description={t("bubble.settings.blockedDescription")}
          layout="stacked"
          grouped={true}
        >
          <div className="mt-2 flex flex-wrap gap-1.5">
            {blocklist.map((process) => (
              <button
                key={process}
                type="button"
                aria-label={t("bubble.settings.unblock", { app: process })}
                title={t("bubble.settings.unblock", { app: process })}
                onClick={() =>
                  updateSetting(
                    "selection_bubble_blocklist",
                    blocklist.filter((p) => p !== process),
                  )
                }
                className="flex items-center gap-1.5 rounded-full border border-hairline py-1 pe-2 ps-3 text-sm text-text transition-colors duration-[120ms] hover:border-accent/40 cursor-pointer"
              >
                {process}
                <X size={14} className="text-text-secondary" />
              </button>
            ))}
          </div>
        </SettingContainer>
      )}
    </>
  );
};
