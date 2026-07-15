import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { TierBadge } from "../license/TierBadge";

// Profils de puissance de Nova (portés fidèlement) : chacun règle le modèle
// local Ollama utilisé pour la reformulation. Air est gratuit ; Aura/Apex
// nécessitent Nova Pro.
const PROFILES = [
  {
    id: "air",
    label: "Nova Air",
    desc: "Léger et vif",
    model: "qwen2.5:3b",
    locked: false,
  },
  {
    id: "aura",
    label: "Nova Aura",
    desc: "Le meilleur équilibre",
    model: "qwen2.5:7b",
    locked: true,
  },
  {
    id: "apex",
    label: "Nova Apex",
    desc: "Intelligence maximale",
    model: "qwen2.5:14b",
    locked: true,
  },
];

type Progress = { stage: string; percentage: number; message: string };

/**
 * Sélecteur Nova Air / Aura / Apex. Choisir un profil installe (si besoin) et
 * télécharge le modèle Ollama correspondant — avec progression dans l'app —
 * puis l'active. Réutilise les commandes Ollama/licence déjà en place
 * (invoke brut). Aura/Apex sont gatés Nova Pro.
 */
export const PowerProfileSelector: React.FC<{
  currentModel?: string;
  onApplied?: () => void;
}> = ({ currentModel, onApplied }) => {
  const { t } = useTranslation();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [canPro, setCanPro] = useState(true);
  const unlistenRef = useRef<UnlistenFn | null>(null);

  useEffect(() => {
    invoke<{ features: Record<string, boolean> }>("get_license_status")
      .then((s) => setCanPro(s.features?.power_profiles ?? true))
      .catch(() => setCanPro(true));
    return () => {
      unlistenRef.current?.();
    };
  }, []);

  const activeId = PROFILES.find((p) => p.model === currentModel)?.id ?? null;

  const apply = async (p: (typeof PROFILES)[number]) => {
    if (p.locked && !canPro) return;
    setBusyId(p.id);
    setProgress({ stage: "checking", percentage: -1, message: "Préparation…" });
    unlistenRef.current = await listen<Progress>(
      "ollama-install-progress",
      (e) => setProgress(e.payload),
    );
    try {
      await invoke("install_ollama_engine", { model: p.model });
      await invoke("change_post_process_model_setting", {
        providerId: "ollama",
        model: p.model,
      });
      await invoke("set_post_process_provider", { providerId: "ollama" });
      onApplied?.();
    } catch {
      // l'installateur affiche déjà l'erreur via l'événement de progression
    } finally {
      unlistenRef.current?.();
      unlistenRef.current = null;
      setBusyId(null);
      setProgress(null);
    }
  };

  const pct = progress && progress.percentage >= 0 ? progress.percentage : null;

  return (
    <div className="mx-4 my-1 flex flex-col gap-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
        {t("settings.postProcessing.powerProfile.label")}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {PROFILES.map((p) => {
          const active = activeId === p.id;
          const locked = p.locked && !canPro;
          return (
            <button
              key={p.id}
              disabled={busyId !== null || locked}
              onClick={() => apply(p)}
              className={`rounded-lg border p-2.5 text-left transition-colors ${
                active
                  ? "border-accent bg-accent/10"
                  : "border-hairline hover:bg-mid-gray/10"
              } ${locked ? "opacity-70 cursor-not-allowed" : ""}`}
            >
              <div className="text-sm font-semibold flex items-center gap-1">
                {p.label}
                {active && (
                  <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    fill="none"
                    stroke="var(--color-accent)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </div>
              <div className="text-[11px] text-text-secondary">{p.desc}</div>
              {p.locked && (
                <TierBadge feature="power_profiles" className="mt-1.5" />
              )}
            </button>
          );
        })}
      </div>

      {busyId && progress && (
        <div className="flex flex-col gap-1">
          <div className="h-1.5 w-full rounded-full bg-mid-gray/20 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: pct !== null ? `${pct}%` : "100%",
                background: "var(--color-accent)",
                opacity: pct !== null ? 1 : 0.5,
              }}
            />
          </div>
          <span className="text-xs text-text-secondary">
            {progress.message}
            {pct !== null ? ` — ${Math.round(pct)} %` : ""}
          </span>
        </div>
      )}
    </div>
  );
};

export default PowerProfileSelector;
