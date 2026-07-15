import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { SettingContainer } from "../../ui/SettingContainer";
import { ToggleSwitch } from "../../ui/ToggleSwitch";
import { TierBadge } from "../license/TierBadge";
import { CustomVariablesSettings } from "./CustomVariablesSettings";
import { useSettings } from "../../../hooks/useSettings";
import {
  ORB_THEMES,
  DEFAULT_ORB_ID,
  getOrbThemeId,
  setOrbThemeId,
  type OrbTheme,
} from "../../../lib/orbTheme";

// Aperçu d'un thème d'orbe : reproduit exactement le rendu « bille de verre »
// (dégradé radial + reflet) avec les 5 arrêts du thème.
const OrbSwatch: React.FC<{ theme: OrbTheme; size?: number }> = ({
  theme,
  size = 40,
}) => (
  <span
    className="relative inline-block rounded-full shrink-0"
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

/**
 * Réglages « Personnalisation » : choix de la teinte de l'orbe (l'identité
 * visuelle de Nova). 100 % frontend (localStorage, variables CSS) — le dock et
 * l'overlay se mettent à jour ensemble. Réservé à Nova Ultra : hors Ultra, seul
 * le thème par défaut est sélectionnable et un badge l'indique.
 */
export const PersonalizationSettings: React.FC = () => {
  const [selected, setSelected] = useState<string>(getOrbThemeId());
  const [canCustomize, setCanCustomize] = useState(true);
  const { settings, refreshSettings } = useSettings();
  // La bulle « toujours affichée » (champ absent des bindings tant que le build
  // Rust n'a pas régénéré les types → lecture souple + écriture via invoke brut).
  const [persistentOverlay, setPersistentOverlay] = useState(true);

  useEffect(() => {
    invoke<{ features: Record<string, boolean> }>("get_license_status")
      .then((s) => setCanCustomize(s.features?.orb_customization ?? true))
      .catch(() => setCanCustomize(true));
  }, []);

  useEffect(() => {
    const v = (settings as unknown as { persistent_overlay?: boolean } | null)
      ?.persistent_overlay;
    if (typeof v === "boolean") setPersistentOverlay(v);
  }, [settings]);

  const togglePersistentOverlay = async (enabled: boolean) => {
    setPersistentOverlay(enabled);
    try {
      await invoke("change_persistent_overlay_setting", { enabled });
      await refreshSettings();
    } catch {
      // La bulle garde son état si l'écriture échoue.
    }
  };

  const choose = (id: string) => {
    if (id !== DEFAULT_ORB_ID && !canCustomize) return;
    setSelected(id);
    setOrbThemeId(id);
  };

  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <SettingsGroup title="Orbe">
        <SettingContainer
          title="Teinte de l'orbe"
          description="L'orbe « bille de verre » est l'identité de Nova. Choisissez sa teinte — le dock et la bulle d'enregistrement suivent."
          layout="stacked"
          grouped={true}
        >
          <div className="space-y-3">
            <TierBadge feature="orb_customization" />
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
                    className={`flex flex-col items-center gap-1.5 rounded-lg border p-2.5 transition-colors ${
                      active
                        ? "border-accent bg-accent/10"
                        : "border-hairline hover:bg-mid-gray/10"
                    } ${locked ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    <OrbSwatch theme={theme} />
                    <span className="text-[11px] text-text-secondary text-center leading-tight">
                      {theme.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </SettingContainer>
      </SettingsGroup>

      <SettingsGroup title="Bulle">
        <ToggleSwitch
          checked={persistentOverlay}
          onChange={togglePersistentOverlay}
          label="Bulle toujours affichée"
          description="Garde la petite bulle Nova à l'écran en permanence, avec un engrenage pour choisir le Style. Elle laisse passer vos clics : elle ne devient cliquable que lorsque la souris la survole."
          descriptionMode="inline"
          grouped={true}
        />
      </SettingsGroup>

      <CustomVariablesSettings />
    </div>
  );
};

export default PersonalizationSettings;
