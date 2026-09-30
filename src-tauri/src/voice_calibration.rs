//! Calibrage de la voix : ce que Nova apprend de quelques phrases lues.
//!
//! Au premier lancement, l'élève lit une poignée de phrases connues. Leur
//! texte est connu d'avance, et c'est tout l'intérêt : on peut alors mesurer
//! ce que le micro reçoit et ce que le moteur comprend, au lieu de le deviner.
//!
//! Trois apprentissages, tous vérifiables :
//!
//! - **le niveau** : une voix basse — un élève qui dicte en classe parle bas —
//!   arrive trop faible, et la reconnaissance s'effondre. On en tire un gain,
//!   borné pour ne jamais saturer ;
//! - **le bruit** : si la voix ne ressort pas du bruit de fond, aucun réglage ne
//!   sauvera la dictée ; on le dit plutôt que de promettre ;
//! - **les mots mal entendus** : chaque écart entre la phrase lue et la
//!   transcription est une correction possible, propre à cette voix.
//!
//! Rien de ce module n'est appliqué sans l'accord de l'élève : il **mesure et
//! propose**. Les corrections passent par le même chemin que le vocabulaire
//! personnel, et le gain par un réglage visible.

/// Longueur d'une trame d'analyse : 30 ms à 16 kHz, comme la détection de voix.
const FRAME_SAMPLES: usize = 480;

/// En deçà, on ne distingue pas une voix d'un bruit : pas de profil.
const MIN_FRAMES: usize = 10;

/// Niveau visé pour la voix. Assez haut pour que la reconnaissance ne perde pas
/// les consonnes d'une voix basse, assez bas pour laisser de la marge.
pub const TARGET_SPEECH_DBFS: f32 = -20.0;

/// Gain maximal (+18 dB). Au-delà, on amplifie surtout le bruit de la salle.
pub const MAX_GAIN: f32 = 8.0;

/// Crête à ne pas dépasser après gain.
const PEAK_CEILING: f32 = 0.9;

/// Écart voix/bruit en deçà duquel la dictée ne peut pas être fiable.
const MIN_SPEECH_OVER_NOISE_DB: f32 = 12.0;

/// Au-delà de ce nombre de mots, un écart est une phrase ratée, pas un mot
/// mal compris.
const MAX_SPAN_WORDS: usize = 3;

/// Ce que le micro a reçu pendant la lecture.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LevelProfile {
    /// Niveau de la voix (dBFS) : les trames les plus fortes.
    pub speech_dbfs: f32,
    /// Niveau du fond (dBFS) : les trames les plus calmes.
    pub noise_dbfs: f32,
    /// Crête absolue, pour borner le gain.
    pub peak: f32,
}

fn dbfs(rms: f32) -> f32 {
    20.0 * rms.max(1e-9).log10()
}

/// Mesure la voix et le fond d'un enregistrement (16 kHz, mono).
///
/// Sans détecteur de voix : une lecture de phrases alterne paroles et pauses,
/// donc les trames les plus fortes (90ᵉ centile) sont la voix et les plus
/// calmes (10ᵉ centile) le fond. `None` si l'enregistrement est trop court
/// pour trancher.
pub fn level_profile(samples: &[f32]) -> Option<LevelProfile> {
    let mut levels: Vec<f32> = samples
        .chunks_exact(FRAME_SAMPLES)
        .map(|frame| {
            let energy: f32 = frame.iter().map(|s| s * s).sum::<f32>() / frame.len() as f32;
            dbfs(energy.sqrt())
        })
        .collect();
    if levels.len() < MIN_FRAMES {
        return None;
    }
    levels.sort_by(|a, b| a.total_cmp(b));
    let at = |fraction: f32| levels[((levels.len() - 1) as f32 * fraction).round() as usize];
    let peak = samples.iter().fold(0.0f32, |max, s| max.max(s.abs()));
    Some(LevelProfile {
        speech_dbfs: at(0.9),
        noise_dbfs: at(0.1),
        peak,
    })
}

/// Le gain qui amène la voix au niveau visé, sans jamais saturer.
///
/// Jamais inférieur à 1 : une voix forte n'est pas un problème à corriger, et
/// l'atténuer ferait perdre du détail pour rien.
pub fn recommended_gain(profile: &LevelProfile) -> f32 {
    let wanted = 10f32.powf((TARGET_SPEECH_DBFS - profile.speech_dbfs) / 20.0);
    let headroom = if profile.peak > 0.0 {
        PEAK_CEILING / profile.peak
    } else {
        MAX_GAIN
    };
    wanted.min(headroom).clamp(1.0, MAX_GAIN)
}

/// La voix ressort-elle assez du fond pour qu'une dictée soit fiable ?
///
/// Un gain monte la voix **et** le bruit : il ne change pas cet écart. S'il
/// est trop faible, il faut rapprocher le micro ou changer de place — et c'est
/// ce qu'il faut dire à l'élève.
pub fn voice_stands_out(profile: &LevelProfile) -> bool {
    profile.speech_dbfs - profile.noise_dbfs >= MIN_SPEECH_OVER_NOISE_DB
}

/// Applique un gain, en écrêtant à la pleine échelle.
pub fn apply_gain(samples: &mut [f32], gain: f32) {
    for sample in samples.iter_mut() {
        *sample = (*sample * gain).clamp(-1.0, 1.0);
    }
}

/// Un mot lu, et ce que le moteur a écrit à sa place.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HeardAs {
    /// La forme lue, telle qu'elle doit être écrite.
    pub expected: String,
    /// Ce que le moteur a transcrit.
    pub heard: String,
}

/// Retire la ponctuation qui entoure un mot, en gardant celle qu'il contient
/// (« d'Aéro » garde son apostrophe).
fn trim_word(word: &str) -> &str {
    word.trim_matches(|c: char| !c.is_alphanumeric())
}

/// Forme de comparaison : sans ponctuation autour, sans casse. Les accents
/// restent : « aero » pour « Aéro » est justement une erreur à apprendre.
fn comparable(word: &str) -> String {
    trim_word(word).to_lowercase()
}

fn words(text: &str) -> Vec<&str> {
    text.split_whitespace()
        .map(trim_word)
        .filter(|w| !w.is_empty())
        .collect()
}

/// Une position de l'alignement : le mot lu et le mot entendu consommés
/// (l'un des deux peut manquer), et s'ils concordent.
struct Aligned {
    read: Option<usize>,
    got: Option<usize>,
    same: bool,
}

/// Aligne deux suites de mots par distance d'édition.
fn align(read: &[String], got: &[String]) -> Vec<Aligned> {
    let (n, m) = (read.len(), got.len());
    let mut cost = vec![vec![0usize; m + 1]; n + 1];
    for (i, row) in cost.iter_mut().enumerate() {
        row[0] = i;
    }
    for (j, cell) in cost[0].iter_mut().enumerate() {
        *cell = j;
    }
    for i in 1..=n {
        for j in 1..=m {
            let substitution = cost[i - 1][j - 1] + usize::from(read[i - 1] != got[j - 1]);
            cost[i][j] = substitution.min(cost[i - 1][j] + 1).min(cost[i][j - 1] + 1);
        }
    }

    let mut path = Vec::with_capacity(n.max(m));
    let (mut i, mut j) = (n, m);
    while i > 0 || j > 0 {
        let diagonal = i > 0 && j > 0;
        if diagonal && read[i - 1] == got[j - 1] && cost[i][j] == cost[i - 1][j - 1] {
            path.push(Aligned {
                read: Some(i - 1),
                got: Some(j - 1),
                same: true,
            });
            i -= 1;
            j -= 1;
        } else if diagonal && cost[i][j] == cost[i - 1][j - 1] + 1 {
            path.push(Aligned {
                read: Some(i - 1),
                got: Some(j - 1),
                same: false,
            });
            i -= 1;
            j -= 1;
        } else if i > 0 && cost[i][j] == cost[i - 1][j] + 1 {
            path.push(Aligned {
                read: Some(i - 1),
                got: None,
                same: false,
            });
            i -= 1;
        } else {
            path.push(Aligned {
                read: None,
                got: Some(j - 1),
                same: false,
            });
            j -= 1;
        }
    }
    path.reverse();
    path
}

/// Les mots lus que le moteur a écrits autrement.
///
/// Les deux textes sont alignés mot à mot. Chaque suite d'écarts entre deux
/// mots identiques forme une paire lu → entendu. Ne sont **pas** retenus :
///
/// - un mot entendu mais pas lu (« euh ») : rien n'a été mal compris ;
/// - un mot lu mais pas entendu : le moteur n'a rien écrit à remplacer ;
/// - un écart de plus de trois mots : c'est une phrase ratée, et en tirer une
///   règle de remplacement abîmerait des dictées justes.
pub fn misheard_words(expected: &str, heard: &str) -> Vec<HeardAs> {
    let read = words(expected);
    let got = words(heard);
    let read_cmp: Vec<String> = read.iter().map(|w| comparable(w)).collect();
    let got_cmp: Vec<String> = got.iter().map(|w| comparable(w)).collect();

    let mut found = Vec::new();
    let mut span_read: Vec<usize> = Vec::new();
    let mut span_got: Vec<usize> = Vec::new();
    let mut close_span = |span_read: &mut Vec<usize>, span_got: &mut Vec<usize>| {
        if !span_read.is_empty()
            && !span_got.is_empty()
            && span_read.len() <= MAX_SPAN_WORDS
            && span_got.len() <= MAX_SPAN_WORDS
        {
            found.push(HeardAs {
                expected: span_read
                    .iter()
                    .map(|&k| read[k])
                    .collect::<Vec<_>>()
                    .join(" "),
                heard: span_got
                    .iter()
                    .map(|&k| got[k])
                    .collect::<Vec<_>>()
                    .join(" "),
            });
        }
        span_read.clear();
        span_got.clear();
    };
    for step in align(&read_cmp, &got_cmp) {
        if step.same {
            close_span(&mut span_read, &mut span_got);
            continue;
        }
        span_read.extend(step.read);
        span_got.extend(step.got);
    }
    close_span(&mut span_read, &mut span_got);
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    const RATE: usize = 16_000;

    /// Une sinusoïde d'amplitude donnée : un niveau connu d'avance.
    fn tone(amplitude: f32, seconds: f32) -> Vec<f32> {
        let n = (RATE as f32 * seconds) as usize;
        (0..n)
            .map(|i| {
                amplitude * (i as f32 * 2.0 * std::f32::consts::PI * 220.0 / RATE as f32).sin()
            })
            .collect()
    }

    /// Une phrase dite bas, entre deux silences légèrement bruités.
    fn quiet_speech_in_quiet_room() -> Vec<f32> {
        let mut samples = tone(0.001, 0.5);
        samples.extend(tone(0.02, 2.0));
        samples.extend(tone(0.001, 0.5));
        samples
    }

    fn heard(expected: &str, heard: &str) -> HeardAs {
        HeardAs {
            expected: expected.to_string(),
            heard: heard.to_string(),
        }
    }

    // --- Les mots mal entendus ---

    #[test]
    fn a_misheard_name_is_learned_with_the_spelling_that_was_read() {
        assert_eq!(
            misheard_words("Le théorème de Pythagore.", "le théorème de pita gore"),
            vec![heard("Pythagore", "pita gore")]
        );
    }

    #[test]
    fn a_missing_accent_is_a_difference_worth_learning() {
        assert_eq!(
            misheard_words("Les élèves d'Aéro 3", "les élèves d'aero 3"),
            vec![heard("d'Aéro", "d'aero")]
        );
    }

    #[test]
    fn case_and_punctuation_alone_teach_nothing() {
        assert!(misheard_words("Bonjour, la classe !", "bonjour la classe").is_empty());
    }

    #[test]
    fn a_hesitation_heard_but_not_read_teaches_nothing() {
        assert!(misheard_words("la dérivée de x", "la euh dérivée de x").is_empty());
    }

    #[test]
    fn a_word_not_heard_at_all_teaches_nothing() {
        // Rien à remplacer : le moteur n'a rien écrit à la place.
        assert!(misheard_words("la dérivée de x carré", "la dérivée de x").is_empty());
    }

    #[test]
    fn a_long_misalignment_is_not_taken_for_a_correction() {
        // Au-delà de trois mots, c'est une phrase ratée, pas un mot mal compris :
        // en tirer une règle de remplacement abîmerait des dictées justes.
        assert!(misheard_words(
            "la photosynthèse produit du dioxygène",
            "la vache mange de l'herbe verte le matin"
        )
        .is_empty());
    }

    // --- Ce qu'une correction de l'élève apprend ---
    //
    // L'élève corrige une dictée dans l'historique. Ce qu'il a corrigé est ce
    // que le moteur entend mal chez lui — mais une correction de style ou de
    // grammaire n'est pas une erreur d'écoute, et en tirer une règle de
    // remplacement abîmerait des dictées justes.

    #[test]
    fn a_corrected_course_term_is_learned() {
        assert_eq!(
            corrected_terms(
                "le théorème de pita gore relie les côtés",
                "le théorème de Pythagore relie les côtés"
            ),
            vec![heard("Pythagore", "pita gore")]
        );
    }

    #[test]
    fn a_corrected_acronym_or_name_is_learned_even_if_only_the_case_changed() {
        assert_eq!(
            corrected_terms(
                "je transmets le dossier à l'ipsa pour madame baratto",
                "je transmets le dossier à l'IPSA pour madame Baratto"
            ),
            vec![heard("l'IPSA", "l'ipsa"), heard("Baratto", "baratto")]
        );
    }

    #[test]
    fn a_capital_at_the_start_of_a_sentence_is_not_a_term() {
        assert!(corrected_terms(
            "le cours commence. demain on revoit tout",
            "Le cours commence. Demain on revoit tout"
        )
        .is_empty());
    }

    #[test]
    fn a_common_word_corrected_is_never_learned() {
        // « court » → « cours » en règle réécrirait chaque « court » dicté.
        assert!(corrected_terms("le court de maths", "le cours de maths").is_empty());
    }

    #[test]
    fn a_rewritten_sentence_is_not_a_correction_of_listening() {
        // Une erreur d'écoute ressemble à ce qui a été dit (« pita gore » /
        // « Pythagore ») ; une phrase réécrite, non.
        assert!(corrected_terms(
            "on va voir la loi de newton aujourd'hui",
            "aujourd'hui nous étudierons la seconde loi de newton en détail"
        )
        .is_empty());
    }

    // --- Le niveau ---

    #[test]
    fn a_too_short_recording_gives_no_profile() {
        assert!(level_profile(&tone(0.1, 0.05)).is_none());
    }

    #[test]
    fn speech_and_background_are_told_apart() {
        let profile = level_profile(&quiet_speech_in_quiet_room()).expect("profil");
        assert!(
            profile.speech_dbfs > profile.noise_dbfs + 20.0,
            "{profile:?}"
        );
    }

    #[test]
    fn a_quiet_voice_is_raised_without_clipping() {
        let profile = level_profile(&quiet_speech_in_quiet_room()).expect("profil");
        let gain = recommended_gain(&profile);
        assert!(gain > 1.0, "{gain}");
        assert!(profile.peak * gain <= 0.95, "{gain} × {}", profile.peak);
    }

    #[test]
    fn the_gain_is_bounded_and_never_lowers_a_voice() {
        let silent_like = LevelProfile {
            speech_dbfs: -90.0,
            noise_dbfs: -95.0,
            peak: 0.0,
        };
        assert_eq!(recommended_gain(&silent_like), MAX_GAIN);

        let loud = LevelProfile {
            speech_dbfs: -6.0,
            noise_dbfs: -50.0,
            peak: 0.9,
        };
        assert_eq!(recommended_gain(&loud), 1.0);
    }

    #[test]
    fn a_voice_lost_in_the_noise_is_reported() {
        let noisy = LevelProfile {
            speech_dbfs: -30.0,
            noise_dbfs: -34.0,
            peak: 0.1,
        };
        assert!(!voice_stands_out(&noisy));
        let clear = LevelProfile {
            speech_dbfs: -25.0,
            noise_dbfs: -55.0,
            peak: 0.2,
        };
        assert!(voice_stands_out(&clear));
    }

    #[test]
    fn applying_the_gain_never_exceeds_full_scale() {
        let mut samples = vec![0.5, -0.5, 0.05];
        apply_gain(&mut samples, 4.0);
        assert_eq!(samples, vec![1.0, -1.0, 0.2]);
    }
}
