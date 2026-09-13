/**
 * Un membre suspendu, tel que le serveur le dit.
 *
 * `/api/me` fait autorité : sur les routes d'un membre, le serveur ne répond
 * 403 que pour un compte suspendu. Tout le reste — hors ligne, panne, erreur
 * réseau, session expirée — ne prouve ni la suspension ni le rétablissement,
 * et l'état précédent reste. Un poste ne doit ni se croire suspendu parce que
 * le Wi-Fi a coupé, ni se croire rétabli parce que le serveur a planté.
 */

export type MeProbe =
  | { reachable: false }
  | {
      reachable: true;
      /** `"ok"` quand `/api/me` a répondu, sinon le statut HTTP (0 : réseau). */
      status: number | "ok";
    };

const SUSPENDED_STATUS = 403;

export function nextSuspended(previous: boolean, probe: MeProbe): boolean {
  if (!probe.reachable) return previous;
  if (probe.status === "ok") return false;
  if (probe.status === SUSPENDED_STATUS) return true;
  return previous;
}
