import type { OrganizationType } from "./model";

/**
 * Nature de l'organisation courante, résolue à l'exécution.
 *
 * ## Pourquoi ce module existe
 *
 * `currentEdition()` répond à une question de **build** : ce paquet est-il un
 * poste personnel ou un poste d'organisation ? Elle ne bouge jamais.
 *
 * « Éducation ou entreprise ? » est une question d'une tout autre nature : la
 * réponse appartient au **tenant**, pas au paquet installé. Deux entreprises et
 * deux écoles installent le même paquet Organization ; c'est le serveur qui sait
 * ce qu'elles sont. Tant que la réponse était codée en dur à `education`, un
 * poste d'entreprise se voyait refuser le chemin Organization et retombait dans
 * l'expérience Personal.
 *
 * ## Trois sources, dans cet ordre, jamais l'inverse
 *
 * 1. **`/api/me`** — l'autorité. Le serveur sait à quelle organisation le compte
 *    appartient et de quelle nature elle est. Aucune valeur locale ne l'écrase.
 * 2. **`/api/config`** — l'amorçage. Avant toute authentification, le poste doit
 *    déjà savoir quoi afficher ; la configuration publique de l'organisation le
 *    lui dit. Ce n'est pas une identité : c'est ce que le déploiement annonce.
 * 3. **`education`** — le repli historique. Un poste Campus déjà installé, servi
 *    par un serveur trop ancien pour annoncer quoi que ce soit, doit continuer à
 *    se comporter exactement comme avant.
 *
 * ## Le miroir localStorage
 *
 * Le thème est appliqué avant que React ne monte, donc avant qu'aucune réponse
 * serveur ne soit revenue. Sans mémoire, un poste d'entreprise afficherait une
 * frame de direction artistique Campus à chaque démarrage. La dernière nature
 * connue est donc recopiée en `localStorage` — exactement le procédé déjà
 * employé pour le thème lui-même (`theme.ts`), et pour la même raison.
 *
 * Ce miroir n'est **pas** une autorité : il ne fait que se souvenir de ce que le
 * serveur avait dit, et la première réponse suivante le corrige. Il ne porte
 * aucun secret — la nature d'une organisation n'en est pas un.
 */

const STORAGE_KEY = "nova.organizationType";

function isOrganizationType(value: unknown): value is OrganizationType {
  return value === "education" || value === "business";
}

/**
 * Nature retenue pour cette session, une fois qu'une source l'a annoncée.
 *
 * En mémoire d'abord : le module est chargé une fois, et une lecture de
 * `localStorage` par appel de `isCampusMode()` — appelée pendant le rendu —
 * serait du travail synchrone inutile à chaque frame.
 */
let announced: OrganizationType | null = null;

/**
 * Retient ce qu'une source a annoncé.
 *
 * `null` — serveur muet, hors ligne, contrat plus ancien — n'efface rien : une
 * absence d'information n'est pas une information. Seule `forget()` efface,
 * et seulement à la déconnexion.
 */
export function rememberOrganizationType(
  value: OrganizationType | string | null | undefined,
): void {
  if (!isOrganizationType(value)) return;
  announced = value;
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Mode privé, quota : le comportement de la session reste correct, seul le
    // prochain démarrage repartira du repli.
  }
}

/**
 * Oublie la nature mémorisée.
 *
 * Appelé à la déconnexion : le poste ne doit pas continuer à se présenter comme
 * l'organisation qu'il servait pour quelqu'un qui n'y appartient plus.
 */
export function forgetOrganizationType(): void {
  announced = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Ce que la dernière source a annoncé, `null` si aucune ne l'a fait. */
export function announcedOrganizationType(): OrganizationType | null {
  if (announced !== null) return announced;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isOrganizationType(stored)) {
      announced = stored;
      return stored;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Nature de l'organisation à supposer en édition Organization.
 *
 * Le repli est `education` et non `business` : c'est le comportement de tous les
 * postes déjà déployés, et un défaut qui change le comportement d'un parc
 * existant n'est pas un défaut, c'est une régression.
 */
export const FALLBACK_ORGANIZATION_TYPE: OrganizationType = "education";

/** Nature courante, repli compris. Appelée par `currentOrganizationType()`. */
export function resolvedOrganizationType(): OrganizationType {
  return announcedOrganizationType() ?? FALLBACK_ORGANIZATION_TYPE;
}
