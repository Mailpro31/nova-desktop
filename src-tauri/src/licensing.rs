//! Licences & paliers de Nova pour nova-desktop : Free / Pro / Ultra.
//!
//! Une licence est un jeton « NOVA1.<payload_b64url>.<sig_b64url> » signé
//! Ed25519 et vérifié LOCALEMENT avec la clé publique ci-dessous — aucun
//! serveur, 100 % hors ligne, infalsifiable sans la clé privée de l'éditeur.
//! On réutilise la clé publique de Nova : les licences déjà vendues (backend
//! Supabase/Stripe) déverrouillent donc nova-desktop directement.
//!
//! Décision produit : le verrou machine (`m`) présent dans les jetons Nova est
//! IGNORÉ ici (l'empreinte de nova-desktop diffère de celle de l'app Python).
//!
//! État dormant : si `PUBLIC_KEY_B64` est vide, tout est débloqué (Ultra).
//! Toutes les fonctions sont défensives — jamais d'exception propagée.

use base64::Engine;
use ed25519_dalek::{Signature, VerifyingKey};
use serde::{Deserialize, Serialize};
use specta::Type;

/// Clé publique Ed25519 de l'éditeur (base64 standard, 32 octets bruts).
/// VIDE = licences dormantes (accès complet). Renseignée = paliers actifs.
const PUBLIC_KEY_B64: &str = "Q+U/LqaeFgLSDkvqiAXRcHQ8DSwqU9NcrHiPt8A6EJE=";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum Tier {
    Free,
    Pro,
    Ultra,
    Business,
}

impl Tier {
    /// Niveau de fonctionnalités : Business = niveau Pro (multi-postes).
    fn level(self) -> u8 {
        match self {
            Tier::Free => 0,
            Tier::Business | Tier::Pro => 1,
            Tier::Ultra => 2,
        }
    }

    fn from_code(s: &str) -> Option<Tier> {
        match s {
            "free" => Some(Tier::Free),
            "pro" => Some(Tier::Pro),
            "ultra" => Some(Tier::Ultra),
            "business" => Some(Tier::Business),
            _ => None,
        }
    }
}

/// Fonctionnalité → palier minimum requis. (Ajuster ici = changer l'offre.)
pub fn feature_min_tier(feature: &str) -> Tier {
    match feature {
        // Pro : reformulation illimitée + les 7 Styles + profils de puissance,
        // le tout en LOCAL (Intelligence privée). Aucun cloud à ce palier.
        "unlimited" | "all_styles" | "power_profiles" | "custom_variables" => Tier::Pro,
        // Ultra : le CLOUD (moteur « Turbo » en ligne + STT en ligne) + meilleure
        // IA + personnalisation avancée. Tout ce qui sort de la machine = Ultra.
        "online_engine" | "best_models" | "custom_styles" | "custom_auto_rules"
        | "orb_customization" | "custom_naming" | "priority_updates" => Tier::Ultra,
        _ => Tier::Free,
    }
}

/// Styles inclus dans le palier Free (les autres nécessitent Pro).
pub const FREE_STYLE_IDS: &[&str] = &[
    "default_improve_transcriptions",
    "nova_style_email",
    "nova_style_messages",
    "nova_style_voice_to_text",
];

/// Infos extraites d'un jeton valide.
#[derive(Debug, Clone)]
pub struct LicenseInfo {
    pub tier: Tier,
    pub email: String,
    pub expiry: i64,
}

/// Le système de licence est-il ACTIF (clé publique configurée) ?
pub fn enabled() -> bool {
    !PUBLIC_KEY_B64.is_empty()
}

fn b64url_decode(s: &str) -> Option<Vec<u8>> {
    let t = s.trim().trim_end_matches('=');
    base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(t)
        .ok()
}

/// Vérifie un jeton « NOVA1.<payload>.<sig> ». → LicenseInfo si signature
/// valide et non expirée, sinon None. Ne panique jamais.
pub fn verify_key(key: &str) -> Option<LicenseInfo> {
    if !enabled() || key.trim().is_empty() {
        return None;
    }
    let parts: Vec<&str> = key.trim().split('.').collect();
    if parts.len() != 3 || parts[0] != "NOVA1" {
        return None;
    }
    let payload = b64url_decode(parts[1])?;
    let sig_bytes = b64url_decode(parts[2])?;
    let pub_bytes = base64::engine::general_purpose::STANDARD
        .decode(PUBLIC_KEY_B64)
        .ok()?;

    let pub_arr: [u8; 32] = pub_bytes.as_slice().try_into().ok()?;
    let sig_arr: [u8; 64] = sig_bytes.as_slice().try_into().ok()?;
    let vk = VerifyingKey::from_bytes(&pub_arr).ok()?;
    let sig = Signature::from_bytes(&sig_arr);
    vk.verify_strict(&payload, &sig).ok()?;

    let data: serde_json::Value = serde_json::from_slice(&payload).ok()?;
    let tier = Tier::from_code(data.get("t")?.as_str()?)?;
    let expiry = data.get("x").and_then(|x| x.as_i64()).unwrap_or(0);
    if expiry > 0 && now_secs() > expiry {
        return None; // expirée
    }
    // Verrou machine (`m`) volontairement ignoré ici.
    let email = data
        .get("e")
        .and_then(|e| e.as_str())
        .unwrap_or("")
        .to_string();
    Some(LicenseInfo {
        tier,
        email,
        expiry,
    })
}

/// Palier courant d'après la clé stockée. Dormant → Ultra ; actif sans clé
/// valide → Free ; sinon le palier de la licence. N'intègre PAS l'essai Pro
/// automatique — voir `effective_tier` pour le palier réellement appliqué.
pub fn current_tier(license_key: &str) -> Tier {
    if !enabled() {
        return Tier::Ultra; // dormant = tout débloqué
    }
    verify_key(license_key)
        .map(|i| i.tier)
        .unwrap_or(Tier::Free)
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Durée de l'essai Nova Pro automatique offert à l'installation (jours).
pub const TRIAL_DAYS: i64 = 14;
const TRIAL_SECS: i64 = TRIAL_DAYS * 24 * 3600;

/// Palier réellement appliqué : la licence prime ; à défaut (Free), l'essai
/// Pro automatique de 14 jours depuis le tout premier lancement
/// (`trial_started_at`, epoch secondes, 0 = jamais amorcé) ; sinon Free.
/// `trial_started_at` est scellé une seule fois par `settings::get_settings`
/// au premier lancement — il ne peut jamais être prolongé ni régénéré.
pub fn effective_tier(license_key: &str, trial_started_at: i64) -> Tier {
    let tier = current_tier(license_key);
    if tier != Tier::Free {
        return tier;
    }
    if trial_started_at > 0 && now_secs() - trial_started_at < TRIAL_SECS {
        return Tier::Pro;
    }
    tier
}

/// Jours d'essai restants (0 si aucun essai en cours ou déjà expiré). Pour
/// l'affichage (compte à rebours, invites d'abonnement).
pub fn trial_days_remaining(trial_started_at: i64) -> i64 {
    if trial_started_at <= 0 {
        return 0;
    }
    let elapsed = now_secs() - trial_started_at;
    if elapsed >= TRIAL_SECS {
        return 0;
    }
    (TRIAL_SECS - elapsed + 86_399) / 86_400 // arrondi au jour supérieur
}

/// La fonctionnalité est-elle accessible, essai Pro automatique inclus ?
pub fn has(feature: &str, license_key: &str, trial_started_at: i64) -> bool {
    effective_tier(license_key, trial_started_at).level() >= feature_min_tier(feature).level()
}
