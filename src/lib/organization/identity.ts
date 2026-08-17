import { z } from "zod";

import type {
  AccountStatus,
  FederatedIdentity,
  Group,
  IdentityProvider,
  MemberType,
  OrganizationMember,
  OrganizationType,
  SecurityRole,
  TenantMapping,
} from "./model";

/**
 * Couche identité : qui se connecte, à quelle organisation, avec quel statut.
 *
 * ## Frontière de confiance
 *
 * Tout ce que ce module produit vient **du serveur**. Le Desktop ne décide ni
 * d'un `securityRole`, ni d'une organisation, ni d'un statut de compte : il lit
 * une réponse et la traduit. Une vérification faite ici sert l'expérience —
 * masquer ce qui n'est pas disponible — jamais la sécurité. Toute opération
 * sensible reste autorisée par le serveur, qui refait la vérification.
 *
 * Conséquence pratique : un client modifié ne gagne rien. Il peut s'afficher ce
 * qu'il veut ; il n'obtient pas pour autant une réponse du serveur.
 */

/** Motif de refus d'une identité — un code, jamais un jeton, pour l'audit. */
export type IdentityRejection = "missing_subject" | "email_used_as_subject";

/**
 * Une chaîne ressemble-t-elle à une adresse e-mail ?
 *
 * Volontairement grossier : le but n'est pas de valider une adresse mais
 * d'empêcher qu'on en glisse une là où un identifiant immuable est attendu.
 */
function looksLikeAnEmail(value: string): boolean {
  const [local, domain, ...rest] = value.trim().split("@");
  if (rest.length > 0 || domain === undefined) return false;
  return local.length > 0 && domain.includes(".") && !domain.startsWith(".");
}

export type FederatedIdentityResult =
  | { ok: true; identity: FederatedIdentity }
  | { ok: false; rejection: IdentityRejection };

/**
 * Construit une identité fédérée, en refusant les sujets inacceptables.
 *
 * Le refus est explicite plutôt qu'un repli silencieux : accepter une adresse
 * comme sujet ferait entrer un identifiant mutable dans le modèle, et plus rien
 * ensuite ne permettrait de le distinguer d'un vrai.
 */
export function createFederatedIdentity(input: {
  provider: IdentityProvider;
  externalSubject: string;
  externalTenantId?: string | null;
  organizationId?: string | null;
}): FederatedIdentityResult {
  const subject = input.externalSubject.trim();
  if (!subject) return { ok: false, rejection: "missing_subject" };
  if (looksLikeAnEmail(subject)) {
    return { ok: false, rejection: "email_used_as_subject" };
  }
  return {
    ok: true,
    identity: {
      provider: input.provider,
      externalSubject: subject,
      externalTenantId: input.externalTenantId?.trim() || null,
      organizationId: input.organizationId?.trim() || null,
    },
  };
}

/**
 * Clé d'unicité d'une identité : le couple (fournisseur, sujet).
 *
 * Un même sujet chez deux fournisseurs reste deux identités distinctes — rien
 * ne garantit qu'un `sub` Google et un `oid` Microsoft identiques désignent la
 * même personne.
 */
export function identityKey(identity: FederatedIdentity): string {
  return `${identity.provider}:${identity.externalSubject}`;
}

/**
 * Organisation Nova correspondant à un tenant externe, `null` si le mapping
 * n'a pas été déclaré.
 *
 * Il n'existe volontairement **aucune** fonction équivalente prenant une
 * adresse ou un domaine : rattacher une organisation à partir de
 * « @entreprise.com » donnerait l'accès d'une organisation à quiconque contrôle
 * une adresse dans ce domaine.
 */
export function resolveOrganizationForTenant(
  mappings: readonly TenantMapping[],
  provider: IdentityProvider,
  externalTenantId: string,
): string | null {
  const tenant = externalTenantId.trim();
  if (!tenant) return null;
  const match = mappings.find(
    (mapping) =>
      mapping.provider === provider && mapping.externalTenantId === tenant,
  );
  return match?.organizationId ?? null;
}

/** Seul un compte actif ouvre l'accès : un statut inconnu ne vaut pas droit. */
export function grantsAccess(status: AccountStatus): boolean {
  return status === "active";
}

// ─────────────────────────────────────────────────────────────────────────────
// Lecture du contrat serveur
// ─────────────────────────────────────────────────────────────────────────────

const memberTypeSchema = z.enum([
  "student",
  "teacher",
  "staff",
  "employee",
  "manager",
  "other",
]);

const securityRoleSchema = z.enum(["member", "organization_admin", "it_admin"]);

const groupSourceSchema = z.enum([
  "legacy_cohort",
  "microsoft_entra",
  "google_workspace",
  "scim",
  "manual",
]);

const accountStatusSchema = z.enum(["active", "disabled", "deprovisioned"]);

const groupSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  source: groupSourceSchema,
  external_group_id: z.string().min(1).nullish(),
});

const membershipSchema = z.object({
  member_type: memberTypeSchema.nullish(),
  security_role: securityRoleSchema.nullish(),
  groups: z.array(groupSchema).nullish(),
  status: accountStatusSchema.nullish(),
});

const identitySchema = z.object({
  provider: z
    .enum(["microsoft_entra", "google_workspace", "oidc", "legacy_email_code"])
    .nullish(),
});

/**
 * Réponse `/api/me`, version 2, **entièrement optionnelle**.
 *
 * Chaque champ peut manquer : un serveur d'établissement plus ancien que le
 * client est un cas normal, pas une erreur. Les trois champs historiques
 * (`email`, `role`, `cohort`) restent lus par le chemin Campus existant ; ce
 * schéma ne décrit que les ajouts.
 */
const meV2Schema = z.object({
  contract_version: z.number().nullish(),
  user_id: z.string().min(1).nullish(),
  organization_id: z.string().min(1).nullish(),
  // Asymétrie assumée avec `security_role` : un type d'organisation inconnu
  // est ignoré (`catch`), parce qu'il ne confère rien et que rejeter toute la
  // réponse pour cela priverait le poste d'informations valides. Un rôle de
  // sécurité inconnu, lui, fait rejeter la réponse : il pourrait être une
  // revendication de privilège.
  organization_type: z
    .enum(["education", "business"])
    .nullish()
    .catch(undefined),
  membership: membershipSchema.nullish(),
  identity: identitySchema.nullish(),
  capabilities: z.array(z.string()).nullish(),
});

/** Ce que le serveur a réellement annoncé sur le membre connecté. */
export interface ServerIdentitySnapshot {
  /** `1` quand la réponse ne porte pas encore le contrat étendu. */
  contractVersion: number;
  userId: string | null;
  organizationId: string | null;
  organizationType: OrganizationType | null;
  provider: IdentityProvider;
  member: OrganizationMember | null;
  /**
   * Capacités annoncées par l'organisation, telles quelles. `null` quand le
   * serveur n'en annonce aucune — à ne pas confondre avec une liste vide, qui
   * signifie « l'organisation ne fournit rien ».
   */
  capabilities: readonly string[] | null;
}

function toGroup(raw: z.infer<typeof groupSchema>): Group {
  return {
    id: raw.id,
    label: raw.label,
    source: raw.source,
    externalGroupId: raw.external_group_id ?? null,
  };
}

/**
 * Lit les ajouts du contrat `/api/me` v2 sans jamais rien inventer.
 *
 * Trois garde-fous portés par cette fonction :
 *
 * 1. une réponse **legacy** (sans aucun de ces champs) produit un instantané
 *    vide plutôt qu'une erreur — le poste continue de fonctionner ;
 * 2. le `securityRole` retenu est celui du serveur, et `member` par défaut :
 *    l'absence d'information ne vaut jamais élévation ;
 * 3. un `memberType` inconnu du modèle est ignoré plutôt que traduit
 *    approximativement.
 */
export function parseServerIdentity(raw: unknown): ServerIdentitySnapshot {
  const parsed = meV2Schema.safeParse(raw);
  if (!parsed.success) {
    return {
      contractVersion: 1,
      userId: null,
      organizationId: null,
      organizationType: null,
      provider: "legacy_email_code",
      member: null,
      capabilities: null,
    };
  }

  const data = parsed.data;
  const membership = data.membership;
  const member: OrganizationMember | null = membership
    ? {
        memberType: (membership.member_type ?? null) as MemberType | null,
        // Le serveur est l'autorité, et son silence vaut `member`.
        securityRole: (membership.security_role ?? "member") as SecurityRole,
        groups: (membership.groups ?? []).map(toGroup),
        status: (membership.status ?? "active") as AccountStatus,
      }
    : null;

  return {
    contractVersion: data.contract_version ?? 1,
    userId: data.user_id ?? null,
    organizationId: data.organization_id ?? null,
    organizationType: data.organization_type ?? null,
    provider: data.identity?.provider ?? "legacy_email_code",
    member,
    capabilities: data.capabilities ?? null,
  };
}
