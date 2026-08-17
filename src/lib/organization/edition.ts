import type { Edition, OrganizationType } from "./model";

/**
 * Ce que le **build** déclare, et rien de plus.
 *
 * Aujourd'hui, `VITE_NOVA_MODE=campus` est le seul signal disponible : le
 * paquet installé décide à la fois du mode de déploiement et de la nature de
 * l'organisation. C'est une coïncidence de l'étape actuelle, pas une règle —
 * un build Organization devra demain servir aussi bien l'éducation que
 * l'entreprise, la distinction venant alors de la configuration déposée par la
 * DSI ou du serveur.
 *
 * Les deux questions sont donc déjà séparées ici, pour que la seconde puisse
 * changer de source sans toucher aux appelants de la première.
 */

function rawBuildMode(): string | undefined {
  // `import.meta.env` n'existe pas hors du bundle Vite (tests unitaires bun,
  // scripts). L'absence de valeur signifie « édition personnelle ».
  return import.meta.env?.VITE_NOVA_MODE;
}

/** Édition déclarée par le build. */
export function currentEdition(): Edition {
  return rawBuildMode() === "campus" ? "organization" : "personal";
}

/**
 * Nature de l'organisation, `null` en édition Personal.
 *
 * Le build Campus historique implique `education`. Aucune autre valeur n'est
 * atteignable : Business n'a ni build, ni configuration, ni interface.
 */
export function currentOrganizationType(): OrganizationType | null {
  return currentEdition() === "organization" ? "education" : null;
}
