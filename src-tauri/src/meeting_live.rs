//! Session de réunion LIVE : capture les deux flux en parallèle et les segmente
//! en prises de parole datées, jusqu'à l'assemblage du compte rendu à l'arrêt.
//!
//! C'est le raccordement de toute la chaîne posée par les modules précédents,
//! côté audio réel (donc Windows) :
//!
//! - micro de l'utilisateur → [`AudioRecorder`] dédié, VAD DÉSACTIVÉ (le
//!   segmenteur a besoin des silences pour dater les prises de parole ; le VAD du
//!   recorder les supprimerait) → segmenteur « Vous » ;
//! - son des autres participants → [`crate::meeting_capture::start_process_loopback`]
//!   → segmenteur « Autres ».
//!
//! À l'arrêt, chaque prise de parole est transcrite (fonction INJECTÉE, pour ne
//! pas coupler ce module au moteur — la commande Tauri fournit le vrai
//! [`crate::managers::transcription::TranscriptionManager`]) puis réordonnée par
//! [`crate::meeting_session::assemble_meeting`].
//!
//! Windows à l'exécution ; le développement se fait sous Linux, donc la
//! compilation de ce fichier est validée par le build MSVC de la CI, pas en
//! local. La partie DÉCISIONNELLE (assemblage, résilience) est, elle, déjà
//! couverte par les tests purs de `meeting_session`.

use std::sync::{Arc, Mutex};

use crate::audio_toolkit::{AudioRecorder, VadPolicy};
use crate::meeting_capture::{start_process_loopback, CaptureError, MeetingCaptureHandle};
use crate::meeting_segmenter::{SegmenterConfig, TimedUtterance, UtteranceSegmenter};
use crate::meeting_session::{assemble_meeting, MeetingAssembly};
use crate::meeting_transcript::SpeakerLabels;

/// Un flux en cours de capture : son segmenteur et les prises de parole déjà
/// closes. Partagé (Arc/Mutex) entre le thread de capture (qui pousse l'audio) et
/// le thread qui arrête la session (qui vide et transcrit).
#[derive(Clone)]
struct StreamAccumulator {
    segmenter: Arc<Mutex<Option<UtteranceSegmenter>>>,
    utterances: Arc<Mutex<Vec<TimedUtterance>>>,
}

impl StreamAccumulator {
    fn new() -> Self {
        Self {
            segmenter: Arc::new(Mutex::new(Some(UtteranceSegmenter::new(
                SegmenterConfig::default(),
            )))),
            utterances: Arc::new(Mutex::new(Vec::new())),
        }
    }

    /// Pousse un bloc d'échantillons 16 kHz mono ; range les prises closes.
    /// Défensif : un mutex empoisonné (thread paniqué) ne doit pas faire tomber le
    /// thread de capture — on ignore silencieusement plutôt que de propager.
    fn push(&self, frame: &[f32]) {
        let Ok(mut seg_guard) = self.segmenter.lock() else {
            return;
        };
        if let Some(seg) = seg_guard.as_mut() {
            let closed = seg.push(frame);
            if !closed.is_empty() {
                if let Ok(mut utts) = self.utterances.lock() {
                    utts.extend(closed);
                }
            }
        }
    }

    /// Clôt la dernière prise en cours et renvoie TOUTES les prises datées. Le
    /// segmenteur est consommé (la session est finie).
    fn drain(&self) -> Vec<TimedUtterance> {
        let mut utterances = self
            .utterances
            .lock()
            .map(|mut u| std::mem::take(&mut *u))
            .unwrap_or_default();
        if let Ok(mut seg_guard) = self.segmenter.lock() {
            if let Some(mut seg) = seg_guard.take() {
                if let Some(last) = seg.flush() {
                    utterances.push(last);
                }
            }
        }
        utterances
    }
}

/// Une session de réunion en cours. La détruire (`Drop`) ou appeler
/// [`finish`](Self::finish) arrête les deux captures — jamais de flux qui
/// continuerait à écouter après coup.
pub struct MeetingSession {
    /// Recorder du micro. `Option` pour pouvoir le fermer proprement à l'arrêt.
    recorder: Option<AudioRecorder>,
    /// Poignée de la capture des autres participants.
    capture: Option<MeetingCaptureHandle>,
    mic: StreamAccumulator,
    others: StreamAccumulator,
}

impl MeetingSession {
    /// Démarre la capture des deux flux pour la réunion tournant dans le
    /// processus `pid` (fourni par la détection de réunion au premier plan).
    ///
    /// Le micro utilise le périphérique d'entrée par défaut. Si la capture
    /// réunion échoue (Windows trop ancien, activation refusée), rien n'est
    /// démarré et l'erreur remonte.
    pub fn start(pid: u32) -> Result<Self, CaptureError> {
        let mic = StreamAccumulator::new();
        let others = StreamAccumulator::new();

        // Capture des autres participants d'abord : c'est elle qui peut échouer
        // pour une raison propre à la machine (API indisponible). Inutile
        // d'ouvrir le micro si elle n'est pas possible.
        let capture = {
            let sink = others.clone();
            start_process_loopback(pid, move |frame| sink.push(frame))?
        };

        // Micro : VAD DÉSACTIVÉ (voir doc du module) pour que les silences
        // parviennent au segmenteur.
        let recorder = match Self::start_microphone(mic.clone()) {
            Ok(recorder) => recorder,
            Err(e) => {
                // `capture` est lâchée ici → son `Drop` arrête la capture réunion.
                // Pas de flux orphelin en cas d'échec micro.
                drop(capture);
                return Err(CaptureError::new_internal(format!(
                    "microphone start failed: {e}"
                )));
            }
        };

        Ok(Self {
            recorder: Some(recorder),
            capture: Some(capture),
            mic,
            others,
        })
    }

    fn start_microphone(
        sink: StreamAccumulator,
    ) -> Result<AudioRecorder, Box<dyn std::error::Error>> {
        let mut recorder = AudioRecorder::new()?.with_audio_callback(move |frame| sink.push(frame));
        recorder.open(None)?; // périphérique d'entrée par défaut
        recorder.start(VadPolicy::Disabled)?;
        Ok(recorder)
    }

    /// Arrête les deux captures et assemble le compte rendu.
    ///
    /// `transcribe` est appelée une fois par prise de parole (voir
    /// [`assemble_meeting`]) : la commande Tauri branche ici le vrai moteur. Les
    /// étiquettes viennent de l'appelant (i18n).
    pub fn finish(
        mut self,
        transcribe: impl FnMut(&[f32]) -> Option<String>,
        labels: &SpeakerLabels,
    ) -> MeetingAssembly {
        // Arrêt de la capture réunion (join du thread WASAPI).
        if let Some(capture) = self.capture.take() {
            if let Err(e) = capture.stop() {
                log::warn!("meeting session: capture stop error: {}", e.detail);
            }
        }
        // Arrêt du micro : `stop` draine les dernières trames vers le callback,
        // puis `close` termine le thread du recorder.
        if let Some(recorder) = self.recorder.as_ref() {
            let _ = recorder.stop();
        }
        if let Some(mut recorder) = self.recorder.take() {
            let _ = recorder.close();
        }

        let mic_utterances = self.mic.drain();
        let others_utterances = self.others.drain();

        assemble_meeting(mic_utterances, others_utterances, transcribe, labels)
    }
}

impl Drop for MeetingSession {
    fn drop(&mut self) {
        // Garde-fou : une session lâchée sans `finish` ne doit pas laisser les
        // captures tourner. `MeetingCaptureHandle` s'arrête déjà à son propre
        // Drop ; on ferme juste le micro.
        if let Some(mut recorder) = self.recorder.take() {
            let _ = recorder.close();
        }
    }
}
