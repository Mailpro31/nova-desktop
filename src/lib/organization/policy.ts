import type { CapabilityId, CapabilityMap } from "./model";

/**
 * Policies produit de l'organisation — le contrat, et la formule.
 *
 * ## Deux concepts qu'il ne faut pas confondre
 *
 * | | |
 * |---|---|
 * | **Capacité d'administration** | ce qu'un administrateur peut modifier dans Nova Admin |
 * | **Policy produit** | ce que l'organisation autorise à ses membres dans Nova |
 *
 * `policy_manage` — la capacité — dit qui a le droit de changer
 * `aiSkillsEnabled` — la policy. Elle n'entre jamais dans le calcul de ce que
 * voit un membre. Les fusionner produirait un système où éditer une case
 * pourrait rouvrir la console.
 *
 * ## La formule
 *
 * ```
 * capacité de base  ∩  policy  =  capacité effective
 * ```
 *
 * L'intersection ne va que dans un sens : une policy **restreint**, elle
 * n'accorde jamais. Une organisation ne peut pas s'attribuer une fonction que
 * le produit ne fournit pas.
 *
 * ## Qui fait autorité
 *
 * **Le serveur.** Il applique déjà cette formule avant d'annoncer quoi que ce
 * soit, et il refuse les routes concernées. Ce module porte le même calcul
 * pour l'interface et pour ce qui se décide localement — pas pour former un
 * second avis. Deux formules qui divergeraient produiraient un bouton actif
 * menant à un refus, ou l'inverse, ce qui est pire.
 *
 * Voir `docs/architecture/organization-policies.md`.
 */

/** Version du schéma que ce poste sait lire. */
export const POLICY_SCHEMA_VERSION = 2;

/** Une policy jamais configurée porte la révision 0 — « personne n'a rien changé ». */
export const UNCONFIGURED_POLICY_REVISION = 0;

export interface OrganizationPolicySettings {
  /** Les membres peuvent-ils utiliser les AI Skills ? */
  readonly aiSkillsEnabled: boolean;
  /** Le vocabulaire distribué par l'organisation est-il disponible ? */
  readonly organizationVocabularyEnabled: boolean;
  /** Les commandes vocales sont-elles autorisées ? */
  readonly voiceCommandsEnabled: boolean;
  /** Les notes d'ingénierie sont-elles autorisées ? */
  readonly engineeringNotesEnabled: boolean;
  /** L'import d'un fichier audio déjà enregistré est-il autorisé ? */
  readonly fileImportEnabled: boolean;
}

export interface OrganizationPolicy {
  readonly schemaVersion: number;
  readonly revision: number;
  readonly settings: OrganizationPolicySettings;
  /**
   * `false` quand le poste n'a pas pu lire de policy — serveur d'une version
   * antérieure, hors ligne, document illisible. Il applique alors les défauts,
   * et il vaut mieux le savoir que le deviner.
   */
  readonly known: boolean;
}

/**
 * Tous les défauts sont permissifs.
 *
 * C'est ce qui protège les installations existantes : une organisation qui n'a
 * jamais rien configuré ne doit rien perdre le jour où les policies
 * apparaissent. Un défaut restrictif éteindrait une fonction chez tout le
 * monde à la première mise à jour.
 */
export const DEFAULT_ORGANIZATION_POLICY_SETTINGS: OrganizationPolicySettings =
  Object.freeze({
    aiSkillsEnabled: true,
    organizationVocabularyEnabled: true,
    voiceCommandsEnabled: true,
    engineeringNotesEnabled: true,
    fileImportEnabled: true,
  });

export const DEFAULT_ORGANIZATION_POLICY: OrganizationPolicy = Object.freeze({
  schemaVersion: POLICY_SCHEMA_VERSION,
  revision: UNCONFIGURED_POLICY_REVISION,
  settings: DEFAULT_ORGANIZATION_POLICY_SETTINGS,
  known: false,
});

/**
 * Quelle capacité chaque policy gouverne.
 *
 * Une seule table, lue par le résolveur : disperser ces correspondances dans
 * l'interface reviendrait à écrire la formule plusieurs fois.
 */
const GOVERNED_CAPABILITY: Readonly<
  Record<keyof OrganizationPolicySettings, CapabilityId>
> = Object.freeze({
  aiSkillsEnabled: "aiSkills",
  organizationVocabularyEnabled: "organizationVocabulary",
  voiceCommandsEnabled: "commands",
  engineeringNotesEnabled: "engineeringNotes",
  fileImportEnabled: "fileTranscription",
});

/** Nom serveur (`snake_case`) → nom Nova. Le serveur possède le schéma. */
const SETTING_BY_SERVER_KEY: Readonly<
  Record<string, keyof OrganizationPolicySettings>
> = Object.freeze({
  ai_skills_enabled: "aiSkillsEnabled",
  organization_vocabulary_enabled: "organizationVocabularyEnabled",
  voice_commands_enabled: "voiceCommandsEnabled",
  engineering_notes_enabled: "engineeringNotesEnabled",
  file_import_enabled: "fileImportEnabled",
});

/**
 * Le document renvoyé par le serveur est-il d'une version que ce poste sait
 * lire ?
 *
 * Un poste qui rencontre une version supérieure **ne devine pas**. Interpréter
 * des règles écrites selon un schéma qu'on ne connaît pas, c'est appliquer une
 * gouvernance imaginaire — soit en ouvrant ce qui devait être fermé, soit en
 * fermant ce qui devait rester ouvert.
 */
export function isSupportedPolicySchema(version: unknown): boolean {
  return typeof version === "number" && Number.isInteger(version)
    ? version <= POLICY_SCHEMA_VERSION && version >= 1
    : false;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * Lit un document de policy tel que le serveur l'envoie.
 *
 * Tolérant en lecture, et volontairement : une clé inconnue est ignorée, une
 * clé manquante reprend son défaut. Le serveur, lui, refuse ces mêmes cas à
 * l'écriture — c'est là que la rigueur a un sens, parce qu'un administrateur
 * attend une confirmation. Ici, la rigueur ne ferait que priver de service.
 */
export function parseOrganizationPolicy(input: unknown): OrganizationPolicy {
  if (!input || typeof input !== "object") return DEFAULT_ORGANIZATION_POLICY;
  const raw = input as Record<string, unknown>;

  if (!isSupportedPolicySchema(raw.schema_version)) {
    // Version inconnue : défauts permissifs, et `known: false` pour que
    // l'interface puisse le dire plutôt que de présenter une gouvernance
    // qu'elle n'a pas comprise.
    return DEFAULT_ORGANIZATION_POLICY;
  }

  const settingsInput =
    raw.settings && typeof raw.settings === "object"
      ? (raw.settings as Record<string, unknown>)
      : {};

  const settings: Record<string, boolean> = {
    ...DEFAULT_ORGANIZATION_POLICY_SETTINGS,
  };
  for (const [serverKey, name] of Object.entries(SETTING_BY_SERVER_KEY)) {
    settings[name] = readBoolean(
      settingsInput[serverKey],
      DEFAULT_ORGANIZATION_POLICY_SETTINGS[name],
    );
  }

  const revision =
    typeof raw.revision === "number" && Number.isInteger(raw.revision)
      ? raw.revision
      : UNCONFIGURED_POLICY_REVISION;

  return Object.freeze({
    schemaVersion: raw.schema_version as number,
    revision,
    settings: Object.freeze(settings) as unknown as OrganizationPolicySettings,
    known: true,
  });
}

/**
 * base ∩ policy = effective.
 *
 * Le miroir exact de `resolve_effective_product_capabilities` côté serveur.
 * Idempotent : l'appliquer sur des capacités que le serveur a déjà filtrées ne
 * change rien, ce qui permet de le poser sans craindre un double effet.
 */
export function resolveEffectiveCapabilities(
  base: CapabilityMap,
  policy: OrganizationPolicy,
): CapabilityMap {
  const effective: Record<string, boolean> = { ...base };
  for (const [name, capability] of Object.entries(GOVERNED_CAPABILITY) as [
    keyof OrganizationPolicySettings,
    CapabilityId,
  ][]) {
    if (!(capability in effective)) continue;
    effective[capability] =
      effective[capability] === true && policy.settings[name] === true;
  }
  return Object.freeze(effective) as CapabilityMap;
}
