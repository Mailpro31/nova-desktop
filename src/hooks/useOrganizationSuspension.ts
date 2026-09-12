import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";

import { showAttentionToast } from "@/lib/attentionNotifications";
import { isOrganizationMode } from "@/lib/mode";
import { refreshCampusContext, useCampusStore } from "@/stores/campusStore";

/** Émis par le backend quand l'organisation refuse une dictée (403). */
const ACCESS_FORBIDDEN_EVENT = "campus-access-forbidden";

/**
 * Dit à un membre qu'il est suspendu, puis qu'il est rétabli.
 *
 * Une dictée refusée ne suffit pas à conclure : elle déclenche une lecture de
 * `/api/me`, seule autorité. Le passage d'un état à l'autre — et lui seul — est
 * annoncé, par le canal des alertes : l'annonce rejoint la pastille de la barre
 * latérale et survit à un regard distrait. Aucune donnée n'est touchée.
 */
export function useOrganizationSuspension(): void {
  const { t } = useTranslation();

  useEffect(() => {
    if (!isOrganizationMode()) return;

    const unlisten = listen(ACCESS_FORBIDDEN_EVENT, () => {
      void refreshCampusContext();
    });

    const unsubscribe = useCampusStore.subscribe((state, previous) => {
      if (state.suspended === previous.suspended) return;
      if (state.suspended) {
        showAttentionToast("warning", t("campus.suspended.title"), {
          description: t("campus.suspended.description"),
        });
      } else {
        showAttentionToast("info", t("campus.suspended.restored"));
      }
    });

    return () => {
      unsubscribe();
      void unlisten.then((fn) => fn());
    };
  }, [t]);
}
