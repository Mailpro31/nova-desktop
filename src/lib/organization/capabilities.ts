import type { CapabilityId, CapabilityMap, OrganizationContext } from "./model";

/**
 * Jeux de capacités par édition, et lecture unique côté interface.
 *
 * L'objectif à terme est que l'interface demande `can(ctx, "aiSkills")` plutôt
 * que `isCampusMode()` : la question posée devient « cette capacité est-elle
 * ouverte ? » et non « quelle édition est installée ? ». La migration est
 * volontairement progressive — les appels existants restent en place tant
 * qu'aucun bénéfice concret ne justifie de les réécrire.
 */

/**
 * Personal : le Nova Core au complet, aucune surface d'organisation.
 *
 * `screenContext` et `cloudInference` sont ouverts en tant que *surfaces* ; le
 * palier de licence décide ensuite qui y a droit. `commands` reste fermé : les
 * Nova Commands sont expérimentales et pilotées par un réglage dédié.
 */
const PERSONAL_CAPABILITIES: CapabilityMap = Object.freeze({
  dictation: true,
  rewrite: true,
  writingStyles: true,
  personalStyles: true,
  fileTranscription: true,
  personalization: true,
  localFallback: true,
  commands: false,
  screenContext: true,
  cloudInference: true,
  engineeringNotes: false,
  organizationVocabulary: false,
  organizationSnippets: false,
  organizationFormattingRules: false,
  organizationStyles: false,
  aiSkills: false,
  learning: false,
});

/**
 * Capacités d'une organisation dont on ne sait encore rien : le Core, et rien
 * de ce qui suppose un serveur joignable. C'est l'état d'un poste Campus avant
 * la première réponse de `/api/config`.
 */
const UNKNOWN_ORGANIZATION_CAPABILITIES: CapabilityMap = Object.freeze({
  ...PERSONAL_CAPABILITIES,
  screenContext: false,
  cloudInference: false,
});

export function personalCapabilities(): CapabilityMap {
  return PERSONAL_CAPABILITIES;
}

export function unknownOrganizationCapabilities(): CapabilityMap {
  return UNKNOWN_ORGANIZATION_CAPABILITIES;
}

/**
 * La capacité est-elle ouverte dans ce contexte ?
 *
 * Réponse binaire et sans effet de bord : aucune notion de licence, de session
 * ni de joignabilité serveur n'intervient ici. Ces questions ont leurs propres
 * réponses (`useLicense`, `useCampusStatus`) et les mélanger produirait un
 * verrou dont personne ne saurait dire d'où il vient.
 */
export function can(
  context: OrganizationContext,
  capability: CapabilityId,
): boolean {
  return context.capabilities[capability] === true;
}
