//! Quota du palier gratuit : 10 reformulations par jour glissant.
//!
//! La dictée reste TOUJOURS illimitée au palier gratuit — c'est la promesse du
//! site. Seules les reformulations (application d'un Style) sont plafonnées :
//! au-delà de la limite quotidienne, le texte dicté est collé tel quel (brut),
//! sans reformulation — le curseur n'est jamais laissé vide. Les paliers payants
//! (Pro / Ultra / Business) ne sont jamais limités. Quand les licences sont
//! dormantes (`licensing::enabled()` faux), tout est illimité — cohérent avec le
//! fait que tout est débloqué dans ce mode.

use crate::licensing::{self, Tier};
use crate::settings::{self, AppSettings};
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::AppHandle;

/// Reformulations offertes par jour au palier Free.
pub const FREE_DAILY_REWRITES: u32 = 10;
const DAY_SECS: i64 = 24 * 3600;

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Le palier courant est-il soumis au quota (Free et licences actives) ?
/// L'essai Pro automatique (voir licensing::effective_tier) lève le quota
/// pendant sa durée, comme une vraie licence Pro.
fn is_free(settings: &AppSettings) -> bool {
    let key = settings.license_key.as_deref().unwrap_or("");
    licensing::enabled()
        && licensing::effective_tier(key, settings.trial_started_at) == Tier::Free
}

/// Fenêtre glissante de 24 h : si la journée est écoulée (ou jamais
/// initialisée), remet le compteur à zéro et cale le début de journée sur `now`.
/// Ne persiste rien — l'appelant écrit s'il a modifié l'état.
fn rolled(used: u32, day_start: i64, now: i64) -> (u32, i64) {
    if day_start == 0 || now.saturating_sub(day_start) >= DAY_SECS {
        (0, now)
    } else {
        (used, day_start)
    }
}

/// État du quota renvoyé au frontend (barre de progression + information).
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct QuotaStatus {
    /// Le quota s'applique-t-il (Free + licences actives) ?
    pub limited: bool,
    pub used: u32,
    pub limit: u32,
    /// Crédit quotidien de reformulations épuisé (la dictée reste ouverte).
    pub blocked: bool,
    /// Epoch (secondes) de la prochaine réinitialisation, 0 si non pertinent.
    pub resets_at: i64,
}

impl QuotaStatus {
    fn unlimited() -> Self {
        QuotaStatus {
            limited: false,
            used: 0,
            limit: FREE_DAILY_REWRITES,
            blocked: false,
            resets_at: 0,
        }
    }
}

/// Statut courant. Applique la fenêtre glissante en lecture et persiste la
/// remise à zéro éventuelle, pour que l'UI et la porte d'entrée concordent.
pub fn status(app: &AppHandle) -> QuotaStatus {
    let mut settings = settings::get_settings(app);
    if !is_free(&settings) {
        return QuotaStatus::unlimited();
    }
    let now = now_secs();
    let (used, day_start) = rolled(
        settings.free_rewrites_used,
        settings.free_quota_day_start,
        now,
    );
    if used != settings.free_rewrites_used || day_start != settings.free_quota_day_start {
        settings.free_rewrites_used = used;
        settings.free_quota_day_start = day_start;
        settings::write_settings(app, settings);
    }
    QuotaStatus {
        limited: true,
        used,
        limit: FREE_DAILY_REWRITES,
        blocked: used >= FREE_DAILY_REWRITES,
        resets_at: day_start + DAY_SECS,
    }
}

/// La reformulation doit-elle être ignorée ? (Free + crédit quotidien épuisé.)
/// La dictée elle-même n'est JAMAIS bloquée : seul le Style est sauté.
pub fn is_rewrite_blocked(app: &AppHandle) -> bool {
    status(app).blocked
}

/// Comptabilise une reformulation réussie dans le quota Free (après qu'un Style
/// a réellement été appliqué). No-op pour les paliers payants / dormant.
/// Persiste le compteur.
pub fn record_rewrite(app: &AppHandle) {
    let mut settings = settings::get_settings(app);
    if !is_free(&settings) {
        return;
    }
    let now = now_secs();
    let (used, day_start) = rolled(
        settings.free_rewrites_used,
        settings.free_quota_day_start,
        now,
    );
    settings.free_rewrites_used = used.saturating_add(1);
    settings.free_quota_day_start = day_start;
    settings::write_settings(app, settings);
}

/// Statut du quota pour le frontend (barre de progression des reformulations).
#[tauri::command]
#[specta::specta]
pub fn get_quota_status(app: AppHandle) -> QuotaStatus {
    status(&app)
}
