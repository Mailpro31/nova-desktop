import type { CampusContext, CampusRole } from "@/lib/campusPolicy";
import { DEFAULT_CAMPUS_ORGANIZATION } from "@/lib/campusPolicy";
import {
  personalCapabilities,
  unknownOrganizationCapabilities,
} from "./capabilities";
import type { ServerIdentitySnapshot } from "./identity";
import type { OrganizationPolicy } from "./policy";
import {
  DEFAULT_ORGANIZATION_POLICY,
  resolveEffectiveCapabilities,
} from "./policy";
import type {
  CapabilityId,
  CapabilityMap,
  Edition,
  Group,
  MemberType,
  OrganizationContext,
  OrganizationIdentity,
  OrganizationMember,
  OrganizationType,
} from "./model";

/**
 * Traduction du monde Campus existant vers le modèle Organization.
 *
 * Campus n'est pas réécrit : il devient un **cas particulier** d'organisation
 * de type `education`. Cette fonction est l'unique endroit où la correspondance
 * est établie, et elle ne fabrique aucune donnée — chaque champ dont la source
 * est muette reste `null` ou `false`.
 */

/**
 * `users.role` côté serveur décrit un métier, pas un droit.
 *
 * `partner` devient `other` : c'est la catégorie fourre-tout du serveur, elle
 * ne désigne aucun métier. Aucune valeur ne produit de `SecurityRole` : voir
 * `resolveMember`.
 */
function toMemberType(role: CampusRole | undefined): MemberType | null {
  switch (role) {
    case "student":
      return "student";
    case "teacher":
      return "teacher";
    case "staff":
      return "staff";
    case "partner":
      return "other";
    default:
      return null;
  }
}

/**
 * L'identifiant d'organisation n'est retenu que s'il vient réellement de la
 * configuration de l'établissement.
 *
 * `DEFAULT_CAMPUS_ORGANIZATION.id` est un bouchon interne au client, présent
 * quand aucune configuration n'a été lue : le retenir reviendrait à faire
 * passer un défaut de l'application pour l'identité d'un tenant. Le nom
 * d'affichage n'est jamais transformé en identifiant non plus — « IPSA Paris »
 * est un libellé, pas une clé.
 */
function resolveOrganizationId(campus: CampusContext | null): string | null {
  const id = campus?.organization.id?.trim();
  if (!id) return null;
  if (id === DEFAULT_CAMPUS_ORGANIZATION.id) return null;
  return id;
}

function resolveIdentity(
  organizationType: OrganizationType,
  campus: CampusContext | null,
): OrganizationIdentity {
  const organization = campus?.organization;
  const displayName = organization?.name?.trim() || null;
  return {
    type: organizationType,
    id: resolveOrganizationId(campus),
    displayName:
      displayName === DEFAULT_CAMPUS_ORGANIZATION.name ? null : displayName,
    shortName: organization?.shortName?.trim() || null,
    managed: organization?.managed ?? true,
  };
}

/**
 * La cohorte Campus devient un groupe de compatibilité.
 *
 * C'est bien la même notion : un champ libre qui segmente les membres
 * (« Promo 2028 », « AERO2 ») sans porter de droit. Il devient donc un `Group`
 * de source `cohort`, ce qui permettra à un groupe d'annuaire de coexister avec
 * lui sans que l'un se fasse passer pour l'autre. La cohorte reste par ailleurs
 * exploitable telle quelle dans le code Campus existant.
 */
function resolveGroups(campus: CampusContext | null): Group[] {
  const cohort = campus?.organization.cohort?.trim();
  if (!cohort) return [];
  return [
    {
      id: cohort,
      label: cohort,
      source: "legacy_cohort",
      // Une cohorte saisie à la main n'a pas d'identifiant d'annuaire.
      externalGroupId: null,
    },
  ];
}

/**
 * Aucune source actuelle n'annonce de rôle de sécurité : tout membre connecté
 * est `member`. Déduire `organization_admin` d'un `teacher` ou d'un `staff`
 * donnerait des droits d'administration à des personnes que l'établissement n'a
 * jamais désignées.
 */
function resolveMember(
  campus: CampusContext | null,
  server: ServerIdentitySnapshot | null,
): OrganizationMember {
  // Quand le serveur annonce le membre, c'est lui l'autorité : le client ne
  // « complète » pas une réponse par ses propres déductions.
  if (server?.member) return server.member;
  return {
    memberType: toMemberType(campus?.organization.role),
    securityRole: "member",
    groups: resolveGroups(campus),
    status: "active",
  };
}

/**
 * Nom de capacité côté serveur → identifiant Nova, **pour les seules surfaces
 * d'organisation**.
 *
 * Les capacités du Nova Core sont volontairement absentes de cette table. Une
 * liste `capabilities` incomplète — serveur d'une version intermédiaire, champ
 * tronqué, incident — ne doit jamais pouvoir éteindre la dictée : ce qui
 * n'apparaît pas dans une réponse serveur est une information manquante, pas
 * un refus.
 */
const SERVER_CAPABILITY_IDS: Readonly<Record<string, CapabilityId>> =
  Object.freeze({
    dictionary: "organizationVocabulary",
    snippets: "organizationSnippets",
    formattingRules: "organizationFormattingRules",
    aiSkills: "aiSkills",
    engineeringNotes: "engineeringNotes",
    commands: "commands",
    screenContext: "screenContext",
    cloudInference: "cloudInference",
  });

/**
 * Applique la liste de capacités annoncée par `/api/me`.
 *
 * Le serveur devient autoritatif sur les surfaces d'organisation : ce qu'il ne
 * cite pas, il ne le fournit pas. Le Nova Core, lui, reste intact — voir
 * `SERVER_CAPABILITY_IDS`.
 */
function applyServerCapabilities(
  base: CapabilityMap,
  announced: readonly string[],
): CapabilityMap {
  const granted = new Set(announced);
  const merged: Record<string, boolean> = { ...base };
  for (const [serverName, capability] of Object.entries(
    SERVER_CAPABILITY_IDS,
  )) {
    merged[capability] = granted.has(serverName);
  }
  return Object.freeze(merged) as CapabilityMap;
}

/**
 * Capacités d'une organisation, projetées depuis la politique Campus.
 *
 * Les capacités Core suivent la politique de l'établissement là où elle existe
 * déjà (mode examen, par exemple, ferme la reformulation et les Styles) ; les
 * surfaces qu'aucun serveur ne distribue restent fermées plutôt que promises.
 */
function resolveCapabilities(campus: CampusContext | null): CapabilityMap {
  if (!campus) return unknownOrganizationCapabilities();
  const capabilities = campus.capabilities;
  return Object.freeze({
    dictation: capabilities.dictation,
    rewrite: capabilities.rewrite,
    writingStyles: capabilities.styles,
    personalStyles: capabilities.personalization,
    fileTranscription: capabilities.fileTranscription,
    personalization: capabilities.personalization,
    // Le repli local reste acquis : un serveur injoignable ne doit pas laisser
    // un étudiant sans dictée.
    localFallback: true,
    commands: capabilities.commands,
    screenContext: capabilities.screenContext,
    cloudInference: capabilities.cloudInference,
    engineeringNotes: capabilities.engineeringNotes,
    organizationVocabulary: capabilities.dictionary,
    organizationSnippets: capabilities.snippets,
    organizationFormattingRules: capabilities.formattingRules,
    // Aucun serveur ne distribue de Styles d'organisation ni de parcours
    // d'apprentissage aujourd'hui — voir `campusCapabilities.ts`.
    organizationStyles: false,
    aiSkills: capabilities.aiSkills,
    learning: false,
  });
}

export interface ResolveOrganizationContextInput {
  edition: Edition;
  /** Requis en édition `organization`, ignoré sinon. */
  organizationType?: OrganizationType | null;
  /** Politique Campus déjà résolue, `null` tant qu'elle n'est pas connue. */
  campus?: CampusContext | null;
  /**
   * Ce que `/api/me` a annoncé, quand le serveur porte le contrat étendu.
   * Absent avec un serveur plus ancien : le contexte se résout alors
   * exactement comme avant.
   */
  server?: ServerIdentitySnapshot | null;
  /**
   * Policy produit de l'organisation, quand elle est connue.
   *
   * Absente, les défauts permissifs s'appliquent : une organisation qui n'a
   * rien configuré — ou un serveur qui n'en parle pas encore — ne doit rien
   * perdre. Ignorée en édition Personal, qui ne reçoit aucune gouvernance.
   */
  policy?: OrganizationPolicy | null;
}

/**
 * Contexte d'organisation courant.
 *
 * En édition Personal, ni organisation ni membre : renvoyer un établissement
 * vide serait une donnée fictive, et l'interface personnelle finirait par
 * l'afficher.
 */
export function resolveOrganizationContext(
  input: ResolveOrganizationContextInput,
): OrganizationContext {
  if (input.edition === "personal") {
    // Aucune policy n'est appliquée ici, et `input.policy` est délibérément
    // ignoré : Nova Personal ne dépend d'aucun plan de contrôle. Lui laisser
    // subir une gouvernance d'organisation ferait dépendre le produit
    // individuel d'un serveur qu'il n'a pas.
    return {
      edition: "personal",
      organization: null,
      member: null,
      capabilities: personalCapabilities(),
    };
  }

  const organizationType: OrganizationType =
    input.organizationType ?? "education";
  const campus = input.campus ?? null;
  const server = input.server ?? null;
  const organization = resolveIdentity(organizationType, campus);
  const capabilities = resolveCapabilities(campus);
  return {
    edition: "organization",
    organization: {
      ...organization,
      // L'identifiant de tenant annoncé par le serveur prime sur celui de la
      // configuration déposée sur le poste : c'est le serveur qui sait à
      // quelle organisation le compte appartient.
      id: server?.organizationId ?? organization.id,
      type: server?.organizationType ?? organization.type,
    },
    member: resolveMember(campus, server),
    // La policy s'applique **en dernier**, sur ce que le serveur a annoncé.
    // Le serveur a déjà filtré ce qu'il annonce ; l'intersection est
    // idempotente, et la reposer ici garantit que l'interface ne montre jamais
    // plus que ce que l'organisation autorise, même si un contrat plus ancien
    // laissait passer une capacité gouvernée.
    capabilities: resolveEffectiveCapabilities(
      server?.capabilities
        ? applyServerCapabilities(capabilities, server.capabilities)
        : capabilities,
      input.policy ?? DEFAULT_ORGANIZATION_POLICY,
    ),
  };
}
