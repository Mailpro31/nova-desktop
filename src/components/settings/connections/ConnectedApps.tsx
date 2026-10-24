import React from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";

import { AppLogo } from "@/components/shared/AppLogo";
import { CONNECTIONS, GROUP_ORDER } from "@/lib/bubble/connections";

/**
 * Les applications que la bulle de sélection sait atteindre, rangées par
 * usage. Un clic ouvre le site, pour s'y connecter une fois : la bulle y
 * enverra ensuite le texte en un clic.
 */
export const ConnectedApps: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="space-y-4 px-4 py-3">
      {GROUP_ORDER.map((group) => (
        <section key={group}>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
            {t(`bubble.group.${group}`)}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {CONNECTIONS.filter((c) => c.group === group).map((connection) => (
              <button
                key={connection.id}
                type="button"
                onClick={() => {
                  const url = connection.url.split("{q}")[0];
                  void openUrl(
                    url.startsWith("http") ? new URL(url).origin : url,
                  );
                }}
                className="flex items-center gap-2 rounded-full border border-hairline py-1.5 pe-3 ps-2 text-sm text-text transition-colors duration-[120ms] hover:border-accent/40 hover:bg-accent/5 cursor-pointer"
              >
                <AppLogo connection={connection} size={18} />
                {connection.name}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};
