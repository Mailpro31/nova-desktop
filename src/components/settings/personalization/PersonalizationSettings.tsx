import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/ui/PageHeader";
import { isCampusMode } from "@/lib/mode";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { SettingContainer } from "../../ui/SettingContainer";
import { ToggleSwitch } from "../../ui/ToggleSwitch";
import { TierBadge } from "../license/TierBadge";
import { ThemeSelector } from "../ThemeSelector";
import { AppLanguageSelector } from "../AppLanguageSelector";
import { ShowOverlay } from "../ShowOverlay";
import { CustomVariablesSettings } from "./CustomVariablesSettings";
import { useSettings } from "../../../hooks/useSettings";
import {
  ORB_THEMES,
  DEFAULT_ORB_ID,
  getOrbThemeId,
  setOrbThemeId,
  type OrbTheme,
} from "../../../lib/orbTheme";

const OrbSwatch: React.FC<{ theme: OrbTheme; size?: number }> = ({
  theme,
  size = 40,
}) => (
  <span
    className="relative inline-block shrink-0 rounded-full"
    style={{
      width: size,
      height: size,
      background: `radial-gradient(circle at 34% 30%, ${theme.stops[0]} 0%, ${theme.stops[1]} 18%, ${theme.stops[2]} 45%, ${theme.stops[3]} 72%, ${theme.stops[4]} 100%)`,
      boxShadow: `inset 0 0 4px rgba(255,255,255,.5), 0 0 8px rgba(${theme.glow}, .35)`,
    }}
  >
    <span
      className="absolute rounded-full"
      style={{
        left: "18%",
        top: "14%",
        width: "44%",
        height: "28%",
        background:
          "radial-gradient(circle, rgba(255,255,255,.9) 0%, rgba(255,255,255,0) 100%)",
        transform: "rotate(-18deg)",
      }}
    />
  </span>
);

export const PersonalizationSettings: React.FC = () => {
  const { t } = useTranslation();
  const campusMode = isCampusMode();
  const [selected, setSelected] = useState<string>(getOrbThemeId());
  const [canCustomize, setCanCustomize] = useState(true);
  const { settings, refreshSettings } = useSettings();
  const [persistentOverlay, setPersistentOverlay] = useState(true);

  useEffect(() => {
    if (campusMode) {
      setCanCustomize(true);
      return;
    }
    void invoke<{ features: Record<string, boolean> }>("get_license_status")
      .then((status) =>
        setCanCustomize(status.features?.orb_customization ?? true),
      )
      .catch(() => setCanCustomize(true));
  }, [campusMode]);

  useEffect(() => {
    const value = (
      settings as unknown as { persistent_overlay?: boolean } | null
    )?.persistent_overlay;
    if (typeof value === "boolean") setPersistentOverlay(value);
  }, [settings]);

  const togglePersistentOverlay = async (enabled: boolean) => {
    setPersistentOverlay(enabled);
    try {
      await invoke("change_persistent_overlay_setting", { enabled });
      await refreshSettings();
    } catch {
      setPersistentOverlay(!enabled);
    }
  };

  const choose = (id: string) => {
    if (id !== DEFAULT_ORB_ID && !canCustomize) return;
    setSelected(id);
    setOrbThemeId(id);
  };

  return (
    <div className="mx-auto w-full max-w-[760px] space-y-8">
      <PageHeader
        title={t("sidebar.personalization")}
        description={t("campus.personalization.description")}
      />

      <SettingsGroup title={t("campus.personalization.appearance")}>
        <ThemeSelector descriptionMode="tooltip" grouped={true} />
        <AppLanguageSelector descriptionMode="tooltip" grouped={true} />
      </SettingsGroup>

      <SettingsGroup title={t("campus.personalization.orb")}>
        <SettingContainer
          title={t("campus.personalization.orbColor")}
          description={t("campus.personalization.orbDescription")}
          layout="stacked"
          grouped={true}
        >
          <div className="space-y-3">
            {!campusMode && <TierBadge feature="orb_customization" />}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {ORB_THEMES.map((theme) => {
                const active = selected === theme.id;
                const locked = theme.id !== DEFAULT_ORB_ID && !canCustomize;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => choose(theme.id)}
                    disabled={locked}
                    aria-pressed={active}
                    title={theme.label}
                    className={`flex flex-col items-center gap-1.5 rounded-lg border p-2.5 transition-colors duration-150 motion-reduce:transition-none ${
                      active
                        ? "border-accent bg-accent/10"
                        : "border-hairline hover:bg-inset"
                    } ${locked ? "cursor-not-allowed opacity-40" : ""}`}
                  >
                    <OrbSwatch theme={theme} />
                    <span className="text-center text-[11px] leading-tight text-text-secondary">
                      {theme.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </SettingContainer>
      </SettingsGroup>

      <SettingsGroup title={t("campus.personalization.bubble")}>
        <ToggleSwitch
          checked={persistentOverlay}
          onChange={togglePersistentOverlay}
          label={t("campus.personalization.alwaysVisible")}
          description={t("campus.personalization.alwaysVisibleDescription")}
          descriptionMode="inline"
          grouped={true}
        />
        <ShowOverlay descriptionMode="tooltip" grouped={true} />
      </SettingsGroup>

      {!campusMode && <CustomVariablesSettings />}
    </div>
  );
};

export default PersonalizationSettings;
