use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_store::StoreExt;

use crate::portable;
use crate::settings::{get_settings, write_settings};

const CAMPUS_CONFIG_FILENAME: &str = "campus-config.json";
const CAMPUS_SESSION_STORE: &str = "campus_session.json";
const CAMPUS_SESSION_KEY: &str = "campus_session";

pub const CAMPUS_SESSION_INVALID_EVENT: &str = "campus-session-invalid";
pub const CAMPUS_SERVER_UNREACHABLE_EVENT: &str = "campus-server-unreachable";

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct CampusConfig {
    pub server_url: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct CampusSession {
    pub server_url: String,
    pub token: String,
    pub email: String,
}

/// État runtime indiquant si le frontend a été buildé en mode campus.
#[derive(Default)]
pub struct CampusState {
    pub enabled: AtomicBool,
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

/// Lit le fichier `campus-config.json` placé à côté de l'exécutable par l'IT.
#[tauri::command]
#[specta::specta]
pub fn get_campus_config() -> Result<Option<CampusConfig>, String> {
    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_dir = exe_path
        .parent()
        .ok_or("Could not determine executable directory")?;
    let config_path = exe_dir.join(CAMPUS_CONFIG_FILENAME);

    if !config_path.exists() {
        return Ok(None);
    }

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

#[tauri::command]
#[specta::specta]
pub fn load_campus_session(app: AppHandle) -> Result<Option<CampusSession>, String> {
    let store = campus_session_store(&app)?;
    let Some(value) = store.get(CAMPUS_SESSION_KEY) else {
        return Ok(None);
    };
    if value.is_null() {
        return Ok(None);
    }
    let session: CampusSession = serde_json::from_value(value).map_err(|e| e.to_string())?;
    Ok(Some(session))
}

#[tauri::command]
#[specta::specta]
pub fn save_campus_session(app: AppHandle, session: CampusSession) -> Result<(), String> {
    let store = campus_session_store(&app)?;
    store.set(
        CAMPUS_SESSION_KEY,
        serde_json::to_value(&session).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())?;

    let mut settings = get_settings(&app);
    settings.onboarding_completed = true;
    write_settings(&app, settings);

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn clear_campus_session(app: AppHandle) -> Result<(), String> {
    let store = campus_session_store(&app)?;
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
pub struct CampusAuthVerifyResponse {
    pub token: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct CampusMeResponse {
    pub email: String,
    pub role: String,
    pub cohort: String,
}

fn campus_client_no_auth() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .expect("reqwest client builds")
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
pub async fn verify_campus_auth(
    server_url: String,
    email: String,
    code: String,
    machine: String,
) -> Result<CampusAuthVerifyResponse, String> {
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

    response
        .json::<CampusAuthVerifyResponse>()
        .await
        .map_err(|e| format!("invalid response: {}", e))
}

fn campus_client_with_token(token: &str) -> reqwest::Client {
    let mut headers = reqwest::header::HeaderMap::new();
    let auth_value = format!("Bearer {}", token)
        .parse()
        .expect("valid bearer header");
    headers.insert(reqwest::header::AUTHORIZATION, auth_value);
    reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .default_headers(headers)
        .build()
        .expect("reqwest client builds")
}

#[tauri::command]
#[specta::specta]
pub async fn get_campus_me(
    server_url: String,
    token: String,
) -> Result<CampusMeResponse, String> {
    let base_url = normalize_base_url(&server_url);
    let client = campus_client_with_token(&token);
    let response = client
        .get(format!("{}/api/me", base_url))
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;

    if !response.status().is_success() {
        return Err(parse_error_text(response).await);
    }

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

#[tauri::command]
#[specta::specta]
pub async fn get_campus_vocabulary(
    server_url: String,
    token: String,
) -> Result<CampusVocabularyResponse, String> {
    let base_url = normalize_base_url(&server_url);
    let client = campus_client_with_token(&token);
    let response = client
        .get(format!("{}/api/vocabulary", base_url))
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;

    if !response.status().is_success() {
        return Err(parse_error_text(response).await);
    }

    response
        .json::<CampusVocabularyResponse>()
        .await
        .map_err(|e| format!("invalid response: {}", e))
}

#[tauri::command]
#[specta::specta]
pub async fn add_campus_dictionary_entry(
    server_url: String,
    token: String,
    term: String,
    replacement: String,
) -> Result<CampusIdResponse, String> {
    let base_url = normalize_base_url(&server_url);
    let client = campus_client_with_token(&token);
    let response = client
        .post(format!("{}/api/dictionary", base_url))
        .json(&serde_json::json!({ "term": term, "replacement": replacement }))
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;

    if !response.status().is_success() {
        return Err(parse_error_text(response).await);
    }

    response
        .json::<CampusIdResponse>()
        .await
        .map_err(|e| format!("invalid response: {}", e))
}

#[tauri::command]
#[specta::specta]
pub async fn delete_campus_dictionary_entry(
    server_url: String,
    token: String,
    entry_id: i64,
) -> Result<(), String> {
    let base_url = normalize_base_url(&server_url);
    let client = campus_client_with_token(&token);
    let response = client
        .delete(format!("{}/api/dictionary/{}", base_url, entry_id))
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;

    if !response.status().is_success() {
        return Err(parse_error_text(response).await);
    }

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn learn_campus_dictionary(
    server_url: String,
    token: String,
    heard: String,
    corrected: String,
) -> Result<CampusLearnResponse, String> {
    let base_url = normalize_base_url(&server_url);
    let client = campus_client_with_token(&token);
    let response = client
        .post(format!("{}/api/dictionary/learn", base_url))
        .json(&serde_json::json!({ "heard": heard, "corrected": corrected }))
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;

    if !response.status().is_success() {
        return Err(parse_error_text(response).await);
    }

    response
        .json::<CampusLearnResponse>()
        .await
        .map_err(|e| format!("invalid response: {}", e))
}

#[tauri::command]
#[specta::specta]
pub async fn export_campus_dictionary(
    server_url: String,
    token: String,
) -> Result<String, String> {
    let base_url = normalize_base_url(&server_url);
    let client = campus_client_with_token(&token);
    let response = client
        .get(format!("{}/api/dictionary/export", base_url))
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;

    if !response.status().is_success() {
        return Err(parse_error_text(response).await);
    }

    response
        .text()
        .await
        .map_err(|e| format!("invalid response text: {}", e))
}

#[tauri::command]
#[specta::specta]
pub async fn import_campus_dictionary(
    server_url: String,
    token: String,
    csv_content: String,
) -> Result<CampusImportResponse, String> {
    let base_url = normalize_base_url(&server_url);
    let client = campus_client_with_token(&token);

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

    if !response.status().is_success() {
        return Err(parse_error_text(response).await);
    }

    response
        .json::<CampusImportResponse>()
        .await
        .map_err(|e| format!("invalid response: {}", e))
}

#[tauri::command]
#[specta::specta]
pub async fn analyze_campus_document(
    server_url: String,
    token: String,
    text_content: String,
    filename: Option<String>,
) -> Result<CampusAnalyzeResponse, String> {
    let base_url = normalize_base_url(&server_url);
    let mut headers = reqwest::header::HeaderMap::new();
    let auth_value = format!("Bearer {}", token)
        .parse()
        .expect("valid bearer header");
    headers.insert(reqwest::header::AUTHORIZATION, auth_value);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .default_headers(headers)
        .build()
        .map_err(|e| e.to_string())?;

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

    if !response.status().is_success() {
        return Err(parse_error_text(response).await);
    }

    response
        .json::<CampusAnalyzeResponse>()
        .await
        .map_err(|e| format!("invalid response: {}", e))
}

#[tauri::command]
#[specta::specta]
pub async fn add_campus_snippet(
    server_url: String,
    token: String,
    trigger: String,
    content: String,
) -> Result<CampusIdResponse, String> {
    let base_url = normalize_base_url(&server_url);
    let client = campus_client_with_token(&token);
    let response = client
        .post(format!("{}/api/snippets", base_url))
        .json(&serde_json::json!({ "trigger": trigger, "content": content }))
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;

    if !response.status().is_success() {
        return Err(parse_error_text(response).await);
    }

    response
        .json::<CampusIdResponse>()
        .await
        .map_err(|e| format!("invalid response: {}", e))
}

#[tauri::command]
#[specta::specta]
pub async fn delete_campus_snippet(
    server_url: String,
    token: String,
    snippet_id: i64,
) -> Result<(), String> {
    let base_url = normalize_base_url(&server_url);
    let client = campus_client_with_token(&token);
    let response = client
        .delete(format!("{}/api/snippets/{}", base_url, snippet_id))
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;

    if !response.status().is_success() {
        return Err(parse_error_text(response).await);
    }

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn get_campus_formatting_rules(
    server_url: String,
    token: String,
) -> Result<CampusFormattingRulesResponse, String> {
    let base_url = normalize_base_url(&server_url);
    let client = campus_client_with_token(&token);
    let response = client
        .get(format!("{}/api/formatting-rules", base_url))
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;

    if !response.status().is_success() {
        return Err(parse_error_text(response).await);
    }

    response
        .json::<CampusFormattingRulesResponse>()
        .await
        .map_err(|e| format!("invalid response: {}", e))
}

#[tauri::command]
#[specta::specta]
pub async fn add_campus_formatting_rule(
    server_url: String,
    token: String,
    rule: String,
) -> Result<CampusIdResponse, String> {
    let base_url = normalize_base_url(&server_url);
    let client = campus_client_with_token(&token);
    let response = client
        .post(format!("{}/api/formatting-rules", base_url))
        .json(&serde_json::json!({ "rule": rule }))
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;

    if !response.status().is_success() {
        return Err(parse_error_text(response).await);
    }

    response
        .json::<CampusIdResponse>()
        .await
        .map_err(|e| format!("invalid response: {}", e))
}

#[tauri::command]
#[specta::specta]
pub async fn delete_campus_formatting_rule(
    server_url: String,
    token: String,
    rule_id: i64,
) -> Result<(), String> {
    let base_url = normalize_base_url(&server_url);
    let client = campus_client_with_token(&token);
    let response = client
        .delete(format!("{}/api/formatting-rules/{}", base_url, rule_id))
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;

    if !response.status().is_success() {
        return Err(parse_error_text(response).await);
    }

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn execute_campus_command(
    server_url: String,
    token: String,
    instruction: String,
    text: String,
) -> Result<CampusCommandResponse, String> {
    let base_url = normalize_base_url(&server_url);
    let mut headers = reqwest::header::HeaderMap::new();
    let auth_value = format!("Bearer {}", token)
        .parse()
        .expect("valid bearer header");
    headers.insert(reqwest::header::AUTHORIZATION, auth_value);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .default_headers(headers)
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .post(format!("{}/api/command", base_url))
        .json(&serde_json::json!({ "instruction": instruction, "text": text }))
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;

    if !response.status().is_success() {
        return Err(parse_error_text(response).await);
    }

    response
        .json::<CampusCommandResponse>()
        .await
        .map_err(|e| format!("invalid response: {}", e))
}

#[tauri::command]
#[specta::specta]
pub async fn transcribe_campus_audio_file(
    server_url: String,
    token: String,
    file_bytes: Vec<u8>,
    filename: String,
) -> Result<String, String> {
    let base_url = normalize_base_url(&server_url);
    let mut headers = reqwest::header::HeaderMap::new();
    let auth_value = format!("Bearer {}", token)
        .parse()
        .expect("valid bearer header");
    headers.insert(reqwest::header::AUTHORIZATION, auth_value);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(300))
        .default_headers(headers)
        .build()
        .map_err(|e| e.to_string())?;

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

    if !response.status().is_success() {
        return Err(parse_error_text(response).await);
    }

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

fn normalize_base_url(url: &str) -> String {
    url.trim_end_matches('/').to_string()
}

fn campus_client(token: &str) -> reqwest::Client {
    let mut headers = reqwest::header::HeaderMap::new();
    let auth_value = format!("Bearer {}", token)
        .parse()
        .expect("valid bearer header");
    headers.insert(reqwest::header::AUTHORIZATION, auth_value);
    reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .default_headers(headers)
        .build()
        .expect("reqwest client builds")
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
    session: &CampusSession,
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

pub async fn reformulate_campus(
    text: &str,
    style_prompt: &str,
    session: &CampusSession,
) -> Result<String, CampusError> {
    let base_url = normalize_base_url(&session.server_url);
    let client = campus_client(&session.token);

    let body = serde_json::json!({
        "text": text,
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
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .expect("reqwest client builds");
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

pub async fn should_use_campus(app: &AppHandle) -> Option<CampusSession> {
    if !is_campus_enabled(app) {
        return None;
    }
    let session = load_campus_session(app.clone()).ok().flatten()?;
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
