import { chosenEdition } from "./editionChoice";
import type { Edition, OrganizationType } from "./model";
import { resolvedOrganizationType } from "./organizationType";

/**
 * Ce que le **build** déclare, et ce que le **tenant** décide.
 *
 * Deux questions, deux sources, et c'est toute l'affaire de ce module :
 *
 * | Question | Source | Change à l'exécution ? |
 * |---|---|---|
 * | poste personnel ou poste d'organisation ? | le paquet installé | non |
 * | ... si le paquet ne déclare rien | le choix de l'utilisateur, une fois | non |
 * | éducation ou entreprise ? | le serveur du tenant | oui |
 *
 * Les confondre est exactement ce qui empêchait Business d'exister : un paquet
 * Organization signifiait « école », donc une entreprise n'avait pas de paquet.
 * Un seul installeur Organization sert désormais les deux, et la nature vient
 * de l'organisation qui répond — voir `organizationType.ts`.
 */

function rawBuildMode(): string | undefined {
  // `import.meta.env` n'existe pas hors du bundle Vite (tests unitaires bun,
  // scripts). L'absence de valeur signifie « édition personnelle ».
  return import.meta.env?.VITE_NOVA_MODE;
}

/**
 * Édition déclarée par le build.
 *
 * `campus` reste accepté comme **alias historique** de `organization` : c'est la
 * valeur qu'emploient la CI Windows validée et les paquets déjà signés, et la
 * renommer aurait invalidé une chaîne de build éprouvée pour un gain purement
 * cosmétique. Les deux désignent le même produit — un poste géré par une
 * organisation, quelle que soit sa nature.
 */
/**
 * Le paquet tranche-t-il lui-même son édition ?
 *
 * Vrai pour tout paquet déjà distribué — `campus`, `organization`, `personal`.
 * Faux uniquement pour un paquet unifié, et c'est le seul cas où la question
 * doit être posée à l'utilisateur.
 */
export function declaresEdition(): boolean {
  const mode = rawBuildMode();
  return mode === "campus" || mode === "organization" || mode === "personal";
}

export function currentEdition(): Edition {
  const mode = rawBuildMode();
  if (mode === "campus" || mode === "organization") return "organization";
  // Un paquet qui se déclare `personal` reste personnel : il n'a pas de code
  // Organization à offrir, et poser la question mènerait à un cul-de-sac.
  if (mode === "personal") return "personal";
  // Paquet unifié — aucune déclaration de build. C'est le seul cas où le choix
  // de l'utilisateur décide, et `personal` reste le repli tant qu'il n'a pas
  // répondu : c'est le comportement historique d'un build sans `VITE_NOVA_MODE`
  // (tests unitaires, scripts), et le seul qui ne contacte rien.
  return chosenEdition() ?? "personal";
}

/**
 * Le poste appartient-il à une organisation ?
 *
 * **C'est la question que pose la quasi-totalité du code** qui interrogeait
 * jusqu'ici `isCampusMode()` : masquer les paliers de licence, amorcer le
 * contexte d'organisation, router la dictée vers le serveur, présenter la barre
 * latérale gérée. Aucune de ces décisions ne dépend de l'école ou de
 * l'entreprise — seulement du fait qu'une organisation administre le poste.
 *
 * Elle ne dépend que du build : elle est donc vraie dès la première frame,
 * avant tout réseau, et ne change jamais en cours de session.
 */
export function isOrganizationMode(): boolean {
  return currentEdition() === "organization";
}

/**
 * Nature de l'organisation, `null` en édition Personal.
 *
 * En édition Organization, la valeur vient de ce que le serveur a annoncé
 * (`/api/me`, puis `/api/config`), avec `education` pour repli — le comportement
 * de tous les postes déjà déployés. Le poste ne la choisit pas : il la lit.
 */
export function currentOrganizationType(): OrganizationType | null {
  return isOrganizationMode() ? resolvedOrganizationType() : null;
}
