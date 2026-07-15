//! Statistique de valeur hebdomadaire : « X mots dictés cette semaine ».
//!
//! Rappel de valeur (rétention), affiché dans les réglages. Réutilise la
//! mécanique de fenêtre glissante de `quota.rs`, mais SANS filtre de palier : la
//! stat compte pour tout le monde (Free comme payant). On stocke des caractères
//! (source unique) et on dérive les mots (~ chars / 5) et les minutes évitées
//! (~ mots / 40 mpm) à l'affichage. Défensif : n'échoue jamais.

use crate::settings;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::AppHandle;

const WEEK_SECS: i64 = 7 * 24 * 3600;
/// Vitesse de frappe de référence (mots/minute) pour estimer le temps évité.
const TYPING_WPM: u32 = 40;

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Fenêtre glissante : réinitialise si la semaine est écoulée (ou jamais amorcée).
fn rolled(count: u32, week_start: i64, now: i64) -> (u32, i64) {
    if week_start == 0 || now.saturating_sub(week_start) >= WEEK_SECS {
        (0, now)
    } else {
        (count, week_start)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct WeekStat {
    pub words: u32,
    pub chars: u32,
    /// Minutes de frappe estimées évitées cette semaine.
    pub minutes: u32,
    /// Epoch (secondes) de la prochaine réinitialisation.
    pub resets_at: i64,
}

/// Comptabilise `n` caractères insérés (après un collage réussi), tous paliers
/// confondus. Persiste. No-op si `n == 0`.
pub fn record_chars(app: &AppHandle, n: u32) {
    if n == 0 {
        return;
    }
    let mut s = settings::get_settings(app);
    let now = now_secs();
    let (count, week_start) = rolled(s.week_chars_produced, s.week_stat_week_start, now);
    s.week_chars_produced = count.saturating_add(n);
    s.week_stat_week_start = week_start;
    settings::write_settings(app, s);
}

/// Statut de la semaine (applique la fenêtre glissante en lecture, persiste la
/// remise à zéro éventuelle pour que l'UI reste cohérente).
pub fn status(app: &AppHandle) -> WeekStat {
    let mut s = settings::get_settings(app);
    let now = now_secs();
    let (count, week_start) = rolled(s.week_chars_produced, s.week_stat_week_start, now);
    if count != s.week_chars_produced || week_start != s.week_stat_week_start {
        s.week_chars_produced = count;
        s.week_stat_week_start = week_start;
        settings::write_settings(app, s);
    }
    let words = count / 5;
    WeekStat {
        words,
        chars: count,
        minutes: words / TYPING_WPM,
        resets_at: week_start + WEEK_SECS,
    }
}

/// Statut hebdomadaire pour le frontend.
#[tauri::command]
#[specta::specta]
pub fn get_week_stat(app: AppHandle) -> WeekStat {
    status(&app)
}
