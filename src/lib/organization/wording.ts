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

/** Chaque texte concerné : la clé Campus, et sa clé neutre. */
export const ORGANIZATION_WORDING = {
  sessionExpired: {
    education: "campus.sessionExpired",
    organization: "organizationWording.sessionExpired",
  },
  logoutConfirmTitle: {
    education: "campus.account.logoutConfirmTitle",
    organization: "organizationWording.logoutConfirmTitle",
  },
  logoutConfirmDescription: {
    education: "campus.account.logoutConfirmDescription",
    organization: "organizationWording.logoutConfirmDescription",
  },
  aboutSubtitle: {
    education: "campus.settings.aboutSubtitle",
    organization: "organizationWording.aboutSubtitle",
  },
  personalizationDescription: {
    education: "campus.personalization.description",
    organization: "organizationWording.personalizationDescription",
  },
  organizationSubtitle: {
    education: "campus.organization.subtitle",
    organization: "organizationWording.organizationSubtitle",
  },
  statusConnected: {
    education: "campus.status.connected",
    organization: "organizationWording.statusConnected",
  },
  providesTitle: {
    education: "campus.provides.title",
    organization: "organizationWording.providesTitle",
  },
  providesPaused: {
    education: "campus.provides.paused",
    organization: "organizationWording.providesPaused",
  },
  transcriptionDescription: {
    education: "campus.provides.transcription.description",
    organization: "organizationWording.transcriptionDescription",
  },
  rewritingDescription: {
    education: "campus.provides.rewriting.description",
    organization: "organizationWording.rewritingDescription",
  },
  vocabularyDescription: {
    education: "campus.provides.vocabulary.description",
    organization: "organizationWording.vocabularyDescription",
  },
  formattingDescription: {
    education: "campus.provides.formatting.description",
    organization: "organizationWording.formattingDescription",
  },
  dataOnServer: {
    education: "campus.data.onCampus",
    organization: "organizationWording.dataOnServer",
  },
  dataNote: {
    education: "campus.data.note",
    organization: "organizationWording.dataNote",
  },
  aiSkillsPrivacyOffline: {
    education: "aiSkills.privacyOffline",
    organization: "organizationWording.aiSkillsPrivacyOffline",
  },
  notInOrganization: {
    education: "campus.microsoft.notInOrganization",
    organization: "organizationWording.notInOrganization",
  },
  codeForbidden: {
    education: "campus.onboarding.code.forbidden",
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
