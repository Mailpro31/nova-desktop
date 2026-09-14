import type { CampusSession } from "@/bindings";

/**
 * État de connexion Organization, sans React ni appel réseau.
 *
 * Tiré de `useCampusStatus` pour être vérifiable : c'est ici que se décide ce
 * que la page Organisation affiche sur la ligne « Connexion ».
 */

export type CampusConnection = "unknown" | "connected" | "local";

export interface CampusSnapshot {
  /** Session persistée, `null` hors connexion. */
  session: CampusSession | null;
  /** Dernière joignabilité mesurée du serveur de la session, `null` si aucune. */
  reachable: boolean | null;
}

/**
 * Nouvel état après relecture de la session persistée.
 *
 * La joignabilité mesurée n'a de sens que pour le serveur de la session qui
 * l'a mesurée. Sans session, ou avec la session d'un autre serveur, elle repart
 * de `null` : sinon la page Organisation continuait d'afficher « connecté »
 * après une déconnexion, puisque plus rien ne la remesure sans session.
 * Relire la même session garde la mesure, pour ne pas faire clignoter l'état.
 */
export function withSession(
  snapshot: CampusSnapshot,
  session: CampusSession | null,
): CampusSnapshot {
  const sameServer =
    session !== null &&
    snapshot.session !== null &&
    session.server_url === snapshot.session.server_url;
  return { session, reachable: sameServer ? snapshot.reachable : null };
}

/** Ce que la ligne « Connexion » doit dire. */
export function connectionOf(snapshot: CampusSnapshot): CampusConnection {
  return snapshot.reachable === null
    ? "unknown"
    : snapshot.reachable
      ? "connected"
      : "local";
}
