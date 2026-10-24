import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowUpRight, Check } from "lucide-react";

import { AppLogo } from "@/components/shared/AppLogo";
import { CONNECTIONS, connectionById } from "@/lib/bubble/connections";
import {
  CHOSEN_GROUPS,
  loadBubblePreferences,
  saveBubblePreferences,
  type BubblePreferences,
  type ChosenGroup,
} from "@/lib/bubble/preferences";

/** La page d'accueil d'une application, pour s'y connecter. */
export function homeOf(url: string): string {
  const base = url.split("{q}")[0];
  return base.startsWith("http") ? new URL(base).origin : base;
}

/**
 * « Vos applications » : une application par usage, et la connexion une fois
 * pour toutes (demande de Sash, 24/10). Une IA ou un site qui demande de se
 * connecter perd la question passée dans l'adresse ; connecté d'avance,
 * l'élève n'a plus rien à coller. Sert au premier lancement et dans Connexions.
 */
export const AppsSetup: React.FC = () => {
  const { t } = useTranslation();
  const [preferences, setPreferences] = useState(loadBubblePreferences);

  const update = (next: BubblePreferences) => {
    setPreferences(next);
    saveBubblePreferences(next);
  };
  const choose = (group: ChosenGroup, id: string) =>
    update({ ...preferences, apps: { ...preferences.apps, [group]: id } });
  const toggleConnected = (id: string) =>
    update({
      ...preferences,
      connected: preferences.connected.includes(id)
        ? preferences.connected.filter((c) => c !== id)
        : [...preferences.connected, id],
    });

  return (
    <div className="divide-y divide-hairline">
      {CHOSEN_GROUPS.map((group) => {
        const chosen = connectionById(preferences.apps[group]);
        const connected = !!chosen && preferences.connected.includes(chosen.id);
        return (
          <section key={group} className="px-4 py-3.5">
            <h3 className="text-sm font-semibold text-text">
              {t(`bubble.group.${group}`)}
            </h3>
            <div role="radiogroup" className="mt-2 flex flex-wrap gap-1.5">
              {CONNECTIONS.filter((c) => c.group === group).map(
                (connection) => {
                  const selected = connection.id === chosen?.id;
                  return (
                    <button
                      key={connection.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => choose(group, connection.id)}
                      className={`flex items-center gap-2 rounded-full border py-1.5 pe-3 ps-2 text-sm transition-colors duration-[120ms] cursor-pointer ${
                        selected
                          ? "border-accent bg-accent/10 text-text"
                          : "border-hairline text-text-secondary hover:border-accent/40"
                      }`}
                    >
                      <AppLogo connection={connection} size={18} />
                      {connection.name}
                    </button>
                  );
                },
              )}
            </div>
            {chosen && (
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void openUrl(homeOf(chosen.url))}
                  className="flex items-center gap-1.5 rounded-control border border-hairline px-3 py-1.5 text-sm text-text transition-colors duration-[120ms] hover:bg-mid-gray/10 cursor-pointer"
                >
                  {t("bubble.setup.signIn", { app: chosen.name })}
                  <ArrowUpRight size={14} className="text-text-secondary" />
                </button>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={connected}
                  onClick={() => toggleConnected(chosen.id)}
                  className={`flex items-center gap-1.5 rounded-control px-3 py-1.5 text-sm transition-colors duration-[120ms] cursor-pointer ${
                    connected
                      ? "bg-accent/10 font-medium text-accent"
                      : "text-text-secondary hover:bg-mid-gray/10"
                  }`}
                >
                  <Check size={15} className={connected ? "" : "opacity-40"} />
                  {t("bubble.setup.connected")}
                </button>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
};
