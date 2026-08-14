import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { Cog, CreditCard, History, Sparkles } from "lucide-react";
import type { SidebarSection } from "../../Sidebar";
import { WeekStat } from "../license/WeekStat";
import { isCampusMode } from "@/lib/mode";
import { CampusHomeSettings } from "./CampusHomeSettings";

type Tier = "free" | "pro" | "ultra" | "business";

type LicenseStatus = {
  tier: Tier;
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

interface QuickNavCardProps {
  icon: React.ComponentType<{
    width?: number | string;
    height?: number | string;
    className?: string;
  }>;
  color: string;
  label: string;
  onClick: () => void;
}

const QuickNavCard: React.FC<QuickNavCardProps> = ({
  icon: Icon,
  color,
  label,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="flex flex-col items-start gap-3 p-3.5 rounded-xl border border-hairline bg-surface hover:bg-mid-gray/10 transition-colors text-left cursor-pointer"
  >
    <span
      className="flex items-center justify-center rounded-[7px] shrink-0"
      style={{ width: 30, height: 30, background: color }}
    >
      <Icon width={17} height={17} className="text-white" />
    </span>
    <span className="text-sm font-medium">{label}</span>
  </button>
);

interface HomeSettingsProps {
  onNavigate?: (section: SidebarSection) => void;
}

/**
 * « Accueil » — la page d'atterrissage des réglages : palier actif, valeur
 * de la semaine, accès rapide à Configuration / Compte / Historique. Volontai-
 * rement simple : un tableau de bord, pas une nouvelle fonctionnalité.
 */
export const HomeSettings: React.FC<HomeSettingsProps> = ({ onNavigate }) => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<LicenseStatus | null>(null);

  useEffect(() => {
    invoke<LicenseStatus>("get_license_status")
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  const tier: Tier = status?.tier ?? "free";

  const go = (section: SidebarSection) => onNavigate?.(section);

  if (isCampusMode()) {
    return <CampusHomeSettings onNavigate={go} />;
  }

  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <div className="px-1">
        <h1 className="text-xl font-semibold mb-1">{t("sidebar.home")}</h1>
        <p className="text-sm text-text-secondary">
          {t("settings.home.subtitle")}
        </p>
      </div>

      {!isCampusMode() && (
        <div className="rounded-lg border border-mid-gray/20 bg-background divide-y divide-mid-gray/20">
          <div className="px-4 py-3 flex items-center justify-between">
            {/* eslint-disable-next-line i18next/no-literal-string */}
            <span className="text-sm text-text-secondary">Palier actif</span>
            <span
              className="text-sm font-semibold px-2.5 py-1 rounded-full border"
              style={{ color: TIER_COLOR[tier], borderColor: TIER_COLOR[tier] }}
            >
              {TIER_LABEL[tier]}
            </span>
          </div>
          <WeekStat />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <QuickNavCard
          icon={Cog}
          color="#8E8E93"
          label={t("sidebar.configuration")}
          onClick={() => go("configuration")}
        />
        {isCampusMode() ? (
          <QuickNavCard
            icon={Sparkles}
            color="#BF5AF2"
            label={t("sidebar.styles")}
            onClick={() => go("postprocessing")}
          />
        ) : (
          <QuickNavCard
            icon={CreditCard}
            color="#5E5CE6"
            label={t("sidebar.account")}
            onClick={() => go("account")}
          />
        )}
        <QuickNavCard
          icon={History}
          color="#FF9F0A"
          label={t("sidebar.history")}
          onClick={() => go("history")}
        />
      </div>
    </div>
  );
};

export default HomeSettings;
