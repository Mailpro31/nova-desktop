use crate::managers::model::{ModelInfo, ModelManager};
use crate::managers::transcription::{ModelStateEvent, TranscriptionManager};
use crate::settings::{get_settings, write_settings, ModelUnloadTimeout};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};

#[tauri::command]
#[specta::specta]
pub async fn get_available_models(
    model_manager: State<'_, Arc<ModelManager>>,
) -> Result<Vec<ModelInfo>, String> {
    Ok(model_manager.get_available_models())
}

#[tauri::command]
#[specta::specta]
pub async fn get_model_info(
    model_manager: State<'_, Arc<ModelManager>>,
    model_id: String,
) -> Result<Option<ModelInfo>, String> {
    Ok(model_manager.get_model_info(&model_id))
}

/// Re-scan local sources (custom models dir + shared HF cache) for models added
/// since launch
#[tauri::command]
#[specta::specta]
pub async fn rescan_local_models(
    model_manager: State<'_, Arc<ModelManager>>,
) -> Result<(), String> {
    let mm = model_manager.inner().clone();
    tokio::task::spawn_blocking(move || mm.rescan_local_models())
        .await
        .map_err(|e| format!("rescan task panicked: {e}"))?
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn download_model(
    app_handle: AppHandle,
    model_manager: State<'_, Arc<ModelManager>>,
    model_id: String,
) -> Result<(), String> {
    let result = model_manager
        .download_model(&model_id)
        .await
        .map_err(|e| e.to_string());

    if let Err(ref error) = result {
        let _ = app_handle.emit(
            "model-download-failed",
            serde_json::json!({ "model_id": &model_id, "error": error }),
        );
    }

    result
}

#[tauri::command]
#[specta::specta]
pub async fn delete_model(
    app_handle: AppHandle,
    model_manager: State<'_, Arc<ModelManager>>,
    transcription_manager: State<'_, Arc<TranscriptionManager>>,
    model_id: String,
) -> Result<(), String> {
    // If deleting the active model, unload it and clear the setting
    let settings = get_settings(&app_handle);
    if settings.selected_model == model_id {
        transcription_manager
            .unload_model()
            .map_err(|e| format!("Failed to unload model: {}", e))?;

        let mut settings = get_settings(&app_handle);
        settings.selected_model = String::new();
        write_settings(&app_handle, settings);
    }

    model_manager
        .delete_model(&model_id)
        .map_err(|e| e.to_string())
}

/// Shared logic for switching the active model, used by both the Tauri command
/// and the tray menu handler.
///
/// Validates the model, updates the persisted setting, and loads the model
/// unless the unload timeout is set to "Immediately" (in which case the model
/// will be loaded on-demand during the next transcription).
pub fn switch_active_model(app: &AppHandle, model_id: &str) -> Result<(), String> {
    let model_manager = app.state::<Arc<ModelManager>>();
    let transcription_manager = app.state::<Arc<TranscriptionManager>>();

    // Atomically claim the loading slot — prevents concurrent model loads
    // from tray double-clicks or overlapping commands. The guard resets the
    // flag on drop (including early returns, errors, and panics).
    let _loading_guard = transcription_manager
        .try_start_loading()
        .ok_or_else(|| "Model load already in progress".to_string())?;

    // Check if model exists and is available
    let model_info = model_manager
        .get_model_info(model_id)
        .ok_or_else(|| format!("Model not found: {}", model_id))?;

    if !model_info.is_downloaded {
        return Err(format!("Model not downloaded: {}", model_id));
    }

    let settings = get_settings(app);
    let unload_timeout = settings.model_unload_timeout;
    let old_model = settings.selected_model.clone();
    let old_onboarding_completed = settings.onboarding_completed;

    // Persist the new selection early so the frontend sees the correct model
    // when it reacts to events emitted by load_model.
    let mut settings = settings;
    settings.selected_model = model_id.to_string();
    settings.onboarding_completed = true;

    write_settings(app, settings);

    // Skip eager loading if unload is set to "Immediately" — the model
    // will be loaded on-demand during the next transcription.
    if unload_timeout == ModelUnloadTimeout::Immediately {
        // Notify frontend — load_model won't be called so no events
        // would otherwise be emitted.
        let _ = app.emit(
            "model-state-changed",
            ModelStateEvent {
                event_type: "selection_changed".to_string(),
                model_id: Some(model_id.to_string()),
                model_name: Some(model_info.name.clone()),
                error: None,
            },
        );
        log::info!(
            "Model selection changed to {} (not loading — unload set to Immediately).",
            model_id
        );
        return Ok(());
    }

    // Load the model. On failure, revert the persisted selection.
    if let Err(e) = transcription_manager.load_model(model_id) {
        let mut settings = get_settings(app);
        settings.selected_model = old_model;
        settings.onboarding_completed = old_onboarding_completed;
        write_settings(app, settings);
        return Err(e.to_string());
    }

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn set_active_model(
    app_handle: AppHandle,
    _model_manager: State<'_, Arc<ModelManager>>,
    _transcription_manager: State<'_, Arc<TranscriptionManager>>,
    model_id: String,
) -> Result<(), String> {
    switch_active_model(&app_handle, &model_id)
}

/// Retient le modèle de repli local dans les réglages, et rien d'autre.
///
/// Un modèle déjà choisi et présent sur le disque reste celui du membre.
/// `onboarding_completed` n'est jamais touché, contrairement à
/// [`switch_active_model`] : c'est ce drapeau qui fait reprendre Nova avant la
/// première dictée après un redémarrage, et préparer le repli pendant ce
/// parcours ne doit pas le clore.
fn adopt_fallback_model(
    settings: &mut crate::settings::AppSettings,
    model_id: &str,
    selected_downloaded: bool,
) -> bool {
    if !settings.selected_model.is_empty() && selected_downloaded {
        return false;
    }
    settings.selected_model = model_id.to_string();
    true
}

fn is_model_downloaded(model_manager: &ModelManager, model_id: &str) -> bool {
    !model_id.is_empty()
        && model_manager
            .get_model_info(model_id)
            .is_some_and(|model| model.is_downloaded)
}

/// Prépare le modèle qui permet à une organisation de dicter sans serveur.
///
/// Télécharge le modèle s'il manque, puis ne le sélectionne que si aucun modèle
/// présent sur le disque ne l'est déjà. Ne touche jamais `onboarding_completed`.
#[tauri::command]
#[specta::specta]
pub async fn prepare_local_fallback_model(
    app_handle: AppHandle,
    model_manager: State<'_, Arc<ModelManager>>,
    transcription_manager: State<'_, Arc<TranscriptionManager>>,
    model_id: String,
) -> Result<(), String> {
    let model_info = model_manager
        .get_model_info(&model_id)
        .ok_or_else(|| format!("Model not found: {}", model_id))?;

    if is_model_downloaded(&model_manager, &get_settings(&app_handle).selected_model) {
        return Ok(());
    }

    if !model_info.is_downloaded {
        // Aucun `model-download-failed` : il afficherait une erreur pour un
        // téléchargement que le membre n'a jamais demandé. Le prochain
        // lancement reprend là où celui-ci s'est arrêté.
        model_manager
            .download_model(&model_id)
            .await
            .map_err(|e| e.to_string())?;
    }

    // Relu après le téléchargement : le membre a pu choisir un modèle entre-temps.
    let mut settings = get_settings(&app_handle);
    let selected_downloaded = is_model_downloaded(&model_manager, &settings.selected_model);
    if !adopt_fallback_model(&mut settings, &model_id, selected_downloaded) {
        return Ok(());
    }
    let unload_timeout = settings.model_unload_timeout;
    write_settings(&app_handle, settings);

    let _ = app_handle.emit(
        "model-state-changed",
        ModelStateEvent {
            event_type: "selection_changed".to_string(),
            model_id: Some(model_id.clone()),
            model_name: Some(model_info.name.clone()),
            error: None,
        },
    );
    if unload_timeout != ModelUnloadTimeout::Immediately {
        transcription_manager.initiate_model_load();
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn get_current_model(app_handle: AppHandle) -> Result<String, String> {
    let settings = get_settings(&app_handle);
    Ok(settings.selected_model)
}

#[tauri::command]
#[specta::specta]
pub async fn get_transcription_model_status(
    transcription_manager: State<'_, Arc<TranscriptionManager>>,
) -> Result<Option<String>, String> {
    Ok(transcription_manager.get_current_model())
}

#[tauri::command]
#[specta::specta]
pub async fn is_model_loading(
    transcription_manager: State<'_, Arc<TranscriptionManager>>,
) -> Result<bool, String> {
    // Check if transcription manager has a loaded model
    let current_model = transcription_manager.get_current_model();
    Ok(current_model.is_none())
}

#[tauri::command]
#[specta::specta]
pub async fn cancel_download(
    model_manager: State<'_, Arc<ModelManager>>,
    model_id: String,
) -> Result<(), String> {
    model_manager
        .cancel_download(&model_id)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::adopt_fallback_model;
    use crate::settings::get_default_settings;

    /// Préparer le repli local pendant le premier parcours ne doit pas le
    /// clore : c'est ce drapeau qui fait reprendre Nova avant la première
    /// dictée après un redémarrage.
    #[test]
    fn un_modele_de_repli_ne_termine_pas_le_parcours() {
        let mut settings = get_default_settings();
        settings.onboarding_completed = false;

        assert!(adopt_fallback_model(&mut settings, "multilingual", false));
        assert_eq!(settings.selected_model, "multilingual");
        assert!(!settings.onboarding_completed);
    }

    #[test]
    fn un_modele_deja_choisi_et_present_est_garde() {
        let mut settings = get_default_settings();
        settings.selected_model = "choisi".to_string();

        assert!(!adopt_fallback_model(&mut settings, "multilingual", true));
        assert_eq!(settings.selected_model, "choisi");
    }

    #[test]
    fn un_modele_choisi_mais_absent_du_disque_est_remplace() {
        let mut settings = get_default_settings();
        settings.selected_model = "supprime".to_string();

        assert!(adopt_fallback_model(&mut settings, "multilingual", false));
        assert_eq!(settings.selected_model, "multilingual");
    }
}
