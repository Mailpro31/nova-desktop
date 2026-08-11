//! Quota du palier gratuit : reformulations Turbo offertes UNE FOIS, à vie.
//!
//! La dictée reste TOUJOURS illimitée au palier gratuit — c'est la promesse du
//! site. Seules les reformulations Turbo (cloud) sont plafonnées, et ce plafond
//! ne se réinitialise jamais : une fois les essais à vie épuisés, le texte
//! dicté est collé tel quel (brut), sans reformulation — le curseur n'est
//! jamais laissé vide. Les paliers payants (Pro / Ultra / Business) ne sont
//! jamais limités. Quand les licences sont dormantes (`licensing::enabled()`
//! faux), tout est illimité — cohérent avec le fait que tout est débloqué dans
//! ce mode.
//!
//! `free_quota_day_start` (ancien champ de la fenêtre glissante quotidienne)
//! n'est plus utilisé pour la logique : conservé uniquement pour désérialiser
//! sans perte les réglages écrits par une version antérieure de Nova.

use crate::licensing::{self, Tier};
use crate::settings::{self, AppSettings};
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::AppHandle;

/// Reformulations Turbo offertes à vie au palier Free.
pub const FREE_LIFETIME_REWRITES: u32 = 20;

/// Le palier courant est-il soumis au quota (Free et licences actives) ?
fn is_free(settings: &AppSettings) -> bool {
    let key = settings.license_key.as_deref().unwrap_or("");
    licensing::enabled() && licensing::effective_tier(key, 0) == Tier::Free
}

/// État du quota renvoyé au frontend (barre de progression + information).
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct QuotaStatus {
    /// Le quota s'applique-t-il (Free + licences actives) ?
    pub limited: bool,
    pub used: u32,
    pub limit: u32,
    /// Crédit à vie de reformulations Turbo épuisé (la dictée reste ouverte).
    pub blocked: bool,
}

impl QuotaStatus {
    fn unlimited() -> Self {
        QuotaStatus {
            limited: false,
            used: 0,
            limit: FREE_LIFETIME_REWRITES,
            blocked: false,
        }
    }
}

/// Statut courant du quota à vie.
pub fn status(app: &AppHandle) -> QuotaStatus {
    let settings = settings::get_settings(app);
    if !is_free(&settings) {
        return QuotaStatus::unlimited();
    }
    let used = settings.free_rewrites_used;
    QuotaStatus {
        limited: true,
        used,
        limit: FREE_LIFETIME_REWRITES,
        blocked: used >= FREE_LIFETIME_REWRITES,
    }
}

/// La reformulation doit-elle être ignorée ? (Free + crédit à vie épuisé.)
/// La dictée elle-même n'est JAMAIS bloquée : seul le Style est sauté.
pub fn is_rewrite_blocked(app: &AppHandle) -> bool {
    status(app).blocked
}

/// Comptabilise une reformulation Turbo réussie dans le quota Free à vie
/// (après qu'un Style a réellement été appliqué). No-op pour les paliers
/// payants / dormant. Persiste le compteur, qui n'est jamais remis à zéro.
pub fn record_rewrite(app: &AppHandle) {
    let mut settings = settings::get_settings(app);
    if !is_free(&settings) {
        return;
    }
    settings.free_rewrites_used = settings.free_rewrites_used.saturating_add(1);
    settings::write_settings(app, settings);
}

/// Statut du quota pour le frontend (barre de progression des reformulations).
#[tauri::command]
#[specta::specta]
pub fn get_quota_status(app: AppHandle) -> QuotaStatus {
    status(&app)
}
