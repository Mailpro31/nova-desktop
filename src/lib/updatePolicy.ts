/**
 * Ce que le poste fait des mises à jour.
 *
 * La DSI choisit la politique dans la console (profil de déploiement), et
 * l'installation la dépose dans la stratégie machine : `manual`, `notify` ou
 * `automatic`. `manual` veut dire que la DSI déploie elle-même chaque version :
 * le poste ne doit alors ni chercher ni proposer de mise à jour, sinon l'élève
 * installerait une version que l'école n'a pas validée.
 *
 * Un poste non géré (installé depuis le lien) n'a pas de politique : il
 * prévient, comme avant.
 */

/** Une vérification toutes les 6 heures : Nova reste des jours dans la zone de notification. */
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function updatesAllowedByPolicy(
  updatePolicy: string | null | undefined,
): boolean {
  return updatePolicy !== "manual";
}

/**
 * Prévenir une seule fois par version : une notification à chaque
 * vérification finirait ignorée, ou désactivée.
 */
export function shouldNotify(
  version: string,
  lastNotified: string | null,
): boolean {
  return version !== "" && version !== lastNotified;
}
