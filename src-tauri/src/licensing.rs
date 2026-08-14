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
use std::sync::atomic::{AtomicBool, Ordering};

/// Mode campus : toutes les fonctionnalités sont débloquées par l'établissement.
static CAMPUS_ENABLED: AtomicBool = AtomicBool::new(false);

/// Active/désactive le bypass de palier pour le mode campus.
pub fn set_campus_enabled(enabled: bool) {
    CAMPUS_ENABLED.store(enabled, Ordering::Relaxed);
}

/// Le mode campus est-il actif côté backend ?
pub fn is_campus_enabled() -> bool {
    CAMPUS_ENABLED.load(Ordering::Relaxed)
}

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
        // et la reformulation en ligne « Turbo » (relais serveur Anthropic,
        // zéro rétention) — le local reste le repli automatique.
        "unlimited" | "all_styles" | "power_profiles" | "custom_variables"
        | "cloud_styles" => Tier::Pro,
        // Ultra : meilleure IA + personnalisation avancée.
        "online_engine" | "best_models" | "custom_styles" | "custom_auto_rules"
        | "orb_customization" | "custom_naming" | "priority_updates"
        // Lecture de contexte : Nova lit le contenu de la fenêtre active pour
        // ancrer la reformulation dans la situation. Fonctionnalité phare Ultra.
        | "context_reading"
        // Mode réunion : capture des autres participants + compte rendu. Feature
        // phare de capture, réservée à Nova Ultra.
        | "meeting_mode" => Tier::Ultra,
        _ => Tier::Free,
    }
}

/// Styles inclus dans le palier Free (les autres nécessitent Pro). Exactement
/// trois : « Transcription améliorée » (nettoyage par défaut), « E-mail » et
/// « Notes ». Tous les autres presets intégrés (Messages, To-do, Prompt IA,
/// Voix → texte, Réunion) nécessitent Nova Pro (`all_styles`) ; les Styles
/// personnels restent gatés Nova Ultra (`custom_styles`).
pub const FREE_STYLE_IDS: &[&str] = &[
    "default_improve_transcriptions",
    "nova_style_email",
    "nova_style_notes",
];

/// Styles INTÉGRÉS de Nova (presets d'origine). Doit rester synchronisé avec
/// `settings::default_post_process_prompts`. Tout Style hors de cette liste est
/// un Style PERSONNEL créé par l'utilisateur → nécessite `custom_styles`
/// (Nova Ultra) pour être créé, modifié ou appliqué.
pub const BUILTIN_STYLE_IDS: &[&str] = &[
    "default_improve_transcriptions",
    "nova_style_email",
    "nova_style_messages",
    "nova_style_prompt",
    "nova_style_todo",
    "nova_style_notes",
    "nova_style_meeting",
    "nova_style_voice_to_text",
];

/// Un Style est-il un preset intégré (par opposition à un Style personnel) ?
pub fn is_builtin_style(id: &str) -> bool {
    BUILTIN_STYLE_IDS.contains(&id)
}

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
/// valide → Free ; sinon le palier de la licence. En mode campus, l'établissement
/// paie : on renvoie toujours Ultra pour court-circuiter tous les verrous.
pub fn current_tier(license_key: &str) -> Tier {
    if is_campus_enabled() || !enabled() {
        return Tier::Ultra; // campus ou dormant = tout débloqué
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

/// Palier réellement appliqué. Le champ historique `trial_started_at` reste
/// accepté pour préserver le format des réglages, mais ne donne plus aucun
/// droit : Nova Free n'inclut plus l'essai Pro automatique.
pub fn effective_tier(license_key: &str, _trial_started_at: i64) -> Tier {
    current_tier(license_key)
}

/// La fonctionnalité est-elle accessible avec la licence active ?
/// En mode campus, l'établissement débloque toutes les fonctionnalités.
pub fn has(feature: &str, license_key: &str, trial_started_at: i64) -> bool {
    if is_campus_enabled() {
        return true;
    }
    effective_tier(license_key, trial_started_at).level() >= feature_min_tier(feature).level()
}

#[cfg(test)]
mod style_gating_tests {
    use super::*;

    #[test]
    fn presets_are_builtin_custom_are_not() {
        for id in BUILTIN_STYLE_IDS {
            assert!(is_builtin_style(id), "{id} devrait être un preset intégré");
        }
        // Les Styles créés par l'utilisateur portent un id horodaté `prompt_…`.
        assert!(!is_builtin_style("prompt_1712345678901"));
        assert!(!is_builtin_style("mon_style_perso"));
        assert!(!is_builtin_style(""));
    }

    #[test]
    fn free_styles_are_all_builtin_presets() {
        for id in FREE_STYLE_IDS {
            assert!(
                BUILTIN_STYLE_IDS.contains(id),
                "{id} gratuit doit exister parmi les presets intégrés"
            );
        }
    }

    #[test]
    fn legacy_trial_timestamp_never_unlocks_pro() {
        let recent_trial = now_secs();
        assert_eq!(effective_tier("", recent_trial), Tier::Free);
        assert!(!has("cloud_styles", "", recent_trial));
    }
}
