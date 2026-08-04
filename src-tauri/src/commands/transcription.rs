use crate::managers::transcription::TranscriptionManager;
use crate::settings::{get_settings, write_settings, ModelUnloadTimeout};
use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, State};

#[derive(Serialize, Type)]
pub struct ModelLoadStatus {
    is_loaded: bool,
    current_model: Option<String>,
}

#[tauri::command]
#[specta::specta]
pub fn set_model_unload_timeout(app: AppHandle, timeout: ModelUnloadTimeout) {
    let mut settings = get_settings(&app);
    settings.model_unload_timeout = timeout;
    write_settings(&app, settings);
}

#[tauri::command]
#[specta::specta]
pub fn get_model_load_status(
    transcription_manager: State<TranscriptionManager>,
) -> Result<ModelLoadStatus, String> {
    Ok(ModelLoadStatus {
        is_loaded: transcription_manager.is_model_loaded(),
        current_model: transcription_manager.get_current_model(),
    })
}

#[tauri::command]
#[specta::specta]
pub fn unload_model_manually(
    transcription_manager: State<TranscriptionManager>,
) -> Result<(), String> {
    transcription_manager
        .unload_model()
        .map_err(|e| format!("Failed to unload model: {}", e))
}

/// Whether startup skipped the GPU backend modules because a previous native
/// backend init hung on a broken graphics driver (see
/// `managers::transcription::init_transcribe_backend`). The frontend shows a
/// degraded-mode notice when this is true.
#[tauri::command]
#[specta::specta]
pub fn is_transcribe_cpu_only_mode() -> bool {
    crate::managers::transcription::is_transcribe_cpu_only_mode()
}

/// Clear the broken-GPU-driver blacklist so the NEXT launch retries the full
/// (GPU-enabled) backend init — e.g. after a graphics driver update. Only
/// takes effect after an app restart.
#[tauri::command]
#[specta::specta]
pub fn clear_transcribe_gpu_blacklist(app: AppHandle) -> Result<(), String> {
    crate::managers::transcription::clear_transcribe_gpu_blacklist(&app)
        .map_err(|e| format!("Failed to clear GPU blacklist: {}", e))
}
