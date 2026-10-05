//! Commandes de l'emploi du temps.
//!
//! L'élève relie le lien d'abonnement de son emploi du temps (ADE,
//! Hyperplanning, Outlook…) ou importe un fichier `.ics`. Nova en garde une
//! copie sur le poste et la relit pour savoir dans quel cours chaque dictée a
//! été faite. Rien n'est envoyé au serveur de l'établissement.
//!
//! Le lien d'abonnement contient en général un jeton personnel : il est rangé
//! dans le trousseau du système, comme le jeton de connexion, et jamais dans
//! un fichier de réglages.
//!
//! Les erreurs sont des codes courts, traduits par l'interface :
//! `invalid_link`, `unreachable`, `unreadable`, `not_calendar`, `too_large`,
//! `keyring`, `storage`.

use std::time::Duration;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

use crate::portable;
use crate::timetable::{looks_like_calendar, normalize_link, MAX_CALENDAR_BYTES};

const KEYRING_SERVICE: &str = "nova-timetable";
const KEYRING_ACCOUNT: &str = "subscription-link";
const STORE: &str = "timetable.json";
const STORE_KEY: &str = "timetable";
const CACHE_FILE: &str = "timetable.ics";
/// Un emploi du temps change peu dans la journée : il est relu au plus toutes
/// les six heures, et à la demande.
const REFRESH_AFTER_SECONDS: i64 = 6 * 60 * 60;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum TimetableSource {
    /// Un lien d'abonnement, relu régulièrement.
    Link,
    /// Un fichier importé une fois.
    File,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct TimetableStatus {
    pub source: Option<TimetableSource>,
    /// Dernière lecture réussie, en secondes depuis l'époque Unix.
    pub updated_at: Option<i64>,
}

fn keyring_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).map_err(|_| "keyring".to_string())
}

fn cache_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    portable::app_data_dir(app)
        .map(|dir| dir.join(CACHE_FILE))
        .map_err(|_| "storage".to_string())
}

fn read_status(app: &AppHandle) -> TimetableStatus {
    app.store(portable::store_path(STORE))
        .ok()
        .and_then(|store| store.get(STORE_KEY))
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or(TimetableStatus {
            source: None,
            updated_at: None,
        })
}

fn write_status(app: &AppHandle, status: &TimetableStatus) -> Result<(), String> {
    let store = app
        .store(portable::store_path(STORE))
        .map_err(|_| "storage".to_string())?;
    store.set(
        STORE_KEY,
        serde_json::to_value(status).map_err(|_| "storage".to_string())?,
    );
    store.save().map_err(|_| "storage".to_string())
}

/// Garde la copie locale puis l'état : une copie sans état serait ignorée,
/// un état sans copie annoncerait un emploi du temps absent.
fn save_calendar(app: &AppHandle, text: &str, source: TimetableSource) -> Result<(), String> {
    std::fs::write(cache_path(app)?, text).map_err(|_| "storage".to_string())?;
    write_status(
        app,
        &TimetableStatus {
            source: Some(source),
            updated_at: Some(Utc::now().timestamp()),
        },
    )
}

fn check_calendar(text: &str) -> Result<(), String> {
    if text.len() > MAX_CALENDAR_BYTES {
        return Err("too_large".into());
    }
    if !looks_like_calendar(text) {
        return Err("not_calendar".into());
    }
    Ok(())
}

async fn download(link: &str) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|_| "unreachable".to_string())?;
    let mut response = client
        .get(link)
        .header("accept", "text/calendar, */*;q=0.5")
        .send()
        .await
        .map_err(|_| "unreachable".to_string())?;
    if !response.status().is_success() {
        return Err("unreachable".into());
    }
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "unreachable".to_string())?
    {
        if body.len() + chunk.len() > MAX_CALENDAR_BYTES {
            return Err("too_large".into());
        }
        body.extend_from_slice(&chunk);
    }
    let text = String::from_utf8_lossy(&body).into_owned();
    check_calendar(&text)?;
    Ok(text)
}

fn forget_link() -> Result<(), String> {
    match keyring_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("keyring".into()),
    }
}

#[tauri::command]
#[specta::specta]
pub fn timetable_status(app: AppHandle) -> TimetableStatus {
    read_status(&app)
}

/// Relie un lien d'abonnement. Le lien n'est gardé qu'une fois le calendrier
/// lu : un lien qui ne marche pas n'est pas enregistré.
#[tauri::command]
#[specta::specta]
pub async fn timetable_connect(app: AppHandle, link: String) -> Result<String, String> {
    let link = normalize_link(&link).ok_or_else(|| "invalid_link".to_string())?;
    let text = download(&link).await?;
    keyring_entry()?
        .set_password(&link)
        .map_err(|_| "keyring".to_string())?;
    if let Err(error) = save_calendar(&app, &text, TimetableSource::Link) {
        let _ = forget_link();
        return Err(error);
    }
    Ok(text)
}

/// Importe un fichier `.ics` choisi par l'élève. Un lien relié auparavant est
/// oublié : il n'y a qu'un emploi du temps.
#[tauri::command]
#[specta::specta]
pub fn timetable_import(app: AppHandle, path: String) -> Result<(), String> {
    let size = std::fs::metadata(&path)
        .map_err(|_| "unreadable".to_string())?
        .len();
    if size > MAX_CALENDAR_BYTES as u64 {
        return Err("too_large".into());
    }
    let bytes = std::fs::read(&path).map_err(|_| "unreadable".to_string())?;
    let text = String::from_utf8_lossy(&bytes).into_owned();
    check_calendar(&text)?;
    forget_link()?;
    save_calendar(&app, &text, TimetableSource::File)
}

/// Le calendrier gardé sur le poste, relu d'abord par le lien s'il date de
/// plus de six heures (ou si `refresh`). Si le lien ne répond pas, la copie
/// locale sert : une salle sans réseau ne doit pas faire disparaître les
/// cours. Seule une actualisation demandée signale l'échec.
#[tauri::command]
#[specta::specta]
pub async fn timetable_load(app: AppHandle, refresh: bool) -> Result<Option<String>, String> {
    let status = read_status(&app);
    let Some(source) = status.source else {
        return Ok(None);
    };
    let stale = status
        .updated_at
        .is_none_or(|at| Utc::now().timestamp() - at >= REFRESH_AFTER_SECONDS);
    if source == TimetableSource::Link && (refresh || stale) {
        let fresh = match keyring_entry()?.get_password() {
            Ok(link) => download(&link).await,
            Err(_) => Err("keyring".to_string()),
        };
        match fresh {
            Ok(text) => {
                save_calendar(&app, &text, TimetableSource::Link)?;
                return Ok(Some(text));
            }
            Err(error) if refresh => return Err(error),
            Err(error) => log::warn!("Timetable refresh failed, local copy kept: {error}"),
        }
    }
    match std::fs::read_to_string(cache_path(&app)?) {
        Ok(text) => Ok(Some(text)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(_) => Err("storage".into()),
    }
}

/// Retire l'emploi du temps : le lien, la copie locale et l'état.
#[tauri::command]
#[specta::specta]
pub fn timetable_disconnect(app: AppHandle) -> Result<(), String> {
    forget_link()?;
    match std::fs::remove_file(cache_path(&app)?) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => return Err("storage".into()),
    }
    write_status(
        &app,
        &TimetableStatus {
            source: None,
            updated_at: None,
        },
    )
}
