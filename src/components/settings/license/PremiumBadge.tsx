import React from "react";

/**
 * Badge « premium » partagé : dégradé rempli + lueur douce. C'est l'identité
 * visuelle des paliers payants de Nova, réutilisée partout (pilule de plan
 * courant ET verrous de fonctionnalité) pour un langage cohérent.
 *
 * - Ultra : lilas (le « premium » historique de Nova).
 * - Pro : bleu d'action Apple, MÊME traitement (même lueur, même graphique) —
 *   la seule différence est la teinte, jamais le soin apporté.
 *
 * Une seule source de vérité pour ce style : `TierBadge` (verrous) et la pilule
 * de plan s'appuient dessus, on ne redéfinit pas le dégradé à deux endroits.
 */
export type PremiumTier = "pro" | "ultra";

/** Style rempli + lueur pour un palier donné. */
export function premiumBadgeStyle(tier: PremiumTier): React.CSSProperties {
  if (tier === "ultra") {
    return {
      background:
        "linear-gradient(135deg, #D9C8F7 0%, var(--color-ultra) 45%, #9F86D9 100%)",
      color: "#1F1F22",
      boxShadow: "0 2px 10px rgba(159, 134, 217, .35)",
    };
  }
  return {
    background:
      "linear-gradient(135deg, #7FB6FF 0%, #0A84FF 45%, #0060DF 100%)",
    color: "#FFFFFF",
    boxShadow: "0 2px 10px rgba(10, 132, 255, .35)",
  };
}

/** Déduit le palier premium d'un libellé (« NOVA ULTRA » → `ultra`). */
export function premiumTierFromLabel(label: string): PremiumTier {
  return label.toUpperCase().includes("ULTRA") ? "ultra" : "pro";
}

/**
 * Pilule premium prête à l'emploi. `size` ajuste la densité : `plan` pour la
 * pilule de plan courant, `gate` (plus compacte) pour un verrou de
 * fonctionnalité.
 */
export const PremiumBadge: React.FC<{
  tier: PremiumTier;
  size?: "plan" | "gate";
  className?: string;
  children: React.ReactNode;
}> = ({ tier, size = "plan", className = "", children }) => {
  const dims =
    size === "gate" ? "text-[10px] px-2 py-0.5" : "text-xs px-3 py-1";
  return (
    <span
      className={`inline-flex items-center gap-1 font-bold tracking-wide uppercase rounded-full whitespace-nowrap ${dims} ${className}`}
      style={premiumBadgeStyle(tier)}
    >
      {children}
    </span>
  );
};

export default PremiumBadge;
