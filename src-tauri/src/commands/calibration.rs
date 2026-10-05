//! Commandes de l'écran de calibrage de la voix.
//!
//! L'élève lit une phrase connue ; Nova l'enregistre **sans** détection de voix
//! (il faut aussi entendre les silences pour mesurer le bruit de fond), la fait
//! transcrire par le même moteur que la dictée — le serveur de l'organisation
//! quand il répond, le modèle local sinon — et compare. Voir
//! `voice_calibration` pour ce qui est mesuré et pourquoi.
//!
//! Rien n'est enregistré ici, sauf par `set_input_gain`, que l'écran n'appelle
//! qu'une fois l'élève d'accord. L'audio de calibrage ne va pas dans
//! l'historique : c'est une lecture d'essai, pas une dictée.

use std::sync::Arc;

use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, Manager};

use crate::audio_toolkit::{sanitize_gain, VadPolicy};
use crate::commands::organization;
use crate::managers::audio::AudioRecordingManager;
use crate::managers::transcription::TranscriptionManager;
use crate::settings::{get_settings, write_settings};
use crate::voice_calibration::{self, HeardAs};

/// Identifiant d'enregistrement réservé au calibrage : il ne peut pas être
/// confondu avec un raccourci de dictée.
const CALIBRATION_BINDING: &str = "voice-calibration";

/// Un mot lu et ce que le moteur a écrit à sa place.
#[derive(Debug, Clone, Serialize, Type)]
pub struct MisheardWord {
    pub expected: String,
    pub heard: String,
}

impl From<HeardAs> for MisheardWord {
    fn from(value: HeardAs) -> Self {
        Self {
            expected: value.expected,
            heard: value.heard,
        }
    }
}

/// Ce qu'une phrase lue a appris à Nova.
#[derive(Debug, Clone, Serialize, Type)]
pub struct CalibrationResult {
    pub speech_dbfs: f32,
    pub noise_dbfs: f32,
    pub voice_stands_out: bool,
    /// Gain total recommandé, gain actuel compris : la phrase a été enregistrée
    /// avec le gain déjà en place.
    pub recommended_gain: f32,
    /// Ce que le moteur a transcrit.
    pub heard: String,
    pub misheard: Vec<MisheardWord>,
}

#[tauri::command]
#[specta::specta]
pub fn start_voice_calibration_sample(app: AppHandle) -> Result<(), String> {
    let recorder = app.state::<Arc<AudioRecordingManager>>();
    recorder.try_start_recording(CALIBRATION_BINDING, VadPolicy::Disabled)
}

#[tauri::command]
#[specta::specta]
pub async fn finish_voice_calibration_sample(
    app: AppHandle,
    expected: String,
) -> Result<CalibrationResult, String> {
    // L'état n'est pas gardé au-delà de l'arrêt : la transcription qui suit
    // est asynchrone, et l'enregistreur ne doit pas rester emprunté pendant.
    let samples = {
        let recorder = app.state::<Arc<AudioRecordingManager>>();
        let generation = recorder.cancel_generation();
        recorder.stop_recording(CALIBRATION_BINDING, generation)
    }
    .filter(|samples| !samples.is_empty())
    .ok_or_else(|| "no audio was recorded".to_string())?;

    let profile = voice_calibration::level_profile(&samples)
        .ok_or_else(|| "the recording is too short".to_string())?;
    let current_gain = sanitize_gain(get_settings(&app).input_gain);
    let heard = transcribe(&app, samples).await?;

    Ok(CalibrationResult {
        speech_dbfs: profile.speech_dbfs,
        noise_dbfs: profile.noise_dbfs,
        voice_stands_out: voice_calibration::voice_stands_out(&profile),
        recommended_gain: sanitize_gain(
            current_gain * voice_calibration::recommended_gain(&profile),
        ),
        misheard: voice_calibration::misheard_words(&expected, &heard)
            .into_iter()
            .map(MisheardWord::from)
            .collect(),
        heard,
    })
}

/// Abandonne la phrase en cours de lecture. Sans effet sur une dictée : seul
/// l'enregistrement de calibrage est concerné.
#[tauri::command]
#[specta::specta]
pub fn cancel_voice_calibration_sample(app: AppHandle) {
    app.state::<Arc<AudioRecordingManager>>()
        .cancel_recording_of(CALIBRATION_BINDING);
}

/// Applique le gain que l'élève a accepté. Borné : voir `sanitize_gain`.
#[tauri::command]
#[specta::specta]
pub fn set_input_gain(app: AppHandle, gain: f32) -> Result<(), String> {
    let mut settings = get_settings(&app);
    settings.input_gain = sanitize_gain(gain);
    write_settings(&app, settings);
    Ok(())
}

/// Transcrit comme une dictée : serveur de l'organisation d'abord, modèle
/// local sinon. Mesurer un autre moteur que celui qui servira ne dirait rien
/// d'utile sur ce que l'élève obtiendra.
async fn transcribe(app: &AppHandle, samples: Vec<f32>) -> Result<String, String> {
    if let Some(session) = organization::should_use_organization(app).await {
        let wav_path = std::env::temp_dir().join(format!(
            "nova-calibration-{}.wav",
            chrono::Utc::now().timestamp_millis()
        ));
        let written = crate::audio_toolkit::save_wav_file(&wav_path, &samples);
        if written.is_ok() {
            let language = get_settings(app).selected_language;
            let result =
                organization::transcribe_organization(&wav_path, &session, Some(&language)).await;
            let _ = std::fs::remove_file(&wav_path);
            if let Ok(text) = result {
                return Ok(text);
            }
        }
    }

    let manager = app.state::<Arc<TranscriptionManager>>().inner().clone();
    tauri::async_runtime::spawn_blocking(move || manager.transcribe(samples))
        .await
        .map_err(|e| format!("transcription task failed: {e}"))?
        .map_err(|e| format!("transcription failed: {e}"))
}
