import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";

// Cache module partagé : le statut de licence ne change qu'à l'activation.
// invalidateLicense() (appelé après activate/clear) force un rechargement.
let cache: LicenseStatus | null = null;
let inflight: Promise<LicenseStatus | null> | null = null;

export type LicenseStatus = {
  tier: string;
  features: Record<string, boolean>;
};

export async function getStatus(): Promise<LicenseStatus | null> {
  if (cache) return cache;
  if (!inflight) {
    inflight = invoke<LicenseStatus>("get_license_status")
      .then((s) => {
        cache = s;
        return s;
      })
      .catch(() => null);
  }
  return inflight;
}

export function invalidateLicense() {
  cache = null;
  inflight = null;
}

// Palier requis affiché par fonctionnalité.
const TIER_FOR_FEATURE: Record<string, string> = {
  online_engine: "NOVA ULTRA",
  all_styles: "NOVA PRO",
  power_profiles: "NOVA PRO",
  custom_variables: "NOVA PRO",
  best_models: "NOVA ULTRA",
  custom_styles: "NOVA ULTRA",
  custom_auto_rules: "NOVA ULTRA",
  orb_customization: "NOVA ULTRA",
  custom_naming: "NOVA ULTRA",
  context_reading: "NOVA ULTRA",
};

/**
 * Badge « NÉCESSITE NOVA PRO / ULTRA » affiché uniquement si la fonctionnalité
 * n'est pas accessible au palier courant. Auto-suffisant : lit le statut de
 * licence en `invoke` brut (indépendant de bindings.ts).
 */
export const TierBadge: React.FC<{ feature: string; className?: string }> = ({
  feature,
  className = "",
}) => {
  const { t } = useTranslation();
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    let alive = true;
    getStatus().then((s) => {
      if (alive) setLocked(s ? !(s.features?.[feature] ?? false) : false);
    });
    return () => {
      alive = false;
    };
  }, [feature]);

  if (!locked) return null;

  const isUltra = (TIER_FOR_FEATURE[feature] ?? "").includes("ULTRA");
  const color = isUltra ? "var(--color-ultra)" : "var(--color-accent)";

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-bold tracking-wide uppercase rounded-full px-2 py-0.5 border whitespace-nowrap ${className}`}
      style={{ color, borderColor: color }}
    >
      {t("license.requiresTier", {
        tier: TIER_FOR_FEATURE[feature] ?? "Nova Pro",
      })}
    </span>
  );
};

export default TierBadge;
