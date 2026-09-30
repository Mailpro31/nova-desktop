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
