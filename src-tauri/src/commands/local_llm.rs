//! Commandes Tauri pour le moteur « Intelligence privée » embarqué (voir
//! `local_llm.rs`) : statut des 3 profils (Nova Air/Aura/Apex) pour l'UI, et
//! activation d'un profil (télécharge si besoin puis démarre le moteur).

use crate::local_llm;
use tauri::AppHandle;

/// Statut des 3 profils pour l'écran de réglages : taille, déjà téléchargé,
/// recommandé selon la RAM détectée.
#[tauri::command]
#[specta::specta]
pub fn get_local_llm_profiles(app: AppHandle) -> Vec<local_llm::LlmProfileStatus> {
    local_llm::profiles_status(&app)
}

/// Active un profil : télécharge le modèle (et le moteur, la première fois)
/// s'ils sont absents, puis démarre `llama-server` avec ce profil. Émet la
/// progression sur `llm-download-progress`. N'écrit pas les réglages
/// eux-mêmes — le frontend appelle ensuite `set_post_process_provider` /
/// `change_post_process_model_setting`, comme pour les autres fournisseurs.
#[tauri::command]
#[specta::specta]
pub async fn activate_local_llm_profile(app: AppHandle, profile_id: String) -> Result<(), String> {
    // Palier : Nova Air est gratuit ; les profils supérieurs (Nova Aura / Apex)
    // nécessitent Nova Pro. On applique la barrière ici — le frontend grise déjà
    // ces profils, mais l'enforcement doit vivre côté backend (non contournable).
    // Défensif : en dormant, `has()` renvoie vrai partout → aucun blocage.
    if profile_id != "air" {
        let settings = crate::settings::get_settings(&app);
        if !crate::licensing::has(
            "power_profiles",
            settings.license_key.as_deref().unwrap_or(""),
            0,
        ) {
            return Err("Les profils Nova Aura et Nova Apex nécessitent Nova Pro.".to_string());
        }
    }
    local_llm::ensure_server_running(&app, &profile_id).await
}
