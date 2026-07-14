//! Commandes Tauri pour les paliers Free / Pro / Ultra de Nova.
//! Activation d'une clé NOVA1 (vérifiée localement) et lecture du statut.

use crate::licensing::{self, Tier};
use crate::settings::{get_settings, write_settings};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;
use tauri::AppHandle;

/// Statut d'abonnement renvoyé au frontend.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct LicenseStatus {
    /// Palier courant (free / pro / ultra / business).
    pub tier: Tier,
    /// Le système de licence est-il actif (clé publique configurée) ?
    pub active: bool,
    /// E-mail associé à la licence (si valide), sinon vide.
    pub email: String,
    /// Une clé est-elle enregistrée et valide ?
    pub licensed: bool,
    /// Fonctionnalité → accessible au palier courant.
    pub features: HashMap<String, bool>,
}

const KNOWN_FEATURES: &[&str] = &[
    "online_engine",
    "all_styles",
    "power_profiles",
    "custom_variables",
    "unlimited",
    "best_models",
    "custom_styles",
    "custom_auto_rules",
    "orb_customization",
    "custom_naming",
    "priority_updates",
];

fn build_status(key: &str) -> LicenseStatus {
    let info = licensing::verify_key(key);
    let tier = licensing::current_tier(key);
    let features = KNOWN_FEATURES
        .iter()
        .map(|f| (f.to_string(), licensing::has(f, key)))
        .collect();
    LicenseStatus {
        tier,
        active: licensing::enabled(),
        email: info.as_ref().map(|i| i.email.clone()).unwrap_or_default(),
        licensed: info.is_some(),
        features,
    }
}

/// Statut d'abonnement courant.
#[tauri::command]
#[specta::specta]
pub fn get_license_status(app: AppHandle) -> LicenseStatus {
    let settings = get_settings(&app);
    build_status(settings.license_key.as_deref().unwrap_or(""))
}

/// Active une clé de licence (jeton NOVA1). Rejette une clé invalide/expirée.
#[tauri::command]
#[specta::specta]
pub fn activate_license(app: AppHandle, key: String) -> Result<LicenseStatus, String> {
    let key = key.trim().to_string();
    match licensing::verify_key(&key) {
        Some(_) => {
            let mut settings = get_settings(&app);
            settings.license_key = Some(key.clone());
            write_settings(&app, settings);
            Ok(build_status(&key))
        }
        None => Err("Clé de licence invalide ou expirée.".to_string()),
    }
}

/// Retire la licence enregistrée (retour au palier Free).
#[tauri::command]
#[specta::specta]
pub fn clear_license(app: AppHandle) -> LicenseStatus {
    let mut settings = get_settings(&app);
    settings.license_key = None;
    write_settings(&app, settings);
    build_status("")
}
