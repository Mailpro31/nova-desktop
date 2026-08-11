//! Orchestration d'une session de réunion : des prises de parole datées des deux
//! flux jusqu'au compte rendu.
//!
//! Assemble la chaîne posée par les modules précédents :
//! [`crate::meeting_capture`] (capter) → [`crate::meeting_segmenter`] (découper
//! qui parle quand) → transcription → [`crate::meeting_transcript`] (réordonner
//! en dialogue « Vous »/« Autres »).
//!
//! Ce fichier isole la partie ORCHESTRATION de la partie audio/Windows : la
//! fonction de transcription est injectée (`impl FnMut`), donc la logique — quel
//! flux est « Vous », quel est « Autres », que faire d'une prise qui échoue — est
//! testable sans moteur ni micro. Le branchement sur le vrai
//! [`crate::managers::transcription::TranscriptionManager`] et sur la capture
//! live se fait par-dessus (tranche suivante).

use crate::meeting_segmenter::TimedUtterance;
use crate::meeting_transcript::{assemble_dialogue, Speaker, SpeakerLabels, Utterance};

/// Résultat de l'assemblage d'une réunion. Le `dialogue` est prêt à passer au
/// Style « Réunion » ; les compteurs servent au journal et à distinguer « réunion
/// silencieuse » (rien à transcrire) de « le moteur a échoué sur tout ».
#[derive(Debug, Clone, PartialEq)]
pub struct MeetingAssembly {
    /// Dialogue chronologique étiqueté, ou chaîne vide si aucune prise n'a rien
    /// donné.
    pub dialogue: String,
    /// Nombre de prises de parole transcrites avec succès (texte non vide).
    pub transcribed: usize,
    /// Nombre de prises ignorées (transcription en échec ou vide).
    pub skipped: usize,
}

/// Transcrit chaque prise de parole des deux flux et les réordonne en dialogue.
///
/// `transcribe` est appelée une fois par prise ; elle renvoie `None` en cas
/// d'échec OU de texte vide — la prise est alors ignorée, JAMAIS abandon de tout
/// le compte rendu. Une réunion d'une heure ne doit pas être perdue parce qu'un
/// segment de 2 s a fait trébucher le moteur.
///
/// Les étiquettes (« Vous »/« Autres ») sont fournies par l'appelant pour rester
/// traduisibles (l'app parle 22 langues).
pub fn assemble_meeting(
    mic: Vec<TimedUtterance>,
    others: Vec<TimedUtterance>,
    mut transcribe: impl FnMut(&[f32]) -> Option<String>,
    labels: &SpeakerLabels,
) -> MeetingAssembly {
    let mut utterances: Vec<Utterance> = Vec::with_capacity(mic.len() + others.len());
    let mut transcribed = 0;
    let mut skipped = 0;

    // Deux passes (micro puis autres) : l'ordre d'insertion n'a pas d'importance,
    // `assemble_dialogue` retrie par horodatage. À temps égal, son tri STABLE
    // gardera « Vous » avant « Autres » ici — choix neutre et déterministe.
    for (samples_source, speaker) in [(mic, Speaker::You), (others, Speaker::Others)] {
        for utterance in samples_source {
            match transcribe(&utterance.samples) {
                Some(text) if !text.trim().is_empty() => {
                    transcribed += 1;
                    utterances.push(Utterance {
                        start_ms: utterance.start_ms,
                        speaker,
                        text,
                    });
                }
                _ => skipped += 1,
            }
        }
    }

    MeetingAssembly {
        dialogue: assemble_dialogue(utterances, labels),
        transcribed,
        skipped,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const LABELS: SpeakerLabels = SpeakerLabels {
        you: "Vous",
        others: "Autres",
    };

    fn utt(start_ms: u64, marker: f32) -> TimedUtterance {
        // Le marqueur encode l'identité de la prise pour que la fonction de
        // transcription factice sache quoi « transcrire ».
        TimedUtterance {
            start_ms,
            samples: vec![marker],
        }
    }

    #[test]
    fn interleaves_both_streams_by_time() {
        // Transcription factice : le texte est dérivé du marqueur d'échantillon.
        let transcribe = |s: &[f32]| Some(format!("dit-{}", s[0] as i32));
        let out = assemble_meeting(
            vec![utt(0, 1.0), utt(4000, 2.0)],
            vec![utt(2000, 3.0)],
            transcribe,
            &LABELS,
        );
        assert_eq!(out.dialogue, "Vous : dit-1\nAutres : dit-3\nVous : dit-2");
        assert_eq!(out.transcribed, 3);
        assert_eq!(out.skipped, 0);
    }

    #[test]
    fn a_failed_utterance_is_skipped_not_fatal() {
        // La 2e prise échoue (None) : le reste du compte rendu survit.
        let mut call = 0;
        let transcribe = |_: &[f32]| {
            call += 1;
            if call == 2 {
                None
            } else {
                Some("ok".to_string())
            }
        };
        let out = assemble_meeting(
            vec![utt(0, 1.0), utt(1000, 2.0)],
            vec![],
            transcribe,
            &LABELS,
        );
        assert_eq!(out.transcribed, 1);
        assert_eq!(out.skipped, 1);
        assert_eq!(out.dialogue, "Vous : ok");
    }

    #[test]
    fn blank_transcription_is_treated_as_skipped() {
        // Un segment transcrit en blanc (silence résiduel) ne crée pas de ligne
        // et compte comme ignoré, pas comme transcrit.
        let transcribe = |_: &[f32]| Some("   ".to_string());
        let out = assemble_meeting(vec![utt(0, 1.0)], vec![], transcribe, &LABELS);
        assert_eq!(out.transcribed, 0);
        assert_eq!(out.skipped, 1);
        assert_eq!(out.dialogue, "");
    }

    #[test]
    fn a_fully_silent_meeting_yields_empty_dialogue() {
        // Aucune prise du tout : dialogue vide, aucun échec — à distinguer d'un
        // moteur cassé (skipped > 0).
        let out = assemble_meeting(vec![], vec![], |_| Some("jamais".into()), &LABELS);
        assert_eq!(out.dialogue, "");
        assert_eq!(out.transcribed, 0);
        assert_eq!(out.skipped, 0);
    }

    #[test]
    fn each_utterance_is_transcribed_exactly_once() {
        // Garde-fou : on ne transcrit pas deux fois la même prise (coût moteur).
        let mut count = 0;
        let transcribe = |_: &[f32]| {
            count += 1;
            Some("x".to_string())
        };
        assemble_meeting(
            vec![utt(0, 1.0), utt(1000, 2.0)],
            vec![utt(500, 3.0)],
            transcribe,
            &LABELS,
        );
        assert_eq!(count, 3);
    }
}
