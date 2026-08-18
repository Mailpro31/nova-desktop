//! Modèle d'organisation de Nova, côté backend.
//!
//! Ce module est le pendant Rust de `src/lib/organization/` : mêmes notions,
//! mêmes règles, une seule définition partagée entre les deux côtés du pont.
//! Il ne contient **que** le modèle et sa traduction depuis l'existant Campus —
//! aucune commande Tauri, aucun état global, aucun accès disque.
//!
//! ## Ce que le modèle refuse de faire
//!
//! - déduire un droit d'administration d'un métier (un enseignant n'est pas
//!   administrateur, un responsable non plus) ;
//! - déduire une identité d'une adresse e-mail ;
//! - transformer un nom d'affichage en identifiant de tenant.
//!
//! Chacune de ces trois déductions est facile à écrire, difficile à retirer, et
//! fausse dès la première organisation qui ne ressemble pas à la précédente.
//!
//! ## Nova Core
//!
//! Toute amélioration de la transcription, de la latence, de la dictée, du
//! presse-papiers, de l'overlay, des Styles, d'Automatic, de l'historique, de
//! l'IA locale, des performances, de la stabilité ou de l'UX appartient au Nova
//! Core et bénéficie par défaut à Personal, Campus et Business. Une édition
//! Organization ne perd une capacité Core que si une policy explicite l'impose
//! — mécanisme qui n'existe pas encore (voir
//! `docs/architecture/organization-foundation.md`).

use serde::{Deserialize, Serialize};

/// Ce que le produit est pour cet utilisateur.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Edition {
    Personal,
    Organization,
}

/// Nature de l'organisation. `Business` est déclaré, jamais produit aujourd'hui.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OrganizationType {
    Education,
    Business,
}

/// Nature métier ou pédagogique du membre — jamais un droit.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MemberType {
    Student,
    Teacher,
    Staff,
    Employee,
    Manager,
    Other,
}

/// Droits de sécurité Nova — jamais un métier.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SecurityRole {
    Member,
    OrganizationAdmin,
    ItAdmin,
}

/// D'où vient un groupe : la garantie n'est pas la même.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GroupSource {
    /// Champ libre `users.cohort` du serveur Campus actuel.
    LegacyCohort,
    /// Groupe d'annuaire Microsoft Entra — aucune source ne le produit encore.
    MicrosoftEntra,
    /// Groupe Google Workspace — aucune source ne le produit encore.
    GoogleWorkspace,
    /// Groupe provisionné par SCIM — aucun endpoint n'existe.
    Scim,
    /// Groupe créé à la main par un administrateur.
    Manual,
}

/// Segmentation organisationnelle : promo, filière, équipe, service.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Group {
    /// Identifiant Nova du groupe.
    pub id: String,
    pub label: String,
    pub source: GroupSource,
    /// Identifiant du groupe dans l'annuaire d'origine, quand il en a un.
    /// Distinct de `id` : un groupe renommé côté annuaire garde son identifiant
    /// Nova, et deux annuaires peuvent employer le même identifiant externe.
    pub external_group_id: Option<String>,
}

/// Identité de l'organisation.
///
/// `id` est nullable et le reste tant que le Control Plane n'a pas attribué
/// d'identifiant de tenant immuable. Le nom d'affichage n'en tient pas lieu.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OrganizationIdentity {
    pub organization_type: OrganizationType,
    pub id: Option<String>,
    pub display_name: Option<String>,
    pub short_name: Option<String>,
    pub managed: bool,
}

/// Le membre tel que Nova le connaît. Aucun champ n'est deviné.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OrganizationMember {
    pub member_type: Option<MemberType>,
    pub security_role: SecurityRole,
    pub groups: Vec<Group>,
}

// ─────────────────────────────────────────────────────────────────────────────
// Identité
//
// Chaîne de confiance visée :
//
//   Identity Provider → identité externe → organisation Nova → membership
//   → groupes → rôle de sécurité → capacités
//
// Chaque flèche est une décision **du serveur**. Le Desktop lit le résultat ;
// il ne le propose jamais.
// ─────────────────────────────────────────────────────────────────────────────

/// Fournisseur d'identité.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IdentityProvider {
    MicrosoftEntra,
    GoogleWorkspace,
    /// Tout IdP OIDC générique : Okta, Auth0, Keycloak, Ping…
    Oidc,
    /// Le couple adresse académique + code à six chiffres déjà en production.
    /// Ce n'est pas une identité fédérée : il n'a pas de sujet externe.
    LegacyEmailCode,
}

/// Identité fédérée : qui se connecte, et chez qui.
///
/// `external_subject` doit être **immuable** : `oid` chez Microsoft (identifiant
/// de l'objet utilisateur dans le tenant, stable au renommage), `sub` chez
/// Google, `sub` associé à l'`issuer` en OIDC générique. Une adresse e-mail
/// n'en est pas un : elle change, se réattribue, et n'existe pas dans certains
/// annuaires.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FederatedIdentity {
    pub provider: IdentityProvider,
    pub external_subject: String,
    /// `tid` Microsoft, identifiant client Google, `issuer` OIDC.
    pub external_tenant_id: Option<String>,
    /// Organisation Nova à laquelle cette identité a été rattachée, quand le
    /// mapping existe.
    pub organization_id: Option<String>,
}

/// Motif de refus d'une identité. Explicite, pour qu'un journal d'audit puisse
/// enregistrer un code de raison sans jamais enregistrer de jeton.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IdentityRejection {
    /// Sujet externe absent : sans lui, rien n'identifie durablement la personne.
    MissingSubject,
    /// Le sujet proposé est une adresse e-mail.
    EmailUsedAsSubject,
}

/// Une chaîne ressemble-t-elle à une adresse e-mail ?
///
/// Volontairement grossier : le but n'est pas de valider une adresse mais
/// d'empêcher qu'on en glisse une là où un identifiant immuable est attendu.
fn looks_like_an_email(value: &str) -> bool {
    let value = value.trim();
    match value.split_once('@') {
        Some((local, domain)) => {
            !local.is_empty() && domain.contains('.') && !domain.starts_with('.')
        }
        None => false,
    }
}

impl FederatedIdentity {
    /// Construit une identité fédérée, en refusant les sujets inacceptables.
    ///
    /// Le refus est un `Result`, pas un repli silencieux : accepter une adresse
    /// comme sujet ferait entrer dans le modèle un identifiant mutable, et plus
    /// rien ensuite ne pourrait le distinguer d'un vrai.
    pub fn new(
        provider: IdentityProvider,
        external_subject: &str,
        external_tenant_id: Option<&str>,
        organization_id: Option<&str>,
    ) -> Result<Self, IdentityRejection> {
        let subject = external_subject.trim();
        if subject.is_empty() {
            return Err(IdentityRejection::MissingSubject);
        }
        if looks_like_an_email(subject) {
            return Err(IdentityRejection::EmailUsedAsSubject);
        }
        Ok(Self {
            provider,
            external_subject: subject.to_string(),
            external_tenant_id: external_tenant_id
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string),
            organization_id: organization_id
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string),
        })
    }

    /// Clé d'unicité d'une identité : le couple (fournisseur, sujet).
    ///
    /// Un même sujet chez deux fournisseurs reste deux identités distinctes —
    /// rien ne garantit qu'un `sub` Google et un `oid` Microsoft identiques
    /// désignent la même personne.
    pub fn identity_key(&self) -> (IdentityProvider, &str) {
        (self.provider, self.external_subject.as_str())
    }
}

/// Cycle de vie d'un compte dans l'organisation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AccountStatus {
    Active,
    /// Suspendu : l'accès est refusé, le compte existe toujours.
    Disabled,
    /// Retiré de l'organisation par l'annuaire. Aucun mécanisme de
    /// déprovisionnement n'existe encore.
    Deprovisioned,
}

impl AccountStatus {
    /// Le compte donne-t-il accès à Nova ? Seul `Active` ouvre l'accès : un
    /// statut inconnu ou intermédiaire ne doit jamais valoir autorisation.
    pub fn grants_access(self) -> bool {
        matches!(self, AccountStatus::Active)
    }
}

/// Rattachement explicite d'un tenant externe à une organisation Nova.
///
/// C'est la table qui remplace la déduction par suffixe d'adresse. Un tenant
/// n'appartient à une organisation que si quelqu'un l'a déclaré.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TenantMapping {
    pub provider: IdentityProvider,
    pub external_tenant_id: String,
    pub organization_id: String,
}

/// Organisation Nova correspondant à un tenant externe, `None` si le mapping
/// n'a pas été déclaré.
///
/// Il n'existe volontairement **aucune** fonction équivalente prenant une
/// adresse ou un domaine : rattacher une organisation à partir de
/// « @entreprise.com » donnerait l'accès d'une organisation à quiconque
/// contrôle une adresse dans ce domaine.
pub fn resolve_organization_for_tenant<'a>(
    mappings: &'a [TenantMapping],
    provider: IdentityProvider,
    external_tenant_id: &str,
) -> Option<&'a str> {
    let tenant = external_tenant_id.trim();
    if tenant.is_empty() {
        return None;
    }
    mappings
        .iter()
        .find(|mapping| mapping.provider == provider && mapping.external_tenant_id == tenant)
        .map(|mapping| mapping.organization_id.as_str())
}

/// Édition correspondant à l'état Campus du backend.
///
/// Campus n'est pas une édition à part : c'est une organisation de type
/// éducation. Le jour où un build Organization servira Business, seul
/// `organization_type_for` changera.
pub fn edition_for(campus_enabled: bool) -> Edition {
    if campus_enabled {
        Edition::Organization
    } else {
        Edition::Personal
    }
}

/// Nature de l'organisation, `None` en édition Personal.
pub fn organization_type_for(edition: Edition) -> Option<OrganizationType> {
    match edition {
        Edition::Organization => Some(OrganizationType::Education),
        Edition::Personal => None,
    }
}

/// Traduit `users.role` du serveur Campus en nature de membre.
///
/// `partner` est la catégorie fourre-tout du serveur : elle ne désigne aucun
/// métier, d'où `Other`. Une valeur inconnue ne produit rien plutôt qu'un
/// métier arbitraire.
pub fn member_type_from_campus_role(role: &str) -> Option<MemberType> {
    match role.trim().to_ascii_lowercase().as_str() {
        "student" => Some(MemberType::Student),
        "teacher" => Some(MemberType::Teacher),
        "staff" => Some(MemberType::Staff),
        "partner" => Some(MemberType::Other),
        _ => None,
    }
}

/// Rôle de sécurité déduit d'un rôle **métier** Campus.
///
/// Toujours `Member`, et c'est le point : un métier ne confère aucun privilège.
/// Un enseignant n'administre pas parce qu'il enseigne.
///
/// Le rôle de sécurité réel est décidé par le serveur et annoncé par `/api/me` ;
/// le poste le lit, il ne le calcule jamais.
pub fn security_role_from_campus_role(_role: &str) -> SecurityRole {
    SecurityRole::Member
}

/// La cohorte Campus devient un groupe de compatibilité.
///
/// Même notion des deux côtés : un champ libre qui segmente sans conférer de
/// droit. Une cohorte vide ne produit pas de groupe vide.
pub fn group_from_campus_cohort(cohort: &str) -> Option<Group> {
    let label = cohort.trim();
    if label.is_empty() {
        return None;
    }
    Some(Group {
        id: label.to_string(),
        label: label.to_string(),
        source: GroupSource::LegacyCohort,
        // Une cohorte saisie à la main n'a pas d'identifiant d'annuaire.
        external_group_id: None,
    })
}

/// Membre reconstruit depuis une réponse `/api/me` du serveur Campus.
pub fn member_from_campus_profile(role: &str, cohort: &str) -> OrganizationMember {
    OrganizationMember {
        member_type: member_type_from_campus_role(role),
        security_role: security_role_from_campus_role(role),
        groups: group_from_campus_cohort(cohort).into_iter().collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn campus_build_is_an_education_organization() {
        let edition = edition_for(true);
        assert_eq!(edition, Edition::Organization);
        assert_eq!(
            organization_type_for(edition),
            Some(OrganizationType::Education)
        );
    }

    #[test]
    fn personal_build_has_no_organization() {
        let edition = edition_for(false);
        assert_eq!(edition, Edition::Personal);
        assert_eq!(organization_type_for(edition), None);
    }

    #[test]
    fn no_member_type_ever_grants_administration() {
        // Le cas dangereux : un enseignant ou un membre du personnel obtenant
        // des droits d'administration parce qu'il « a l'air » responsable.
        for role in ["student", "teacher", "staff", "partner", "unknown", ""] {
            assert_eq!(
                security_role_from_campus_role(role),
                SecurityRole::Member,
                "« {role} » ne doit conférer aucun droit d'administration"
            );
        }
    }

    #[test]
    fn campus_roles_map_to_member_types() {
        assert_eq!(
            member_type_from_campus_role("student"),
            Some(MemberType::Student)
        );
        assert_eq!(
            member_type_from_campus_role("Teacher"),
            Some(MemberType::Teacher)
        );
        assert_eq!(
            member_type_from_campus_role("staff"),
            Some(MemberType::Staff)
        );
        // `partner` n'est pas un métier : le fourre-tout reste un fourre-tout.
        assert_eq!(
            member_type_from_campus_role("partner"),
            Some(MemberType::Other)
        );
        // Plutôt rien qu'un métier inventé.
        assert_eq!(member_type_from_campus_role("doyen"), None);
        assert_eq!(member_type_from_campus_role(""), None);
    }

    #[test]
    fn cohort_becomes_a_compatibility_group() {
        let group = group_from_campus_cohort(" AERO2 ").expect("cohorte non vide");
        assert_eq!(group.id, "AERO2");
        assert_eq!(group.label, "AERO2");
        assert_eq!(group.source, GroupSource::LegacyCohort);
        assert_eq!(group.external_group_id, None);
        assert!(group_from_campus_cohort("   ").is_none());
    }

    // ── Identité ─────────────────────────────────────────────────────────

    #[test]
    fn an_email_can_never_become_an_external_subject() {
        // Le raccourci tentant : « on a déjà l'adresse, servons-nous en ».
        for email in [
            "etudiant@exemple.fr",
            "  Prenom.Nom@sous.domaine.exemple.fr  ",
            "employe@entreprise.com",
        ] {
            assert_eq!(
                FederatedIdentity::new(IdentityProvider::MicrosoftEntra, email, None, None),
                Err(IdentityRejection::EmailUsedAsSubject),
                "« {email} » est une adresse, pas un identifiant immuable"
            );
        }
    }

    #[test]
    fn an_identity_without_subject_is_refused() {
        assert_eq!(
            FederatedIdentity::new(IdentityProvider::GoogleWorkspace, "   ", None, None),
            Err(IdentityRejection::MissingSubject)
        );
    }

    #[test]
    fn immutable_subjects_are_accepted() {
        let identity = FederatedIdentity::new(
            IdentityProvider::MicrosoftEntra,
            " 9f2c1a70-1111-4b3e-9f10-abc123456789 ",
            Some(" tenant-a "),
            None,
        )
        .expect("un oid est un sujet acceptable");
        assert_eq!(
            identity.external_subject,
            "9f2c1a70-1111-4b3e-9f10-abc123456789"
        );
        assert_eq!(identity.external_tenant_id.as_deref(), Some("tenant-a"));
        // Aucune organisation n'est inventée faute de mapping.
        assert_eq!(identity.organization_id, None);
    }

    #[test]
    fn the_same_subject_at_two_providers_is_two_identities() {
        let microsoft = FederatedIdentity::new(
            IdentityProvider::MicrosoftEntra,
            "sujet-partage",
            None,
            None,
        )
        .unwrap();
        let google = FederatedIdentity::new(
            IdentityProvider::GoogleWorkspace,
            "sujet-partage",
            None,
            None,
        )
        .unwrap();
        assert_ne!(microsoft.identity_key(), google.identity_key());
        assert_ne!(microsoft, google);
    }

    fn mappings() -> Vec<TenantMapping> {
        vec![
            TenantMapping {
                provider: IdentityProvider::MicrosoftEntra,
                external_tenant_id: "tenant-a".into(),
                organization_id: "organisation-a".into(),
            },
            TenantMapping {
                provider: IdentityProvider::MicrosoftEntra,
                external_tenant_id: "tenant-b".into(),
                organization_id: "organisation-b".into(),
            },
        ]
    }

    #[test]
    fn two_tenants_can_never_be_confused() {
        let mappings = mappings();
        assert_eq!(
            resolve_organization_for_tenant(
                &mappings,
                IdentityProvider::MicrosoftEntra,
                "tenant-a"
            ),
            Some("organisation-a")
        );
        assert_eq!(
            resolve_organization_for_tenant(
                &mappings,
                IdentityProvider::MicrosoftEntra,
                "tenant-b"
            ),
            Some("organisation-b")
        );
    }

    #[test]
    fn an_undeclared_tenant_maps_to_nothing() {
        let mappings = mappings();
        // Le cas dangereux : un tenant inconnu qui entrerait « par défaut »
        // dans la première organisation venue.
        assert_eq!(
            resolve_organization_for_tenant(
                &mappings,
                IdentityProvider::MicrosoftEntra,
                "tenant-inconnu"
            ),
            None
        );
        assert_eq!(
            resolve_organization_for_tenant(&mappings, IdentityProvider::MicrosoftEntra, "   "),
            None
        );
    }

    #[test]
    fn a_tenant_declared_for_one_provider_does_not_serve_another() {
        let mappings = mappings();
        assert_eq!(
            resolve_organization_for_tenant(
                &mappings,
                IdentityProvider::GoogleWorkspace,
                "tenant-a"
            ),
            None
        );
    }

    #[test]
    fn only_an_active_account_grants_access() {
        assert!(AccountStatus::Active.grants_access());
        assert!(!AccountStatus::Disabled.grants_access());
        assert!(!AccountStatus::Deprovisioned.grants_access());
    }

    #[test]
    fn profile_without_cohort_has_no_group() {
        let member = member_from_campus_profile("student", "");
        assert_eq!(member.member_type, Some(MemberType::Student));
        assert_eq!(member.security_role, SecurityRole::Member);
        assert!(member.groups.is_empty());
    }
}
