import {
  currentEdition,
  currentOrganizationType,
  isOrganizationMode,
} from "@/lib/organization/edition";

export { isOrganizationMode };

// `getNovaMode(): "campus" | "personal"` vivait ici. Il n'avait plus aucun
// appelant, et il ne pouvait pas en accueillir : un poste d'entreprise aurait
// obtenu « personal », c'est-à-dire précisément la réponse qui fait sortir du
// chemin Organization. Les trois prédicats ci-dessous se répondent chacun à une
// question, sans réduire trois situations à deux valeurs.

/**
 * Le poste sert-il un **établissement d'enseignement** ?
 *
 * La sémantique est celle qui a toujours été écrite ici — « édition
 * organisation, de type éducation » — mais elle n'est plus une tautologie : la
 * nature vient désormais du serveur du tenant, donc un poste d'entreprise
 * répond `false`.
 *
 * ## Ce n'est presque jamais la bonne question
 *
 * La plupart des appelants historiques voulaient dire « ce poste est-il géré par
 * une organisation ? ». Ils interrogent désormais `isOrganizationMode()`, qui
 * répond exactement à cela et qui vaut aussi pour Business. Ne réservez
 * `isCampusMode()` qu'à ce qui est réellement propre à l'éducation : la
 * direction artistique Campus, le parcours d'apprentissage.
 *
 * Et pour une **fonctionnalité**, la bonne autorité n'est ni l'une ni l'autre :
 * c'est la capacité (`can(ctx, "aiSkills")`), qu'une policy d'organisation peut
 * fermer et qu'un test peut poser. Voir `@/lib/organization`.
 */
export function isCampusMode(): boolean {
  return (
    currentEdition() === "organization" &&
    currentOrganizationType() === "education"
  );
}

/**
 * Le poste sert-il une **entreprise** ?
 *
 * Exposé pour la symétrie et pour les rares écarts d'expérience réellement
 * propres à Business. Il ne doit jamais remplacer une capacité : `if (business)`
 * là où la bonne question est `can(ctx, …)` produit une fonctionnalité qu'aucune
 * organisation ne peut gouverner.
 */
export function isBusinessMode(): boolean {
  return (
    currentEdition() === "organization" &&
    currentOrganizationType() === "business"
  );
}
