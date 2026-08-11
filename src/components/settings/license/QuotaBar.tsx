import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";

// Renvoyé par la commande Rust `get_quota_status` (absente des bindings tant que
// le build de debug n'a pas régénéré les types → lecture souple via invoke brut).
type QuotaStatus = {
  limited: boolean;
  used: number;
  limit: number;
  blocked: boolean;
};

/**
 * Barre de progression du quota gratuit de reformulations Turbo, offert une
 * fois à vie. Ne s'affiche qu'au palier Free (les paliers payants ne sont pas
 * limités). Passe au rouge une fois le crédit épuisé — la dictée, elle, reste
 * illimitée.
 */
export const QuotaBar: React.FC = () => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<QuotaStatus | null>(null);

  const refresh = () =>
    invoke<QuotaStatus>("get_quota_status")
      .then(setStatus)
      .catch(() => setStatus(null));

  useEffect(() => {
    refresh();
    // Rafraîchit quand une reformulation vient d'être plafonnée (compteur bougé).
    const unlisten = listen("quota-blocked", () => refresh());
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  if (!status || !status.limited) return null;

  const pct = Math.min(100, Math.round((status.used / status.limit) * 100));

  return (
    <div className="px-4 py-3 flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-text-primary">
          {t("quota.lifetimeUsage")}
        </span>
        <span
          className="text-[12px] tabular-nums"
          style={{
            color: status.blocked
              ? "var(--color-danger)"
              : "var(--color-text-secondary)",
          }}
        >
          {t("quota.count", {
            used: status.used.toLocaleString(),
            limit: status.limit.toLocaleString(),
          })}
        </span>
      </div>

      <div
        className="w-full h-2 rounded-full overflow-hidden"
        style={{ background: "var(--color-input-bg, rgba(255,255,255,.08))" }}
        role="progressbar"
        aria-valuenow={status.used}
        aria-valuemin={0}
        aria-valuemax={status.limit}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${pct}%`,
            background: status.blocked
              ? "var(--color-danger)"
              : "var(--color-accent)",
          }}
        />
      </div>

      {status.blocked ? (
        <span className="text-[12px]" style={{ color: "var(--color-danger)" }}>
          {t("quota.blockedInline")}
        </span>
      ) : (
        <span className="text-[12px] text-text-secondary">
          {t("quota.lifetimeNote")}
        </span>
      )}
    </div>
  );
};

export default QuotaBar;
