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
  whatToReload,
  type CatalogMarkers,
  type ChangeMarkers,
  type OrganizationChange,
} from "@/lib/organization/updates";
import { refreshCampusContext, useCampusStore } from "@/stores/campusStore";
import { useLearningStore } from "@/stores/learningStore";

/**
 * Rafraîchissement complet toutes les cinq minutes. C'est aussi le seul rythme
 * face à un serveur qui ne connaît pas encore `/api/organization/changes`.
 */
const INTERVAL_MS = 5 * 60 * 1000;

/**
 * Sonde légère toutes les trente secondes : trois repères, aucun contenu. Un
 * changement fait dans la console arrive ainsi en moins d'une minute, sans
 * que chaque poste allumé recharge tout en permanence.
 */
const CHANGES_INTERVAL_MS = 30 * 1000;

/** Les repères légers, ou `null` si le serveur ne les donne pas. */
async function readChanges(): Promise<ChangeMarkers | null> {
  try {
    const result = await commands.fetchOrganizationChanges();
    return result.status === "ok" && result.data ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * Va rechercher le contenu de l'organisation, puis dit ce qui a changé.
 *
 * L'ordre compte : on **applique** d'abord, on annonce ensuite. Une annonce
 * qui précède le contenu envoie l'utilisateur chercher quelque chose qui n'est
 * pas encore arrivé.
 *
 * Le repère des leçons est `learning_version` quand le serveur le donne : lui
 * seul bouge quand l'organisation archive une leçon ou la rend obligatoire.
 */
async function probe(learningVersion: string | null): Promise<CatalogMarkers> {
  const packages = await refreshCampusContext()
    .then(
      () =>
        useCampusStore.getState().organizationCatalog?.catalog_version ?? null,
    )
    .catch(() => null);

  const lessons =
    learningVersion ??
    (await commands
      .fetchLearningCatalog()
      .then((r) => (r.status === "ok" ? String(r.data.catalog_version) : null))
      .catch(() => null));

  return { packages, lessons };
}

/**
 * Applique ce que l'organisation change, et prévient quand elle publie.
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
  // Les derniers repères légers vus pendant cette session.
  const lastChanges = useRef<ChangeMarkers | null>(null);

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

    // Sans session, il n'y a pas d'organisation à interroger : sonder ferait
    // un aller-retour réseau pour un refus. Tant que le store n'a rien chargé,
    // en revanche, l'absence de session ne prouve rien — et c'est justement
    // l'état du tout premier passage, celui qui rattrape ce qui a été publié
    // pendant que l'application était fermée.
    const signedOut = () => {
      const campus = useCampusStore.getState();
      return campus.initialized && campus.session === null;
    };

    const look = async (changes: ChangeMarkers | null) => {
      if (running.current || stopped || signedOut()) return;
      running.current = true;
      try {
        const current = await probe(changes?.learning_version ?? null);
        if (stopped) return;
        const seen = readSeenMarkers();
        const found = changesBetween(seen, current);
        rememberMarkers(mergeMarkers(seen, current));
        if (found.length > 0) announce(found);
      } finally {
        running.current = false;
      }
    };

    const full = async () => {
      if (running.current || stopped || signedOut()) return;
      const changes = await readChanges();
      if (changes) lastChanges.current = changes;
      await look(changes);
    };

    const quick = async () => {
      if (running.current || stopped || signedOut()) return;
      const changes = await readChanges();
      if (!changes || stopped) return;
      const reload = whatToReload(lastChanges.current, changes);
      lastChanges.current = changes;
      if (reload.length === 0) return;

      if (reload.includes("policy") || reload.includes("profile")) {
        // Capacités, catégories et durée maximale de dictée : la configuration
        // est relue, et `/api/me` transmet la limite au moteur de dictée.
        await refreshCampusContext().catch(() => {});
        await commands.getCampusMe().catch(() => null);
      }
      if (
        reload.includes("lessons") &&
        useLearningStore.getState().catalog !== null
      ) {
        await useLearningStore.getState().loadCatalog();
      }
      if (reload.includes("packages") || reload.includes("lessons")) {
        await look(changes);
      }
    };

    // Le premier passage sert de repère : au tout premier lancement il
    // n'annonce rien (voir `changesBetween`), mais il détecte ce qui a été
    // publié pendant que l'application était fermée.
    void full();

    const fullTimer = setInterval(() => void full(), INTERVAL_MS);
    const quickTimer = setInterval(() => void quick(), CHANGES_INTERVAL_MS);
    // Revenir sur l'application est le moment où l'on s'attend le plus à
    // trouver ce qui vient d'être publié — et celui où un membre réactivé
    // doit retrouver son organisation. Le passage complet relit le contexte
    // et `/api/me` ; la sonde légère, elle, ne sait rien d'une suspension, et
    // ne répond pas du tout face à un serveur plus ancien.
    const onFocus = () => void full();
    window.addEventListener("focus", onFocus);

    return () => {
      stopped = true;
      clearInterval(fullTimer);
      clearInterval(quickTimer);
      window.removeEventListener("focus", onFocus);
    };
  }, [t]);
}
