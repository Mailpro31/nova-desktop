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

/// Au-delà, le serveur de l'organisation refuse le texte (`MAX_INFERENCE_TEXT_CHARS`).
const ORGANIZATION_MAX_CHARS: usize = 50_000;

/// Le compte rendu par le serveur de l'organisation, quand le membre en a un.
///
/// Même chemin que la dictée : un modèle plus gros et un contexte plus large
/// que le moteur local, et la politique de l'organisation sur les Styles. La
/// réponse passe les mêmes contrôles qu'une sortie locale.
async fn organization_report(app: &AppHandle, dialogue: &str) -> Option<String> {
    if dialogue.chars().count() > ORGANIZATION_MAX_CHARS {
        return None;
    }
    let session = crate::commands::campus::should_use_campus(app).await?;
    let style = crate::actions::resolve_effective_style(app, Some(MEETING_STYLE_ID))?;
    match crate::commands::campus::reformulate_campus(dialogue, &style.id, &style.prompt, &session)
        .await
    {
        Ok(text) => match crate::actions::checked_campus_rewrite(dialogue, &text, &style.id) {
            // Un serveur qui refuse sa propre sortie rend le dialogue tel quel :
            // ce n'est pas un compte rendu, le moteur local peut encore essayer.
            Ok(report) if report.trim() != dialogue.trim() => Some(report),
            Ok(_) => None,
            Err(reason) => {
                log::warn!("meeting: compte rendu du serveur refusé ({reason})");
                None
            }
        },
        Err(error) => {
            log::warn!("meeting: serveur de l'organisation indisponible ({error})");
            None
        }
    }
}

/// Ce que le moteur local lit d'un coup. Air a un contexte de 3 072 jetons,
/// Aura et Apex de 4 096 ; il faut y loger la consigne et le compte rendu.
fn local_chunk_chars(settings: &crate::settings::AppSettings) -> usize {
    match settings
        .post_process_models
        .get(crate::local_llm::PROVIDER_ID)
        .map(String::as_str)
    {
        Some("air") => 3_000,
        _ => 5_000,
    }
}

/// Le compte rendu par le moteur local (ou Turbo).
///
/// Une réunion de plus de quelques minutes dépasse le contexte du moteur
/// local : elle est résumée par morceaux. Les résumés sont fondus en un seul
/// compte rendu quand ils tiennent ensemble dans le contexte ; sinon ils sont
/// rendus à la suite. Les résumer à leur tour ne les raccourcissait pas (le
/// modèle réécrit des notes aussi longues que leur source), pour des minutes de
/// calcul en plus. Un morceau qui échoue reste en dialogue brut : rien ne se perd.
async fn local_report(
    app: &AppHandle,
    settings: &crate::settings::AppSettings,
    dialogue: &str,
) -> Option<String> {
    let chunk_chars = local_chunk_chars(settings);
    if dialogue.chars().count() <= chunk_chars {
        return crate::actions::post_process_transcription(
            app,
            settings,
            dialogue,
            Some(MEETING_STYLE_ID),
        )
        .await;
    }
    let joined = summarize_by_chunks(app, settings, dialogue, chunk_chars).await?;
    if joined.chars().count() <= chunk_chars {
        if let Some(merged) = crate::actions::post_process_transcription(
            app,
            settings,
            &joined,
            Some(MEETING_STYLE_ID),
        )
        .await
        {
            return Some(merged);
        }
    }
    Some(joined)
}

/// Chaque morceau résumé, les résumés mis bout à bout.
/// `None` si aucun morceau n'a pu être résumé.
async fn summarize_by_chunks(
    app: &AppHandle,
    settings: &crate::settings::AppSettings,
    text: &str,
    chunk_chars: usize,
) -> Option<String> {
    let chunks = meeting_chunks(text, chunk_chars);

    let mut parts = Vec::with_capacity(chunks.len());
    let mut summarized = 0;
    for chunk in &chunks {
        match crate::actions::post_process_transcription(
            app,
            settings,
            chunk,
            Some(MEETING_STYLE_ID),
        )
        .await
        {
            Some(part) => {
                summarized += 1;
                parts.push(part);
            }
            None => parts.push(chunk.clone()),
        }
    }
    log::info!(
        "meeting: {} morceau(x), {} résumé(s)",
        chunks.len(),
        summarized
    );
    (summarized > 0).then(|| parts.join("\n\n"))
}

/// Le dialogue en morceaux d'au plus `max_chars` caractères, coupés entre deux
/// prises de parole. Une prise plus longue que la limite est coupée sur un
/// espace, jamais au milieu d'un mot.
pub(crate) fn meeting_chunks(dialogue: &str, max_chars: usize) -> Vec<String> {
    let mut chunks = Vec::new();
    let mut current = String::new();
    for line in dialogue.lines().filter(|line| !line.trim().is_empty()) {
        let mut rest = line;
        while rest.chars().count() > max_chars {
            let cut = cut_before(rest, max_chars);
            push_line(&mut chunks, &mut current, rest[..cut].trim_end(), max_chars);
            rest = rest[cut..].trim_start();
        }
        if !rest.is_empty() {
            push_line(&mut chunks, &mut current, rest, max_chars);
        }
    }
    if !current.is_empty() {
        chunks.push(current);
    }
    chunks
}

fn push_line(chunks: &mut Vec<String>, current: &mut String, line: &str, max_chars: usize) {
    let needed = line.chars().count() + usize::from(!current.is_empty());
    if !current.is_empty() && current.chars().count() + needed > max_chars {
        chunks.push(std::mem::take(current));
    }
    if !current.is_empty() {
        current.push('\n');
    }
    current.push_str(line);
}

/// L'indice (en octets) où couper `text` pour garder au plus `max_chars`
/// caractères : au dernier espace avant la limite, ou à la limite s'il n'y en a pas.
fn cut_before(text: &str, max_chars: usize) -> usize {
    let limit = text
        .char_indices()
        .nth(max_chars)
        .map_or(text.len(), |(index, _)| index);
    match text[..limit].rfind(char::is_whitespace) {
        Some(space) if space > 0 => space,
        _ => limit,
    }
}

#[cfg(test)]
mod chunk_tests {
    use super::meeting_chunks;

    #[test]
    fn a_short_meeting_is_a_single_chunk() {
        let dialogue = "Vous : bonjour\nAutres : bonjour à tous";
        assert_eq!(meeting_chunks(dialogue, 5_000), vec![dialogue.to_string()]);
    }

    #[test]
    fn a_long_meeting_is_cut_between_turns_and_loses_nothing() {
        let turn = "Autres : la batterie tient 18 minutes, il en faut 25.";
        let dialogue = vec![turn; 200].join("\n");
        let chunks = meeting_chunks(&dialogue, 1_000);
        assert!(chunks.len() > 1);
        for chunk in &chunks {
            assert!(chunk.chars().count() <= 1_000, "{}", chunk.len());
            // Coupé entre deux prises : chaque ligne est une prise entière.
            assert!(chunk.lines().all(|line| line == turn));
        }
        assert_eq!(chunks.join("\n"), dialogue);
    }

    #[test]
    fn an_overlong_turn_is_cut_on_a_space() {
        let turn = format!("Vous : {}", "mot ".repeat(400));
        let chunks = meeting_chunks(turn.trim_end(), 300);
        assert!(chunks.len() > 1);
        for chunk in &chunks {
            assert!(chunk.chars().count() <= 300);
            assert!(!chunk.ends_with("mo") && !chunk.starts_with("t "));
        }
        let rebuilt = chunks.join(" ");
        assert_eq!(
            rebuilt.split_whitespace().count(),
            turn.split_whitespace().count()
        );
    }
}

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
    /// Dialogue brut « Vous »/« Autres » avant mise en forme — conservé pour
    /// que l'historique puisse montrer la transcription telle quelle en plus du
    /// compte rendu.
    pub dialogue: String,
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
    // Modèle à charger si besoin : contrairement à la dictée (qui réchauffe le
    // moteur au DÉMARRAGE de l'enregistrement), le mode réunion ne transcrit
    // qu'à l'arrêt. Sans ce chargement, `transcribe` renvoie « modèle non
    // chargé » pour CHAQUE prise → 0 transcrit (et un comportement aléatoire :
    // ça « marchait » seulement si une dictée récente avait laissé le moteur
    // chaud). On charge donc explicitement avant la transcription par lots.
    let selected_model = crate::settings::get_settings(&app).selected_model.clone();

    // Arrêt + transcription de toutes les prises = travail long et bloquant.
    let assembly = tokio::task::spawn_blocking(move || {
        // Garantit le moteur chargé une seule fois, sur ce thread bloquant
        // (le chargement bloque). En échec, on continue : chaque `transcribe`
        // échouera proprement (prise ignorée) plutôt que de tout faire tomber.
        if !tm.is_model_loaded() {
            if let Err(e) = tm.load_model(&selected_model) {
                log::warn!("meeting: échec du chargement du modèle avant transcription: {e}");
            }
        }
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

    log::info!(
        "meeting: {} prise(s) transcrite(s), {} ignorée(s)",
        assembly.transcribed,
        assembly.skipped
    );

    // Le dialogue brut passe au Style « Réunion » : le serveur de
    // l'organisation d'abord, comme la dictée, puis le moteur local/Turbo. Si
    // tout échoue, on rend au moins le dialogue brut — jamais rien perdu.
    let settings = crate::settings::get_settings(&app);
    let report = match organization_report(&app, &assembly.dialogue).await {
        Some(report) => report,
        None => local_report(&app, &settings, &assembly.dialogue)
            .await
            .unwrap_or_else(|| assembly.dialogue.clone()),
    };

    Ok(MeetingReport {
        report,
        dialogue: assembly.dialogue,
        transcribed: assembly.transcribed,
        skipped: assembly.skipped,
    })
}
