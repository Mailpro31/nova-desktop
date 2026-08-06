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
    /// Champ de compatibilité frontend, toujours égal à 0.
    pub trial_days_remaining: i64,
    /// Champ de compatibilité frontend, toujours faux.
    pub trial_just_expired: bool,
}

const KNOWN_FEATURES: &[&str] = &[
    "online_engine",
    "cloud_styles",
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
    "context_reading",
];

fn build_status(key: &str, _trial_started_at: i64, _trial_expired_notified: bool) -> LicenseStatus {
    let info = licensing::verify_key(key);
    let tier = licensing::effective_tier(key, 0);
    let features = KNOWN_FEATURES
        .iter()
        .map(|f| (f.to_string(), licensing::has(f, key, 0)))
        .collect();
    LicenseStatus {
        tier,
        active: licensing::enabled(),
        email: info.as_ref().map(|i| i.email.clone()).unwrap_or_default(),
        licensed: info.is_some(),
        features,
        trial_days_remaining: 0,
        trial_just_expired: false,
    }
}

/// Statut d'abonnement courant.
#[tauri::command]
#[specta::specta]
pub fn get_license_status(app: AppHandle) -> LicenseStatus {
    let settings = get_settings(&app);
    build_status(
        settings.license_key.as_deref().unwrap_or(""),
        0,
        settings.trial_expired_notified,
    )
}

/// Ancienne commande conservée pour les bindings existants. Aucun essai actif.
#[tauri::command]
#[specta::specta]
pub fn acknowledge_trial_expired(app: AppHandle) -> LicenseStatus {
    let mut settings = get_settings(&app);
    settings.trial_expired_notified = true;
    write_settings(&app, settings.clone());
    build_status(
        settings.license_key.as_deref().unwrap_or(""),
        settings.trial_started_at,
        settings.trial_expired_notified,
    )
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
            let (trial_started_at, trial_expired_notified) =
                (settings.trial_started_at, settings.trial_expired_notified);
            write_settings(&app, settings);
            Ok(build_status(&key, trial_started_at, trial_expired_notified))
        }
        None => Err("Clé de licence invalide ou expirée.".to_string()),
    }
}

/// URL de la fonction edge d'activation (projet Supabase « nova-licences »).
const ACTIVATION_URL: &str =
    "https://cvpucqsxgjczkdskohte.supabase.co/functions/v1/license/activate";

#[derive(Deserialize)]
struct ActivateResp {
    ok: bool,
    token: Option<String>,
    error: Option<String>,
}

/// Active une licence à partir du CODE d'achat (format NOVA-xxxx) : calcule
/// l'empreinte machine, échange le code contre un jeton signé via la fonction
/// edge, le vérifie localement, puis le stocke. Complète (sans remplacer)
/// l'activation par jeton collé. Défensive : messages FR, jamais de panique.
#[tauri::command]
#[specta::specta]
pub async fn activate_license_code(app: AppHandle, code: String) -> Result<LicenseStatus, String> {
    let code = code.trim().to_uppercase();
    if !code.starts_with("NOVA-") {
        return Err("Le code d'achat doit commencer par NOVA-.".to_string());
    }

    let machine = crate::machine_id::fingerprint();

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .map_err(|_| "Impossible d'initialiser le réseau.".to_string())?;

    let resp = client
        .post(ACTIVATION_URL)
        .json(&serde_json::json!({ "key": code, "machine": machine }))
        .send()
        .await
        .map_err(|_| {
            "Serveur d'activation injoignable — vérifiez votre connexion internet.".to_string()
        })?;

    let parsed: ActivateResp = resp
        .json()
        .await
        .map_err(|_| "Réponse du serveur invalide.".to_string())?;

    if !parsed.ok {
        return Err(parsed
            .error
            .unwrap_or_else(|| "Activation refusée.".to_string()));
    }

    let token = parsed
        .token
        .ok_or_else(|| "Réponse du serveur incomplète.".to_string())?;

    // Garde-fou : on ne stocke que si le jeton est valide localement.
    if licensing::verify_key(&token).is_none() {
        return Err("Le jeton reçu est invalide ou expiré.".to_string());
    }

    let mut settings = get_settings(&app);
    settings.license_key = Some(token.clone());
    let (trial_started_at, trial_expired_notified) =
        (settings.trial_started_at, settings.trial_expired_notified);
    write_settings(&app, settings);
    Ok(build_status(
        &token,
        trial_started_at,
        trial_expired_notified,
    ))
}

/// Décision produit : une licence activée ne peut plus être retirée depuis
/// l'app (protège contre un retour au palier Free non désiré). Reste
/// disponible pour compat des bindings existants ; renvoie le statut
/// INCHANGÉ sans jamais effacer `license_key`. Remplacer par une nouvelle
/// clé reste possible via `activate_license`/`activate_license_code`.
#[tauri::command]
#[specta::specta]
pub fn clear_license(app: AppHandle) -> LicenseStatus {
    let settings = get_settings(&app);
    build_status(
        settings.license_key.as_deref().unwrap_or(""),
        settings.trial_started_at,
        settings.trial_expired_notified,
    )
}

/// URL de la fonction edge du portail de facturation (projet « nova-licences »).
const BILLING_PORTAL_URL: &str =
    "https://cvpucqsxgjczkdskohte.supabase.co/functions/v1/billing-portal";

#[derive(Deserialize)]
struct PortalResp {
    ok: bool,
    url: Option<String>,
    error: Option<String>,
}

/// Ouvre le portail client Stripe (résiliation, changement de palier avec
/// prorata, moyen de paiement, factures) dans le navigateur. L'app envoie son
/// jeton de licence — jamais la clé d'achat — ; le serveur résout le client
/// Stripe et renvoie une URL de session éphémère.
#[tauri::command]
#[specta::specta]
pub async fn open_billing_portal(app: AppHandle) -> Result<(), String> {
    let settings = get_settings(&app);
    let token = settings
        .license_key
        .clone()
        .filter(|k| !k.trim().is_empty())
        .ok_or_else(|| "Aucune licence active sur cet appareil.".to_string())?;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|_| "Impossible d'initialiser le réseau.".to_string())?;

    let resp = client
        .post(BILLING_PORTAL_URL)
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|_| {
            "Serveur de facturation injoignable — vérifiez votre connexion.".to_string()
        })?;

    let parsed: PortalResp = resp
        .json()
        .await
        .map_err(|_| "Réponse du serveur invalide.".to_string())?;
    if !parsed.ok {
        return Err(parsed
            .error
            .unwrap_or_else(|| "Portail indisponible.".to_string()));
    }
    let url = parsed
        .url
        .filter(|u| u.starts_with("https://"))
        .ok_or_else(|| "Réponse du serveur incomplète.".to_string())?;

    tauri_plugin_opener::open_url(url, None::<&str>)
        .map_err(|_| "Impossible d'ouvrir le navigateur.".to_string())
}
