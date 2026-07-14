import React, { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Button } from "../../ui/Button";

// Modèle local par défaut installé en un clic (léger, bon en français).
const DEFAULT_OLLAMA_MODEL = "qwen2.5:3b";

type InstallProgress = {
  stage: string;
  percentage: number;
  message: string;
};

type OllamaStatus = {
  running: boolean;
  models: string[];
};

/**
 * Installation « clé-en-main » d'Ollama (l'Intelligence privée locale de Nova),
 * en un clic et avec barre de progression dans l'app — comme le téléchargement
 * des modèles. Appelle les commandes Rust en `invoke` brut (indépendant de
 * bindings.ts) et écoute l'événement `ollama-install-progress`.
 */
export const OllamaInstaller: React.FC<{ onReady?: () => void }> = ({
  onReady,
}) => {
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);

  const refresh = async () => {
    try {
      setStatus(await invoke<OllamaStatus>("ollama_status"));
    } catch {
      setStatus({ running: false, models: [] });
    }
  };

  useEffect(() => {
    refresh();
    return () => {
      unlistenRef.current?.();
    };
  }, []);

  const install = async () => {
    setBusy(true);
    setError(null);
    setProgress({ stage: "checking", percentage: -1, message: "Préparation…" });

    unlistenRef.current = await listen<InstallProgress>(
      "ollama-install-progress",
      (e) => setProgress(e.payload),
    );

    try {
      await invoke("install_ollama_engine", { model: DEFAULT_OLLAMA_MODEL });
      // Rendre l'Intelligence privée directement utilisable.
      try {
        await invoke("change_post_process_model_setting", {
          providerId: "ollama",
          model: DEFAULT_OLLAMA_MODEL,
        });
        await invoke("set_post_process_provider", { providerId: "ollama" });
      } catch {
        // Réglages non critiques : l'installation a réussi malgré tout.
      }
      await refresh();
      onReady?.();
    } catch (e) {
      setError(typeof e === "string" ? e : "Échec de l'installation d'Ollama.");
    } finally {
      unlistenRef.current?.();
      unlistenRef.current = null;
      setBusy(false);
      setProgress(null);
    }
  };

  const installed = status?.running === true;
  const pct = progress && progress.percentage >= 0 ? progress.percentage : null;

  return (
    <div className="rounded-lg border border-hairline bg-inset/40 p-3 mx-4 my-1">
      {installed ? (
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: "var(--color-success)" }}
          />
          <span className="text-sm font-medium">
            Intelligence privée installée
          </span>
          {status && status.models.length > 0 && (
            <span className="text-xs text-text-secondary truncate">
              · {status.models.join(", ")}
            </span>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-sm font-medium">
                Installer l'Intelligence privée (Ollama)
              </span>
              <span className="text-xs text-text-secondary">
                Reformulation 100 % locale, sans clé — installée en un clic.
              </span>
            </div>
            <Button
              variant="primary"
              size="md"
              onClick={install}
              disabled={busy}
            >
              {busy ? "Installation…" : "Installer"}
            </Button>
          </div>

          {busy && progress && (
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

          {error && (
            <span className="text-xs" style={{ color: "var(--color-danger)" }}>
              {error}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default OllamaInstaller;
