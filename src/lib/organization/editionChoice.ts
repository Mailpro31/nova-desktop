import type { Edition } from "./model";

/**
 * Le choix d'édition, quand le paquet ne tranche pas lui-même.
 *
 * ## Pourquoi ce module existe
 *
 * Jusqu'ici l'édition venait entièrement du build : `VITE_NOVA_MODE` décidait,
 * et un utilisateur qui téléchargeait le mauvais paquet n'avait aucun recours.
 * Un paquet unifié — celui qui ne déclare rien — doit pouvoir poser la question
 * une fois et s'en souvenir.
 *
 * ## Ce que ce module ne change pas
 *
 * **Un paquet qui déclare son édition n'est jamais consulté ici.** Les postes
 * Organization déjà déployés ignorent totalement ce choix : leur édition reste
 * décidée à la compilation, immuable, connue avant tout réseau. C'est ce qui
 * rend ce changement sans effet sur un parc existant.
 *
 * ## Pourquoi ce n'est pas une étape du parcours
 *
 * `isOrganizationMode()` est appelée pendant le rendu, et le parcours
 * d'accueil **fige** sa liste d'étapes dès que l'état système est connu. Si le
 * choix arrivait au milieu de ce parcours, la liste serait déjà arrêtée et
 * l'étape de connexion Organization n'y figurerait pas. Le choix est donc une
 * porte placée **avant** le parcours, jamais une étape dedans.
 *
 * ## Ce qu'il n'est pas
 *
 * Ce choix n'accorde aucun accès et ne désigne aucune organisation. Il dit
 * quelle expérience présenter, pas à qui l'on a affaire : un poste qui choisit
 * « Organisation » doit encore découvrir son organisation et s'y authentifier.
 * Il ne contient donc aucun secret, et le lire n'apprend rien d'exploitable.
 */

const STORAGE_KEY = "nova.editionChoice";

/**
 * L'intention exprimée sous « Organisation ».
 *
 * **Affichage uniquement.** La nature réelle d'une organisation appartient au
 * tenant vérifié — voir `organizationType.ts`. Si un utilisateur choisit
 * « entreprise » et que le serveur annonce `education`, c'est le serveur qui a
 * raison, sans discussion et sans message d'erreur : personne ne doit pouvoir
 * s'attribuer un type d'organisation en cochant une case.
 */
export type OrganizationKindIntent = "campus" | "business";

const INTENT_KEY = "nova.organizationKindIntent";

export type EditionChoice = Extract<Edition, "personal" | "organization">;

function isEditionChoice(value: unknown): value is EditionChoice {
  return value === "personal" || value === "organization";
}

function isKindIntent(value: unknown): value is OrganizationKindIntent {
  return value === "campus" || value === "business";
}

/**
 * Valeur retenue pour cette session.
 *
 * En mémoire d'abord : `currentEdition()` est appelée pendant le rendu, et
 * relire `localStorage` à chaque frame serait du travail synchrone inutile.
 * C'est le procédé déjà employé par `organizationType.ts`, pour la même raison.
 */
let chosen: EditionChoice | null = null;
let intent: OrganizationKindIntent | null = null;

/** Ce que l'utilisateur a choisi, `null` s'il n'a pas encore choisi. */
export function chosenEdition(): EditionChoice | null {
  if (chosen !== null) return chosen;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isEditionChoice(stored)) {
      chosen = stored;
      return stored;
    }
  } catch {
    // Mode privé, quota : la session reste correcte, la question sera reposée
    // au prochain démarrage. Reposer la question est bénin ; deviner ne l'est pas.
  }
  return null;
}

/**
 * Enregistre le choix.
 *
 * Écrit une fois, au moment où l'utilisateur répond. Rien d'autre dans
 * l'application n'appelle cette fonction : l'édition ne doit pas se mettre à
 * changer sous les pieds d'un écran déjà monté.
 */
export function rememberEditionChoice(value: EditionChoice): void {
  chosen = value;
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // ignore
  }
}

/** Intention Campus / Entreprise, `null` si aucune n'a été exprimée. */
export function organizationKindIntent(): OrganizationKindIntent | null {
  if (intent !== null) return intent;
  try {
    const stored = localStorage.getItem(INTENT_KEY);
    if (isKindIntent(stored)) {
      intent = stored;
      return stored;
    }
  } catch {
    // ignore
  }
  return null;
}

export function rememberOrganizationKindIntent(
  value: OrganizationKindIntent,
): void {
  intent = value;
  try {
    localStorage.setItem(INTENT_KEY, value);
  } catch {
    // ignore
  }
}

/**
 * Oublie le choix et l'intention.
 *
 * Destiné à une réinitialisation explicite. Ne pas l'appeler à la déconnexion :
 * quelqu'un qui se déconnecte de son organisation reste sur un poste
 * d'organisation, et lui reposer la question ferait passer une déconnexion
 * ordinaire pour une réinstallation.
 */
export function forgetEditionChoice(): void {
  chosen = null;
  intent = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(INTENT_KEY);
  } catch {
    // ignore
  }
}
