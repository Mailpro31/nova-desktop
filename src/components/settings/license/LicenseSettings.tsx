import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { SettingContainer } from "../../ui/SettingContainer";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { invalidateLicense, TIER_FOR_FEATURE } from "./TierBadge";
import { PremiumBadge } from "./PremiumBadge";
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

// Fonctions mises en avant (clé technique → libellé). Exporté : réutilisé
// tel quel par le tableau comparatif des paliers (Compte) — source de vérité
// unique, on ne fabrique pas une deuxième liste de fonctionnalités.
export const FEATURE_ROWS: { key: string; label: string }[] = [
  { key: "cloud_styles", label: "Turbo illimité — reformulation en ligne" },
  { key: "all_styles", label: "Les 7 Styles" },
  { key: "power_profiles", label: "Profils de puissance" },
  { key: "best_models", label: "Meilleure IA / qualité maximale" },
  { key: "orb_customization", label: "Personnalisation (orbe, noms, modes)" },
];

/**
 * Pilule de palier, volontairement très différenciée : Free gris neutre,
 * Pro bleu Apple (l'accent d'action), Ultra lilas en dégradé (le « premium »
 * visuel de Nova), Business bleu.
 */
const TierPill: React.FC<{ tier: Tier }> = ({ tier }) => {
  // Pro et Ultra partagent le traitement « premium » (dégradé + lueur), même
  // soin, seule la teinte change — cf. PremiumBadge.
  if (tier === "ultra" || tier === "pro") {
    return <PremiumBadge tier={tier}>{TIER_LABEL[tier]}</PremiumBadge>;
  }
  // Free (neutre) et Business (bleu d'action) restent des pilules sobres.
  const color =
    tier === "free" ? "var(--color-text-secondary)" : "var(--color-accent)";
  return (
    <span
      className="text-xs font-bold tracking-wide uppercase rounded-full px-3 py-1 border whitespace-nowrap"
      style={{
        color,
        borderColor: color,
        background:
          tier === "free"
            ? "transparent"
            : "color-mix(in srgb, var(--color-accent) 10%, transparent)",
      }}
    >
      {TIER_LABEL[tier]}
    </span>
  );
};

/** Chip « NOVA PRO » / « NOVA ULTRA » marquant le palier d'une fonction. */
const TierChip: React.FC<{ tierLabel: string }> = ({ tierLabel }) => {
  const isUltra = tierLabel.includes("ULTRA");
  const color = isUltra ? "var(--color-ultra)" : "var(--color-accent)";
  return (
    <span
      className="text-[9px] font-bold tracking-wider rounded-full px-1.5 py-px border whitespace-nowrap"
      style={{
        color,
        borderColor: color,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      {tierLabel}
    </span>
  );
};

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

  const tier: Tier = status?.tier ?? "free";
  const isUltra = tier === "ultra";

  // Liens de paiement Stripe — MENSUELS (l'utilisateur choisit l'annuel sur le
  // site s'il préfère ; les mêmes liens que la landing novaspeak.app).
  const PRO_MONTHLY_URL = "https://buy.stripe.com/9B68wO1Wif1g3Kfg7YefC09";
  const ULTRA_MONTHLY_URL = "https://buy.stripe.com/4gM28qfN8aL0cgL4pgefC0b";

  const [portalBusy, setPortalBusy] = useState(false);
  const openPortal = async () => {
    setPortalBusy(true);
    setError(null);
    try {
      await invoke("open_billing_portal");
    } catch (e) {
      setError(typeof e === "string" ? e : "Portail indisponible.");
    } finally {
      setPortalBusy(false);
    }
  };

  return (
    <SettingsGroup title="Abonnement">
      {/* 1. Le plan ACTUEL d'abord — toujours au-dessus de toute promo. */}
      <div className="px-4 py-3.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">{t("license.yourPlan")}</h3>
          <p className="text-xs text-text-secondary mt-0.5">
            {status?.licensed && status.email
              ? status.email
              : "Palier Nova actif sur cet appareil."}
          </p>
        </div>
        <TierPill tier={tier} />
      </div>

      {/* 2. Ce que le palier donne — chaque fonction marquée de SON palier. */}
      <div className="px-4 py-3 flex flex-col gap-2 border-t border-mid-gray/20">
        {FEATURE_ROWS.map((f) => {
          const ok = status?.features?.[f.key] ?? false;
          return (
            <div key={f.key} className="flex items-center gap-2.5 text-sm">
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
              <span className={`flex-1 ${ok ? "" : "text-text-secondary"}`}>
                {f.label}
              </span>
              {TIER_FOR_FEATURE[f.key] && (
                <TierChip tierLabel={TIER_FOR_FEATURE[f.key]} />
              )}
            </div>
          );
        })}
      </div>

      {/* 3. Utilisation (quota Free / statistique de la semaine). */}
      <QuotaBar />
      <WeekStat />

      {/* 4. Montée de palier — checkout Stripe MENSUEL direct. */}
      {!isUltra && (
        <SettingContainer
          title="Passer à un palier supérieur"
          description={
            tier === "pro"
              ? "Débloquez la lecture de contexte, les Styles sur mesure et la personnalisation complète."
              : "Débloquez Turbo, les 7 Styles et la personnalisation."
          }
          grouped={true}
        >
          <Button
            variant="primary"
            size="md"
            onClick={() =>
              openUrl(tier === "pro" ? ULTRA_MONTHLY_URL : PRO_MONTHLY_URL)
            }
          >
            {tier === "pro"
              ? t("license.upgradeToUltra")
              : t("license.trial.subscribe")}
          </Button>
        </SettingContainer>
      )}

      {status?.licensed && (
        <SettingContainer
          title={t("license.manageSubscription")}
          description="Résiliation, changement de palier (la différence est calculée au prorata), moyen de paiement et factures — portail sécurisé Stripe."
          grouped={true}
        >
          <Button
            variant="secondary"
            size="md"
            disabled={portalBusy}
            onClick={openPortal}
          >
            {t("license.manageSubscription")}
          </Button>
        </SettingContainer>
      )}

      {/* 5. Activation d'une clé. */}
      <SettingContainer
        title="Entrer ma licence"
        description="Collez votre clé NOVA1 ou votre code d'achat NOVA-… reçu après paiement."
        grouped={true}
        layout="stacked"
      >
        <div className="flex items-center gap-2 w-full">
          <Input
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="NOVA1.… ou NOVA-…"
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
