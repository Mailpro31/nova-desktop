use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use specta::Type;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_store::StoreExt;

#[cfg(feature = "lab")]
use once_cell::sync::Lazy;

use crate::portable;
use crate::settings::{get_settings, write_settings};

const CAMPUS_CONFIG_FILENAME: &str = "campus-config.json";
const CAMPUS_SESSION_STORE: &str = "campus_session.json";
const CAMPUS_SESSION_KEY: &str = "campus_session";
const CAMPUS_CREDENTIAL_SERVICE: &str = "app.novaspeak.desktop.campus";

pub const CAMPUS_SESSION_INVALID_EVENT: &str = "campus-session-invalid";
pub const CAMPUS_SERVER_UNREACHABLE_EVENT: &str = "campus-server-unreachable";

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct CampusConfig {
    /// Adresse du serveur — schéma historique. Vide quand la DSI déclare
    /// plutôt une organisation à découvrir.
    #[serde(default)]
    pub server_url: String,
    /// Identifiant d'organisation, pour le mode découverte. Ce n'est pas un
    /// secret : le connaître ne donne rien.
    #[serde(default)]
    pub organization_code: Option<String>,
    /// `dedicated` (défaut, schéma historique) ou `discovery`.
    #[serde(default)]
    pub bootstrap_mode: Option<String>,
    /// Nature de l'organisation : `education` ou `business`.
    ///
    /// C'est l'**amorçage** de la nature du tenant — ce que le déploiement
    /// annonce avant toute authentification. `/api/me` reste l'autorité une
    /// fois le membre connecté. Absent d'un serveur plus ancien, et le repli
    /// historique `education` s'applique alors côté poste.
    #[serde(default)]
    pub organization_type: Option<String>,
    #[serde(default)]
    pub organization: Option<CampusOrganizationConfig>,
    #[serde(default)]
    pub capabilities: Option<CampusCapabilitiesConfig>,
    #[serde(default)]
    pub education_mode: Option<String>,
    #[serde(default)]
    pub ai_skills: Option<CampusAiSkillsPolicyConfig>,
    #[serde(default)]
    pub auth_methods: Option<Vec<String>>,
    #[serde(default)]
    pub privacy: Option<CampusPrivacyConfig>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
#[serde(rename_all = "camelCase")]
pub struct CampusAiSkillsPolicyConfig {
    #[serde(default)]
    pub enabled: Option<bool>,
    #[serde(default)]
    pub required: Option<bool>,
    #[serde(default)]
    pub track_progress: Option<bool>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
#[serde(rename_all = "camelCase")]
pub struct CampusOrganizationConfig {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub short_name: Option<String>,
    #[serde(default)]
    pub campus_name: Option<String>,
    #[serde(default)]
    pub role: Option<String>,
    #[serde(default)]
    pub cohort: Option<String>,
    #[serde(default = "default_managed")]
    pub managed: bool,
    #[serde(default)]
    pub branding: Option<CampusBrandingConfig>,
    #[serde(default)]
    pub support: Option<CampusSupportConfig>,
}

fn default_managed() -> bool {
    true
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
#[serde(rename_all = "camelCase")]
pub struct CampusBrandingConfig {
    #[serde(default)]
    pub logo_url: Option<String>,
    #[serde(default)]
    pub accent_color: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct CampusSupportConfig {
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub website: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
#[serde(rename_all = "camelCase")]
pub struct CampusCapabilitiesConfig {
    #[serde(default)]
    pub dictation: Option<bool>,
    #[serde(default)]
    pub rewrite: Option<bool>,
    #[serde(default)]
    pub styles: Option<bool>,
    #[serde(default)]
    pub file_transcription: Option<bool>,
    #[serde(default)]
    pub commands: Option<bool>,
    #[serde(default)]
    pub dictionary: Option<bool>,
    #[serde(default)]
    pub snippets: Option<bool>,
    #[serde(default)]
    pub formatting_rules: Option<bool>,
    #[serde(default)]
    pub screen_context: Option<bool>,
    #[serde(default)]
    pub cloud_inference: Option<bool>,
    #[serde(default)]
    pub engineering_notes: Option<bool>,
    #[serde(default)]
    pub ai_skills: Option<bool>,
    #[serde(default)]
    pub personalization: Option<bool>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
#[serde(rename_all = "camelCase")]
pub struct CampusPrivacyConfig {
    #[serde(default)]
    pub verified: Option<bool>,
    #[serde(default)]
    pub content_retention: Option<String>,
    #[serde(default)]
    pub usage_counters: Option<String>,
    #[serde(default)]
    pub infrastructure: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct CampusSession {
    pub server_url: String,
    pub email: String,
    /// Identifiant d'organisation, quand il est connu.
    ///
    /// Il sert de **périmètre du trousseau** : voir `credential_username`.
    /// Absent des sessions créées avant la découverte, d'où l'`Option`.
    #[serde(default)]
    pub organization: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct StoredCampusSession {
    server_url: String,
    email: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    organization: Option<String>,
    /// Legacy field used only to migrate sessions created before secure storage.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    token: Option<String>,
}

#[derive(Debug, Clone)]
pub struct CampusCredentials {
    pub session: CampusSession,
    token: String,
}

impl std::ops::Deref for CampusCredentials {
    type Target = CampusSession;

    fn deref(&self) -> &Self::Target {
        &self.session
    }
}

/// État runtime indiquant si le frontend a été buildé en mode campus.
#[derive(Default)]
pub struct CampusState {
    pub enabled: AtomicBool,
}

/// Connexion éphémère à un Lab. Le jeton est uniquement en mémoire : il ne
/// survit ni à une fermeture de Nova ni à un redémarrage. Une version Lab
/// ultérieure pourra proposer une reconnexion explicite, mais il ne faut pas
/// écrire un jeton d'accès LAN en clair juste pour gagner cette commodité.
#[cfg(feature = "lab")]
#[derive(Clone)]
pub(crate) struct LabConnection {
    pub endpoint: String,
    pub certificate_der: Vec<u8>,
    pub device_token: String,
}

#[cfg(feature = "lab")]
static LAB_CONNECTION: Lazy<Mutex<Option<LabConnection>>> = Lazy::new(|| Mutex::new(None));

#[cfg(feature = "lab")]
pub(crate) fn set_lab_connection(connection: LabConnection) -> Result<(), String> {
    let mut stored = LAB_CONNECTION
        .lock()
        .map_err(|_| "LAB_CONNECTION_STATE_UNAVAILABLE".to_string())?;
    *stored = Some(connection);
    Ok(())
}

#[cfg(feature = "lab")]
fn current_lab_connection() -> Option<LabConnection> {
    LAB_CONNECTION.lock().ok()?.clone()
}

/// Active ou désactive la logique campus côté backend.
#[tauri::command]
#[specta::specta]
pub fn set_campus_mode(enabled: bool, app: AppHandle) -> Result<(), String> {
    if let Some(state) = app.try_state::<CampusState>() {
        state.enabled.store(enabled, Ordering::Relaxed);
    }
    crate::licensing::set_campus_enabled(enabled);
    Ok(())
}

pub fn is_campus_enabled(app: &AppHandle) -> bool {
    app.try_state::<CampusState>()
        .map(|state| state.enabled.load(Ordering::Relaxed))
        .unwrap_or(false)
}

/// Répertoire de configuration **à l'échelle de la machine**, déposé par la DSI.
///
/// Sur Windows, `%ProgramData%\Nova` est l'emplacement prévu par le système pour
/// une donnée d'application commune à tous les comptes : lisible par un
/// utilisateur standard, modifiable seulement par un administrateur, et situé
/// hors du répertoire d'installation — donc préservé par une mise à jour de
/// Nova. Un déploiement Intune ou GPO y écrit une fois pour le poste, là où un
/// fichier dans le profil devrait être recopié pour chaque étudiant.
#[cfg(windows)]
fn machine_config_dir() -> Option<PathBuf> {
    std::env::var_os("ProgramData").map(|dir| PathBuf::from(dir).join("Nova"))
}

#[cfg(target_os = "macos")]
fn machine_config_dir() -> Option<PathBuf> {
    Some(PathBuf::from("/Library/Application Support/Nova"))
}

#[cfg(all(unix, not(target_os = "macos")))]
fn machine_config_dir() -> Option<PathBuf> {
    Some(PathBuf::from("/etc/nova"))
}

/// Choisit la configuration Campus à lire, de la plus gérée à la moins gérée.
///
/// 1. la configuration machine, déployée par la DSI ;
/// 2. le fichier à côté de l'exécutable — l'emplacement historique, conservé
///    pour les postes déjà déployés ainsi que pour l'installation portable, qui
///    n'a par définition aucune configuration machine ;
/// 3. rien : l'utilisateur saisit lui-même l'adresse du serveur.
///
/// Aucune adresse n'est codée en dur : sans fichier, Nova ne connaît aucun
/// établissement.
fn resolve_campus_config_path(machine_dir: Option<&Path>, exe_dir: &Path) -> Option<PathBuf> {
    let managed = machine_dir.map(|dir| dir.join(CAMPUS_CONFIG_FILENAME));
    if let Some(path) = managed.filter(|path| path.is_file()) {
        return Some(path);
    }

    let beside_executable = exe_dir.join(CAMPUS_CONFIG_FILENAME);
    beside_executable.is_file().then_some(beside_executable)
}

/// Lit la configuration Campus déposée par l'IT. Voir `resolve_campus_config_path`.
#[tauri::command]
#[specta::specta]
pub fn get_campus_config() -> Result<Option<CampusConfig>, String> {
    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_dir = exe_path
        .parent()
        .ok_or("Could not determine executable directory")?;

    let machine_dir = machine_config_dir();
    let Some(config_path) = resolve_campus_config_path(machine_dir.as_deref(), exe_dir) else {
        return Ok(None);
    };

    let content = std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    let config: CampusConfig = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(Some(config))
}

fn campus_session_store(
    app: &AppHandle,
) -> Result<std::sync::Arc<tauri_plugin_store::Store<tauri::Wry>>, String> {
    app.store(portable::store_path(CAMPUS_SESSION_STORE))
        .map_err(|e| e.to_string())
}

/// Emplacement de la session dans le trousseau du système.
///
/// ## Pourquoi l'organisation plutôt que l'adresse
///
/// Cette clé était dérivée de l'adresse du serveur. C'était correct tant qu'une
/// organisation avait une adresse fixe — mais une organisation doit pouvoir
/// déménager, et la découverte rend ce déménagement banal. Avec l'ancienne
/// clé, un changement d'adresse **perdait silencieusement la session** : le
/// poste redemandait une connexion sans que personne comprenne pourquoi.
///
/// La clé suit donc l'identité de l'organisation, qui ne change pas quand son
/// hébergement change.
///
/// ## Compatibilité
///
/// Les sessions créées avant la découverte n'ont pas d'organisation : elles
/// gardent la clé dérivée de l'adresse, et continuent de fonctionner. Aucune
/// migration forcée, aucune reconnexion imposée.
fn credential_username(session: &CampusSession) -> String {
    let scope = match session.organization.as_deref().map(str::trim) {
        Some(organization) if !organization.is_empty() => organization.to_string(),
        _ => normalize_base_url(&session.server_url),
    };
    let identity = format!("{}|{}", scope, session.email);
    format!("{:x}", Sha256::digest(identity.as_bytes()))
}

fn credential_entry(session: &CampusSession) -> Result<keyring::Entry, String> {
    keyring::Entry::new(CAMPUS_CREDENTIAL_SERVICE, &credential_username(session))
        .map_err(|e| format!("secure credential store unavailable: {e}"))
}

fn persist_session_metadata(app: &AppHandle, session: &CampusSession) -> Result<(), String> {
    let store = campus_session_store(app)?;
    let stored = StoredCampusSession {
        server_url: session.server_url.clone(),
        email: session.email.clone(),
        organization: session.organization.clone(),
        token: None,
    };
    store.set(
        CAMPUS_SESSION_KEY,
        serde_json::to_value(stored).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())
}

pub(crate) fn save_campus_credentials(
    app: &AppHandle,
    session: CampusSession,
    token: String,
) -> Result<(), String> {
    let entry = credential_entry(&session)?;
    entry
        .set_password(&token)
        .map_err(|e| format!("failed to protect campus credential: {e}"))?;
    if let Err(error) = persist_session_metadata(app, &session) {
        let _ = entry.delete_credential();
        return Err(error);
    }

    let mut settings = get_settings(app);
    settings.onboarding_completed = true;
    write_settings(app, settings);
    Ok(())
}

fn load_campus_credentials(app: &AppHandle) -> Result<Option<CampusCredentials>, String> {
    let store = campus_session_store(app)?;
    let Some(value) = store.get(CAMPUS_SESSION_KEY) else {
        return Ok(None);
    };
    if value.is_null() {
        return Ok(None);
    }

    let stored: StoredCampusSession = serde_json::from_value(value).map_err(|e| e.to_string())?;
    let session = CampusSession {
        server_url: stored.server_url,
        email: stored.email,
        organization: stored.organization,
    };
    let entry = credential_entry(&session)?;

    // One-time migration from the previous plaintext tauri-store record.
    let token = if let Some(legacy_token) = stored.token {
        entry
            .set_password(&legacy_token)
            .map_err(|e| format!("failed to migrate campus credential: {e}"))?;
        persist_session_metadata(app, &session)?;
        legacy_token
    } else {
        entry.get_password().map_err(|e| match e {
            keyring::Error::NoEntry => "campus credential is missing".to_string(),
            other => format!("failed to read campus credential: {other}"),
        })?
    };

    Ok(Some(CampusCredentials { session, token }))
}

#[tauri::command]
#[specta::specta]
pub fn load_campus_session(app: AppHandle) -> Result<Option<CampusSession>, String> {
    Ok(load_campus_credentials(&app)?.map(|credentials| credentials.session))
}

#[tauri::command]
#[specta::specta]
pub fn clear_campus_session(app: AppHandle) -> Result<(), String> {
    let store = campus_session_store(&app)?;
    if let Some(value) = store.get(CAMPUS_SESSION_KEY) {
        if !value.is_null() {
            if let Ok(stored) = serde_json::from_value::<StoredCampusSession>(value) {
                let session = CampusSession {
                    server_url: stored.server_url,
                    email: stored.email,
                    organization: stored.organization,
                };
                if let Ok(entry) = credential_entry(&session) {
                    if let Err(error) = entry.delete_credential() {
                        if !matches!(error, keyring::Error::NoEntry) {
                            return Err(format!("failed to delete campus credential: {error}"));
                        }
                    }
                }
            }
        }
    }
    store.delete(CAMPUS_SESSION_KEY);
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

/// Marque l'onboarding comme terminé sans toucher à la session campus.
#[tauri::command]
#[specta::specta]
pub fn complete_campus_onboarding(app: AppHandle) -> Result<(), String> {
    let mut settings = get_settings(&app);
    settings.onboarding_completed = true;
    write_settings(&app, settings);
    Ok(())
}

/// Efface la session et notifie le frontend qu'il faut retourner à l'onboarding.
pub fn clear_campus_session_and_notify(app: &AppHandle) {
    let _ = clear_campus_session(app.clone());
    let _ = app.emit(CAMPUS_SESSION_INVALID_EVENT, ());
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct CampusAuthRequestResponse {
    pub sent: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct CampusEntraStartResponse {
    pub flow_id: String,
    pub user_code: String,
    pub verification_uri: String,
    pub verification_uri_complete: Option<String>,
    pub expires_in: i64,
    pub interval: i64,
    pub message: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct CampusEntraPollResponse {
    pub status: String,
    pub email: Option<String>,
    pub retry_after: Option<i64>,
}

#[derive(Deserialize)]
struct CampusEntraPollServerResponse {
    status: String,
    email: Option<String>,
    token: Option<String>,
    retry_after: Option<i64>,
}

#[derive(Deserialize)]
struct CampusTokenResponse {
    token: String,
}

/// Groupe annoncé par le serveur (promo, filière, équipe, service).
#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct CampusGroup {
    pub id: String,
    pub label: String,
    pub source: String,
    #[serde(default)]
    pub external_group_id: Option<String>,
}

/// Appartenance du membre à l'organisation, telle que le serveur la décide.
#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct CampusMembership {
    #[serde(default)]
    pub member_type: Option<String>,
    #[serde(default)]
    pub security_role: Option<String>,
    #[serde(default)]
    pub groups: Option<Vec<CampusGroup>>,
    #[serde(default)]
    pub status: Option<String>,
}

/// Mode d'authentification employé. Le sujet externe n'est pas transmis au
/// poste : il n'en a aucun usage.
#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct CampusIdentityInfo {
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub has_external_identity: Option<bool>,
}

/// Réponse de `GET /api/me`.
///
/// Les quatre premiers champs sont le contrat historique ; tout le reste est
/// **optionnel**, parce qu'un serveur d'établissement plus ancien que le poste
/// est un cas normal. `organization` reste une **chaîne** — le nom d'affichage :
/// en faire un objet casserait chaque poste déjà déployé.
#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct CampusMeResponse {
    pub email: String,
    pub role: String,
    pub cohort: String,
    /// Nom de l'établissement, déduit côté serveur du domaine de l'adresse.
    /// Absent des anciennes réponses : `default` évite de casser la
    /// désérialisation contre un serveur non mis à jour.
    #[serde(default)]
    pub organization: String,
    /// `None` avec un serveur antérieur au contrat étendu.
    #[serde(default)]
    pub contract_version: Option<i32>,
    #[serde(default)]
    pub user_id: Option<String>,
    /// Identifiant de tenant immuable, attribué par le serveur.
    #[serde(default)]
    pub organization_id: Option<String>,
    #[serde(default)]
    pub organization_type: Option<String>,
    #[serde(default)]
    pub membership: Option<CampusMembership>,
    #[serde(default)]
    pub identity: Option<CampusIdentityInfo>,
    /// Capacités déclarées par l'organisation. Ne peut jamais fermer une
    /// capacité du Nova Core — voir `src/lib/organization/resolve.ts`.
    #[serde(default)]
    pub capabilities: Option<Vec<String>>,
}

fn campus_client_no_auth() -> reqwest::Client {
    campus_request_client(None)
}

async fn parse_error_text(response: reqwest::Response) -> String {
    let status = response.status();
    let text = response.text().await.unwrap_or_default();
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
        if let Some(detail) = value.get("detail").and_then(|v| v.as_str()) {
            return format!("HTTP {}: {}", status, detail);
        }
    }
    if text.is_empty() {
        return format!("HTTP {}", status);
    }
    format!("HTTP {}: {}", status, text)
}

/// Vérifie la réponse d'une commande authentifiée : si le serveur a révoqué la
/// session (401), on efface la session locale et on notifie le frontend pour
/// qu'il retourne à l'onboarding. Renvoie la réponse consommable sinon.
async fn handle_authed_response(
    app: &AppHandle,
    response: reqwest::Response,
) -> Result<reqwest::Response, String> {
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        clear_campus_session_and_notify(app);
        return Err(parse_error_text(response).await);
    }
    if !response.status().is_success() {
        return Err(parse_error_text(response).await);
    }
    Ok(response)
}

#[tauri::command]
#[specta::specta]
pub async fn check_campus_server_reachability(server_url: String) -> Result<bool, String> {
    let base_url = normalize_base_url(&server_url);
    let client = campus_client_no_auth();
    let result = client
        .get(format!("{}/api/health", base_url))
        .timeout(Duration::from_secs(2))
        .send()
        .await;
    match result {
        Ok(response) => Ok(response.status().is_success()),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn fetch_campus_server_config(server_url: String) -> Result<CampusConfig, String> {
    let base_url = normalize_base_url(&server_url);
    let client = campus_client_no_auth();
    let response = client
        .get(format!("{}/api/config", base_url))
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;
    if !response.status().is_success() {
        return Err(parse_error_text(response).await);
    }
    let mut value = response
        .json::<serde_json::Value>()
        .await
        .map_err(|e| format!("invalid response: {}", e))?;
    value["server_url"] = serde_json::Value::String(base_url);
    serde_json::from_value(value).map_err(|e| format!("invalid campus config: {}", e))
}

#[tauri::command]
#[specta::specta]
pub async fn request_campus_auth(
    server_url: String,
    email: String,
    machine: String,
) -> Result<CampusAuthRequestResponse, String> {
    let base_url = normalize_base_url(&server_url);
    let client = campus_client_no_auth();
    let response = client
        .post(format!("{}/api/auth/request", base_url))
        .json(&serde_json::json!({ "email": email, "machine": machine }))
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;

    if !response.status().is_success() {
        return Err(parse_error_text(response).await);
    }

    response
        .json::<CampusAuthRequestResponse>()
        .await
        .map_err(|e| format!("invalid response: {}", e))
}

#[tauri::command]
#[specta::specta]
pub async fn start_campus_entra_auth(
    server_url: String,
    machine: String,
) -> Result<CampusEntraStartResponse, String> {
    let base_url = normalize_base_url(&server_url);
    let response = campus_client_no_auth()
        .post(format!("{}/api/auth/entra/start", base_url))
        .json(&serde_json::json!({ "machine": machine }))
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;
    if !response.status().is_success() {
        return Err(parse_error_text(response).await);
    }
    response
        .json::<CampusEntraStartResponse>()
        .await
        .map_err(|e| format!("invalid response: {}", e))
}

#[tauri::command]
#[specta::specta]
pub async fn poll_campus_entra_auth(
    app: AppHandle,
    server_url: String,
    flow_id: String,
) -> Result<CampusEntraPollResponse, String> {
    let base_url = normalize_base_url(&server_url);
    let response = campus_client_no_auth()
        .post(format!("{}/api/auth/entra/poll", base_url))
        .json(&serde_json::json!({ "flow_id": flow_id }))
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;
    if !response.status().is_success() {
        return Err(parse_error_text(response).await);
    }
    let response = response
        .json::<CampusEntraPollServerResponse>()
        .await
        .map_err(|e| format!("invalid response: {}", e))?;
    if response.status == "complete" {
        let email = response
            .email
            .clone()
            .ok_or_else(|| "Microsoft response is missing email".to_string())?;
        let token = response
            .token
            .ok_or_else(|| "Microsoft response is missing token".to_string())?;
        save_campus_credentials(
            &app,
            CampusSession {
                server_url: base_url,
                email,
                organization: None,
            },
            token,
        )?;
    }
    Ok(CampusEntraPollResponse {
        status: response.status,
        email: response.email,
        retry_after: response.retry_after,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn verify_campus_auth(
    app: AppHandle,
    server_url: String,
    email: String,
    code: String,
    machine: String,
) -> Result<CampusSession, String> {
    let base_url = normalize_base_url(&server_url);
    let client = campus_client_no_auth();
    let response = client
        .post(format!("{}/api/auth/verify", base_url))
        .json(&serde_json::json!({ "email": email, "code": code, "machine": machine }))
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;

    if !response.status().is_success() {
        return Err(parse_error_text(response).await);
    }

    let response = response
        .json::<CampusTokenResponse>()
        .await
        .map_err(|e| format!("invalid response: {}", e))?;
    let session = CampusSession {
        server_url: base_url,
        email: email.to_lowercase(),
        organization: None,
    };
    save_campus_credentials(&app, session.clone(), response.token)?;
    Ok(session)
}

fn campus_client_with_token(token: &str) -> reqwest::Client {
    campus_request_client(Some(token))
}

/// Un seul constructeur de client pour le chemin Campus. En build Lab, après
/// enrôlement, il accepte exclusivement le certificat épinglé par le code et
/// envoie le jeton de périphérique à chaque requête. Les builds ordinaires
/// gardent exactement le transport historique.
pub(crate) fn campus_request_client(token: Option<&str>) -> reqwest::Client {
    campus_request_client_with_timeout(token, Duration::from_secs(30))
}

/// Variante conservant le transport Lab pour les opérations qui ont besoin
/// d'un délai différent (document long, audio ou simple sonde de disponibilité).
/// Aucun appel Campus ne doit reconstruire un client à côté de ce chemin : il
/// perdrait sinon le certificat épinglé et le jeton du périphérique Lab.
fn campus_request_client_with_timeout(
    token: Option<&str>,
    timeout: Duration,
) -> reqwest::Client {
    let mut headers = reqwest::header::HeaderMap::new();
    if let Some(token) = token {
        let auth_value = format!("Bearer {}", token)
            .parse()
            .expect("valid bearer header");
        headers.insert(reqwest::header::AUTHORIZATION, auth_value);
    }

    #[cfg(feature = "lab")]
    if let Some(connection) = current_lab_connection() {
        let device_value = connection
            .device_token
            .parse()
            .expect("valid Lab device header");
        headers.insert("X-Nova-Lab-Device", device_value);
        let certificate = reqwest::Certificate::from_der(&connection.certificate_der)
            .expect("Lab certificate was verified before being retained");
        return reqwest::Client::builder()
            .timeout(timeout)
            .https_only(true)
            .tls_built_in_root_certs(false)
            .add_root_certificate(certificate)
            .default_headers(headers)
            .build()
            .expect("Lab reqwest client builds");
    }

    reqwest::Client::builder()
        .timeout(timeout)
        .default_headers(headers)
        .build()
        .expect("reqwest client builds")
}

#[derive(Deserialize, Debug)]
struct OrganizationPackageEntry {
    id: String,
    #[serde(rename = "type")]
    package_type: String,
    content: serde_json::Map<String, serde_json::Value>,
}

#[derive(Deserialize, Debug)]
struct OrganizationPackagesResponse {
    #[serde(default)]
    packages: Vec<OrganizationPackageEntry>,
    #[serde(default)]
    catalog_version: String,
}

/// Ce que l'interface reçoit après un rafraîchissement.
#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct OrganizationCatalogSnapshot {
    pub catalog_version: String,
    pub styles: Vec<crate::organization_packages::OrganizationStyle>,
    pub skills: Vec<crate::organization_packages::OrganizationSkill>,
}

// ──────────────────────────────── Learn ────────────────────────────────
//
// Learn appartient au Nova Core, et ces commandes n'en decident rien : elles
// transportent. Le catalogue, la progression et le retour d'un exercice
// viennent tous du serveur, qui applique la capacite `learning` et la policy de
// l'organisation. Le poste ne reconstruit aucun de ces tris.
//
// Le contenu des blocs reste `serde_json::Value` : le moteur de rendu est
// generique cote interface, et figer ici une structure par type de bloc
// obligerait a recompiler l'application pour ajouter un type de contenu — soit
// exactement ce que le catalogue versionne cherche a eviter.

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct LearningBlock {
    pub id: String,
    #[serde(rename = "type")]
    pub block_type: String,
    pub order: i64,
    pub content: serde_json::Map<String, serde_json::Value>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct LearningLesson {
    pub id: String,
    pub title: String,
    pub description: String,
    pub estimated_minutes: i64,
    pub difficulty: String,
    pub order: i64,
    pub version: i64,
    #[serde(default)]
    pub tags: Vec<String>,
    pub blocks: Vec<LearningBlock>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct LearningModule {
    pub id: String,
    pub title: String,
    pub description: String,
    pub order: i64,
    pub lessons: Vec<LearningLesson>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct LearningPath {
    pub id: String,
    pub pillar: String,
    pub title: String,
    pub description: String,
    #[serde(default)]
    pub icon: Option<String>,
    pub order: i64,
    #[serde(default)]
    pub tags: Vec<String>,
    pub modules: Vec<LearningModule>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct LearningCatalog {
    pub catalog_version: i64,
    pub locale: String,
    pub paths: Vec<LearningPath>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct LearningLessonProgress {
    pub lesson_id: String,
    pub status: String,
    pub lesson_version: i64,
    pub completed_blocks: Vec<String>,
    pub last_block_id: Option<String>,
    pub started_at: Option<f64>,
    pub updated_at: f64,
    pub completed_at: Option<f64>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct LearningProgressSnapshot {
    pub catalog_version: i64,
    pub lessons: Vec<LearningLessonProgress>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct LearningExerciseFeedback {
    pub exercise_id: String,
    pub feedback: String,
}

#[derive(Serialize)]
struct LearningProgressBody {
    completed_blocks: Vec<String>,
    last_block_id: Option<String>,
}

#[derive(Serialize)]
struct LearningExerciseBody {
    text: String,
}

#[tauri::command]
#[specta::specta]
pub async fn fetch_learning_catalog(app: AppHandle) -> Result<LearningCatalog, String> {
    let (base_url, client) = authenticated_client(&app)?;
    let response = client
        .get(format!("{}/api/learning/catalog", base_url))
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;
    let response = handle_authed_response(&app, response).await?;
    response
        .json::<LearningCatalog>()
        .await
        .map_err(|e| format!("invalid response: {}", e))
}

#[tauri::command]
#[specta::specta]
pub async fn fetch_learning_progress(app: AppHandle) -> Result<LearningProgressSnapshot, String> {
    let (base_url, client) = authenticated_client(&app)?;
    let response = client
        .get(format!("{}/api/learning/progress", base_url))
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;
    let response = handle_authed_response(&app, response).await?;
    response
        .json::<LearningProgressSnapshot>()
        .await
        .map_err(|e| format!("invalid response: {}", e))
}

/// Avance la progression sur une lecon.
///
/// Le corps ne porte que ce qui a ete traite. L'etat — `in_progress`,
/// `completed` — est calcule par le serveur : c'est lui qui sait ce qu'une
/// lecon exige, et une completion annoncee par le poste ne voudrait rien dire.
#[tauri::command]
#[specta::specta]
pub async fn update_learning_progress(
    app: AppHandle,
    lesson_id: String,
    completed_blocks: Vec<String>,
    last_block_id: Option<String>,
) -> Result<LearningLessonProgress, String> {
    let (base_url, client) = authenticated_client(&app)?;
    let response = client
        .put(format!("{}/api/learning/progress/{}", base_url, lesson_id))
        .json(&LearningProgressBody {
            completed_blocks,
            last_block_id,
        })
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;
    let response = handle_authed_response(&app, response).await?;
    response
        .json::<LearningLessonProgress>()
        .await
        .map_err(|e| format!("invalid response: {}", e))
}

/// Demande un retour pedagogique sur ce que la personne vient d'ecrire.
///
/// Seul le texte part. L'instruction destinee au modele vit dans le catalogue
/// du serveur et n'a jamais transite jusqu'ici — il n'y a donc aucun parametre
/// par lequel le poste pourrait la remplacer.
#[tauri::command]
#[specta::specta]
pub async fn request_learning_feedback(
    app: AppHandle,
    exercise_id: String,
    text: String,
) -> Result<LearningExerciseFeedback, String> {
    let (base_url, client) = authenticated_client(&app)?;
    let response = client
        .post(format!(
            "{}/api/learning/exercises/{}/feedback",
            base_url, exercise_id
        ))
        .json(&LearningExerciseBody { text })
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;
    let response = handle_authed_response(&app, response).await?;
    response
        .json::<LearningExerciseFeedback>()
        .await
        .map_err(|e| format!("invalid response: {}", e))
}

fn authenticated_client(app: &AppHandle) -> Result<(String, reqwest::Client), String> {
    let credentials =
        load_campus_credentials(app)?.ok_or_else(|| "campus session is missing".to_string())?;
    let base_url = normalize_base_url(&credentials.session.server_url);
    let client = campus_client_with_token(&credentials.token);
    Ok((base_url, client))
}

#[tauri::command]
#[specta::specta]
pub async fn logout_campus_session(app: AppHandle) -> Result<(), String> {
    if let Some(credentials) = load_campus_credentials(&app)? {
        let base_url = normalize_base_url(&credentials.session.server_url);
        let response = campus_client_with_token(&credentials.token)
            .post(format!("{}/api/auth/logout", base_url))
            .send()
            .await;
        let _ = response;
    }
    clear_campus_session(app)
}

#[tauri::command]
#[specta::specta]
pub async fn get_campus_me(app: AppHandle) -> Result<CampusMeResponse, String> {
    let credentials =
        load_campus_credentials(&app)?.ok_or_else(|| "campus session is missing".to_string())?;
    let base_url = normalize_base_url(&credentials.session.server_url);
    let client = campus_client_with_token(&credentials.token);
    let response = client
        .get(format!("{}/api/me", base_url))
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;
    let response = handle_authed_response(&app, response).await?;

    response
        .json::<CampusMeResponse>()
        .await
        .map_err(|e| format!("invalid response: {}", e))
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct CampusSharedDictEntry {
    pub id: i64,
    pub term: String,
    pub replacement: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct CampusPersonalDictEntry {
    pub id: i64,
    pub term: String,
    pub replacement: String,
    pub source: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct CampusSnippetEntry {
    pub id: i64,
    pub trigger: String,
    pub content: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct CampusVocabularyResponse {
    pub shared: Vec<CampusSharedDictEntry>,
    pub personal: Vec<CampusPersonalDictEntry>,
    pub snippets: Vec<CampusSnippetEntry>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct CampusIdResponse {
    pub id: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct CampusLearnResponse {
    pub learned: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct CampusImportResponse {
    pub imported: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct CampusAnalyzeResponse {
    pub terms_added: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct CampusRuleEntry {
    pub id: i64,
    pub rule: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct CampusFormattingRulesResponse {
    pub shared: Vec<CampusRuleEntry>,
    pub personal: Vec<CampusRuleEntry>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct CampusCommandResponse {
    pub text: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct CampusAiSkill {
    pub id: String,
    pub title: String,
    pub summary: String,
    pub practice: String,
    pub duration_minutes: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct CampusAiSkillsResponse {
    pub skills: Vec<CampusAiSkill>,
}

#[tauri::command]
#[specta::specta]
pub async fn get_campus_vocabulary(app: AppHandle) -> Result<CampusVocabularyResponse, String> {
    let (base_url, client) = authenticated_client(&app)?;
    let response = client
        .get(format!("{}/api/vocabulary", base_url))
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;
    let response = handle_authed_response(&app, response).await?;

    response
        .json::<CampusVocabularyResponse>()
        .await
        .map_err(|e| format!("invalid response: {}", e))
}

#[tauri::command]
#[specta::specta]
pub async fn add_campus_dictionary_entry(
    app: AppHandle,
    term: String,
    replacement: String,
) -> Result<CampusIdResponse, String> {
    let (base_url, client) = authenticated_client(&app)?;
    let response = client
        .post(format!("{}/api/dictionary", base_url))
        .json(&serde_json::json!({ "term": term, "replacement": replacement }))
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;
    let response = handle_authed_response(&app, response).await?;

    response
        .json::<CampusIdResponse>()
        .await
        .map_err(|e| format!("invalid response: {}", e))
}

#[tauri::command]
#[specta::specta]
pub async fn delete_campus_dictionary_entry(app: AppHandle, entry_id: i64) -> Result<(), String> {
    let (base_url, client) = authenticated_client(&app)?;
    let response = client
        .delete(format!("{}/api/dictionary/{}", base_url, entry_id))
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;
    handle_authed_response(&app, response).await?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn learn_campus_dictionary(
    app: AppHandle,
    heard: String,
    corrected: String,
) -> Result<CampusLearnResponse, String> {
    let (base_url, client) = authenticated_client(&app)?;
    let response = client
        .post(format!("{}/api/dictionary/learn", base_url))
        .json(&serde_json::json!({ "heard": heard, "corrected": corrected }))
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;
    let response = handle_authed_response(&app, response).await?;

    response
        .json::<CampusLearnResponse>()
        .await
        .map_err(|e| format!("invalid response: {}", e))
}

#[tauri::command]
#[specta::specta]
pub async fn export_campus_dictionary(app: AppHandle) -> Result<String, String> {
    let (base_url, client) = authenticated_client(&app)?;
    let response = client
        .get(format!("{}/api/dictionary/export", base_url))
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;
    let response = handle_authed_response(&app, response).await?;

    response
        .text()
        .await
        .map_err(|e| format!("invalid response text: {}", e))
}

#[tauri::command]
#[specta::specta]
pub async fn import_campus_dictionary(
    app: AppHandle,
    csv_content: String,
) -> Result<CampusImportResponse, String> {
    let (base_url, client) = authenticated_client(&app)?;

    let part = reqwest::multipart::Part::bytes(csv_content.into_bytes())
        .file_name("dictionary.csv")
        .mime_str("text/csv")
        .map_err(|e| format!("invalid mime: {}", e))?;

    let form = reqwest::multipart::Form::new().part("file", part);

    let response = client
        .post(format!("{}/api/dictionary/import", base_url))
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;
    let response = handle_authed_response(&app, response).await?;

    response
        .json::<CampusImportResponse>()
        .await
        .map_err(|e| format!("invalid response: {}", e))
}

#[tauri::command]
#[specta::specta]
pub async fn analyze_campus_document(
    app: AppHandle,
    text_content: String,
    filename: Option<String>,
) -> Result<CampusAnalyzeResponse, String> {
    let credentials =
        load_campus_credentials(&app)?.ok_or_else(|| "campus session is missing".to_string())?;
    let base_url = normalize_base_url(&credentials.session.server_url);
    let client = campus_request_client_with_timeout(
        Some(&credentials.token),
        Duration::from_secs(120),
    );

    let fname = filename.unwrap_or_else(|| "document.txt".to_string());
    let part = reqwest::multipart::Part::bytes(text_content.into_bytes())
        .file_name(fname)
        .mime_str("text/plain")
        .map_err(|e| format!("invalid mime: {}", e))?;

    let form = reqwest::multipart::Form::new().part("file", part);

    let response = client
        .post(format!("{}/api/dictionary/analyze", base_url))
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;
    let response = handle_authed_response(&app, response).await?;

    response
        .json::<CampusAnalyzeResponse>()
        .await
        .map_err(|e| format!("invalid response: {}", e))
}

#[tauri::command]
#[specta::specta]
pub async fn add_campus_snippet(
    app: AppHandle,
    trigger: String,
    content: String,
) -> Result<CampusIdResponse, String> {
    let (base_url, client) = authenticated_client(&app)?;
    let response = client
        .post(format!("{}/api/snippets", base_url))
        .json(&serde_json::json!({ "trigger": trigger, "content": content }))
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;
    let response = handle_authed_response(&app, response).await?;

    response
        .json::<CampusIdResponse>()
        .await
        .map_err(|e| format!("invalid response: {}", e))
}

#[tauri::command]
#[specta::specta]
pub async fn delete_campus_snippet(app: AppHandle, snippet_id: i64) -> Result<(), String> {
    let (base_url, client) = authenticated_client(&app)?;
    let response = client
        .delete(format!("{}/api/snippets/{}", base_url, snippet_id))
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;
    handle_authed_response(&app, response).await?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn get_campus_formatting_rules(
    app: AppHandle,
) -> Result<CampusFormattingRulesResponse, String> {
    let (base_url, client) = authenticated_client(&app)?;
    let response = client
        .get(format!("{}/api/formatting-rules", base_url))
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;
    let response = handle_authed_response(&app, response).await?;

    response
        .json::<CampusFormattingRulesResponse>()
        .await
        .map_err(|e| format!("invalid response: {}", e))
}

#[tauri::command]
#[specta::specta]
pub async fn add_campus_formatting_rule(
    app: AppHandle,
    rule: String,
) -> Result<CampusIdResponse, String> {
    let (base_url, client) = authenticated_client(&app)?;
    let response = client
        .post(format!("{}/api/formatting-rules", base_url))
        .json(&serde_json::json!({ "rule": rule }))
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;
    let response = handle_authed_response(&app, response).await?;

    response
        .json::<CampusIdResponse>()
        .await
        .map_err(|e| format!("invalid response: {}", e))
}

#[tauri::command]
#[specta::specta]
pub async fn delete_campus_formatting_rule(app: AppHandle, rule_id: i64) -> Result<(), String> {
    let (base_url, client) = authenticated_client(&app)?;
    let response = client
        .delete(format!("{}/api/formatting-rules/{}", base_url, rule_id))
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;
    handle_authed_response(&app, response).await?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn execute_campus_command(
    app: AppHandle,
    instruction: String,
    text: String,
) -> Result<CampusCommandResponse, String> {
    let credentials =
        load_campus_credentials(&app)?.ok_or_else(|| "campus session is missing".to_string())?;
    let base_url = normalize_base_url(&credentials.session.server_url);
    let client = campus_request_client_with_timeout(
        Some(&credentials.token),
        Duration::from_secs(120),
    );

    let response = client
        .post(format!("{}/api/command", base_url))
        .json(&serde_json::json!({ "instruction": instruction, "text": text }))
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;
    let response = handle_authed_response(&app, response).await?;

    response
        .json::<CampusCommandResponse>()
        .await
        .map_err(|e| format!("invalid response: {}", e))
}

/// Charge le contenu publié par l'organisation et le rend disponible au poste.
///
/// Le catalogue reçu **remplace** le précédent : garder des morceaux de l'ancien
/// produirait un mélange de versions, et personne ne saurait dire laquelle
/// s'applique. C'est aussi ce qui rend le changement de version — et le retour
/// arrière — immédiat, sans redémarrage.
///
/// Le serveur a déjà filtré selon les policies : ce qui arrive ici est ce que
/// l'organisation autorise **et** distribue. Le poste ne réinvente pas ce
/// tri, il applique ce qu'il reçoit.
#[tauri::command]
#[specta::specta]
pub async fn refresh_organization_packages(
    app: AppHandle,
) -> Result<OrganizationCatalogSnapshot, String> {
    let (base_url, client) = authenticated_client(&app)?;
    let response = client
        .get(format!("{}/api/organization/packages", base_url))
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;
    let response = handle_authed_response(&app, response).await?;
    let payload = response
        .json::<OrganizationPackagesResponse>()
        .await
        .map_err(|e| format!("invalid response: {}", e))?;

    // L'organisation vient de `/api/me`, jamais de la réponse du catalogue :
    // c'est elle qui décide à qui ce contenu appartient, et un catalogue qui
    // se déclarerait lui-même propriétaire ne prouverait rien.
    let organization_id = current_organization_id(&app).await;

    let mut styles = Vec::new();
    let mut skills = Vec::new();
    for entry in payload.packages {
        match entry.package_type.as_str() {
            "style" => {
                if let (Some(name), Some(instruction)) = (
                    entry.content.get("name").and_then(|v| v.as_str()),
                    entry.content.get("instruction").and_then(|v| v.as_str()),
                ) {
                    styles.push(crate::organization_packages::OrganizationStyle {
                        id: entry.id.clone(),
                        name: name.to_string(),
                        instruction: instruction.to_string(),
                    });
                }
            }
            "ai_skill" => {
                if let Some(title) = entry.content.get("title").and_then(|v| v.as_str()) {
                    skills.push(crate::organization_packages::OrganizationSkill {
                        id: entry.id.clone(),
                        title: title.to_string(),
                        summary: text_field(&entry.content, "summary"),
                        practice: text_field(&entry.content, "practice"),
                        duration_minutes: entry
                            .content
                            .get("duration_minutes")
                            .and_then(|v| v.as_u64())
                            .unwrap_or(5) as u32,
                        steps: entry
                            .content
                            .get("steps")
                            .and_then(|v| v.as_array())
                            .map(|items| {
                                items
                                    .iter()
                                    .filter_map(|item| item.as_str().map(str::to_string))
                                    .collect()
                            })
                            .unwrap_or_default(),
                    });
                }
            }
            // Le vocabulaire est appliqué par le serveur, dans la consigne de
            // reformulation : le poste n'a rien à en faire.
            _ => {}
        }
    }

    let catalog = crate::organization_packages::OrganizationCatalog {
        organization_id,
        catalog_version: payload.catalog_version,
        styles,
        skills,
    };
    crate::organization_packages::set_catalog(catalog.clone());
    Ok(OrganizationCatalogSnapshot {
        catalog_version: catalog.catalog_version,
        styles: catalog.styles,
        skills: catalog.skills,
    })
}

/// Exécute un AI Skill publié par l'organisation.
///
/// Le poste envoie un **identifiant**, jamais l'instruction : c'est le serveur
/// qui la retrouve dans le package actif. S'il acceptait une instruction du
/// client, n'importe qui pourrait faire exécuter n'importe quoi au modèle en se
/// réclamant d'un Skill, et le catalogue publié ne serait plus qu'une
/// suggestion.
#[tauri::command]
#[specta::specta]
pub async fn run_organization_skill(
    app: AppHandle,
    skill_id: String,
    text: String,
) -> Result<CampusCommandResponse, String> {
    let (base_url, client) = authenticated_client(&app)?;
    let response = client
        .post(format!("{}/api/skills/run", base_url))
        .json(&serde_json::json!({ "skill_id": skill_id, "text": text }))
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;
    let response = handle_authed_response(&app, response).await?;
    response
        .json::<CampusCommandResponse>()
        .await
        .map_err(|e| format!("invalid response: {}", e))
}

/// Oublie le contenu de l'organisation — déconnexion, ou changement d'organisation.
#[tauri::command]
#[specta::specta]
pub fn clear_organization_packages() {
    crate::organization_packages::clear_catalog();
}

fn text_field(content: &serde_json::Map<String, serde_json::Value>, key: &str) -> String {
    content
        .get(key)
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .to_string()
}

async fn current_organization_id(app: &AppHandle) -> Option<String> {
    let (base_url, client) = authenticated_client(app).ok()?;
    let response = client
        .get(format!("{}/api/me", base_url))
        .send()
        .await
        .ok()?;
    let profile = response.json::<serde_json::Value>().await.ok()?;
    profile
        .get("organization_id")
        .and_then(|value| value.as_str())
        .map(str::to_string)
}

#[tauri::command]
#[specta::specta]
pub async fn get_campus_ai_skills(app: AppHandle) -> Result<CampusAiSkillsResponse, String> {
    let (base_url, client) = authenticated_client(&app)?;
    let response = client
        .get(format!("{}/api/ai-skills", base_url))
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;
    let response = handle_authed_response(&app, response).await?;

    response
        .json::<CampusAiSkillsResponse>()
        .await
        .map_err(|e| format!("invalid response: {}", e))
}

#[tauri::command]
#[specta::specta]
pub async fn format_campus_engineering_notes(
    app: AppHandle,
    instruction: String,
    text: String,
) -> Result<CampusCommandResponse, String> {
    let (base_url, client) = authenticated_client(&app)?;
    let response = client
        .post(format!("{}/api/engineering-notes", base_url))
        .json(&serde_json::json!({ "instruction": instruction, "text": text }))
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;
    let response = handle_authed_response(&app, response).await?;

    response
        .json::<CampusCommandResponse>()
        .await
        .map_err(|e| format!("invalid response: {}", e))
}

#[tauri::command]
#[specta::specta]
pub async fn transcribe_campus_audio_file(
    app: AppHandle,
    file_bytes: Vec<u8>,
    filename: String,
) -> Result<String, String> {
    let credentials =
        load_campus_credentials(&app)?.ok_or_else(|| "campus session is missing".to_string())?;
    let base_url = normalize_base_url(&credentials.session.server_url);
    let client = campus_request_client_with_timeout(
        Some(&credentials.token),
        Duration::from_secs(300),
    );

    let mime = if filename.ends_with(".mp3") {
        "audio/mpeg"
    } else if filename.ends_with(".m4a") {
        "audio/mp4"
    } else if filename.ends_with(".ogg") {
        "audio/ogg"
    } else {
        "audio/wav"
    };

    let part = reqwest::multipart::Part::bytes(file_bytes)
        .file_name(filename)
        .mime_str(mime)
        .map_err(|e| format!("invalid mime: {}", e))?;

    let form = reqwest::multipart::Form::new().part("file", part);

    let response = client
        .post(format!("{}/api/transcribe", base_url))
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;
    let response = handle_authed_response(&app, response).await?;

    let resp: TranscribeResponse = response
        .json()
        .await
        .map_err(|e| format!("invalid response: {}", e))?;

    Ok(resp.text)
}

#[derive(Debug)]
pub enum CampusError {
    Unauthorized,
    Forbidden(String),
    BadGateway(String),
    Network(String),
    Other(String),
}

impl std::fmt::Display for CampusError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CampusError::Unauthorized => write!(f, "Session campus expirée"),
            CampusError::Forbidden(msg) => write!(f, "Compte suspendu : {msg}"),
            CampusError::BadGateway(msg) => write!(f, "Moteur IA indisponible : {msg}"),
            CampusError::Network(msg) => write!(f, "Serveur injoignable : {msg}"),
            CampusError::Other(msg) => write!(f, "Erreur campus : {msg}"),
        }
    }
}

impl std::error::Error for CampusError {}

pub(crate) fn normalize_base_url(url: &str) -> String {
    url.trim_end_matches('/').to_string()
}

fn campus_client(token: &str) -> reqwest::Client {
    campus_request_client(Some(token))
}

#[derive(Deserialize, Debug)]
#[allow(dead_code)]
struct TranscribeResponse {
    text: String,
}

#[derive(Deserialize, Debug)]
#[allow(dead_code)]
struct ReformulateResponse {
    text: String,
}

pub async fn transcribe_campus(
    _app: &AppHandle,
    wav_path: &Path,
    session: &CampusCredentials,
) -> Result<String, CampusError> {
    let base_url = normalize_base_url(&session.server_url);
    let client = campus_client(&session.token);

    let file_bytes = tokio::fs::read(wav_path)
        .await
        .map_err(|e| CampusError::Other(format!("failed to read wav: {}", e)))?;

    let part = reqwest::multipart::Part::bytes(file_bytes)
        .file_name("recording.wav")
        .mime_str("audio/wav")
        .map_err(|e| CampusError::Other(format!("invalid mime: {}", e)))?;

    let form = reqwest::multipart::Form::new().part("file", part);

    let response = client
        .post(format!("{}/api/transcribe", base_url))
        .multipart(form)
        .send()
        .await
        .map_err(|e| {
            if e.is_connect() || e.is_timeout() || e.is_request() {
                CampusError::Network(e.to_string())
            } else {
                CampusError::Other(e.to_string())
            }
        })?;

    handle_campus_response(response).await
}

/// Reformule côté serveur, en désignant le Style appliqué.
///
/// `style_id` accompagne toujours la consigne. Pour un Style **intégré** ou
/// **personnel**, la consigne appartient à l'utilisateur et le serveur
/// l'applique telle quelle. Pour un Style **d'organisation**, l'identifiant
/// porte un préfixe réservé et le serveur retrouve lui-même la consigne dans
/// le package actif : le poste n'y fait pas autorité, et un Style dépublié
/// cesse d'être exécutable même si le catalogue local est en retard.
pub async fn reformulate_campus(
    text: &str,
    style_id: &str,
    style_prompt: &str,
    session: &CampusCredentials,
) -> Result<String, CampusError> {
    let base_url = normalize_base_url(&session.server_url);
    let client = campus_client(&session.token);

    let body = serde_json::json!({
        "text": text,
        "style_id": style_id,
        "style_prompt": style_prompt,
    });

    let response = client
        .post(format!("{}/api/reformulate", base_url))
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            if e.is_connect() || e.is_timeout() || e.is_request() {
                CampusError::Network(e.to_string())
            } else {
                CampusError::Other(e.to_string())
            }
        })?;

    handle_campus_response(response).await
}

async fn handle_campus_response<T: serde::de::DeserializeOwned>(
    response: reqwest::Response,
) -> Result<T, CampusError> {
    let status = response.status();
    if status == reqwest::StatusCode::UNAUTHORIZED {
        return Err(CampusError::Unauthorized);
    }
    if status == reqwest::StatusCode::FORBIDDEN {
        let text = response.text().await.unwrap_or_default();
        return Err(CampusError::Forbidden(parse_error_detail(&text)));
    }
    if status == reqwest::StatusCode::BAD_GATEWAY {
        let text = response.text().await.unwrap_or_default();
        return Err(CampusError::BadGateway(parse_error_detail(&text)));
    }
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(CampusError::Other(format!("HTTP {}: {}", status, text)));
    }

    response
        .json::<T>()
        .await
        .map_err(|e| CampusError::Other(format!("invalid response: {}", e)))
}

fn parse_error_detail(text: &str) -> String {
    if text.is_empty() {
        return "erreur inconnue".to_string();
    }
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(text) {
        if let Some(detail) = value.get("detail").and_then(|v| v.as_str()) {
            return detail.to_string();
        }
    }
    text.to_string()
}

#[derive(Clone, Copy)]
struct ReachabilityCacheEntry {
    reachable: bool,
    at: Instant,
}

const REACHABILITY_TTL: Duration = Duration::from_secs(30);

static REACHABILITY_CACHE: Mutex<Option<HashMap<String, ReachabilityCacheEntry>>> =
    Mutex::new(None);

pub fn is_server_reachable_cached(base_url: &str) -> Option<bool> {
    let normalized = normalize_base_url(base_url);
    let now = Instant::now();

    let mut cache_guard = REACHABILITY_CACHE.lock().unwrap_or_else(|e| e.into_inner());
    let cache = cache_guard.get_or_insert_with(HashMap::new);

    if let Some(entry) = cache.get(&normalized) {
        if now.duration_since(entry.at) < REACHABILITY_TTL {
            return Some(entry.reachable);
        }
    }
    None
}

async fn update_reachability_cache(base_url: &str) -> bool {
    let normalized = normalize_base_url(base_url);
    let reachable = check_server_reachability(&normalized).await;
    let now = Instant::now();

    let mut cache_guard = REACHABILITY_CACHE.lock().unwrap_or_else(|e| e.into_inner());
    let cache = cache_guard.get_or_insert_with(HashMap::new);
    cache.insert(normalized, ReachabilityCacheEntry { reachable, at: now });
    reachable
}

async fn check_server_reachability(base_url: &str) -> bool {
    let client = campus_request_client_with_timeout(None, Duration::from_secs(2));
    client
        .get(format!("{}/api/health", base_url))
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

/// Retourne vrai si une session campus est présente — utile pour distinguer
/// « serveur injoignable » (session présente mais reachability à faux) de
/// « aucun mode campus » quand `should_use_campus` renvoie None.
pub fn has_campus_session(app: &AppHandle) -> bool {
    load_campus_session(app.clone()).ok().flatten().is_some()
}

pub async fn should_use_campus(app: &AppHandle) -> Option<CampusCredentials> {
    if !is_campus_enabled(app) {
        return None;
    }
    let session = load_campus_credentials(app).ok().flatten()?;
    match is_server_reachable_cached(&session.server_url) {
        Some(true) => Some(session),
        Some(false) => None,
        None => {
            if update_reachability_cache(&session.server_url).await {
                Some(session)
            } else {
                None
            }
        }
    }
}

pub fn invalidate_server_reachability_cache(base_url: &str) {
    let normalized = normalize_base_url(base_url);
    let mut cache_guard = REACHABILITY_CACHE.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(cache) = cache_guard.as_mut() {
        cache.remove(&normalized);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_metadata_never_serializes_a_token() {
        let stored = StoredCampusSession {
            server_url: "https://campus.example.edu".to_string(),
            email: "student@example.edu".to_string(),
            organization: None,
            token: None,
        };

        let value = serde_json::to_value(stored).expect("session metadata serializes");
        assert_eq!(value.get("token"), None);
        assert_eq!(value["email"], "student@example.edu");
    }

    #[test]
    fn legacy_plaintext_session_can_be_migrated() {
        let value = serde_json::json!({
            "server_url": "https://campus.example.edu",
            "email": "student@example.edu",
            "token": "legacy-secret",
        });

        let stored: StoredCampusSession =
            serde_json::from_value(value).expect("legacy session deserializes");
        assert_eq!(stored.token.as_deref(), Some("legacy-secret"));
    }

    #[test]
    fn credential_username_does_not_expose_account_identity() {
        let session = CampusSession {
            server_url: "https://campus.example.edu".to_string(),
            email: "student@example.edu".to_string(),
            organization: None,
        };

        let username = credential_username(&session);
        assert_eq!(username.len(), 64);
        assert!(!username.contains("student"));
        assert!(!username.contains("example.edu"));
    }

    #[test]
    fn a_session_survives_a_change_of_server_address() {
        // Le défaut que la découverte rendait inévitable : une organisation qui
        // déménage perdait sa session, sans que personne comprenne pourquoi.
        let before = CampusSession {
            server_url: "https://avant.example.edu".to_string(),
            email: "etudiant@example.edu".to_string(),
            organization: Some("ecole".to_string()),
        };
        let after = CampusSession {
            server_url: "https://apres.example.edu".to_string(),
            ..before.clone()
        };
        assert_eq!(credential_username(&before), credential_username(&after));
    }

    #[test]
    fn two_organizations_never_share_a_keyring_entry() {
        let first = CampusSession {
            server_url: "https://nova.example.edu".to_string(),
            email: "personne@example.edu".to_string(),
            organization: Some("ecole-a".to_string()),
        };
        let second = CampusSession {
            organization: Some("ecole-b".to_string()),
            ..first.clone()
        };
        assert_ne!(credential_username(&first), credential_username(&second));
    }

    #[test]
    fn a_session_without_an_organization_keeps_its_legacy_entry() {
        // Les sessions créées avant la découverte continuent de fonctionner :
        // aucune migration forcée, aucune reconnexion imposée.
        let legacy = CampusSession {
            server_url: "https://campus.example.edu".to_string(),
            email: "student@example.edu".to_string(),
            organization: None,
        };
        let expected = format!(
            "{:x}",
            Sha256::digest("https://campus.example.edu|student@example.edu".as_bytes())
        );
        assert_eq!(credential_username(&legacy), expected);
    }

    // ── Où la configuration Campus est lue ──────────────────────────────

    fn write_config(dir: &Path) {
        std::fs::create_dir_all(dir).expect("config directory is created");
        std::fs::write(
            dir.join(CAMPUS_CONFIG_FILENAME),
            r#"{"server_url":"https://campus.example.edu"}"#,
        )
        .expect("config is written");
    }

    #[test]
    fn a_machine_wide_configuration_is_found() {
        let machine = tempfile::tempdir().expect("machine directory");
        let exe = tempfile::tempdir().expect("executable directory");
        write_config(machine.path());

        assert_eq!(
            resolve_campus_config_path(Some(machine.path()), exe.path()),
            Some(machine.path().join(CAMPUS_CONFIG_FILENAME))
        );
    }

    #[test]
    fn a_configuration_beside_the_executable_still_works() {
        // Postes déjà déployés et installation portable : ni l'un ni l'autre
        // n'a de configuration machine.
        let machine = tempfile::tempdir().expect("machine directory");
        let exe = tempfile::tempdir().expect("executable directory");
        write_config(exe.path());

        assert_eq!(
            resolve_campus_config_path(Some(machine.path()), exe.path()),
            Some(exe.path().join(CAMPUS_CONFIG_FILENAME))
        );
    }

    #[test]
    fn the_managed_configuration_wins_over_the_one_beside_the_executable() {
        // Un fichier laissé à côté de l'exécutable ne doit pas pouvoir
        // détourner un poste géré par la DSI.
        let machine = tempfile::tempdir().expect("machine directory");
        let exe = tempfile::tempdir().expect("executable directory");
        write_config(machine.path());
        write_config(exe.path());

        assert_eq!(
            resolve_campus_config_path(Some(machine.path()), exe.path()),
            Some(machine.path().join(CAMPUS_CONFIG_FILENAME))
        );
    }

    #[test]
    fn without_any_configuration_nova_stays_unmanaged() {
        // Comportement inchangé : l'utilisateur saisit lui-même son serveur.
        let machine = tempfile::tempdir().expect("machine directory");
        let exe = tempfile::tempdir().expect("executable directory");

        assert_eq!(
            resolve_campus_config_path(Some(machine.path()), exe.path()),
            None
        );
        assert_eq!(resolve_campus_config_path(None, exe.path()), None);
    }

    #[test]
    fn a_missing_machine_directory_falls_back_instead_of_failing() {
        let exe = tempfile::tempdir().expect("executable directory");
        write_config(exe.path());
        let absent = exe.path().join("no-such-directory");

        assert_eq!(
            resolve_campus_config_path(Some(&absent), exe.path()),
            Some(exe.path().join(CAMPUS_CONFIG_FILENAME))
        );
    }

    #[cfg(windows)]
    #[test]
    fn the_machine_directory_is_program_data() {
        // ProgramData, et non un chemin dans le profil : la configuration doit
        // être commune à tous les comptes du poste.
        let dir = machine_config_dir().expect("ProgramData is defined on Windows");
        assert!(dir.ends_with("Nova"));
        assert_eq!(
            dir.parent().map(Path::to_path_buf),
            std::env::var_os("ProgramData").map(PathBuf::from)
        );
    }

    #[test]
    fn no_server_address_is_hard_coded() {
        // Nova ne connaît aucun établissement : l'adresse vient toujours de la
        // configuration déployée, ou de l'utilisateur. Le marqueur est
        // reconstruit pour que cette chaîne ne se coupe pas elle-même.
        let marker = format!("#[cfg({})]", "test");
        let production = include_str!("campus.rs")
            .split(&marker)
            .next()
            .expect("the file has a production section");

        assert!(
            !production.contains("https://") && !production.contains("http://"),
            "an absolute server address must never be compiled into Nova"
        );
    }

    // ── Ce que chaque édition installe ──────────────────────────────────

    #[test]
    fn personal_installs_for_the_current_user_only() {
        // Nova Personal ne doit jamais réclamer de droits administrateur :
        // absence d'`installMode` = `currentUser`, le défaut de Tauri.
        let config: serde_json::Value = serde_json::from_str(include_str!("../../tauri.conf.json"))
            .expect("tauri.conf.json parses");

        assert_eq!(
            config.pointer("/bundle/windows/nsis/installMode"),
            None,
            "adding installMode here would change Nova Personal too"
        );
    }

    #[test]
    fn the_installer_never_touches_the_legacy_machine_configuration() {
        // L'installateur écrit désormais la configuration de déploiement
        // d'entreprise (`organization.json`) — c'est tout l'objet du
        // déploiement géré. Mais `campus-config.json`, déposé par la DSI par
        // un mécanisme séparé, ne lui appartient toujours pas : une mise à
        // jour qui l'écraserait déconnecterait silencieusement un pilote.
        let installer = include_str!("../../nsis/installer.nsi");
        assert!(
            !installer.to_lowercase().contains("campus-config"),
            "the installer must never write to or delete the legacy machine configuration"
        );
    }

    #[test]
    fn the_installer_writes_the_machine_configuration_only_when_asked() {
        // L'invariant qui compte n'est plus « ne touche pas au répertoire
        // machine » mais « ne le réécrit pas tout seul » : une mise à jour
        // lancée sans paramètre de déploiement doit préserver le rattachement
        // à l'organisation.
        let installer = include_str!("../../nsis/installer.nsi");
        let write = installer
            .find(r#"CopyFiles /SILENT "$ManagedConfigSource""#)
            .expect("the managed configuration is written somewhere");
        let guard = installer
            .find(r#"${If} $DeploymentId != """#)
            .expect("the write is guarded by a deployment parameter");
        assert!(
            guard < write,
            "the machine configuration must only be written when this run carries one"
        );
    }

    #[test]
    fn only_an_explicit_purge_deletes_the_machine_configuration() {
        // Une désinstallation ordinaire, une réparation et une mise à jour
        // conservent la configuration. La purger est une action
        // administrative distincte, demandée explicitement.
        let installer = include_str!("../../nsis/installer.nsi");
        let purge = installer
            .find("${If} $PurgeConfigMode = 1")
            .expect("a purge guard exists");
        for deletion in [
            r#"Delete "$COMMONPROGRAMDATA\Nova\organization.json""#,
            r#"Delete "$COMMONPROGRAMDATA\Nova\device.json""#,
            r#"RMDir /r "$COMMONPROGRAMDATA\Nova\logs""#,
            r#"RMDir "$COMMONPROGRAMDATA\Nova""#,
        ] {
            let at = installer
                .find(deletion)
                .unwrap_or_else(|| panic!("deletion not found: {deletion}"));
            assert!(
                purge < at,
                "{deletion} must sit behind the explicit purge guard"
            );
        }
        // Et rien ne supprime le répertoire machine en bloc.
        assert!(
            !installer.contains(r#"RMDir /r "$COMMONPROGRAMDATA\Nova""#),
            "the machine configuration directory must never be removed recursively"
        );
    }

    #[test]
    fn the_installer_accepts_no_dangerous_parameter() {
        // Ni adresse de serveur libre, ni commande, ni script, ni secret : un
        // installeur qui les accepterait deviendrait un moyen d'execution
        // arbitraire declenchable par n'importe quel outil de deploiement.
        let installer = include_str!("../../nsis/installer.nsi");
        for forbidden in [
            "/SERVER_URL",
            "/COMMAND=",
            "/SCRIPT",
            "/TOKEN",
            "/PASSWORD",
            "/SECRET",
        ] {
            assert!(
                !installer.contains(forbidden),
                "the installer must not accept {forbidden}"
            );
        }
    }

    #[test]
    fn campus_installs_for_the_whole_machine() {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../../tauri.campus.conf.json"))
                .expect("tauri.campus.conf.json parses");

        assert_eq!(
            config.pointer("/bundle/windows/nsis/installMode"),
            Some(&serde_json::Value::String("perMachine".to_string()))
        );
    }
}
