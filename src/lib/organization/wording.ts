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
    education: "educationWording.sessionExpired",
    organization: "organization.sessionExpired",
  },
  logoutConfirmTitle: {
    education: "educationWording.logoutConfirmTitle",
    organization: "organization.account.logoutConfirmTitle",
  },
  logoutConfirmDescription: {
    education: "educationWording.logoutConfirmDescription",
    organization: "organization.account.logoutConfirmDescription",
  },
  aboutSubtitle: {
    education: "educationWording.aboutSubtitle",
    organization: "organization.settings.aboutSubtitle",
  },
  personalizationDescription: {
    education: "educationWording.personalizationDescription",
    organization: "organization.personalization.description",
  },
  organizationSubtitle: {
    education: "educationWording.organizationSubtitle",
    organization: "organization.organization.subtitle",
  },
  statusConnected: {
    education: "educationWording.statusConnected",
    organization: "organization.status.connected",
  },
  providesTitle: {
    education: "educationWording.providesTitle",
    organization: "organization.provides.title",
  },
  providesPaused: {
    education: "educationWording.providesPaused",
    organization: "organization.provides.paused",
  },
  transcriptionDescription: {
    education: "educationWording.transcriptionDescription",
    organization: "organization.provides.transcription.description",
  },
  rewritingDescription: {
    education: "educationWording.rewritingDescription",
    organization: "organization.provides.rewriting.description",
  },
  vocabularyDescription: {
    education: "educationWording.vocabularyDescription",
    organization: "organization.provides.vocabulary.description",
  },
  formattingDescription: {
    education: "educationWording.formattingDescription",
    organization: "organization.provides.formatting.description",
  },
  dataOnServer: {
    education: "educationWording.dataOnServer",
    organization: "organization.data.onServer",
  },
  dataNote: {
    education: "educationWording.dataNote",
    organization: "organization.data.note",
  },
  aiSkillsPrivacyOffline: {
    education: "educationWording.aiSkillsPrivacyOffline",
    organization: "aiSkills.privacyOffline",
  },
  notInOrganization: {
    education: "educationWording.notInOrganization",
    organization: "organization.microsoft.notInOrganization",
  },
  codeForbidden: {
    education: "educationWording.codeForbidden",
    organization: "organization.onboarding.code.forbidden",
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
