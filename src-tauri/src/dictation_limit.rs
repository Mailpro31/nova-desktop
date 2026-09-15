//! Durée maximale d'une dictée, fixée par l'organisation.
//!
//! Le serveur annonce la limite dans `/api/me` (`limits.max_dictation_seconds`)
//! et refuse ce qui la dépasse. Le poste l'applique lui-même pour que la
//! personne ne perde jamais sa dictée : trente secondes avant la fin, l'overlay
//! prévient ; à la limite, l'enregistrement s'arrête et part en transcription,
//! exactement comme si la touche avait été relâchée.
//!
//! Hors organisation, aucune limite n'est jamais posée.

use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::time::{Duration, Instant};

use log::debug;
use tauri::{AppHandle, Emitter, Manager};

/// Délai de prévenance avant l'arrêt.
pub const WARNING_BEFORE_SECONDS: u32 = 30;
/// Bornes acceptées par le serveur. Une valeur hors bornes venue d'un serveur
/// défaillant est ramenée dedans plutôt que de couper la dictée à zéro.
pub const MIN_SECONDS: u32 = 30;
pub const MAX_SECONDS: u32 = 7200;

/// Émis vers l'overlay avec le nombre de secondes restantes.
pub const LIMIT_WARNING_EVENT: &str = "dictation-limit-warning";

/// 0 : aucune limite.
static LIMIT_SECONDS: AtomicU32 = AtomicU32::new(0);
/// Identifie l'enregistrement surveillé. Un arrêt le fait avancer : la
/// surveillance d'une dictée terminée ne peut pas arrêter la suivante.
static SESSION: AtomicU64 = AtomicU64::new(0);

const POLL: Duration = Duration::from_millis(250);

/// La limite retenue pour une valeur annoncée par le serveur.
pub fn normalize(seconds: Option<u32>) -> Option<u32> {
    match seconds {
        None | Some(0) => None,
        Some(value) => Some(value.clamp(MIN_SECONDS, MAX_SECONDS)),
    }
}

/// Quand prévenir, et quand arrêter, depuis le début de l'enregistrement.
#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub struct Schedule {
    pub warn_after: Option<Duration>,
    pub stop_after: Duration,
}

pub fn schedule(limit_seconds: u32) -> Schedule {
    // Une limite de trente secondes ou moins ne laisse pas la place d'un
    // avertissement utile : il s'afficherait dès le premier mot.
    let warn_after = (limit_seconds > WARNING_BEFORE_SECONDS)
        .then(|| Duration::from_secs(u64::from(limit_seconds - WARNING_BEFORE_SECONDS)));
    Schedule {
        warn_after,
        stop_after: Duration::from_secs(u64::from(limit_seconds)),
    }
}

pub fn set_limit(seconds: Option<u32>) {
    LIMIT_SECONDS.store(normalize(seconds).unwrap_or(0), Ordering::Release);
}

pub fn limit() -> Option<u32> {
    match LIMIT_SECONDS.load(Ordering::Acquire) {
        0 => None,
        value => Some(value),
    }
}

/// Un enregistrement commence : renvoie son identifiant de surveillance.
pub fn begin_session() -> u64 {
    SESSION.fetch_add(1, Ordering::AcqRel) + 1
}

/// Un enregistrement se termine, par la touche ou par la limite.
pub fn end_session() {
    SESSION.fetch_add(1, Ordering::AcqRel);
}

fn is_current(session: u64) -> bool {
    SESSION.load(Ordering::Acquire) == session
}

/// Attend jusqu'à `deadline` ; `false` si l'enregistrement s'est terminé avant.
fn wait_until(started: Instant, deadline: Duration, session: u64) -> bool {
    while started.elapsed() < deadline {
        if !is_current(session) {
            return false;
        }
        std::thread::sleep(POLL.min(deadline.saturating_sub(started.elapsed())));
    }
    is_current(session)
}

/// Surveille l'enregistrement qui vient de commencer, s'il y a une limite.
pub fn watch_recording(app: &AppHandle) {
    let Some(limit_seconds) = limit() else {
        return;
    };
    let session = begin_session();
    let plan = schedule(limit_seconds);
    let app = app.clone();
    std::thread::spawn(move || {
        let started = Instant::now();
        if let Some(warn_after) = plan.warn_after {
            if !wait_until(started, warn_after, session) {
                return;
            }
            let _ = app.emit(LIMIT_WARNING_EVENT, WARNING_BEFORE_SECONDS);
        }
        if !wait_until(started, plan.stop_after, session) {
            return;
        }
        debug!("Dictation reached the organization limit of {limit_seconds}s; finishing");
        if let Some(coordinator) =
            app.try_state::<crate::transcription_coordinator::TranscriptionCoordinator>()
        {
            coordinator.finish_current();
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_value_or_zero_means_no_limit() {
        assert_eq!(normalize(None), None);
        assert_eq!(normalize(Some(0)), None);
    }

    #[test]
    fn a_value_outside_the_server_bounds_is_brought_back_inside() {
        assert_eq!(normalize(Some(5)), Some(MIN_SECONDS));
        assert_eq!(normalize(Some(100_000)), Some(MAX_SECONDS));
        assert_eq!(normalize(Some(600)), Some(600));
    }

    #[test]
    fn the_default_limit_warns_thirty_seconds_before_stopping() {
        assert_eq!(
            schedule(600),
            Schedule {
                warn_after: Some(Duration::from_secs(570)),
                stop_after: Duration::from_secs(600),
            }
        );
    }

    #[test]
    fn a_limit_too_short_for_a_useful_warning_only_stops() {
        assert_eq!(
            schedule(30),
            Schedule {
                warn_after: None,
                stop_after: Duration::from_secs(30),
            }
        );
    }

    #[test]
    fn a_finished_recording_can_no_longer_be_stopped_by_its_watcher() {
        let first = begin_session();
        assert!(is_current(first));
        end_session();
        assert!(!is_current(first));
        let second = begin_session();
        assert!(is_current(second));
        assert!(!is_current(first));
    }
}
