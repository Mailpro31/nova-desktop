import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { commands } from "@/bindings";
import { isOrganizationMode } from "@/lib/mode";
import { showAttentionToast } from "@/lib/attentionNotifications";
import {
  changesBetween,
  mergeMarkers,
  readSeenMarkers,
  rememberMarkers,
  type CatalogMarkers,
  type OrganizationChange,
} from "@/lib/organization/updates";
import { refreshCampusContext, useCampusStore } from "@/stores/campusStore";

/**
 * Toutes les cinq minutes. Assez court pour qu'une publication faite pendant
 * une réunion soit là en sortant, assez long pour qu'un poste allumé la
 * journée ne fasse pas de son serveur une préoccupation.
 */
const INTERVAL_MS = 5 * 60 * 1000;

/**
 * Va rechercher le contenu de l'organisation, puis dit ce qui a changé.
 *
 * L'ordre compte : on **applique** d'abord, on annonce ensuite. Une annonce
 * qui précède le contenu envoie l'utilisateur chercher quelque chose qui n'est
 * pas encore arrivé.
 */
async function probe(): Promise<CatalogMarkers> {
  const packages = await refreshCampusContext()
    .then(
      () =>
        useCampusStore.getState().organizationCatalog?.catalog_version ?? null,
    )
    .catch(() => null);

  const lessons = await commands
    .fetchLearningCatalog()
    .then((r) => (r.status === "ok" ? String(r.data.catalog_version) : null))
    .catch(() => null);

  return { packages, lessons };
}

/**
 * Prévient quand l'organisation publie quelque chose.
 *
 * Avant ce guichet, le catalogue de l'organisation n'était chargé qu'une fois,
 * au lancement. Un AI Skill ou un Style publié en cours de journée n'arrivait
 * sur le poste qu'au redémarrage suivant — et rien n'indiquait qu'il fallait
 * redémarrer. C'est ce qui a fait dire, à juste titre, qu'un ajout « ne
 * s'était pas ajouté ».
 *
 * L'annonce passe par le même canal que les alertes système : elle rejoint la
 * pastille de la barre latérale, donc elle survit à un regard distrait.
 */
export function useOrganizationUpdates(): void {
  const { t } = useTranslation();
  // Une sonde à la fois. Deux fenêtres qui reprennent le focus ensemble ne
  // doivent pas produire deux annonces du même contenu.
  const running = useRef(false);

  useEffect(() => {
    if (!isOrganizationMode()) return;

    let stopped = false;

    const announce = (changes: OrganizationChange[]) => {
      const what = changes
        .map((c) => t(`campus.updates.${c}`))
        .join(t("campus.updates.separator"));
      showAttentionToast("info", t("campus.updates.title"), {
        description: t("campus.updates.description", { what }),
      });
    };

    const look = async () => {
      if (running.current || stopped) return;
      // Sans session, il n'y a pas d'organisation à interroger : sonder
      // ferait un aller-retour réseau pour un refus. Tant que le store n'a
      // rien chargé, en revanche, l'absence de session ne prouve rien — et
      // c'est justement l'état du tout premier passage, celui qui rattrape ce
      // qui a été publié pendant que l'application était fermée.
      const campus = useCampusStore.getState();
      if (campus.initialized && campus.session === null) return;
      running.current = true;
      try {
        const current = await probe();
        if (stopped) return;
        const seen = readSeenMarkers();
        const changes = changesBetween(seen, current);
        rememberMarkers(mergeMarkers(seen, current));
        if (changes.length > 0) announce(changes);
      } finally {
        running.current = false;
      }
    };

    // Le premier passage sert de repère : au tout premier lancement il
    // n'annonce rien (voir `changesBetween`), mais il détecte ce qui a été
    // publié pendant que l'application était fermée.
    void look();

    const timer = setInterval(() => void look(), INTERVAL_MS);
    // Revenir sur l'application est le moment où l'on s'attend le plus à
    // trouver ce qui vient d'être publié.
    const onFocus = () => void look();
    window.addEventListener("focus", onFocus);

    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [t]);
}
