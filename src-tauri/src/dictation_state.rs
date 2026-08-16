//! État de dictée diffusé à toute l'application.
//!
//! # Pourquoi ce module existe
//!
//! Le pipeline pilotait déjà un overlay riche (repos, préparation, écoute,
//! flux, transcription, traitement, erreur de capture, repli presse-papiers),
//! mais ces transitions étaient émises **vers la seule fenêtre d'overlay**
//! (`overlay_window.emit`). La fenêtre principale n'en voyait rien : l'accueil
//! ne pouvait donc pas dire « Écoute… » sans l'inventer.
//!
//! Ce module ne crée aucun état neuf. Il **projette** les états existants du
//! moteur vers les quatre qu'un utilisateur distingue réellement, et les
//! diffuse à toutes les fenêtres.
//!
//! # Une seule source de vérité
//!
//! Rust possède le pipeline, donc Rust possède l'état. Les points d'entrée
//! sont les mêmes fonctions publiques d'`overlay.rs` qui pilotent déjà
//! l'overlay : aucun appelant n'a été modifié, et il est impossible de faire
//! avancer l'overlay sans faire avancer cet état.
//!
//! Conséquence voulue : l'état est diffusé **même quand l'overlay est
//! désactivé** (`overlay_style: none`), là où `show_overlay_state` renonce.

use std::sync::atomic::{AtomicU8, Ordering};

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::AppHandle;
use tauri_specta::Event;

/// Ce que l'utilisateur perçoit. Le moteur connaît davantage de nuances —
/// préparation du modèle, flux en direct, transcription puis reformulation —
/// mais aucune ne demande une réaction différente de sa part : dans les deux
/// cas il attend. Multiplier les libellés ferait clignoter l'interface sans
/// rien lui apprendre.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum DictationState {
    Idle,
    Listening,
    Processing,
    Error,
}

/// Nature d'un échec, quand elle change ce que l'utilisateur peut faire.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum DictationErrorKind {
    /// La capture audio n'a pas démarré — micro absent, occupé ou refusé.
    Microphone,
    /// Le texte n'a pas pu être inséré. Il est dans le presse-papiers : la
    /// dictée n'est jamais perdue (voir `clipboard::paste_via_clipboard`).
    Insertion,
}

#[derive(Clone, Debug, Serialize, Deserialize, Type, Event)]
pub struct DictationStateEvent {
    pub state: DictationState,
    /// Renseigné uniquement quand `state` vaut `Error`.
    pub error: Option<DictationErrorKind>,
}

/// Dernier état diffusé, pour n'émettre que les changements.
///
/// Le pipeline réaffiche volontiers le même état — `show_recording_overlay`
/// est rappelé quand le flux en direct échoue et retombe sur l'affichage
/// compact, par exemple. Sans cette garde, chaque redite traverserait le pont
/// IPC pour ne rien changer.
static CURRENT: AtomicU8 = AtomicU8::new(0);

fn code(state: DictationState, error: Option<DictationErrorKind>) -> u8 {
    match (state, error) {
        (DictationState::Idle, _) => 0,
        (DictationState::Listening, _) => 1,
        (DictationState::Processing, _) => 2,
        (DictationState::Error, Some(DictationErrorKind::Microphone)) => 3,
        (DictationState::Error, Some(DictationErrorKind::Insertion)) => 4,
        (DictationState::Error, None) => 5,
    }
}

/// Diffuse un état s'il diffère du précédent.
///
/// Ne panique jamais : un échec d'émission est journalisé et le pipeline
/// continue. L'affichage d'un état ne doit jamais mettre une dictée en péril.
pub fn set(app: &AppHandle, state: DictationState, error: Option<DictationErrorKind>) {
    let next = code(state, error);
    if CURRENT.swap(next, Ordering::SeqCst) == next {
        return;
    }
    if let Err(e) = (DictationStateEvent { state, error }).emit(app) {
        log::warn!("dictation state: emit failed: {}", e);
    }
}

/// Projette un état d'overlay vers l'état perçu.
///
/// Fonction pure, testable, et **seule** table de correspondance : ajouter un
/// état d'overlay sans décider de sa projection fera échouer un test plutôt
/// que de le faire disparaître silencieusement de l'accueil.
pub fn project(overlay_state: &str) -> (DictationState, Option<DictationErrorKind>) {
    match overlay_state {
        // « preparing » est un démarrage de modèle à froid : la capture micro
        // a déjà commencé en parallèle, l'utilisateur peut parler.
        "preparing" | "recording" | "streaming" => (DictationState::Listening, None),
        "transcribing" | "processing" => (DictationState::Processing, None),
        "capture-error" => (DictationState::Error, Some(DictationErrorKind::Microphone)),
        "paste-fallback" => (DictationState::Error, Some(DictationErrorKind::Insertion)),
        // « idle » et tout état inconnu : au repos. Se taire vaut mieux
        // qu'annoncer un travail dont on ignore la nature.
        _ => (DictationState::Idle, None),
    }
}

/// Diffuse l'état correspondant à un état d'overlay.
pub fn set_from_overlay(app: &AppHandle, overlay_state: &str) {
    let (state, error) = project(overlay_state);
    set(app, state, error);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn engine_phases_collapse_to_what_the_user_distinguishes() {
        // Trois phases moteur, une seule attente côté utilisateur.
        for phase in ["preparing", "recording", "streaming"] {
            assert_eq!(project(phase).0, DictationState::Listening, "{}", phase);
        }
        // Transcription puis reformulation : l'utilisateur attend, dans les
        // deux cas, sans rien pouvoir faire de différent.
        for phase in ["transcribing", "processing"] {
            assert_eq!(project(phase).0, DictationState::Processing, "{}", phase);
        }
    }

    #[test]
    fn failures_keep_the_distinction_that_changes_what_to_do() {
        assert_eq!(
            project("capture-error"),
            (DictationState::Error, Some(DictationErrorKind::Microphone))
        );
        // Le texte est dans le presse-papiers : ce n'est pas la même consigne
        // qu'un micro muet.
        assert_eq!(
            project("paste-fallback"),
            (DictationState::Error, Some(DictationErrorKind::Insertion))
        );
    }

    #[test]
    fn unknown_phase_never_claims_work_in_progress() {
        assert_eq!(project("idle").0, DictationState::Idle);
        assert_eq!(project("something-new").0, DictationState::Idle);
    }

    #[test]
    fn error_kinds_are_distinct_states() {
        // Sans quoi la garde anti-répétition avalerait le passage d'une erreur
        // micro à une erreur d'insertion.
        let micro = code(DictationState::Error, Some(DictationErrorKind::Microphone));
        let paste = code(DictationState::Error, Some(DictationErrorKind::Insertion));
        assert_ne!(micro, paste);
        assert_ne!(micro, code(DictationState::Idle, None));
    }
}
