//! Commandes Tauri du mode réunion : démarrer/arrêter une session et produire le
//! compte rendu.
//!
//! Relie la chaîne backend ([`crate::meeting_live::MeetingSession`]) au moteur de
//! transcription et au Style « Réunion » :
//!
//! - `start_meeting` : détecte l'app de réunion au premier plan (même détection
//!   que le Style « Réunion »), démarre la capture des deux flux.
//! - `stop_meeting` : arrête, transcrit chaque prise de parole, assemble le
//!   dialogue « Vous »/« Autres », puis le passe au Style « Réunion » pour le
//!   compte rendu final.
//!
//! Une seule session à la fois. La transcription (longue) tourne sur un thread
//! bloquant, jamais sur l'exécuteur asynchrone.

use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Manager};

use crate::managers::transcription::TranscriptionManager;
use crate::meeting_live::MeetingSession;
use crate::meeting_transcript::SpeakerLabels;

/// Id du Style « Réunion » appliqué au dialogue pour produire le compte rendu.
const MEETING_STYLE_ID: &str = "nova_style_meeting";

/// Session de réunion en cours (au plus une). État Tauri partagé.
#[derive(Default)]
pub struct MeetingSessionState(pub Mutex<Option<MeetingSession>>);

/// Une application de réunion détectée, proposée au choix de l'utilisateur.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct MeetingApp {
    /// Exécutable (ex. « zoom.exe »).
    pub process: String,
    /// Identifiant du processus à capter.
    pub pid: u32,
    /// Titre de la fenêtre — aide à distinguer plusieurs réunions (ex. l'onglet
    /// d'un navigateur).
    pub title: String,
}

/// Liste les applications de réunion actuellement ouvertes, pour que l'interface
/// propose un choix plutôt que de dépendre de la fenêtre au premier plan.
/// Non gaté : la simple détection ne capte rien (le verrou de palier est sur
/// `start_meeting`).
#[tauri::command]
#[specta::specta]
pub fn list_meeting_apps(app: AppHandle) -> Vec<MeetingApp> {
    let settings = crate::settings::get_settings(&app);
    crate::auto_style::enumerate_meeting_apps(&settings)
        .into_iter()
        .map(|(process, pid, title)| MeetingApp {
            process,
            pid,
            title,
        })
        .collect()
}

/// Compte rendu final rendu à l'arrêt.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct MeetingReport {
    /// Compte rendu mis en forme par le Style « Réunion » (ou, à défaut de
    /// moteur, le dialogue brut « Vous »/« Autres »).
    pub report: String,
    /// Prises de parole transcrites avec succès.
    pub transcribed: usize,
    /// Prises ignorées (transcription en échec ou vide).
    pub skipped: usize,
}

/// Démarre une session de réunion sur l'application choisie (`pid`, fourni par
/// [`list_meeting_apps`] via l'interface). Plus aucune dépendance à la fenêtre au
/// premier plan : l'utilisateur a explicitement sélectionné quoi écouter.
///
/// Erreurs (codes stables, traduits côté interface) : `already_running` si une
/// session tourne déjà, `requires_ultra` sans le palier, sinon le code de
/// [`crate::meeting_capture::CaptureError`].
#[tauri::command]
#[specta::specta]
pub async fn start_meeting(app: AppHandle, pid: u32) -> Result<(), String> {
    // Refus net d'un double démarrage (l'UI ne devrait pas le permettre, mais le
    // backend reste l'autorité).
    {
        let state = app.state::<MeetingSessionState>();
        let guard = state.0.lock().map_err(|_| "internal".to_string())?;
        if guard.is_some() {
            return Err("already_running".to_string());
        }
    }

    // Verrou de palier : le mode réunion est réservé à Nova Ultra. Dormant
    // (clé publique vide) → `has` renvoie true partout, donc aucun changement de
    // comportement en développement.
    let settings = crate::settings::get_settings(&app);
    let license_key = settings.license_key.as_deref().unwrap_or("");
    if !crate::licensing::has("meeting_mode", license_key, 0) {
        return Err("requires_ultra".to_string());
    }

    // L'ouverture des flux audio bloque (quelques dizaines de ms) : hors de
    // l'exécuteur asynchrone.
    let session = tokio::task::spawn_blocking(move || MeetingSession::start(pid))
        .await
        .map_err(|e| format!("internal: {e}"))?
        .map_err(|e| e.reason.to_string())?;

    let state = app.state::<MeetingSessionState>();
    let mut guard = state.0.lock().map_err(|_| "internal".to_string())?;
    // Course possible : une autre session a pu démarrer entre-temps. Si c'est le
    // cas, on abandonne CELLE-ci (son Drop arrête proprement ses captures).
    if guard.is_some() {
        return Err("already_running".to_string());
    }
    *guard = Some(session);

    Ok(())
}

/// Arrête la session en cours et renvoie le compte rendu.
///
/// `you_label` / `others_label` viennent de l'interface (i18n) : « Vous » /
/// « Autres » traduits. Erreur `no_active_meeting` si aucune session ne tourne.
#[tauri::command]
#[specta::specta]
pub async fn stop_meeting(
    app: AppHandle,
    you_label: String,
    others_label: String,
) -> Result<MeetingReport, String> {
    // Sort la session de l'état AVANT tout await : on ne tient jamais le mutex à
    // travers un point de suspension.
    let session = {
        let state = app.state::<MeetingSessionState>();
        let mut guard = state.0.lock().map_err(|_| "internal".to_string())?;
        guard.take()
    };
    let Some(session) = session else {
        return Err("no_active_meeting".to_string());
    };

    let tm = Arc::clone(&app.state::<Arc<TranscriptionManager>>());

    // Arrêt + transcription de toutes les prises = travail long et bloquant.
    let assembly = tokio::task::spawn_blocking(move || {
        let labels = SpeakerLabels {
            you: &you_label,
            others: &others_label,
        };
        session.finish(
            |samples| {
                tm.transcribe(samples.to_vec())
                    .ok()
                    .filter(|text| !text.trim().is_empty())
            },
            &labels,
        )
    })
    .await
    .map_err(|e| format!("internal: {e}"))?;

    // Le dialogue brut passe au Style « Réunion » (même chemin que la dictée :
    // moteur local/Turbo, repli). Si le moteur échoue, on rend au moins le
    // dialogue brut — jamais rien perdu.
    let settings = crate::settings::get_settings(&app);
    let report = crate::actions::post_process_transcription(
        &app,
        &settings,
        &assembly.dialogue,
        Some(MEETING_STYLE_ID),
    )
    .await
    .unwrap_or(assembly.dialogue);

    Ok(MeetingReport {
        report,
        transcribed: assembly.transcribed,
        skipped: assembly.skipped,
    })
}
