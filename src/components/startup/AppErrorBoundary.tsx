import React from "react";
import i18next from "i18next";
import { relaunch } from "@tauri-apps/plugin-process";

/**
 * Le dernier filet entre une exception de rendu et une fenêtre blanche.
 *
 * Sans lui, une erreur levée pendant le rendu démonte l'arbre React : le DOM
 * se vide, la WebView reste ouverte, et l'utilisateur voit un rectangle blanc
 * sans le moindre indice. L'erreur, elle, ne part nulle part — la console de la
 * WebView n'est pas accessible dans un paquet installé.
 *
 * Ce composant ne répare rien. Il rend l'échec **visible et rapportable** :
 * un message compréhensible, le message technique tel quel, et un bouton pour
 * relancer.
 */

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/** Traduction défensive : le crash peut précéder l'initialisation d'i18n. */
function translate(key: string, fallback: string): string {
  try {
    const value = i18next.t(key, { defaultValue: fallback });
    return typeof value === "string" && value !== key ? value : fallback;
  } catch {
    return fallback;
  }
}

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Visible dans handy.log via le pont de logs, et dans la console de dev.
    console.error("Nova a échoué au rendu:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const title = translate(
      "startup.errorTitle",
      "Nova n'a pas réussi à s'afficher",
    );
    const body = translate(
      "startup.errorBody",
      "Une erreur est survenue au démarrage. Relancez Nova ; si l'écran revient, transmettez le message ci-dessous.",
    );
    const retry = translate("startup.retry", "Relancer Nova");
    const detail = `${error.name}: ${error.message}`;

    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-5 px-8 text-center">
        <div className="max-w-[520px] space-y-3">
          <h1 className="text-xl font-semibold text-text">{title}</h1>
          <p className="text-sm leading-relaxed text-text-secondary">{body}</p>
          <p className="break-words rounded-control bg-mid-gray/10 px-3 py-2 text-left font-mono text-xs text-text-secondary">
            {detail}
          </p>
        </div>
        <button
          type="button"
          className="inline-flex h-[var(--control-h-lg)] cursor-pointer items-center justify-center rounded-control border border-accent bg-accent px-[18px] text-sm font-semibold text-white"
          onClick={() => {
            relaunch().catch(() => window.location.reload());
          }}
        >
          {retry}
        </button>
      </div>
    );
  }
}
