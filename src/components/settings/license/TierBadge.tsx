import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { PremiumBadge, premiumTierFromLabel } from "./PremiumBadge";

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

// Palier requis affiché par fonctionnalité. Exporté : source de vérité
// réutilisée par le tableau comparatif des paliers (Compte).
export const TIER_FOR_FEATURE: Record<string, string> = {
  online_engine: "NOVA ULTRA",
  cloud_styles: "NOVA PRO",
  all_styles: "NOVA PRO",
  power_profiles: "NOVA PRO",
  custom_variables: "NOVA PRO",
  best_models: "NOVA ULTRA",
  custom_styles: "NOVA ULTRA",
  custom_auto_rules: "NOVA ULTRA",
  orb_customization: "NOVA ULTRA",
  custom_naming: "NOVA ULTRA",
  context_reading: "NOVA ULTRA",
  meeting_mode: "NOVA ULTRA",
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
      if (alive) setLocked(s ? !(s.features?.[feature] ?? true) : false);
    });
    return () => {
      alive = false;
    };
  }, [feature]);

  if (!locked) return null;

  const tierLabel = TIER_FOR_FEATURE[feature] ?? "NOVA PRO";

  return (
    <PremiumBadge
      tier={premiumTierFromLabel(tierLabel)}
      size="gate"
      className={className}
    >
      {t("license.requiresTier", { tier: tierLabel })}
    </PremiumBadge>
  );
};

export default TierBadge;
