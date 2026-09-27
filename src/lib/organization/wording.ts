import type { OrganizationType } from "./model";

/**
 * Le vocabulaire d'une organisation, selon ce que son serveur a annoncé.
 *
 * ## Le défaut que ce module corrige
 *
 * Nova Campus est devenu Nova Organization, mais une partie des textes est
 * restée celle d'une école : « Se déconnecter de Nova Campus ? », « Ce que votre
 * établissement fournit », « Campus connecté ». Une entreprise les lisait tels
 * quels.
 *
 * ## La règle
 *
 * - le serveur fait autorité : `/api/me` d'abord, `/api/config` ensuite ;
 * - `education` annoncé : le vocabulaire Campus reste permis ;
 * - `business` annoncé, **ou rien d'annoncé** : un vocabulaire neutre.
 *
 * Pas de repli sur « éducation » ici, contrairement à
 * `resolvedOrganizationType()` : un repli qui décide du thème d'un parc déjà
 * installé ne doit pas décider des mots qu'on adresse à quelqu'un dont on ne
 * sait rien.
 */

/**
 * Chaque texte concerné : la clé au vocabulaire d'établissement, et sa clé
 * neutre.
 *
 * Le nommage reste bâtard depuis que l'espace `campus.*` s'appelle
 * `organization.*` : la variante éducation vit sous `organization.*` et la
 * variante neutre sous `organizationWording.*`. L'état correct est l'inverse
 * — le neutre par défaut dans `organization.*`, l'éducation en exception
 * déclarée — mais l'intervertir change quel texte s'affiche par défaut, donc
 * cela ne se fait pas dans un renommage mécanique.
 */
export const ORGANIZATION_WORDING = {
  sessionExpired: {
    education: "organization.sessionExpired",
    organization: "organizationWording.sessionExpired",
  },
  logoutConfirmTitle: {
    education: "organization.account.logoutConfirmTitle",
    organization: "organizationWording.logoutConfirmTitle",
  },
  logoutConfirmDescription: {
    education: "organization.account.logoutConfirmDescription",
    organization: "organizationWording.logoutConfirmDescription",
  },
  aboutSubtitle: {
    education: "organization.settings.aboutSubtitle",
    organization: "organizationWording.aboutSubtitle",
  },
  personalizationDescription: {
    education: "organization.personalization.description",
    organization: "organizationWording.personalizationDescription",
  },
  organizationSubtitle: {
    education: "organization.organization.subtitle",
    organization: "organizationWording.organizationSubtitle",
  },
  statusConnected: {
    education: "organization.status.connected",
    organization: "organizationWording.statusConnected",
  },
  providesTitle: {
    education: "organization.provides.title",
    organization: "organizationWording.providesTitle",
  },
  providesPaused: {
    education: "organization.provides.paused",
    organization: "organizationWording.providesPaused",
  },
  transcriptionDescription: {
    education: "organization.provides.transcription.description",
    organization: "organizationWording.transcriptionDescription",
  },
  rewritingDescription: {
    education: "organization.provides.rewriting.description",
    organization: "organizationWording.rewritingDescription",
  },
  vocabularyDescription: {
    education: "organization.provides.vocabulary.description",
    organization: "organizationWording.vocabularyDescription",
  },
  formattingDescription: {
    education: "organization.provides.formatting.description",
    organization: "organizationWording.formattingDescription",
  },
  dataOnServer: {
    education: "organization.data.onCampus",
    organization: "organizationWording.dataOnServer",
  },
  dataNote: {
    education: "organization.data.note",
    organization: "organizationWording.dataNote",
  },
  aiSkillsPrivacyOffline: {
    education: "aiSkills.privacyOffline",
    organization: "organizationWording.aiSkillsPrivacyOffline",
  },
  notInOrganization: {
    education: "organization.microsoft.notInOrganization",
    organization: "organizationWording.notInOrganization",
  },
  codeForbidden: {
    education: "organization.onboarding.code.forbidden",
    organization: "organizationWording.codeForbidden",
  },
} as const;

export type WordingId = keyof typeof ORGANIZATION_WORDING;

function isOrganizationType(value: unknown): value is OrganizationType {
  return value === "education" || value === "business";
}

/**
 * Nature annoncée par le serveur, ou `null`.
 *
 * `identityType` vient de `/api/me`, `configType` de `/api/config`. Une valeur
 * inconnue ou absente n'annonce rien.
 */
export function announcedTypeFrom(
  identityType: unknown,
  configType: unknown,
): OrganizationType | null {
  if (isOrganizationType(identityType)) return identityType;
  if (isOrganizationType(configType)) return configType;
  return null;
}

/** Clé à traduire pour ce texte, selon la nature annoncée. */
export function wordingKey(
  id: WordingId,
  organizationType: OrganizationType | null,
): string {
  const entry = ORGANIZATION_WORDING[id];
  return organizationType === "education"
    ? entry.education
    : entry.organization;
}
