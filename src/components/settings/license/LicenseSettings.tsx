import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { SettingContainer } from "../../ui/SettingContainer";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { invalidateLicense } from "./TierBadge";
import { QuotaBar } from "./QuotaBar";
import { WeekStat } from "./WeekStat";

type Tier = "free" | "pro" | "ultra" | "business";

type LicenseStatus = {
  tier: Tier;
  active: boolean;
  email: string;
  licensed: boolean;
  features: Record<string, boolean>;
};

const TIER_LABEL: Record<Tier, string> = {
  free: "Nova Free",
  pro: "Nova Pro",
  ultra: "Nova Ultra",
  business: "Nova Business",
};

const TIER_COLOR: Record<Tier, string> = {
  free: "var(--color-text-secondary)",
  pro: "var(--color-accent)",
  ultra: "var(--color-ultra)",
  business: "var(--color-accent)",
};

// Fonctions mises en avant (clé technique → libellé).
const FEATURE_ROWS: { key: string; label: string }[] = [
  { key: "online_engine", label: "Turbo — moteur de reformulation en ligne" },
  { key: "all_styles", label: "Les 7 Styles" },
  { key: "power_profiles", label: "Profils de puissance" },
  { key: "best_models", label: "Meilleure IA / qualité maximale" },
  { key: "orb_customization", label: "Personnalisation (orbe, noms, modes)" },
];

export const LicenseSettings: React.FC = () => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setStatus(await invoke<LicenseStatus>("get_license_status"));
    } catch {
      setStatus(null);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const activate = async () => {
    const value = keyInput.trim();
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      // Code d'achat NOVA-xxxx → échange en ligne contre un jeton lié à la
      // machine ; sinon jeton NOVA1 collé → vérification hors-ligne.
      const isPurchaseCode = value.toUpperCase().startsWith("NOVA-");
      const s = isPurchaseCode
        ? await invoke<LicenseStatus>("activate_license_code", { code: value })
        : await invoke<LicenseStatus>("activate_license", { key: value });
      setStatus(s);
      setKeyInput("");
      invalidateLicense();
    } catch (e) {
      setError(typeof e === "string" ? e : "Clé invalide.");
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    setError(null);
    try {
      setStatus(await invoke<LicenseStatus>("clear_license"));
      invalidateLicense();
    } finally {
      setBusy(false);
    }
  };

  const tier: Tier = status?.tier ?? "free";
  const isUltra = tier === "ultra";

  return (
    <SettingsGroup title="Abonnement">
      <SettingContainer
        title="Votre plan"
        description="Palier Nova actif sur cet appareil."
        grouped={true}
      >
        <span
          className="text-sm font-semibold px-2.5 py-1 rounded-full border"
          style={{
            color: TIER_COLOR[tier],
            borderColor: TIER_COLOR[tier],
          }}
        >
          {TIER_LABEL[tier]}
        </span>
      </SettingContainer>

      <QuotaBar />
      <WeekStat />

      {status?.licensed && status.email && (
        <SettingContainer
          title="Licence"
          description={status.email}
          grouped={true}
        >
          <Button variant="ghost" size="sm" onClick={clear} disabled={busy}>
            {t("license.remove")}
          </Button>
        </SettingContainer>
      )}

      {/* Fonctions incluses / verrouillées au palier courant */}
      <div className="px-4 py-2 flex flex-col gap-1.5">
        {FEATURE_ROWS.map((f) => {
          const ok = status?.features?.[f.key] ?? false;
          return (
            <div key={f.key} className="flex items-center gap-2 text-sm">
              <span
                className="w-4 h-4 flex items-center justify-center shrink-0"
                style={{
                  color: ok
                    ? "var(--color-success)"
                    : "var(--color-text-secondary)",
                }}
              >
                {ok ? (
                  <svg
                    viewBox="0 0 24 24"
                    width="15"
                    height="15"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    width="13"
                    height="13"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="5" y="11" width="14" height="10" rx="2" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                )}
              </span>
              <span className={ok ? "" : "text-text-secondary"}>{f.label}</span>
            </div>
          );
        })}
      </div>

      {!isUltra && (
        <SettingContainer
          title="Passer à un palier supérieur"
          description="Débloquez Turbo, les 7 Styles et la personnalisation."
          grouped={true}
        >
          <Button
            variant="primary"
            size="md"
            onClick={() => openUrl("https://novaspeak.app")}
          >
            {t("license.upgradeToUltra")}
          </Button>
        </SettingContainer>
      )}

      <SettingContainer
        title="Entrer ma licence"
        description="Collez votre clé NOVA1 reçue après achat."
        grouped={true}
        layout="stacked"
      >
        <div className="flex items-center gap-2 w-full">
          <Input
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="NOVA1.…"
            className="flex-1"
          />
          <Button
            variant="primary"
            size="md"
            onClick={activate}
            disabled={busy || !keyInput.trim()}
          >
            {busy ? "…" : "Activer"}
          </Button>
        </div>
      </SettingContainer>

      {error && (
        <div
          className="px-4 pb-2 text-xs"
          style={{ color: "var(--color-danger)" }}
        >
          {error}
        </div>
      )}
    </SettingsGroup>
  );
};

export default LicenseSettings;
