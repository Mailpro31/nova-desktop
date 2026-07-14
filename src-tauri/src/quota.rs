//! Quota du palier gratuit : 2500 caractères insérés par semaine glissante.
//!
//! Au-delà de la limite, la dictée est bloquée avant l'enregistrement et l'app
//! propose de passer à un palier supérieur. Les paliers payants (Pro / Ultra /
//! Business) ne sont jamais limités. Quand les licences sont dormantes
//! (`licensing::enabled()` faux), tout est illimité — cohérent avec le fait que
//! tout est débloqué dans ce mode.

use crate::licensing::{self, Tier};
use crate::settings::{self, AppSettings};
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::AppHandle;

/// Caractères offerts par semaine au palier Free.
pub const FREE_WEEKLY_LIMIT: u32 = 2500;
const WEEK_SECS: i64 = 7 * 24 * 3600;

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Le palier courant est-il soumis au quota (Free et licences actives) ?
fn is_free(settings: &AppSettings) -> bool {
    let key = settings.license_key.as_deref().unwrap_or("");
    licensing::enabled() && licensing::current_tier(key) == Tier::Free
}

/// Fenêtre glissante : si la semaine est écoulée (ou jamais initialisée), remet
/// le compteur à zéro et cale le début de semaine sur `now`. Ne persiste rien —
/// l'appelant écrit s'il a modifié l'état.
fn rolled(used: u32, week_start: i64, now: i64) -> (u32, i64) {
    if week_start == 0 || now.saturating_sub(week_start) >= WEEK_SECS {
        (0, now)
    } else {
        (used, week_start)
    }
}

/// État du quota renvoyé au frontend (barre de progression + blocage).
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct QuotaStatus {
    /// Le quota s'applique-t-il (Free + licences actives) ?
    pub limited: bool,
    pub used: u32,
    pub limit: u32,
    /// Crédit hebdomadaire épuisé.
    pub blocked: bool,
    /// Epoch (secondes) de la prochaine réinitialisation, 0 si non pertinent.
    pub resets_at: i64,
}

impl QuotaStatus {
    fn unlimited() -> Self {
        QuotaStatus {
            limited: false,
            used: 0,
            limit: FREE_WEEKLY_LIMIT,
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
    let (used, week_start) = rolled(settings.free_chars_used, settings.free_quota_week_start, now);
    if used != settings.free_chars_used || week_start != settings.free_quota_week_start {
        settings.free_chars_used = used;
        settings.free_quota_week_start = week_start;
        settings::write_settings(app, settings);
    }
    QuotaStatus {
        limited: true,
        used,
        limit: FREE_WEEKLY_LIMIT,
        blocked: used >= FREE_WEEKLY_LIMIT,
        resets_at: week_start + WEEK_SECS,
    }
}

/// La dictée doit-elle être bloquée avant l'enregistrement ? (Free + crédit épuisé.)
pub fn is_blocked(app: &AppHandle) -> bool {
    status(app).blocked
}

/// Comptabilise `n` caractères insérés dans le quota Free (après une insertion
/// réussie). No-op pour les paliers payants / dormant. Persiste le compteur.
pub fn record_chars(app: &AppHandle, n: u32) {
    if n == 0 {
        return;
    }
    let mut settings = settings::get_settings(app);
    if !is_free(&settings) {
        return;
    }
    let now = now_secs();
    let (used, week_start) = rolled(settings.free_chars_used, settings.free_quota_week_start, now);
    settings.free_chars_used = used.saturating_add(n);
    settings.free_quota_week_start = week_start;
    settings::write_settings(app, settings);
}

/// Statut du quota pour le frontend (barre de progression, écran de blocage).
#[tauri::command]
#[specta::specta]
pub fn get_quota_status(app: AppHandle) -> QuotaStatus {
    status(&app)
}
