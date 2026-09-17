import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";

import { commands } from "@/bindings";
import { showAttentionToast } from "@/lib/attentionNotifications";
import { isOrganizationMode } from "@/lib/mode";
import { refreshCampusContext, useCampusStore } from "@/stores/campusStore";

/** Émis par le backend quand l'organisation refuse une dictée (403). */
const ACCESS_FORBIDDEN_EVENT = "campus-access-forbidden";
/** Émis par le backend quand il refuse une dictée à un membre suspendu. */
const ACCESS_SUSPENDED_EVENT = "campus-access-suspended";

/**
 * Dit à un membre qu'il est suspendu, puis qu'il est rétabli.
 *
 * Renvoie `true` tant que l'organisation le suspend : l'application montre
 * alors un écran bloquant à la place de tout le reste.
 *
 * Une dictée refusée ne suffit pas à conclure : elle déclenche une lecture de
 * `/api/me`, seule autorité. Le passage d'un état à l'autre — et lui seul — est
 * annoncé, par le canal des alertes : l'annonce rejoint la pastille de la barre
 * latérale et survit à un regard distrait. Aucune donnée n'est touchée.
 */
export function useOrganizationSuspension(): boolean {
  const { t } = useTranslation();
  const suspended = useCampusStore((state) => state.suspended);

  useEffect(() => {
    if (!isOrganizationMode()) return;

    const unlisten = listen(ACCESS_FORBIDDEN_EVENT, () => {
      void refreshCampusContext();
    });
    // Une dictée refusée depuis la barre des tâches : la fenêtre revient là où
    // l'écran de suspension l'explique.
    const unlistenSuspended = listen(ACCESS_SUSPENDED_EVENT, () => {
      void commands.showMainWindowCommand();
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
      void unlistenSuspended.then((fn) => fn());
    };
  }, [t]);

  return isOrganizationMode() && suspended;
}
