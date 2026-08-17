/**
 * Modèle d'organisation de Nova — vocabulaire commun à Personal, Campus
 * (Éducation) et, plus tard, Business.
 *
 * Ce module ne contient **que des types et des constantes**. Il ne lit aucun
 * réglage, n'appelle aucune commande et ne suppose l'existence d'aucune
 * édition en particulier : la résolution vit dans `resolve.ts`, la lecture des
 * capacités dans `capabilities.ts`.
 *
 * ## Quatre notions distinctes, jamais interchangeables
 *
 * | Notion | Question à laquelle elle répond | Exemple |
 * |---|---|---|
 * | `MemberType` | quelle est la nature métier de la personne ? | `student` |
 * | `SecurityRole` | de quels droits Nova dispose-t-elle ? | `member` |
 * | `Group` | dans quel segment de l'organisation est-elle ? | `AERO2` |
 * | `CapabilityId` | qu'est-ce que l'application autorise ? | `aiSkills` |
 *
 * Un enseignant n'est pas administrateur. Un ingénieur non plus. Un étudiant
 * n'est pas défini par son domaine d'adresse. Aucune fonction de ce dossier ne
 * déduit un `SecurityRole` d'un `MemberType`, d'un groupe ou d'une adresse.
 */

/** Ce que le produit est pour cet utilisateur : un outil personnel, ou l'outil d'une organisation. */
export type Edition = "personal" | "organization";

/** Nature de l'organisation. `business` est déclaré mais aucune UI ne l'expose encore. */
export type OrganizationType = "education" | "business";

/**
 * Nature métier ou pédagogique du membre.
 *
 * Les quatre premières valeurs couvrent exactement ce que `nova-server`
 * renvoie aujourd'hui dans `users.role` (`student | teacher | staff | partner`) ;
 * `employee` et `manager` sont déclarés pour Business et ne sont produits par
 * aucune source actuelle. `partner` est traduit en `other` : c'est une
 * catégorie fourre-tout côté serveur, pas un métier.
 */
export type MemberType =
  | "student"
  | "teacher"
  | "staff"
  | "employee"
  | "manager"
  | "other";

/**
 * Droits de sécurité Nova.
 *
 * Aucune source actuelle n'en fournit : `nova-server` n'a pas de champ de rôle
 * de sécurité, et son panneau d'administration s'authentifie par un jeton
 * `X-Admin-Token` hors du modèle utilisateur. Tant qu'un serveur ne l'annonce
 * pas explicitement, tout membre connecté est `member` — y compris un
 * enseignant ou un responsable.
 */
export type SecurityRole = "member" | "organization_admin" | "it_admin";

/**
 * D'où vient un groupe. La garantie n'est pas la même selon la source, donc
 * elle est portée explicitement : `legacy_cohort` est le champ libre
 * `users.cohort` de l'actuel serveur Campus ; les autres désignent un annuaire
 * et ne sont produites par aucune source aujourd'hui.
 */
export type GroupSource =
  | "legacy_cohort"
  | "microsoft_entra"
  | "google_workspace"
  | "scim"
  | "manual";

/** Segmentation organisationnelle : promo, filière, équipe, service. */
export interface Group {
  /** Identifiant Nova du groupe. Aujourd'hui égal au libellé. */
  id: string;
  label: string;
  source: GroupSource;
  /**
   * Identifiant du groupe dans l'annuaire d'origine, quand il en a un.
   * Distinct de `id` : un groupe renommé côté annuaire garde son identifiant
   * Nova, et deux annuaires peuvent employer le même identifiant externe.
   */
  externalGroupId: string | null;
}

/** Cycle de vie d'un compte dans l'organisation. */
export type AccountStatus = "active" | "disabled" | "deprovisioned";

/**
 * Identité de l'organisation.
 *
 * `id` est volontairement nullable : un identifiant de tenant immuable n'existe
 * pas encore. Le nom d'affichage n'en tient **jamais** lieu — voir
 * `docs/architecture/organization-foundation.md`.
 */
export interface OrganizationIdentity {
  type: OrganizationType;
  /** Identifiant fourni par la configuration de l'organisation, sinon `null`. */
  id: string | null;
  /** Nom affiché, tel que fourni. Jamais utilisé comme identifiant. */
  displayName: string | null;
  shortName: string | null;
  /** L'organisation administre-t-elle le poste (déploiement DSI) ? */
  managed: boolean;
}

/** Le membre tel que Nova le connaît. Aucune valeur n'est inventée. */
export interface OrganizationMember {
  /** `null` tant qu'aucune source n'a annoncé la nature du membre. */
  memberType: MemberType | null;
  securityRole: SecurityRole;
  groups: Group[];
  /** `active` tant que le serveur n'annonce pas autre chose. */
  status: AccountStatus;
}

/**
 * Capacités : ce que l'édition **expose** comme surface fonctionnelle.
 *
 * À ne pas confondre avec les paliers de licence (`licensing.rs` / `TierBadge`),
 * qui répondent à « cet utilisateur y a-t-il droit ? ». Une capacité à `true`
 * peut rester verrouillée par une licence en édition Personal ; une capacité à
 * `false` n'apparaît pas du tout.
 */
export type CapabilityId =
  // — Nova Core : présent dans toutes les éditions sauf refus explicite —
  | "dictation"
  | "rewrite"
  | "writingStyles"
  | "personalStyles"
  | "fileTranscription"
  | "personalization"
  | "localFallback"
  // — Surfaces conditionnelles —
  | "commands"
  | "screenContext"
  | "cloudInference"
  | "engineeringNotes"
  // — Surfaces d'organisation —
  | "organizationVocabulary"
  | "organizationSnippets"
  | "organizationFormattingRules"
  | "organizationStyles"
  | "aiSkills"
  | "learning";

export type CapabilityMap = Readonly<Record<CapabilityId, boolean>>;

/**
 * Capacités relevant du **Nova Core**.
 *
 * Règle d'architecture : toute amélioration du Core (qualité de transcription,
 * latence, dictée, presse-papiers, overlay, Styles, Automatic, historique, IA
 * locale, performance, stabilité, UX) bénéficie par défaut à Personal, Campus
 * et Business. Une édition Organization ne perd une capacité Core que si une
 * policy explicite l'impose — mécanisme qui n'existe pas encore.
 */
export const CORE_CAPABILITIES: readonly CapabilityId[] = [
  "dictation",
  "rewrite",
  "writingStyles",
  "personalStyles",
  "fileTranscription",
  "personalization",
  "localFallback",
] as const;

/** Contexte d'organisation complet, tel que l'interface doit le consommer. */
export interface OrganizationContext {
  edition: Edition;
  /** `null` en édition Personal : aucune organisation fictive n'est fabriquée. */
  organization: OrganizationIdentity | null;
  /** `null` en édition Personal. */
  member: OrganizationMember | null;
  capabilities: CapabilityMap;
}

// ─────────────────────────────────────────────────────────────────────────────
// Préparation SSO / SCIM — types déclarés, aucune source ne les produit
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fournisseur d'identité.
 *
 * `legacy_email_code` — l'adresse académique et le code à six chiffres déjà en
 * production — en fait partie : c'est une manière de s'authentifier, pas un
 * régime à part. Ce qui la distingue est qu'elle n'a pas de sujet externe.
 */
export type IdentityProvider =
  | "microsoft_entra"
  | "google_workspace"
  | "oidc"
  | "legacy_email_code";

/**
 * Identité fédérée : qui se connecte, et chez qui.
 *
 * Le point important est structurel : l'identifiant principal est le couple
 * (`provider`, `externalSubject`), **pas l'adresse e-mail**. Une adresse
 * change, se réattribue, et n'existe pas dans certains annuaires.
 *
 * `externalSubject` doit être immuable : `oid` chez Microsoft, `sub` chez
 * Google, `sub` associé à l'`issuer` en OIDC générique. Voir
 * `createFederatedIdentity` dans `identity.ts`, qui refuse une adresse.
 */
export interface FederatedIdentity {
  provider: IdentityProvider;
  /** Sujet du fournisseur : stable, opaque, jamais une adresse. */
  externalSubject: string;
  /** `tid` Microsoft, identifiant client Google, `issuer` OIDC. */
  externalTenantId: string | null;
  /** Organisation Nova rattachée, quand le mapping existe. */
  organizationId: string | null;
}

/**
 * Rattachement explicite d'un tenant externe à une organisation Nova.
 *
 * C'est ce qui remplace la déduction par suffixe d'adresse : un tenant
 * n'appartient à une organisation que si quelqu'un l'a déclaré.
 */
export interface TenantMapping {
  provider: IdentityProvider;
  externalTenantId: string;
  organizationId: string;
}

/**
 * Ancrage annuaire, pour un provisionnement SCIM ultérieur. Déclaré ici pour
 * que le modèle puisse l'accueillir sans refonte ; aucun endpoint n'existe.
 */
export interface DirectoryLink {
  externalUserId: string;
  externalGroupIds: string[];
  active: boolean;
}
