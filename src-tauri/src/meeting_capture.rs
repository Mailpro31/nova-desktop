//! Capture du son des AUTRES participants d'une réunion.
//!
//! Nova ne sait capter que le micro de l'utilisateur : sa propre voix. Pour un
//! vrai compte rendu de réunion il faut aussi ce que Nova *entend sortir* des
//! haut-parleurs, c'est-à-dire les autres participants. Windows sait le faire
//! sans pilote virtuel via la capture « loopback » WASAPI, et depuis
//! Windows 10 version 2004 elle peut être limitée à UN SEUL PROCESSUS
//! (`ActivateAudioInterfaceAsync` + `AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS`).
//!
//! C'est ce qu'on utilise ici, et c'est un choix de conception, pas un détail :
//! Nova ne capte JAMAIS tout le son de l'ordinateur (musique, notifications,
//! autres onglets), uniquement l'arbre de processus de l'application de réunion
//! détectée au premier plan. Le PID vient de [`crate::auto_style`], donc de la
//! MÊME détection que le Style « Réunion » — une seule définition de « ceci est
//! une réunion » dans tout le produit, liste noire de confidentialité comprise.
//!
//! Ce module est le SOCLE : il sait ouvrir le flux, le ramener au format que le
//! moteur de transcription attend (16 kHz mono) et mesurer ce qu'il a entendu.
//! La session de réunion complète (démarrage/arrêt long, mixage avec le micro,
//! compte rendu) n'est pas encore branchée — seul le diagnostic
//! [`probe_meeting_capture`] l'exerce, ce qui permet de vérifier la faisabilité
//! sur une vraie machine avant d'aller plus loin.
//!
//! Windows uniquement ; partout ailleurs les fonctions renvoient un repli
//! « non pris en charge » sans jamais échouer bruyamment.

use serde::{Deserialize, Serialize};
use specta::Type;
use std::time::Duration;

/// Durée du test de capture déclenché par [`probe_meeting_capture`]. Assez long
/// pour qu'un interlocuteur qui parle produise un niveau mesurable, assez court
/// pour rester un diagnostic (on n'enregistre pas une réunion « pour voir »).
const PROBE_DURATION: Duration = Duration::from_millis(2000);

/// Délai avant de lire la fenêtre au premier plan. Le bouton du diagnostic vit
/// dans la fenêtre Réglages de Nova : au moment du clic, c'est ELLE qui a le
/// focus, jamais l'appli de réunion. Ce délai laisse le temps à l'utilisateur de
/// basculer dessus (Alt+Tab) avant que la détection ne s'exécute — sans lui, le
/// diagnostic échouerait TOUJOURS avec « aucune app de réunion », même réunion
/// ouverte.
const SWITCH_GRACE_PERIOD: Duration = Duration::from_millis(3000);

/// Format demandé au flux loopback. On le FIXE au lieu d'interroger le
/// périphérique : le pseudo-périphérique de loopback par processus n'implémente
/// ni `GetMixFormat` ni `GetDevicePeriod` (ils renvoient `E_NOTIMPL`), donc toute
/// négociation de format échouerait. L'auto-conversion laisse Windows convertir
/// depuis le format réel de l'application.
#[cfg(target_os = "windows")]
const CAPTURE_SAMPLE_RATE: usize = 48_000;
const CAPTURE_CHANNELS: usize = 2;

/// Taille du tampon demandée, en unités de 100 ns (20 ms) — valeur fixe reprise
/// de l'exemple officiel Microsoft, pour la même raison que ci-dessus.
#[cfg(target_os = "windows")]
const CAPTURE_BUFFER_HNS: i64 = 200_000;

/// En dessous de ce niveau crête, la capture n'a entendu que du silence.
/// Volontairement bas : on veut distinguer « le flux est ouvert mais vide » sans
/// qualifier de silence une voix lointaine.
const SILENCE_PEAK: f32 = 0.001;

// ---------------------------------------------------------------------------
// Codes de raison
// ---------------------------------------------------------------------------

/// Aucune application de réunion au premier plan.
pub const REASON_NO_MEETING_APP: &str = "no_meeting_app";
/// La capture par application n'est pas disponible (Windows trop ancien, ou
/// activation refusée).
pub const REASON_UNAVAILABLE: &str = "unavailable";
/// Le flux s'est ouvert mais n'a produit aucun échantillon.
pub const REASON_NO_AUDIO: &str = "no_audio";
/// Erreur pendant la lecture du flux. Émis uniquement par le chemin Windows,
/// mais il fait partie du contrat traduit par l'interface : `allow` plutôt que
/// suppression, sinon la compilation Linux (tests, nix) le signale inutilisé.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub const REASON_STREAM_ERROR: &str = "stream_error";
/// Le test n'a pas pu s'exécuter (thread, exécuteur).
pub const REASON_INTERNAL: &str = "internal";

/// Échec de capture. Le `reason` est un code STABLE traduit par l'interface (les
/// messages Windows ne sont pas localisés et l'app parle 24 langues) ; le
/// `detail` est le message technique brut, affiché tel quel pour le support.
pub struct CaptureError {
    pub reason: &'static str,
    pub detail: String,
}

impl CaptureError {
    fn new(reason: &'static str, detail: impl Into<String>) -> Self {
        Self {
            reason,
            detail: detail.into(),
        }
    }
}

/// Résultat du diagnostic. Ne contient JAMAIS d'audio ni de contenu de réunion :
/// seulement de quoi répondre « est-ce que ça marche sur cette machine, et Nova
/// a-t-elle réellement entendu quelque chose ».
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct MeetingCaptureProbe {
    /// La capture a abouti (le flux s'est ouvert et a produit des échantillons).
    pub supported: bool,
    /// Exécutable de l'application de réunion testée (ex. « zoom.exe »). Vide si
    /// aucune n'a été détectée au premier plan.
    pub process: String,
    /// Une application de réunion était bien au premier plan.
    pub meeting_app_detected: bool,
    /// Durée réellement capturée, en millisecondes.
    pub captured_ms: u32,
    /// Niveau crête observé (0.0 à 1.0). Calculé, puis l'audio est jeté.
    pub peak_level: f32,
    /// La capture a fonctionné mais n'a entendu que du silence — cas normal si
    /// personne ne parlait ; à distinguer d'un échec.
    pub silent: bool,
    /// Code de raison de l'échec, à traduire côté interface. `None` si succès.
    pub reason: Option<String>,
    /// Détail technique brut (message Windows). Non traduit, non obligatoire.
    pub detail: Option<String>,
}

impl MeetingCaptureProbe {
    fn failed(process: String, meeting_app_detected: bool, error: CaptureError) -> Self {
        Self {
            supported: false,
            process,
            meeting_app_detected,
            captured_ms: 0,
            peak_level: 0.0,
            silent: false,
            reason: Some(error.reason.to_string()),
            detail: (!error.detail.is_empty()).then_some(error.detail),
        }
    }
}

/// Audio capté par [`capture_process_loopback`], déjà ramené au format du moteur
/// de transcription (16 kHz mono) — le même que celui produit par le micro, donc
/// mixable tel quel avec lui le jour où la session de réunion sera branchée.
pub struct CapturedAudio {
    pub samples_16k_mono: Vec<f32>,
}

/// Niveau crête d'un buffer (valeur absolue maximale), borné à 1.0. Un buffer
/// vide vaut 0.0.
fn peak_level(samples: &[f32]) -> f32 {
    samples
        .iter()
        .filter(|s| s.is_finite())
        .fold(0.0_f32, |peak, s| peak.max(s.abs()))
        .min(1.0)
}

/// Durée d'un buffer 16 kHz mono, en millisecondes.
fn duration_ms_16k(samples: &[f32]) -> u32 {
    let rate = crate::audio_toolkit::constants::WHISPER_SAMPLE_RATE as u64;
    ((samples.len() as u64 * 1000) / rate) as u32
}

/// Replie le flux brut (f32 petit-boutien, canaux entrelacés) en mono, en
/// moyennant les canaux — même conversion que celle appliquée au micro dans
/// `audio_toolkit::audio::recorder`.
///
/// Hors du bloc `#[cfg(windows)]` À DESSEIN : c'est la seule étape de conversion
/// du flux, celle qui corromprait l'audio en silence si elle était fausse, et
/// elle ne dépend d'aucune API Windows — elle doit donc être testable partout.
/// `chunks_exact` ignore une trame incomplète en fin de buffer plutôt que de
/// fabriquer un échantillon aberrant à partir d'octets tronqués.
fn interleaved_f32_to_mono(raw: &[u8]) -> Vec<f32> {
    const BYTES_PER_SAMPLE: usize = 4;
    let frame_bytes = BYTES_PER_SAMPLE * CAPTURE_CHANNELS;

    raw.chunks_exact(frame_bytes)
        .map(|frame| {
            let sum: f32 = frame
                .chunks_exact(BYTES_PER_SAMPLE)
                .map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
                .sum();
            sum / CAPTURE_CHANNELS as f32
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Capture (Windows)
// ---------------------------------------------------------------------------

/// Capte le son produit par le processus `pid` (et son arbre d'enfants) pendant
/// au plus `max_duration`, et renvoie l'audio en 16 kHz mono.
///
/// Le travail se fait sur un thread dédié : WASAPI exige un appartement COM
/// multithread (MTA) que le thread appelant n'a pas forcément, et la boucle de
/// capture bloque. Ne panique jamais — toute erreur remonte en `Err`.
#[cfg(target_os = "windows")]
pub fn capture_process_loopback(
    pid: u32,
    max_duration: Duration,
) -> Result<CapturedAudio, CaptureError> {
    // Thread NOMMÉ : identifiable dans les journaux et les vidages de pile du
    // watchdog, comme les autres threads longs de Nova.
    let handle = std::thread::Builder::new()
        .name("nova-meeting-capture".into())
        .spawn(move || capture_on_this_thread(pid, max_duration))
        .map_err(|e| CaptureError::new(REASON_INTERNAL, e.to_string()))?;

    // Un thread de capture qui panique ne doit pas faire tomber l'appelant :
    // « jamais de plantage » s'applique aussi à un chemin de diagnostic.
    handle.join().unwrap_or_else(|_| {
        Err(CaptureError::new(
            REASON_INTERNAL,
            "capture thread panicked",
        ))
    })
}

#[cfg(target_os = "windows")]
fn capture_on_this_thread(pid: u32, max_duration: Duration) -> Result<CapturedAudio, CaptureError> {
    use crate::audio_toolkit::audio::FrameResampler;
    use crate::audio_toolkit::constants;
    use std::collections::VecDeque;
    use std::time::Instant;
    use wasapi::{initialize_mta, AudioClient, Direction, SampleType, StreamMode, WaveFormat};

    initialize_mta()
        .ok()
        .map_err(|e| CaptureError::new(REASON_INTERNAL, e.to_string()))?;

    let format = WaveFormat::new(
        32,
        32,
        &SampleType::Float,
        CAPTURE_SAMPLE_RATE,
        CAPTURE_CHANNELS,
        None,
    );

    // C'est ICI que le périmètre se décide : la capture est attachée à l'arbre de
    // processus de l'application de réunion, jamais au périphérique de sortie —
    // donc jamais au son de tout l'ordinateur.
    let mut audio_client = AudioClient::new_application_loopback_client(pid, true)
        .map_err(|e| CaptureError::new(REASON_UNAVAILABLE, e.to_string()))?;

    let mode = StreamMode::EventsShared {
        autoconvert: true,
        buffer_duration_hns: CAPTURE_BUFFER_HNS,
    };
    audio_client
        .initialize_client(&format, &Direction::Capture, &mode)
        .map_err(|e| CaptureError::new(REASON_UNAVAILABLE, e.to_string()))?;

    let event = audio_client
        .set_get_eventhandle()
        .map_err(|e| CaptureError::new(REASON_STREAM_ERROR, e.to_string()))?;
    let capture_client = audio_client
        .get_audiocaptureclient()
        .map_err(|e| CaptureError::new(REASON_STREAM_ERROR, e.to_string()))?;

    audio_client
        .start_stream()
        .map_err(|e| CaptureError::new(REASON_STREAM_ERROR, e.to_string()))?;

    // À partir d'ici le flux tourne : toute sortie doit l'arrêter, d'où l'arrêt
    // explicite avant chaque retour plutôt qu'un `?` nu dans la boucle.
    let mut raw: VecDeque<u8> = VecDeque::new();
    let started = Instant::now();
    let mut read_error: Option<CaptureError> = None;

    while started.elapsed() < max_duration {
        if let Err(e) = capture_client.read_from_device_to_deque(&mut raw) {
            read_error = Some(CaptureError::new(REASON_STREAM_ERROR, e.to_string()));
            break;
        }

        // Un processus parfaitement silencieux peut ne jamais signaler
        // l'événement : le délai d'attente court garde la boucle bornée par
        // `max_duration` au lieu de la laisser suspendue.
        let _ = event.wait_for_event(100);
    }

    let _ = audio_client.stop_stream();

    if let Some(error) = read_error {
        return Err(error);
    }

    // Le flux est en f32 entrelacé : on replie en mono puis on ramène à la
    // fréquence du moteur de transcription, exactement comme le micro.
    let mono = interleaved_f32_to_mono(raw.make_contiguous());

    let mut samples_16k: Vec<f32> = Vec::new();
    let mut resampler = FrameResampler::new(
        CAPTURE_SAMPLE_RATE,
        constants::WHISPER_SAMPLE_RATE as usize,
        Duration::from_millis(30),
    );
    resampler.push(&mono, &mut |frame: &[f32]| {
        samples_16k.extend_from_slice(frame)
    });
    resampler.finish(&mut |frame: &[f32]| samples_16k.extend_from_slice(frame));

    Ok(CapturedAudio {
        samples_16k_mono: samples_16k,
    })
}

/// Repli hors Windows : la capture loopback par processus est une API Windows.
/// Le développement se fait sous Linux, donc ce chemin doit compiler et échouer
/// proprement plutôt que de ne pas exister.
#[cfg(not(target_os = "windows"))]
pub fn capture_process_loopback(
    _pid: u32,
    _max_duration: Duration,
) -> Result<CapturedAudio, CaptureError> {
    Err(CaptureError::new(REASON_UNAVAILABLE, "windows only"))
}

// ---------------------------------------------------------------------------
// Diagnostic
// ---------------------------------------------------------------------------

/// Teste la capture des autres participants sur CETTE machine, contre
/// l'application de réunion actuellement au premier plan.
///
/// C'est un diagnostic, pas la fonctionnalité : l'audio capté sert uniquement à
/// calculer un niveau crête, puis il est jeté. Rien n'est enregistré, transcrit,
/// ni envoyé où que ce soit.
#[tauri::command]
#[specta::specta]
pub async fn probe_meeting_capture(app: tauri::AppHandle) -> Result<MeetingCaptureProbe, String> {
    // Voir la doc de `SWITCH_GRACE_PERIOD` : sans ce délai, la fenêtre au
    // premier plan est TOUJOURS celle des Réglages, jamais la réunion.
    tokio::time::sleep(SWITCH_GRACE_PERIOD).await;

    let settings = crate::settings::get_settings(&app);

    let Some((process, pid)) = crate::auto_style::foreground_meeting_target(&settings) else {
        log::info!("meeting capture probe: no meeting app in the foreground");
        return Ok(MeetingCaptureProbe::failed(
            String::new(),
            false,
            CaptureError::new(REASON_NO_MEETING_APP, ""),
        ));
    };
    log::info!("meeting capture probe: targeting {process} (pid {pid})");

    // La capture bloque deux secondes : elle ne doit pas s'exécuter sur
    // l'exécuteur asynchrone, sinon elle gèle les autres commandes.
    let joined =
        tokio::task::spawn_blocking(move || capture_process_loopback(pid, PROBE_DURATION)).await;

    // Même un échec d'exécution reste un RÉSULTAT de diagnostic : l'interface
    // affiche une ligne traduite plutôt qu'une exception brute.
    let captured = match joined {
        Ok(result) => result,
        Err(e) => Err(CaptureError::new(REASON_INTERNAL, e.to_string())),
    };

    Ok(match captured {
        Ok(audio) if audio.samples_16k_mono.is_empty() => {
            log::info!("meeting capture probe: stream opened but produced no samples");
            MeetingCaptureProbe::failed(process, true, CaptureError::new(REASON_NO_AUDIO, ""))
        }
        Ok(audio) => {
            let peak = peak_level(&audio.samples_16k_mono);
            log::info!(
                "meeting capture probe: captured {}ms, peak {peak}",
                duration_ms_16k(&audio.samples_16k_mono)
            );
            MeetingCaptureProbe {
                supported: true,
                process,
                meeting_app_detected: true,
                captured_ms: duration_ms_16k(&audio.samples_16k_mono),
                peak_level: peak,
                silent: peak < SILENCE_PEAK,
                reason: None,
                detail: None,
            }
        }
        Err(error) => {
            log::warn!(
                "meeting capture probe failed: reason={} detail={}",
                error.reason,
                error.detail
            );
            MeetingCaptureProbe::failed(process, true, error)
        }
    })
}

#[cfg(test)]
mod tests {
    use super::{
        duration_ms_16k, interleaved_f32_to_mono, peak_level, CaptureError, MeetingCaptureProbe,
        REASON_NO_MEETING_APP, REASON_UNAVAILABLE, SILENCE_PEAK,
    };

    /// Encode des échantillons f32 comme le fait WASAPI (petit-boutien, entrelacé).
    fn raw_frames(samples: &[f32]) -> Vec<u8> {
        samples.iter().flat_map(|s| s.to_le_bytes()).collect()
    }

    #[test]
    fn peak_of_empty_buffer_is_zero() {
        assert_eq!(peak_level(&[]), 0.0);
    }

    #[test]
    fn peak_uses_absolute_value() {
        assert_eq!(peak_level(&[0.1, -0.8, 0.3]), 0.8);
    }

    #[test]
    fn peak_is_clamped_to_one() {
        // Un flux mal converti peut dépasser la pleine échelle ; le diagnostic
        // ne doit jamais afficher « 340 % ».
        assert_eq!(peak_level(&[3.4, -7.0]), 1.0);
    }

    #[test]
    fn peak_ignores_non_finite_samples() {
        // NaN se propage à travers `max` : sans le filtre, un seul échantillon
        // corrompu rendrait le niveau entier invalide.
        assert_eq!(peak_level(&[0.25, f32::NAN, f32::INFINITY]), 0.25);
    }

    #[test]
    fn silence_threshold_separates_quiet_from_empty() {
        // Un vrai silence numérique est sous le seuil…
        assert!(peak_level(&[0.0, 0.0]) < SILENCE_PEAK);
        // …mais une voix, même lointaine, ne doit pas être qualifiée de silence.
        assert!(peak_level(&[0.02, -0.015]) > SILENCE_PEAK);
    }

    #[test]
    fn duration_is_derived_from_the_transcription_rate() {
        assert_eq!(duration_ms_16k(&[]), 0);
        assert_eq!(duration_ms_16k(&vec![0.0; 16_000]), 1000);
        assert_eq!(duration_ms_16k(&vec![0.0; 8_000]), 500);
    }

    #[test]
    fn stereo_frames_fold_to_their_average() {
        // (1.0, 0.0) -> 0.5 et (-1.0, -1.0) -> -1.0 : un canal muet ne doit pas
        // faire disparaître l'autre, ni saturer le mélange.
        let raw = raw_frames(&[1.0, 0.0, -1.0, -1.0]);
        assert_eq!(interleaved_f32_to_mono(&raw), vec![0.5, -1.0]);
    }

    #[test]
    fn an_incomplete_trailing_frame_is_dropped_not_misread() {
        // Un buffer coupé au milieu d'une trame ne doit pas produire un
        // échantillon fabriqué à partir d'octets tronqués (bruit audible).
        let mut raw = raw_frames(&[1.0, 1.0]);
        raw.extend_from_slice(&[0xFF, 0xFF]); // demi-échantillon
        assert_eq!(interleaved_f32_to_mono(&raw), vec![1.0]);
    }

    #[test]
    fn empty_capture_folds_to_nothing() {
        assert!(interleaved_f32_to_mono(&[]).is_empty());
    }

    #[test]
    fn failed_probe_carries_a_translatable_reason() {
        let probe = MeetingCaptureProbe::failed(
            "zoom.exe".into(),
            true,
            CaptureError::new(REASON_UNAVAILABLE, "E_NOTIMPL"),
        );
        assert!(!probe.supported);
        assert!(!probe.silent);
        assert_eq!(probe.captured_ms, 0);
        assert_eq!(probe.reason.as_deref(), Some(REASON_UNAVAILABLE));
        assert_eq!(probe.detail.as_deref(), Some("E_NOTIMPL"));
    }

    #[test]
    fn empty_detail_is_omitted_rather_than_shown_blank() {
        let probe = MeetingCaptureProbe::failed(
            String::new(),
            false,
            CaptureError::new(REASON_NO_MEETING_APP, ""),
        );
        assert_eq!(probe.reason.as_deref(), Some(REASON_NO_MEETING_APP));
        assert!(probe.detail.is_none());
    }
}
