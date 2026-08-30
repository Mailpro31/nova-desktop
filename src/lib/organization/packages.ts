import type { CapabilityMap } from "./model";

/**
 * Contenu distribué par l'organisation — Styles, AI Skills, vocabulaire.
 *
 * ## Package et Policy ne répondent pas à la même question
 *
 * | | |
 * |---|---|
 * | **Policy** | cette capacité est-elle autorisée ? |
 * | **Package** | quel contenu l'organisation distribue-t-elle ? |
 *
 * Un package actif dont la policy est fermée n'arrive tout simplement pas : le
 * serveur ne le distribue pas. Le poste applique la même règle une seconde
 * fois, pour la même raison que le résolveur de capacités — un contrat plus
 * ancien, une réponse en cache, et l'interface montrerait ce que
 * l'organisation a fermé.
 *
 * ## Ce que ce module ne fait pas
 *
 * Il ne fusionne rien avec les Styles personnels ni le vocabulaire personnel :
 * il les **complète**. Un Style d'organisation n'écrase pas un Style
 * personnel, et le préfixe d'identifiant rend la confusion impossible.
 *
 * Voir `docs/architecture/organization-packages.md`.
 */

export const PACKAGE_CONTENT_SCHEMA_VERSION = 1;

export type PackageType = "style" | "ai_skill" | "vocabulary";

export interface StylePackageContent {
  readonly name: string;
  readonly instruction: string;
}

export interface AiSkillPackageContent {
  readonly title: string;
  readonly summary: string;
  readonly practice: string;
  readonly durationMinutes: number;
  readonly steps: readonly string[];
}

export interface VocabularyEntry {
  readonly term: string;
  readonly replacement: string;
}

export interface VocabularyPackageContent {
  readonly entries: readonly VocabularyEntry[];
}

export type PackageContent =
  | { readonly type: "style"; readonly style: StylePackageContent }
  | { readonly type: "ai_skill"; readonly aiSkill: AiSkillPackageContent }
  | {
      readonly type: "vocabulary";
      readonly vocabulary: VocabularyPackageContent;
    };

export interface OrganizationPackage {
  /** Identifiant préfixé — `org_style_…`. Jamais confondable avec un preset. */
  readonly id: string;
  readonly packageId: string;
  readonly name: string;
  readonly description: string;
  readonly version: number;
  readonly schemaVersion: number;
  readonly contentHash: string;
  readonly content: PackageContent;
}

export interface OrganizationCatalog {
  readonly packages: readonly OrganizationPackage[];
  /**
   * Empreinte de l'ensemble distribué. Le poste sait qu'il détient déjà la
   * bonne chose sans comparer chaque document.
   */
  readonly catalogVersion: string;
  /** Organisation à laquelle ce catalogue appartient. Voir § cache. */
  readonly organizationId: string | null;
  /** `false` quand rien n'a pu être lu — serveur ancien, hors ligne. */
  readonly known: boolean;
}

export const EMPTY_CATALOG: OrganizationCatalog = Object.freeze({
  packages: [],
  catalogVersion: "",
  organizationId: null,
  known: false,
});

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : fallback;
}

/**
 * Lit un contenu selon son type déclaré.
 *
 * Renvoie `null` si la forme ne correspond pas — le package est alors ignoré
 * plutôt que présenté à moitié. Un Style sans consigne n'est pas un Style
 * dégradé : c'est un Style qui ne fonctionnerait pas.
 */
function parseContent(type: string, raw: unknown): PackageContent | null {
  if (!raw || typeof raw !== "object") return null;
  const content = raw as Record<string, unknown>;

  if (type === "style") {
    const name = text(content.name);
    const instruction = text(content.instruction);
    if (!name || !instruction) return null;
    return { type: "style", style: { name, instruction } };
  }

  if (type === "ai_skill") {
    const title = text(content.title);
    if (!title) return null;
    const steps = Array.isArray(content.steps)
      ? content.steps.filter((step): step is string => typeof step === "string")
      : [];
    return {
      type: "ai_skill",
      aiSkill: {
        title,
        summary: text(content.summary),
        practice: text(content.practice),
        durationMinutes: positiveInteger(content.duration_minutes, 5),
        steps,
      },
    };
  }

  if (type === "vocabulary") {
    if (!Array.isArray(content.entries)) return null;
    const entries: VocabularyEntry[] = [];
    for (const entry of content.entries) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const term = text(record.term);
      const replacement = text(record.replacement);
      if (term && replacement) entries.push({ term, replacement });
    }
    if (entries.length === 0) return null;
    return { type: "vocabulary", vocabulary: { entries } };
  }

  return null;
}

/**
 * Lit le catalogue tel que le serveur l'envoie.
 *
 * Tolérant : un package d'un type inconnu, ou d'un schéma plus récent, est
 * **ignoré** — pas deviné. Un poste qui interpréterait un format qu'il ne
 * connaît pas distribuerait du contenu déformé à son utilisateur, ce qui est
 * pire que de ne rien distribuer.
 */
export function parseOrganizationCatalog(
  input: unknown,
  organizationId: string | null,
): OrganizationCatalog {
  if (!input || typeof input !== "object") return EMPTY_CATALOG;
  const raw = input as Record<string, unknown>;
  if (!Array.isArray(raw.packages)) return EMPTY_CATALOG;

  const packages: OrganizationPackage[] = [];
  for (const item of raw.packages) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const schemaVersion = positiveInteger(record.schema_version, 0);
    if (schemaVersion === 0 || schemaVersion > PACKAGE_CONTENT_SCHEMA_VERSION) {
      continue;
    }
    const content = parseContent(text(record.type), record.content);
    if (!content) continue;
    const id = text(record.id);
    const packageId = text(record.package_id);
    if (!id || !packageId) continue;
    packages.push({
      id,
      packageId,
      name: text(record.name),
      description: text(record.description),
      version: positiveInteger(record.version, 1),
      schemaVersion,
      contentHash: text(record.content_hash),
      content,
    });
  }

  return Object.freeze({
    packages: Object.freeze(packages),
    catalogVersion: text(raw.catalog_version),
    organizationId,
    known: true,
  });
}

/**
 * Le catalogue appartient-il à l'organisation courante ?
 *
 * Un catalogue conservé localement porte l'organisation pour laquelle il a été
 * reçu. Changer d'organisation — ou se déconnecter — ne doit jamais laisser le
 * contenu de la précédente s'appliquer, et un cache qui ne porterait pas cette
 * identité rendrait cette faute invisible.
 */
export function catalogBelongsTo(
  catalog: OrganizationCatalog,
  organizationId: string | null,
): boolean {
  return (
    catalog.known &&
    catalog.organizationId !== null &&
    catalog.organizationId === organizationId
  );
}

/** Le catalogue utilisable ici, ou vide s'il vient d'ailleurs. */
export function catalogFor(
  catalog: OrganizationCatalog,
  organizationId: string | null,
): OrganizationCatalog {
  return catalogBelongsTo(catalog, organizationId) ? catalog : EMPTY_CATALOG;
}

/** Quelle capacité gouverne quel type. Noms Nova, pas noms serveur. */
const CAPABILITY_BY_TYPE: Readonly<Record<PackageType, keyof CapabilityMap>> =
  Object.freeze({
    style: "writingStyles",
    ai_skill: "aiSkills",
    vocabulary: "organizationVocabulary",
  });

/**
 * Ce que le membre peut réellement utiliser.
 *
 * Le serveur filtre déjà — cette seconde application est **idempotente** et
 * protège le cas où le poste applique un catalogue conservé pendant qu'une
 * policy a changé. Sans elle, un poste hors ligne continuerait d'offrir ce que
 * l'organisation vient de fermer.
 */
export function usablePackages(
  catalog: OrganizationCatalog,
  capabilities: CapabilityMap,
  type?: PackageType,
): readonly OrganizationPackage[] {
  return catalog.packages.filter((entry) => {
    if (type && entry.content.type !== type) return false;
    const capability = CAPABILITY_BY_TYPE[entry.content.type];
    return capabilities[capability] === true;
  });
}

/**
 * Vocabulaire applicable, organisation puis personnel.
 *
 * **La personne l'emporte sur l'organisation en cas de collision.** Un membre
 * qui a corrigé un terme pour son propre usage l'a fait en connaissance de
 * cause ; le lui reprendre à la prochaine publication serait un contenu qui se
 * défait tout seul. L'organisation fournit une base, elle ne réécrit pas les
 * choix individuels.
 */
export function mergeVocabulary(
  organization: readonly VocabularyEntry[],
  personal: readonly VocabularyEntry[],
): readonly VocabularyEntry[] {
  const merged = new Map<string, VocabularyEntry>();
  for (const entry of organization) merged.set(entry.term.toLowerCase(), entry);
  for (const entry of personal) merged.set(entry.term.toLowerCase(), entry);
  return Object.freeze([...merged.values()]);
}
