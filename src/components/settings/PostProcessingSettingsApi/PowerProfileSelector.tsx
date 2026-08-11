import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { TierBadge } from "../license/TierBadge";

const LOCAL_LLM_PROVIDER_ID = "nova_local";

// Profils de puissance de Nova : chacun règle la taille du modèle local
// embarqué utilisé pour la reformulation (llama-server, aucune installation
// manuelle). Air est gratuit ; Aura/Apex nécessitent Nova Pro.
const PROFILE_META: Record<string, { label: string; desc: string }> = {
  air: { label: "Nova Air", desc: "Léger et vif" },
  aura: { label: "Nova Aura", desc: "Le meilleur équilibre" },
  apex: { label: "Nova Apex", desc: "Intelligence maximale" },
};
const LOCKED_PROFILES = new Set(["aura", "apex"]);

type LlmProfileStatus = {
  id: string;
  approx_size_mb: number;
  required_ram_gb: number;
  is_downloaded: boolean;
  is_recommended: boolean;
  is_supported: boolean;
};

type Progress = {
  stage: string;
  profile_id: string;
  downloaded: number;
  total: number;
  percentage: number;
};

/**
 * Sélecteur Nova Air / Aura / Apex. Choisir un profil télécharge (si besoin)
 * le modèle correspondant — avec progression dans l'app — puis démarre le
 * moteur local embarqué et l'active comme fournisseur de reformulation.
 * Aura/Apex sont gatés Nova Pro. Le profil recommandé (selon la RAM détectée
 * par l'app) porte un badge « Recommandé ».
 */
export const PowerProfileSelector: React.FC<{
  currentModel?: string;
  onApplied?: () => void;
}> = ({ currentModel, onApplied }) => {
  const { t } = useTranslation();
  const [profiles, setProfiles] = useState<LlmProfileStatus[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canPro, setCanPro] = useState(true);
  const unlistenRef = useRef<UnlistenFn | null>(null);

  const refreshProfiles = () =>
    invoke<LlmProfileStatus[]>("get_local_llm_profiles")
      .then(setProfiles)
      .catch(() => setProfiles([]));

  useEffect(() => {
    refreshProfiles();
    invoke<{ features: Record<string, boolean> }>("get_license_status")
      .then((s) => setCanPro(s.features?.power_profiles ?? true))
      .catch(() => setCanPro(true));
    return () => {
      unlistenRef.current?.();
    };
  }, []);

  const activeId = currentModel ?? null;

  const apply = async (profileId: string) => {
    const profile = profiles.find((candidate) => candidate.id === profileId);
    if (!profile?.is_supported) return;
    if (LOCKED_PROFILES.has(profileId) && !canPro) return;
    setBusyId(profileId);
    setError(null);
    setProgress({
      stage: "checking",
      profile_id: profileId,
      downloaded: 0,
      total: 0,
      percentage: -1,
    });
    unlistenRef.current = await listen<Progress>("llm-download-progress", (e) =>
      setProgress(e.payload),
    );
    try {
      await invoke("activate_local_llm_profile", { profileId });
      await invoke("change_post_process_model_setting", {
        providerId: LOCAL_LLM_PROVIDER_ID,
        model: profileId,
      });
      await invoke("set_post_process_provider", {
        providerId: LOCAL_LLM_PROVIDER_ID,
      });
      await refreshProfiles();
      onApplied?.();
    } catch (e) {
      setError(typeof e === "string" ? e : "Échec de l'activation du profil.");
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
        {profiles.map((profile) => {
          const meta = PROFILE_META[profile.id];
          if (!meta) return null;
          const active = activeId === profile.id;
          const locked = LOCKED_PROFILES.has(profile.id) && !canPro;
          const unavailable = !profile.is_supported;
          return (
            <button
              key={profile.id}
              disabled={busyId !== null || locked || unavailable}
              onClick={() => apply(profile.id)}
              className={`rounded-lg border p-2.5 text-left transition-colors ${
                active
                  ? "border-accent bg-accent/10"
                  : "border-hairline hover:bg-mid-gray/10"
              } ${locked || unavailable ? "opacity-70 cursor-not-allowed" : ""}`}
            >
              <div className="text-sm font-semibold flex items-center gap-1">
                {meta.label}
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
              <div className="text-[11px] text-text-secondary">{meta.desc}</div>
              <div className="text-[11px] text-text-secondary mt-0.5">
                {profile.approx_size_mb >= 1000
                  ? `${(profile.approx_size_mb / 1000).toFixed(1)} Go`
                  : `${profile.approx_size_mb} Mo`}
                {profile.is_downloaded &&
                  ` · ${t("settings.postProcessing.powerProfile.downloaded")}`}
              </div>
              {profile.is_recommended && (
                <div
                  className="text-[10px] font-semibold mt-1"
                  style={{ color: "var(--color-accent)" }}
                >
                  {t("settings.postProcessing.powerProfile.recommended")}
                </div>
              )}
              {LOCKED_PROFILES.has(profile.id) && (
                <TierBadge feature="power_profiles" className="mt-1.5" />
              )}
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-text-secondary">
        {t("settings.postProcessing.powerProfile.sameOnAllTiers")}
      </p>

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
            {progress.stage === "engine"
              ? t("settings.postProcessing.powerProfile.downloadingEngine")
              : t("settings.postProcessing.powerProfile.downloadingModel")}
            {pct !== null ? ` — ${Math.round(pct)} %` : ""}
          </span>
        </div>
      )}

      {error && (
        <span className="text-xs" style={{ color: "var(--color-danger)" }}>
          {error}
        </span>
      )}
    </div>
  );
};

export default PowerProfileSelector;
