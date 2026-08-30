//! Déploiement géré — ce que le poste apprend de la DSI avant toute connexion.
//!
//! ## Le problème
//!
//! Un poste installé par une DSI doit savoir qu'il appartient à une
//! organisation **avant** que quiconque se connecte. Sinon le premier écran
//! demande une adresse de serveur, et mille postes deviennent mille saisies
//! manuelles.
//!
//! ## Ce que ce module ne fait pas
//!
//! Savoir qu'un poste est géré n'authentifie personne. La configuration lue ici
//! ne contient **aucun secret** et n'accorde **aucun accès** : elle dit quelle
//! organisation joindre, pas qui vous êtes. Le parcours SSO reste entier. Un
//! `deployment_id` volé sur un poste ne permet ni de se faire passer pour un
//! utilisateur, ni d'administrer une organisation, ni d'enrôler un Connector.
//!
//! ## Pourquoi l'origine est épinglée
//!
//! Le reste de la configuration peut venir d'une stratégie MDM, donc d'un
//! canal que Nova ne contrôle pas. Si l'adresse du Control Plane venait de là
//! aussi, une stratégie mal formée — ou hostile — enverrait les échanges du
//! poste vers un service arbitraire. L'origine est donc choisie dans une liste
//! compilée dans le package : la DSI peut sélectionner, pas inventer.
//!
//! ## Priorité des sources
//!
//! 1. stratégie machine `HKLM\SOFTWARE\Policies\Nova` — ce qu'une GPO ou un MDM
//!    dépose, et qu'un utilisateur standard ne peut pas modifier ;
//! 2. `%ProgramData%\Nova\organization.json` — ce que l'installeur écrit ;
//! 3. valeurs par défaut du package ;
//! 4. configuration héritée `campus-config.json` — voir `commands::campus`.
//!
//! Une source de rang supérieur **invalide** ne se rabat pas silencieusement
//! sur la suivante : elle échoue. Un repli silencieux transformerait une
//! stratégie cassée en poste non géré, ce qui est exactement l'inverse de ce
//! qu'une DSI attend.

use serde::{Deserialize, Serialize};
use specta::Type;
use std::path::{Path, PathBuf};

/// Nom du fichier écrit par l'installeur. Distinct de `campus-config.json` :
/// l'ancien schéma reste lisible, et mélanger les deux dans un même fichier
/// aurait rendu impossible de dire lequel fait autorité.
pub const MANAGED_CONFIG_FILENAME: &str = "organization.json";

/// Seule version de schéma comprise. Une version plus récente est refusée
/// plutôt que devinée : un poste qui interprète à moitié une configuration
/// qu'il ne comprend pas est plus dangereux qu'un poste qui s'arrête.
pub const MANAGED_SCHEMA_VERSION: u32 = 1;

/// Clé de stratégie machine. `Policies` est la branche que les GPO et les
/// fournisseurs MDM écrivent, et qu'un utilisateur standard ne peut pas
/// modifier sans élévation.
pub const POLICY_KEY: &str = r"SOFTWARE\Policies\Nova";

/// Origines Control Plane acceptables, compilées dans le package.
///
/// Une stratégie peut en **désigner** une ; elle ne peut pas en ajouter. Voir
/// l'en-tête de module.
pub const PINNED_CONTROL_PLANE_ORIGINS: &[&str] = &["https://api.novaspeak.app"];

/// Canaux de diffusion. La DSI choisit un canal, jamais une URL d'artefact.
pub const RELEASE_CHANNELS: &[&str] = &["stable", "preview"];

/// Politique de mise à jour applicable au poste.
pub const UPDATE_POLICIES: &[&str] = &["manual", "notify", "automatic"];

/// Anneaux de déploiement. Fondation seulement : Nova n'orchestre aucun parc.
pub const DEPLOYMENT_RINGS: &[&str] = &["pilot", "broad"];

/// Ce qui a mal tourné, sous une forme que l'interface peut afficher et qu'un
/// journal d'installation peut porter sans rien révéler.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum DeploymentConfigError {
    /// Le fichier ou la clé existe mais n'est pas du JSON.
    Malformed,
    /// `schema_version` absent ou différent de celui que ce poste comprend.
    UnsupportedSchema,
    /// Un champ obligatoire manque.
    MissingField,
    /// Un champ a une valeur que le contrat n'autorise pas.
    InvalidValue,
    /// Un champ inconnu : refus plutôt qu'ignorance silencieuse.
    UnknownField,
    /// L'origine désignée n'est pas dans la liste épinglée du package.
    OriginNotPinned,
    /// Le fichier existe mais n'a pas pu être lu.
    Unreadable,
}

impl DeploymentConfigError {
    /// Code stable, destiné aux journaux et aux tests.
    pub fn code(&self) -> &'static str {
        match self {
            Self::Malformed => "DEPLOYMENT_CONFIG_MALFORMED",
            Self::UnsupportedSchema => "DEPLOYMENT_CONFIG_SCHEMA_UNSUPPORTED",
            Self::MissingField => "DEPLOYMENT_CONFIG_FIELD_MISSING",
            Self::InvalidValue => "DEPLOYMENT_CONFIG_VALUE_INVALID",
            Self::UnknownField => "DEPLOYMENT_CONFIG_FIELD_UNKNOWN",
            Self::OriginNotPinned => "DEPLOYMENT_CONFIG_ORIGIN_NOT_PINNED",
            Self::Unreadable => "DEPLOYMENT_CONFIG_UNREADABLE",
        }
    }
}

/// D'où vient la configuration retenue. Une DSI qui diagnostique un poste a
/// besoin de le savoir avant tout le reste.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum DeploymentSource {
    /// `HKLM\SOFTWARE\Policies\Nova`.
    MachinePolicy,
    /// `%ProgramData%\Nova\organization.json`.
    ManagedFile,
    /// Aucune des deux : le poste n'est pas géré.
    None,
}

/// Configuration de déploiement, telle qu'elle est écrite et telle qu'elle est
/// lue. `deny_unknown_fields` est le cœur du contrat : un champ non prévu est
/// une erreur, jamais un ajout silencieux.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(deny_unknown_fields)]
pub struct ManagedDeployment {
    pub schema_version: u32,
    /// Identifiant opaque du parc, attribué par le Control Plane.
    /// **Non secret** : le connaître n'accorde rien.
    pub deployment_id: String,
    /// Organisation à joindre. Opaque également.
    pub organization_id: String,
    /// Origine Control Plane, obligatoirement épinglée.
    pub control_plane_origin: String,
    pub release_channel: String,
    /// Toujours `true` dans un fichier valide : un fichier qui déclare
    /// `managed: false` ne décrit pas un déploiement géré, et le dire
    /// explicitement évite qu'un `false` accidentel passe pour un oubli.
    pub managed: bool,
    /// Révision de configuration, pour que le Control Plane sache si ce poste
    /// applique encore une configuration périmée.
    #[serde(default)]
    pub config_revision: u32,
    /// `manual` | `notify` | `automatic`. Absent = `notify`.
    #[serde(default)]
    pub update_policy: Option<String>,
    /// `pilot` | `broad`. Fondation ; Nova ne cible rien dynamiquement.
    #[serde(default)]
    pub deployment_ring: Option<String>,
    /// Démarrage automatique à l'ouverture de session, imposé par la DSI.
    /// Absent = le réglage utilisateur décide.
    #[serde(default)]
    pub autostart: Option<bool>,
}

/// Identifiant de déploiement : opaque, borné, sans caractère qui puisse
/// traverser une ligne de commande ou un chemin.
fn identifier_is_valid(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// Vérifie un document déjà désérialisé. Séparé de la lecture pour être
/// testable sans toucher au disque ni au registre.
pub fn validate(config: ManagedDeployment) -> Result<ManagedDeployment, DeploymentConfigError> {
    if config.schema_version != MANAGED_SCHEMA_VERSION {
        return Err(DeploymentConfigError::UnsupportedSchema);
    }
    if !identifier_is_valid(&config.deployment_id) || !identifier_is_valid(&config.organization_id)
    {
        return Err(DeploymentConfigError::InvalidValue);
    }
    if !PINNED_CONTROL_PLANE_ORIGINS.contains(&config.control_plane_origin.as_str()) {
        return Err(DeploymentConfigError::OriginNotPinned);
    }
    if !RELEASE_CHANNELS.contains(&config.release_channel.as_str()) {
        return Err(DeploymentConfigError::InvalidValue);
    }
    if !config.managed {
        return Err(DeploymentConfigError::InvalidValue);
    }
    if let Some(policy) = &config.update_policy {
        if !UPDATE_POLICIES.contains(&policy.as_str()) {
            return Err(DeploymentConfigError::InvalidValue);
        }
    }
    if let Some(ring) = &config.deployment_ring {
        if !DEPLOYMENT_RINGS.contains(&ring.as_str()) {
            return Err(DeploymentConfigError::InvalidValue);
        }
    }
    Ok(config)
}

/// Désérialise puis valide. Les erreurs de `serde` sont ramenées aux codes du
/// contrat pour que l'interface n'ait jamais à afficher un message de bibliothèque.
pub fn parse(document: &str) -> Result<ManagedDeployment, DeploymentConfigError> {
    match serde_json::from_str::<ManagedDeployment>(document) {
        Ok(config) => validate(config),
        Err(error) => Err(classify(document, &error)),
    }
}

fn classify(document: &str, error: &serde_json::Error) -> DeploymentConfigError {
    if serde_json::from_str::<serde_json::Value>(document).is_err() {
        return DeploymentConfigError::Malformed;
    }
    let message = error.to_string();
    if message.contains("unknown field") {
        DeploymentConfigError::UnknownField
    } else if message.contains("missing field") {
        DeploymentConfigError::MissingField
    } else {
        DeploymentConfigError::InvalidValue
    }
}

/// Répertoire de configuration à l'échelle de la machine.
///
/// `%ProgramData%\Nova` est l'emplacement prévu par Windows pour une donnée
/// commune à tous les comptes : lisible par un utilisateur standard, écrivable
/// seulement par un administrateur, et hors du répertoire d'installation — donc
/// préservé par une mise à jour.
#[cfg(windows)]
pub fn machine_config_dir() -> Option<PathBuf> {
    std::env::var_os("ProgramData").map(|dir| PathBuf::from(dir).join("Nova"))
}

#[cfg(target_os = "macos")]
pub fn machine_config_dir() -> Option<PathBuf> {
    Some(PathBuf::from("/Library/Application Support/Nova"))
}

#[cfg(all(unix, not(target_os = "macos")))]
pub fn machine_config_dir() -> Option<PathBuf> {
    Some(PathBuf::from("/etc/nova"))
}

/// Lit le fichier managé d'un répertoire donné. `Ok(None)` = absent, ce qui
/// n'est pas une erreur : un poste non géré est un cas normal.
pub fn read_managed_file(dir: &Path) -> Result<Option<ManagedDeployment>, DeploymentConfigError> {
    let path = dir.join(MANAGED_CONFIG_FILENAME);
    if !path.is_file() {
        return Ok(None);
    }
    let content = std::fs::read_to_string(&path).map_err(|_| DeploymentConfigError::Unreadable)?;
    parse(&content).map(Some)
}

/// Stratégie machine, lue depuis le registre. Les valeurs y sont des chaînes et
/// des `DWORD` — la forme qu'un modèle ADMX ou une stratégie Intune sait
/// écrire — puis réassemblées dans le même contrat que le fichier.
#[cfg(windows)]
pub fn read_machine_policy() -> Result<Option<ManagedDeployment>, DeploymentConfigError> {
    use winreg::enums::{HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_64KEY};
    use winreg::RegKey;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let Ok(key) = hklm.open_subkey_with_flags(POLICY_KEY, KEY_READ | KEY_WOW64_64KEY) else {
        return Ok(None);
    };
    let managed: u32 = key.get_value("Managed").unwrap_or(0);
    if managed == 0 {
        // Une clé présente qui ne déclare pas `Managed` n'est pas une
        // configuration à moitié valide : c'est l'absence de configuration.
        return Ok(None);
    }
    let string = |name: &str| key.get_value::<String, _>(name).ok();
    let config = ManagedDeployment {
        schema_version: key
            .get_value::<u32, _>("SchemaVersion")
            .unwrap_or(MANAGED_SCHEMA_VERSION),
        deployment_id: string("DeploymentId").ok_or(DeploymentConfigError::MissingField)?,
        organization_id: string("OrganizationId").ok_or(DeploymentConfigError::MissingField)?,
        control_plane_origin: string("ControlPlaneOrigin")
            .unwrap_or_else(|| PINNED_CONTROL_PLANE_ORIGINS[0].to_string()),
        release_channel: string("Channel").unwrap_or_else(|| "stable".to_string()),
        managed: true,
        config_revision: key.get_value::<u32, _>("ConfigRevision").unwrap_or(0),
        update_policy: string("UpdatePolicy"),
        deployment_ring: string("DeploymentRing"),
        autostart: key.get_value::<u32, _>("Autostart").ok().map(|v| v != 0),
    };
    validate(config).map(Some)
}

#[cfg(not(windows))]
pub fn read_machine_policy() -> Result<Option<ManagedDeployment>, DeploymentConfigError> {
    // Il n'existe pas d'équivalent de `HKLM\Software\Policies` ailleurs, et en
    // inventer un donnerait l'illusion d'une couche de stratégie inexistante.
    Ok(None)
}

/// Identifiant de poste, écrit une fois par l'installeur.
///
/// Aléatoire, stable, non secret, et **jamais dérivé du matériel** : ni numéro
/// de série, ni TPM, ni adresse MAC. Nova n'a pas besoin de reconnaître une
/// machine, seulement de distinguer deux rapports d'état. Absent quand
/// l'installeur ne l'a pas écrit — auquel cas on le dit, on ne le fabrique pas.
pub fn read_device_id(dir: &Path) -> Option<String> {
    let content = std::fs::read_to_string(dir.join("device.json")).ok()?;
    let value: serde_json::Value = serde_json::from_str(&content).ok()?;
    let id = value.get("device_id")?.as_str()?.trim().to_string();
    identifier_is_valid(&id).then_some(id)
}

/// État de déploiement du poste, tel que l'interface et un diagnostic DSI
/// peuvent le lire.
///
/// **Rien de ce qui est ici n'est du contenu utilisateur** : pas de texte
/// dicté, pas d'audio, pas de presse-papiers, pas d'historique. C'est la
/// frontière posée par `control-plane-foundation.md`, et un état de déploiement
/// n'a aucune raison de la franchir.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct DeploymentState {
    pub installed_version: String,
    /// `organization` ou `personal`, tel que le package a été compilé.
    pub edition: String,
    pub managed: bool,
    pub source: DeploymentSource,
    pub deployment_id: Option<String>,
    pub organization_id: Option<String>,
    pub control_plane_origin: Option<String>,
    pub release_channel: Option<String>,
    pub config_revision: u32,
    pub update_policy: Option<String>,
    pub deployment_ring: Option<String>,
    pub autostart: Option<bool>,
    pub device_id: Option<String>,
    /// Portée d'installation : `machine`, `user`, `portable` ou `unknown`.
    pub install_scope: String,
    /// Code d'erreur si une source prioritaire est invalide. Dans ce cas
    /// `managed` reste `false` et l'interface doit le dire, pas se rabattre.
    pub error: Option<String>,
}

/// Portée d'installation, déduite du chemin de l'exécutable.
///
/// Déduire plutôt que déclarer : un marqueur écrit à l'installation mentirait
/// dès qu'on copie le dossier ailleurs, alors que le chemin, lui, est la vérité.
pub fn install_scope(exe_dir: &Path) -> String {
    if crate::portable::is_portable() {
        return "portable".to_string();
    }
    let path = exe_dir.to_string_lossy().to_lowercase();
    for variable in ["ProgramFiles", "ProgramFiles(x86)", "ProgramW6432"] {
        if let Some(root) = std::env::var_os(variable) {
            let root = root.to_string_lossy().to_lowercase();
            if !root.is_empty() && path.starts_with(&root) {
                return "machine".to_string();
            }
        }
    }
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        let local = local.to_string_lossy().to_lowercase();
        if !local.is_empty() && path.starts_with(&local) {
            return "user".to_string();
        }
    }
    "unknown".to_string()
}

/// Applique la priorité des sources et construit l'état.
///
/// Le répertoire machine est un paramètre pour que les tests décrivent un poste
/// entier sans écrire dans `ProgramData` de la machine qui les exécute.
pub fn resolve(machine_dir: Option<&Path>, exe_dir: &Path, edition: &str) -> DeploymentState {
    resolve_with(read_machine_policy(), machine_dir, exe_dir, edition)
}

/// La priorité elle-même, isolée de ses deux sources.
///
/// La stratégie machine est passée en argument plutôt que lue ici : sans cela,
/// vérifier l'ordre de priorité demanderait d'écrire dans le registre réel de
/// la machine qui exécute les tests, ce qui n'est pas un prix acceptable pour
/// un test unitaire.
pub fn resolve_with(
    policy: Result<Option<ManagedDeployment>, DeploymentConfigError>,
    machine_dir: Option<&Path>,
    exe_dir: &Path,
    edition: &str,
) -> DeploymentState {
    let mut state = DeploymentState {
        installed_version: env!("CARGO_PKG_VERSION").to_string(),
        edition: edition.to_string(),
        managed: false,
        source: DeploymentSource::None,
        deployment_id: None,
        organization_id: None,
        control_plane_origin: None,
        release_channel: None,
        config_revision: 0,
        update_policy: None,
        deployment_ring: None,
        autostart: None,
        device_id: machine_dir.and_then(read_device_id),
        install_scope: install_scope(exe_dir),
        error: None,
    };

    // 1. stratégie machine. Une stratégie invalide arrête tout : se rabattre
    //    sur le fichier reviendrait à laisser un utilisateur contourner une
    //    stratégie en cassant volontairement une valeur qu'il peut lire.
    match policy {
        Ok(Some(config)) => return apply(state, config, DeploymentSource::MachinePolicy),
        Err(error) => {
            state.error = Some(error.code().to_string());
            return state;
        }
        Ok(None) => {}
    }

    // 2. fichier managé écrit par l'installeur.
    if let Some(dir) = machine_dir {
        match read_managed_file(dir) {
            Ok(Some(config)) => return apply(state, config, DeploymentSource::ManagedFile),
            Err(error) => {
                state.error = Some(error.code().to_string());
                return state;
            }
            Ok(None) => {}
        }
    }

    // 3. aucune configuration gérée : le poste n'est pas géré. Ce n'est pas une
    //    erreur, et `campus-config.json` reste lu par `commands::campus`.
    state
}

fn apply(
    mut state: DeploymentState,
    config: ManagedDeployment,
    source: DeploymentSource,
) -> DeploymentState {
    state.managed = true;
    state.source = source;
    state.config_revision = config.config_revision;
    state.update_policy = Some(config.update_policy.unwrap_or_else(|| "notify".to_string()));
    state.deployment_ring = config.deployment_ring;
    state.autostart = config.autostart;
    state.deployment_id = Some(config.deployment_id);
    state.organization_id = Some(config.organization_id);
    state.control_plane_origin = Some(config.control_plane_origin);
    state.release_channel = Some(config.release_channel);
    state
}

/// État de déploiement du poste. Lecture seule, sans effet de bord.
#[tauri::command]
#[specta::specta]
pub fn get_deployment_state() -> Result<DeploymentState, String> {
    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_dir = exe_path
        .parent()
        .ok_or("Could not determine executable directory")?;
    let edition = if crate::licensing::is_campus_enabled() {
        "organization"
    } else {
        "personal"
    };
    Ok(resolve(machine_config_dir().as_deref(), exe_dir, edition))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_document() -> String {
        format!(
            r#"{{
              "schema_version": 1,
              "deployment_id": "dpl-0123456789abcdef",
              "organization_id": "org-controlled-example",
              "control_plane_origin": "{}",
              "release_channel": "stable",
              "managed": true,
              "config_revision": 4
            }}"#,
            PINNED_CONTROL_PLANE_ORIGINS[0]
        )
    }

    #[test]
    fn a_valid_document_is_accepted_and_keeps_every_field() {
        let config = parse(&valid_document()).expect("valid");
        assert_eq!(config.deployment_id, "dpl-0123456789abcdef");
        assert_eq!(config.organization_id, "org-controlled-example");
        assert_eq!(config.release_channel, "stable");
        assert_eq!(config.config_revision, 4);
        assert!(config.managed);
    }

    #[test]
    fn a_malformed_document_is_refused() {
        assert_eq!(parse("{ not json"), Err(DeploymentConfigError::Malformed));
    }

    #[test]
    fn a_missing_required_field_is_refused() {
        let document = valid_document().replace(r#""deployment_id": "dpl-0123456789abcdef","#, "");
        assert_eq!(parse(&document), Err(DeploymentConfigError::MissingField));
    }

    #[test]
    fn an_unknown_field_is_refused_rather_than_ignored() {
        let document = valid_document().replace(
            r#""config_revision": 4"#,
            r#""config_revision": 4, "admin_token": "x""#,
        );
        assert_eq!(parse(&document), Err(DeploymentConfigError::UnknownField));
    }

    #[test]
    fn a_future_schema_is_refused_rather_than_guessed() {
        let document = valid_document().replace(r#""schema_version": 1"#, r#""schema_version": 2"#);
        assert_eq!(
            parse(&document),
            Err(DeploymentConfigError::UnsupportedSchema)
        );
    }

    #[test]
    fn an_arbitrary_control_plane_origin_is_refused() {
        for origin in [
            "https://attacker.example",
            "http://api.novaspeak.app",
            "https://api.novaspeak.app.evil.example",
            "https://api.novaspeak.app/",
            "",
        ] {
            let document = valid_document().replace(PINNED_CONTROL_PLANE_ORIGINS[0], origin);
            assert_eq!(
                parse(&document),
                Err(DeploymentConfigError::OriginNotPinned),
                "origin {origin} must not be accepted"
            );
        }
    }

    #[test]
    fn an_unknown_channel_is_refused() {
        let document = valid_document().replace(r#""stable""#, r#""nightly""#);
        assert_eq!(parse(&document), Err(DeploymentConfigError::InvalidValue));
    }

    #[test]
    fn a_hostile_deployment_id_is_refused() {
        for identifier in [
            "",
            "../../evil",
            "dpl id",
            "dpl\"; shutdown",
            "dpl\\windows",
            "dpl\nsecond-line",
            &"d".repeat(129),
        ] {
            // Le document est fabriqué par `serde_json` : l'identifiant est
            // toujours du JSON valide, et c'est donc bien la validation — non
            // l'analyse syntaxique — qui le refuse.
            let mut document: serde_json::Value =
                serde_json::from_str(&valid_document()).expect("valid base document");
            document["deployment_id"] = serde_json::Value::String(identifier.to_string());
            assert_eq!(
                parse(&document.to_string()),
                Err(DeploymentConfigError::InvalidValue),
                "identifier {identifier:?} must not be accepted"
            );
        }
    }

    #[test]
    fn managed_false_is_refused_rather_than_treated_as_unmanaged() {
        let document = valid_document().replace(r#""managed": true"#, r#""managed": false"#);
        assert_eq!(parse(&document), Err(DeploymentConfigError::InvalidValue));
    }

    #[test]
    fn an_unknown_update_policy_is_refused() {
        let document = valid_document().replace(
            r#""config_revision": 4"#,
            r#""config_revision": 4, "update_policy": "silent-forced""#,
        );
        assert_eq!(parse(&document), Err(DeploymentConfigError::InvalidValue));
    }

    #[test]
    fn the_document_carries_no_secret() {
        // Le contrat lui-même interdit tout champ non listé ; ce test fige
        // l'intention pour que l'ajout d'un champ secret soit un choix visible.
        for forbidden in [
            "token",
            "secret",
            "password",
            "bearer",
            "credential",
            "client_secret",
        ] {
            let document = valid_document().replace(
                r#""config_revision": 4"#,
                &format!(r#""config_revision": 4, "{forbidden}": "x""#),
            );
            assert_eq!(
                parse(&document),
                Err(DeploymentConfigError::UnknownField),
                "field {forbidden} must not be accepted"
            );
        }
    }

    #[test]
    fn an_absent_managed_file_leaves_the_workstation_unmanaged() {
        let dir = std::env::temp_dir().join("nova-deployment-absent");
        std::fs::create_dir_all(&dir).unwrap();
        let _ = std::fs::remove_file(dir.join(MANAGED_CONFIG_FILENAME));
        assert_eq!(read_managed_file(&dir), Ok(None));
        let state = resolve(Some(&dir), &dir, "organization");
        assert!(!state.managed);
        assert_eq!(state.source, DeploymentSource::None);
        assert!(state.error.is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_managed_file_makes_the_workstation_managed() {
        let dir = std::env::temp_dir().join("nova-deployment-managed");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(MANAGED_CONFIG_FILENAME), valid_document()).unwrap();
        let state = resolve(Some(&dir), &dir, "organization");
        assert!(state.managed);
        assert_eq!(state.source, DeploymentSource::ManagedFile);
        assert_eq!(state.deployment_id.as_deref(), Some("dpl-0123456789abcdef"));
        assert_eq!(state.config_revision, 4);
        // Non déclarée dans le document : la valeur par défaut est explicite.
        assert_eq!(state.update_policy.as_deref(), Some("notify"));
        assert!(state.error.is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_broken_managed_file_fails_closed_instead_of_falling_back() {
        let dir = std::env::temp_dir().join("nova-deployment-broken");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join(MANAGED_CONFIG_FILENAME),
            valid_document().replace(PINNED_CONTROL_PLANE_ORIGINS[0], "https://attacker.example"),
        )
        .unwrap();
        let state = resolve(Some(&dir), &dir, "organization");
        assert!(!state.managed);
        assert_eq!(
            state.error.as_deref(),
            Some("DEPLOYMENT_CONFIG_ORIGIN_NOT_PINNED")
        );
        // Et surtout : aucune adresse hostile n'a été retenue.
        assert_eq!(state.control_plane_origin, None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_device_id_is_read_only_when_the_installer_wrote_one() {
        let dir = std::env::temp_dir().join("nova-deployment-device");
        std::fs::create_dir_all(&dir).unwrap();
        let _ = std::fs::remove_file(dir.join("device.json"));
        assert_eq!(read_device_id(&dir), None);
        std::fs::write(&dir.join("device.json"), r#"{"device_id":"a1b2c3d4e5f6"}"#).unwrap();
        assert_eq!(read_device_id(&dir).as_deref(), Some("a1b2c3d4e5f6"));
        // Une valeur hostile n'est pas reprise telle quelle.
        std::fs::write(&dir.join("device.json"), r#"{"device_id":"../../etc"}"#).unwrap();
        assert_eq!(read_device_id(&dir), None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    fn policy_document(deployment_id: &str) -> ManagedDeployment {
        let mut config = parse(&valid_document()).expect("valid");
        config.deployment_id = deployment_id.to_string();
        config.config_revision = 99;
        config
    }

    #[test]
    fn a_machine_policy_wins_over_the_installed_file() {
        let dir = std::env::temp_dir().join("nova-deployment-priority");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(MANAGED_CONFIG_FILENAME), valid_document()).unwrap();

        let state = resolve_with(
            Ok(Some(policy_document("dpl-from-policy"))),
            Some(&dir),
            &dir,
            "organization",
        );
        assert_eq!(state.source, DeploymentSource::MachinePolicy);
        assert_eq!(state.deployment_id.as_deref(), Some("dpl-from-policy"));
        assert_eq!(state.config_revision, 99);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_file_is_used_only_when_no_policy_is_present() {
        let dir = std::env::temp_dir().join("nova-deployment-priority-file");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(MANAGED_CONFIG_FILENAME), valid_document()).unwrap();

        let state = resolve_with(Ok(None), Some(&dir), &dir, "organization");
        assert_eq!(state.source, DeploymentSource::ManagedFile);
        assert_eq!(state.deployment_id.as_deref(), Some("dpl-0123456789abcdef"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn an_invalid_policy_is_not_worked_around_by_the_file() {
        // Sinon un utilisateur contournerait une strategie en cassant
        // volontairement une valeur qu'il peut lire.
        let dir = std::env::temp_dir().join("nova-deployment-priority-broken");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(MANAGED_CONFIG_FILENAME), valid_document()).unwrap();

        let state = resolve_with(
            Err(DeploymentConfigError::OriginNotPinned),
            Some(&dir),
            &dir,
            "organization",
        );
        assert!(!state.managed);
        assert_eq!(state.source, DeploymentSource::None);
        assert_eq!(
            state.error.as_deref(),
            Some("DEPLOYMENT_CONFIG_ORIGIN_NOT_PINNED")
        );
        assert_eq!(state.deployment_id, None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn no_source_at_all_is_not_an_error() {
        let dir = std::env::temp_dir().join("nova-deployment-priority-none");
        std::fs::create_dir_all(&dir).unwrap();
        let _ = std::fs::remove_file(dir.join(MANAGED_CONFIG_FILENAME));
        let state = resolve_with(Ok(None), Some(&dir), &dir, "personal");
        assert!(!state.managed);
        assert!(state.error.is_none());
        assert_eq!(state.edition, "personal");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_reported_state_carries_no_user_content() {
        let dir = std::env::temp_dir().join("nova-deployment-state-content");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(MANAGED_CONFIG_FILENAME), valid_document()).unwrap();
        let state = resolve_with(Ok(None), Some(&dir), &dir, "organization");
        let serialized = serde_json::to_string(&state).unwrap().to_lowercase();
        for forbidden in [
            "transcript",
            "audio",
            "clipboard",
            "history",
            "prompt",
            "dictation",
            "token",
            "secret",
            "password",
        ] {
            assert!(
                !serialized.contains(forbidden),
                "deployment state must not carry {forbidden}"
            );
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn every_error_code_is_stable() {
        assert_eq!(
            DeploymentConfigError::Malformed.code(),
            "DEPLOYMENT_CONFIG_MALFORMED"
        );
        assert_eq!(
            DeploymentConfigError::OriginNotPinned.code(),
            "DEPLOYMENT_CONFIG_ORIGIN_NOT_PINNED"
        );
        assert_eq!(
            DeploymentConfigError::UnknownField.code(),
            "DEPLOYMENT_CONFIG_FIELD_UNKNOWN"
        );
    }

    #[test]
    fn the_pinned_origins_are_https_and_exact() {
        for origin in PINNED_CONTROL_PLANE_ORIGINS {
            assert!(origin.starts_with("https://"), "{origin} must be https");
            assert!(!origin.ends_with('/'), "{origin} must not end with a slash");
        }
    }
}
