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
export function currentEdition(): Edition {
  const mode = rawBuildMode();
  return mode === "campus" || mode === "organization"
    ? "organization"
    : "personal";
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
