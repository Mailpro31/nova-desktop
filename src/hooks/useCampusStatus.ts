import { useCallback, useEffect, useState } from "react";

import { isServerReachable } from "@/lib/campusApi";
import { loadCampusSession, type CampusSession } from "@/lib/campusSession";
import { isOrganizationMode } from "@/lib/mode";

/** Intervalle de re-vérification de la joignabilité du serveur. */
const POLL_MS = 30_000;

export type CampusConnection = "unknown" | "connected" | "local";

export interface CampusStatus {
  /** Session campus persistée, `null` en mode personnel ou avant chargement. */
  session: CampusSession | null;
  /** `unknown` tant que la première vérification n'a pas répondu. */
  connection: CampusConnection;
  /** Hôte du serveur de l'établissement, prêt à afficher. */
  serverName: string | null;
  /** Relit la session : à appeler après une déconnexion ou une expiration. */
  refresh: () => Promise<void>;
}

interface Snapshot {
  session: CampusSession | null;
  reachable: boolean | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sondage unique, partagé
//
// Le hook était auparavant autonome : chaque montage ouvrait sa propre
// minuterie. Or l'accueil campus en monte cinq à la fois — App, la barre
// latérale, l'état d'accueil, l'organisation, la disponibilité système — soit
// cinq `GET /api/health` toutes les 30 secondes par poste, alors que la
// commande Rust correspondante n'est pas mise en cache. À l'échelle d'un
// établissement, cela produit une charge continue pour une information unique.
//
// L'état vit donc ici, hors React : une minuterie tant qu'au moins un
// composant écoute, aucune dès que le dernier se démonte.
// ─────────────────────────────────────────────────────────────────────────────

let snapshot: Snapshot = { session: null, reachable: null };
const subscribers = new Set<(next: Snapshot) => void>();
let timer: number | undefined;
let inFlight = false;

function publish(next: Snapshot) {
  snapshot = next;
  for (const notify of subscribers) notify(next);
}

async function loadSession() {
  const session = await loadCampusSession();
  publish({ ...snapshot, session });
}

async function checkReachability() {
  const { session } = snapshot;
  if (!session || inFlight) return;
  inFlight = true;
  try {
    publish({
      ...snapshot,
      reachable: await isServerReachable(session.server_url),
    });
  } catch {
    publish({ ...snapshot, reachable: false });
  } finally {
    inFlight = false;
  }
}

function start() {
  if (timer !== undefined) return;
  timer = window.setInterval(() => void checkReachability(), POLL_MS);
}

function stop() {
  window.clearInterval(timer);
  timer = undefined;
}

/**
 * Source unique de l'état de connexion campus.
 *
 * Tous les consommateurs partagent une seule session, une seule vérification
 * et une seule minuterie : le nombre de composants montés ne change pas le
 * trafic réseau.
 */
export function useCampusStatus(): CampusStatus {
  const [local, setLocal] = useState<Snapshot>(snapshot);

  useEffect(() => {
    if (!isOrganizationMode()) return;

    subscribers.add(setLocal);
    // Le premier abonné amorce ; les suivants héritent de l'état courant.
    if (subscribers.size === 1) {
      void loadSession().then(() => void checkReachability());
      start();
    } else {
      setLocal(snapshot);
    }

    return () => {
      subscribers.delete(setLocal);
      if (subscribers.size === 0) stop();
    };
  }, []);

  const refresh = useCallback(async () => {
    await loadSession();
    await checkReachability();
  }, []);

  const serverName = local.session
    ? (() => {
        try {
          return new URL(local.session.server_url).hostname;
        } catch {
          return local.session.server_url;
        }
      })()
    : null;

  const connection: CampusConnection =
    local.reachable === null
      ? "unknown"
      : local.reachable
        ? "connected"
        : "local";

  return { session: local.session, connection, serverName, refresh };
}
