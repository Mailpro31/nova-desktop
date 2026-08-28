//! Contenu distribué par l'organisation, côté poste.
//!
//! ## Ce que ce module tient
//!
//! Le catalogue publié par l'organisation — Styles, AI Skills, vocabulaire —
//! tel que `/api/organization/packages` le renvoie, gardé en mémoire pour que
//! la résolution d'un Style n'ait pas à toucher le réseau à chaque dictée.
//!
//! ## Pourquoi un magasin séparé des réglages
//!
//! Il aurait été plus court d'injecter les Styles d'organisation dans
//! `post_process_prompts`, avec les Styles personnels. Ce serait une faute :
//! ces réglages sont la propriété de l'utilisateur — il les modifie, les
//! supprime, ils survivent à une déconnexion. Y écrire du contenu que
//! l'organisation contrôle mélangerait deux durées de vie et deux autorités.
//! Supprimer un Style d'organisation depuis l'écran des Styles aurait alors
//! signifié « le supprimer jusqu'à la prochaine synchronisation », ce qui n'est
//! ni une suppression ni un refus.
//!
//! ## Le catalogue porte son organisation
//!
//! Sans cela, changer d'organisation laisserait le contenu de la précédente
//! s'appliquer — une fuite silencieuse, visible seulement sous la forme d'un
//! Style qui ne devrait plus être là.

use crate::licensing::ORGANIZATION_STYLE_PREFIX;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::sync::RwLock;

/// Un Style publié par l'organisation, réduit à ce que l'exécution demande.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Type)]
pub struct OrganizationStyle {
    /// Identifiant préfixé, attribué par le serveur.
    pub id: String,
    pub name: String,
    /// La consigne réellement envoyée au modèle.
    pub instruction: String,
}

/// Un AI Skill publié par l'organisation.
///
/// **Déclaratif, et rien d'autre.** Pas de script, pas d'URL à exécuter : le
/// serveur refuse déjà ces champs, et le poste ne saurait pas quoi en faire —
/// mais la structure le dit aussi, pour que personne n'ait l'idée de l'étendre.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Type)]
pub struct OrganizationSkill {
    pub id: String,
    pub title: String,
    pub summary: String,
    pub practice: String,
    pub duration_minutes: u32,
    pub steps: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct OrganizationCatalog {
    /// Organisation à laquelle ce catalogue appartient. `None` = aucun.
    pub organization_id: Option<String>,
    pub catalog_version: String,
    pub styles: Vec<OrganizationStyle>,
    pub skills: Vec<OrganizationSkill>,
}

static CATALOG: RwLock<Option<OrganizationCatalog>> = RwLock::new(None);

/// Remplace le catalogue courant.
///
/// Un remplacement, jamais une fusion : garder des morceaux de l'ancien
/// produirait un mélange de versions, et personne ne saurait dire laquelle est
/// appliquée.
pub fn set_catalog(catalog: OrganizationCatalog) {
    if let Ok(mut guard) = CATALOG.write() {
        *guard = Some(catalog);
    }
}

/// Vide le catalogue — déconnexion, ou changement d'organisation.
pub fn clear_catalog() {
    if let Ok(mut guard) = CATALOG.write() {
        *guard = None;
    }
}

/// Le catalogue courant, s'il appartient à l'organisation demandée.
///
/// `organization_id` à `None` — Personal, ou avant toute connexion — ne renvoie
/// jamais rien : Nova Personal ne consomme aucun contenu d'organisation.
pub fn catalog_for(organization_id: Option<&str>) -> Option<OrganizationCatalog> {
    let organization_id = organization_id?;
    let guard = CATALOG.read().ok()?;
    let catalog = guard.as_ref()?;
    match catalog.organization_id.as_deref() {
        Some(owner) if owner == organization_id => Some(catalog.clone()),
        _ => None,
    }
}

/// Le catalogue courant sans vérification de propriétaire.
///
/// Réservé aux appelants qui viennent d'établir l'organisation eux-mêmes.
pub fn current_catalog() -> Option<OrganizationCatalog> {
    CATALOG.read().ok()?.clone()
}

/// La consigne d'un Style d'organisation, si le catalogue la porte.
pub fn style_instruction(organization_id: Option<&str>, style_id: &str) -> Option<String> {
    if !style_id.starts_with(ORGANIZATION_STYLE_PREFIX) {
        return None;
    }
    catalog_for(organization_id)?
        .styles
        .into_iter()
        .find(|style| style.id == style_id)
        .map(|style| style.instruction)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    /// Le catalogue est un état de processus, et `cargo test` exécute en
    /// parallèle : sans ce verrou, un test en viderait un autre au milieu de sa
    /// vérification. L'échec serait intermittent — le pire genre.
    static SERIAL: Mutex<()> = Mutex::new(());

    fn guard() -> std::sync::MutexGuard<'static, ()> {
        SERIAL
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn catalog(owner: &str) -> OrganizationCatalog {
        OrganizationCatalog {
            organization_id: Some(owner.to_string()),
            catalog_version: "v1".into(),
            styles: vec![OrganizationStyle {
                id: format!("{ORGANIZATION_STYLE_PREFIX}abc"),
                name: "Example".into(),
                instruction: "Write plainly.".into(),
            }],
            skills: vec![],
        }
    }

    #[test]
    fn a_catalog_serves_only_its_own_organization() {
        let _serial = guard();
        set_catalog(catalog("org-a"));
        assert!(catalog_for(Some("org-a")).is_some());
        assert!(catalog_for(Some("org-b")).is_none());
        clear_catalog();
    }

    #[test]
    fn personal_never_receives_a_catalog() {
        let _serial = guard();
        set_catalog(catalog("org-a"));
        assert!(catalog_for(None).is_none());
        clear_catalog();
    }

    #[test]
    fn clearing_leaves_nothing_behind() {
        let _serial = guard();
        set_catalog(catalog("org-a"));
        clear_catalog();
        assert!(catalog_for(Some("org-a")).is_none());
    }

    #[test]
    fn a_style_resolves_only_within_its_organization() {
        let _serial = guard();
        set_catalog(catalog("org-a"));
        let id = format!("{ORGANIZATION_STYLE_PREFIX}abc");
        assert_eq!(
            style_instruction(Some("org-a"), &id).as_deref(),
            Some("Write plainly.")
        );
        assert!(style_instruction(Some("org-b"), &id).is_none());
        clear_catalog();
    }

    #[test]
    fn a_personal_style_id_never_resolves_here() {
        let _serial = guard();
        // Sans ce contrôle, un Style personnel nommé comme un Style
        // d'organisation contournerait le palier Ultra.
        set_catalog(catalog("org-a"));
        assert!(style_instruction(Some("org-a"), "mon-style").is_none());
        clear_catalog();
    }

    #[test]
    fn replacing_the_catalog_keeps_nothing_of_the_previous_one() {
        let _serial = guard();
        set_catalog(catalog("org-a"));
        let mut next = catalog("org-a");
        next.styles.clear();
        next.catalog_version = "v2".into();
        set_catalog(next);
        let current = catalog_for(Some("org-a")).unwrap();
        assert!(current.styles.is_empty());
        assert_eq!(current.catalog_version, "v2");
        clear_catalog();
    }
}
