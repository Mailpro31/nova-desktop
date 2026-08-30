pub mod audio;
pub mod campus;
pub mod history;
pub mod license;
pub mod local_llm;
pub mod meeting;
pub mod models;
pub mod transcription;

use crate::settings::{get_settings, write_settings, AppSettings, LogLevel};
use crate::utils::cancel_current_operation;
use tauri::{AppHandle, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
#[specta::specta]
pub fn cancel_operation(app: AppHandle) {
    cancel_current_operation(&app);
}

#[tauri::command]
#[specta::specta]
pub fn finish_recording(app: AppHandle) {
    if let Some(coordinator) = app.try_state::<crate::TranscriptionCoordinator>() {
        coordinator.finish_current();
    }
}

/// Déclenche une dictée comme si le raccourci correspondant avait été pressé
/// (par exemple depuis un bouton de l'écran d'accueil campus).
#[tauri::command]
#[specta::specta]
pub fn trigger_transcription(app: AppHandle, binding_id: String) {
    crate::signal_handle::send_transcription_input(&app, &binding_id, "HOME_BUTTON");
}

#[tauri::command]
#[specta::specta]
pub fn copy_transcription(app: AppHandle, text: String) -> Result<(), String> {
    app.clipboard()
        .write_text(text)
        .map_err(|error| format!("Failed to copy transcription: {error}"))
}

#[tauri::command]
#[specta::specta]
pub fn dismiss_recording_overlay(app: AppHandle) {
    crate::overlay::hide_recording_overlay(&app);
}

#[tauri::command]
#[specta::specta]
pub fn is_portable() -> bool {
    crate::portable::is_portable()
}

#[tauri::command]
#[specta::specta]
pub fn get_app_dir_path(app: AppHandle) -> Result<String, String> {
    let app_data_dir = crate::portable::app_data_dir(&app)
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    Ok(app_data_dir.to_string_lossy().to_string())
}

#[tauri::command]
#[specta::specta]
pub fn get_app_settings(app: AppHandle) -> Result<AppSettings, String> {
    Ok(get_settings(&app))
}

#[tauri::command]
#[specta::specta]
pub fn get_default_settings() -> Result<AppSettings, String> {
    Ok(crate::settings::get_default_settings())
}

/// Termes récurrents que l'apprentissage progressif propose d'ajouter au
/// lexique personnel. Vide tant qu'aucun candidat n'a atteint le seuil de
/// récurrence (ou si l'apprentissage est désactivé). Voir `lexicon_learning.rs`.
#[tauri::command]
#[specta::specta]
pub fn get_lexicon_suggestions(app: AppHandle) -> Vec<String> {
    crate::lexicon_learning::pending_suggestions(&get_settings(&app))
}

/// L'utilisateur accepte une suggestion : le terme rejoint le lexique personnel.
#[tauri::command]
#[specta::specta]
pub fn accept_lexicon_suggestion(app: AppHandle, term: String) -> Result<(), String> {
    crate::lexicon_learning::accept(&app, &term);
    Ok(())
}

/// L'utilisateur ignore une suggestion : le terme ne sera plus jamais reproposé.
#[tauri::command]
#[specta::specta]
pub fn dismiss_lexicon_suggestion(app: AppHandle, term: String) -> Result<(), String> {
    crate::lexicon_learning::dismiss(&app, &term);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn get_log_dir_path(app: AppHandle) -> Result<String, String> {
    let log_dir = crate::portable::app_log_dir(&app)
        .map_err(|e| format!("Failed to get log directory: {}", e))?;

    Ok(log_dir.to_string_lossy().to_string())
}

/// Charge la fin du journal courant pour que l'écran Debug montre aussi ce qui
/// s'est passé AVANT son ouverture. Lecture bornée (256 Kio / 1000 lignes) afin
/// de rester instantanée même sur une longue session.
#[tauri::command]
#[specta::specta]
pub fn get_recent_log_lines(
    app: AppHandle,
    max_lines: Option<usize>,
) -> Result<Vec<String>, String> {
    use std::io::{Read, Seek, SeekFrom};

    let log_dir = crate::portable::app_log_dir(&app)
        .map_err(|e| format!("Failed to get log directory: {e}"))?;
    let mut files = std::fs::read_dir(&log_dir)
        .map_err(|e| format!("Failed to read log directory: {e}"))?
        .filter_map(Result::ok)
        .filter(|entry| {
            entry
                .file_type()
                .map(|kind| kind.is_file())
                .unwrap_or(false)
        })
        .collect::<Vec<_>>();
    files.sort_by_key(|entry| {
        entry
            .metadata()
            .and_then(|metadata| metadata.modified())
            .ok()
    });
    let Some(latest) = files.last() else {
        return Ok(Vec::new());
    };

    let mut file = std::fs::File::open(latest.path())
        .map_err(|e| format!("Failed to open current log: {e}"))?;
    let len = file
        .metadata()
        .map_err(|e| format!("Failed to inspect current log: {e}"))?
        .len();
    const MAX_BYTES: u64 = 256 * 1024;
    let start = len.saturating_sub(MAX_BYTES);
    file.seek(SeekFrom::Start(start))
        .map_err(|e| format!("Failed to seek current log: {e}"))?;
    let mut text = String::new();
    file.read_to_string(&mut text)
        .map_err(|e| format!("Failed to read current log: {e}"))?;
    if start > 0 {
        if let Some(first_newline) = text.find('\n') {
            text.drain(..=first_newline);
        }
    }
    let cap = max_lines.unwrap_or(500).clamp(1, 1_000);
    let mut lines = text.lines().map(str::to_string).collect::<Vec<_>>();
    if lines.len() > cap {
        lines.drain(..lines.len() - cap);
    }
    Ok(lines)
}

#[specta::specta]
#[tauri::command]
pub fn set_log_level(app: AppHandle, level: LogLevel) -> Result<(), String> {
    let tauri_log_level: tauri_plugin_log::LogLevel = level.into();
    let log_level: log::Level = tauri_log_level.into();
    // Update the file log level atomic so the filter picks up the new level
    crate::FILE_LOG_LEVEL.store(
        log_level.to_level_filter() as u8,
        std::sync::atomic::Ordering::Relaxed,
    );

    let mut settings = get_settings(&app);
    settings.log_level = level;
    write_settings(&app, settings);

    Ok(())
}

#[specta::specta]
#[tauri::command]
pub fn open_recordings_folder(app: AppHandle) -> Result<(), String> {
    let app_data_dir = crate::portable::app_data_dir(&app)
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let recordings_dir = app_data_dir.join("recordings");

    let path = recordings_dir.to_string_lossy().as_ref().to_string();
    app.opener()
        .open_path(path, None::<String>)
        .map_err(|e| format!("Failed to open recordings folder: {}", e))?;

    Ok(())
}

#[specta::specta]
#[tauri::command]
pub fn open_log_dir(app: AppHandle) -> Result<(), String> {
    let log_dir = crate::portable::app_log_dir(&app)
        .map_err(|e| format!("Failed to get log directory: {}", e))?;

    let path = log_dir.to_string_lossy().as_ref().to_string();
    app.opener()
        .open_path(path, None::<String>)
        .map_err(|e| format!("Failed to open log directory: {}", e))?;

    Ok(())
}

#[specta::specta]
#[tauri::command]
pub fn open_app_data_dir(app: AppHandle) -> Result<(), String> {
    let app_data_dir = crate::portable::app_data_dir(&app)
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let path = app_data_dir.to_string_lossy().as_ref().to_string();
    app.opener()
        .open_path(path, None::<String>)
        .map_err(|e| format!("Failed to open app data directory: {}", e))?;

    Ok(())
}

/// Check if Apple Intelligence is available on this device.
/// Called by the frontend when the user selects Apple Intelligence provider.
#[specta::specta]
#[tauri::command]
pub fn check_apple_intelligence_available() -> bool {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        crate::apple_intelligence::check_apple_intelligence_availability()
    }
    #[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
    {
        false
    }
}

/// Try to initialize Enigo (keyboard/mouse simulation).
/// On macOS, this will return an error if accessibility permissions are not granted.
#[specta::specta]
#[tauri::command]
pub fn initialize_enigo(app: AppHandle) -> Result<(), String> {
    use crate::input::EnigoState;

    // Check if already initialized
    if app.try_state::<EnigoState>().is_some() {
        log::debug!("Enigo already initialized");
        return Ok(());
    }

    // Try to initialize
    match EnigoState::new() {
        Ok(enigo_state) => {
            app.manage(enigo_state);
            log::info!("Enigo initialized successfully after permission grant");
            Ok(())
        }
        Err(e) => {
            if cfg!(target_os = "macos") {
                log::warn!(
                    "Failed to initialize Enigo: {} (accessibility permissions may not be granted)",
                    e
                );
            } else {
                log::warn!("Failed to initialize Enigo: {}", e);
            }
            Err(format!("Failed to initialize input system: {}", e))
        }
    }
}

/// Marker state to track if shortcuts have been initialized.
pub struct ShortcutsInitialized;

/// Initialize keyboard shortcuts.
/// On macOS, this should be called after accessibility permissions are granted.
/// This is idempotent - calling it multiple times is safe.
#[specta::specta]
#[tauri::command]
pub fn initialize_shortcuts(app: AppHandle) -> Result<(), String> {
    // Check if already initialized
    if app.try_state::<ShortcutsInitialized>().is_some() {
        log::debug!("Shortcuts already initialized");
        return Ok(());
    }

    // Initialize shortcuts
    crate::shortcut::init_shortcuts(&app);

    // Mark as initialized
    app.manage(ShortcutsInitialized);

    log::info!("Shortcuts initialized successfully");
    Ok(())
}
