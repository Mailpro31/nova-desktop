import React from "react";
import { useTranslation } from "react-i18next";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { FEATURE_ROWS } from "./LicenseSettings";
import { TIER_FOR_FEATURE } from "./TierBadge";

type Tier = "free" | "pro" | "ultra" | "business";

const TIERS: { id: Tier; label: string; color: string }[] = [
  { id: "free", label: "Free", color: "var(--color-text-secondary)" },
  { id: "pro", label: "Pro", color: "var(--color-accent)" },
  { id: "ultra", label: "Ultra", color: "var(--color-ultra)" },
  { id: "business", label: "Business", color: "var(--color-accent)" },
];

const TIER_RANK: Record<Tier, number> = {
  free: 0,
  pro: 1,
  ultra: 2,
  business: 3,
};

// Palier minimum requis par fonctionnalité (déduit de TIER_FOR_FEATURE, la
// même source que le badge de verrouillage — on ne fabrique aucune donnée).
const requiredRank = (featureKey: string): number => {
  const requirement = (TIER_FOR_FEATURE[featureKey] ?? "").toUpperCase();
  if (requirement.includes("ULTRA")) return TIER_RANK.ultra;
  if (requirement.includes("PRO")) return TIER_RANK.pro;
  return TIER_RANK.free;
};

const Check: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    width="15"
    height="15"
    fill="none"
    stroke="var(--color-accent)"
    strokeWidth="2.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

/**
 * Tableau comparatif Free / Pro / Ultra / Business — construit directement à
 * partir de FEATURE_ROWS (LicenseSettings) et TIER_FOR_FEATURE (TierBadge),
 * les deux seules sources de vérité déjà présentes dans l'app. Business est
 * traité comme englobant tout Ultra (aucune fonctionnalité Business propre
 * n'existe ailleurs dans le code — on ne l'invente pas ici).
 */
export const TierComparisonTable: React.FC = () => {
  const { t } = useTranslation();
  return (
    <SettingsGroup title="Comparer les paliers">
      <div className="px-4 py-3 overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[560px]">
          <thead>
            <tr>
              <th className="text-left font-medium text-text-secondary pb-2 pr-2 w-1/3">
                {t("license.featureColumn")}
              </th>
              {TIERS.map((tier) => (
                <th
                  key={tier.id}
                  className="text-center font-semibold pb-2 px-2"
                  style={{ color: tier.color }}
                >
                  {tier.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FEATURE_ROWS.map((feature) => {
              const min = requiredRank(feature.key);
              return (
                <tr
                  key={feature.key}
                  className="border-t"
                  style={{ borderColor: "var(--color-hairline)" }}
                >
                  <td className="py-2 pr-2 text-text-primary">
                    {feature.label}
                  </td>
                  {TIERS.map((tier) => (
                    <td key={tier.id} className="text-center py-2 px-2">
                      {TIER_RANK[tier.id] >= min ? (
                        <span className="inline-flex justify-center">
                          <Check />
                        </span>
                      ) : (
                        <span className="text-text-secondary">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SettingsGroup>
  );
};

export default TierComparisonTable;
