import type { Edition, OrganizationType } from "./model";
import { resolvedOrganizationType } from "./organizationType";

/**
 * Nova n'a plus qu'une édition : celle d'une organisation (décision du
 * 21/10/2026, Nova personnel supprimé). La nature de l'organisation, éducation
 * ou entreprise, vient toujours du serveur du tenant — voir
 * `organizationType.ts`.
 */
export function currentEdition(): Edition {
  return "organization";
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
