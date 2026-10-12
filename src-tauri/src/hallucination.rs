//! Ce qu'un moteur de transcription écrit alors que personne n'a parlé.
//!
//! Le serveur de l'établissement a ses propres filtres (`dictation_unclear`
//! dans nova-server). Le moteur local du poste, qui transcrit quand le serveur
//! ne répond pas, n'en avait aucun : banc du RTX du 11/10, Cohere Transcribe
//! (le repli local d'un élève francophone) écrit « Sous-titrage Société
//! Radio-Canada » sur 2 s de silence, un souffle, un bruit blanc ou un
//! brouhaha. Ce texte ne doit jamais être collé.

use once_cell::sync::Lazy;
use regex::Regex;

/// Les mêmes crédits que `SUBTITLE_CREDITS` côté serveur, comparés en mots,
/// sans accents ni ponctuation.
static SUBTITLE_CREDITS: Lazy<Regex> = Lazy::new(|| {
    Regex::new(concat!(
        r"\b(?:sous titres? (?:realises? )?(?:par )?(?:la communaute )?(?:d )?(?:l )?amara org",
        r"|sous titrage st(?: \d+)?",
        r"|sous titrage societe radio canada",
        r"|merci d avoir regarde cette video",
        r"|subtitles by the amara org community",
        r"|thanks for watching)\b",
    ))
    .expect("subtitle credits pattern")
});

/// Les hésitations seules, que le serveur rend vides (`only_hesitations`).
const HESITATIONS: &[&str] = &[
    "euh", "heu", "hum", "hm", "hmm", "mm", "mmh", "mhm", "uh", "um",
];

/// Une syllabe d'une ou deux lettres répétée au moins trois fois, seule :
/// « Lalalala. » écrit par turbo (transcribe.cpp) sur un « euh » (banc du RTX
/// sur la carte, 11/10). Le moteur de regex de Rust n'a pas de références
/// arrière : la répétition se vérifie à la main. Un nombre n'en est pas une :
/// « 111 » ou « 2222 », une réponse d'exercice, étaient jetés.
fn repeated_syllable(word: &str) -> bool {
    let letters: Vec<char> = word.chars().collect();
    if !letters.iter().all(|c| c.is_alphabetic()) {
        return false;
    }
    (1..=2).any(|size| {
        letters.len() >= size * 3
            && letters.len().is_multiple_of(size)
            && letters.chunks(size).all(|chunk| chunk == &letters[..size])
    })
}

fn fold(text: &str) -> String {
    let lowered = text.to_lowercase();
    let mut words = String::with_capacity(lowered.len());
    for c in lowered.chars() {
        let base = match c {
            'à' | 'â' | 'ä' | 'á' => 'a',
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'î' | 'ï' | 'í' => 'i',
            'ô' | 'ö' | 'ó' => 'o',
            'ù' | 'û' | 'ü' | 'ú' => 'u',
            'ç' => 'c',
            'œ' => 'o',
            other => other,
        };
        words.push(if base.is_alphanumeric() { base } else { ' ' });
    }
    words.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Sous ce niveau, au moment le plus fort de la dictée, personne n'a parlé :
/// le même seuil que la porte de silence du serveur (nova-server #107). Les
/// dictées de Sash culminent entre −21,5 et −12,9 dBFS.
const SILENT_PEAK_DBFS: f32 = -58.0;
/// Le niveau se mesure par tranches de 30 ms à 16 kHz.
const LEVEL_WINDOW: usize = 480;

/// Vrai si l'enregistrement est presque muet : rien ne doit en sortir.
///
/// Banc du RTX (11/10) : sur 6 s de silence numérique, Cohere Transcribe (le
/// repli local d'un élève francophone) écrit « Le but est de ne pas avoir de
/// mal à l'aise. », une phrase qu'aucun filtre de texte ne reconnaît.
pub fn is_silent(samples: &[f32]) -> bool {
    if samples.is_empty() {
        return false;
    }
    let loudest = samples
        .chunks(LEVEL_WINDOW)
        .map(|window| window.iter().map(|s| s * s).sum::<f32>() / window.len() as f32)
        .fold(0.0_f32, f32::max);
    let threshold = 10_f32.powf(SILENT_PEAK_DBFS / 20.0);
    loudest.sqrt() < threshold
}

/// Vrai si la transcription n'est faite que de crédits de sous-titres ou
/// d'hésitations : rien de ce que l'élève a dit.
pub fn is_invented(text: &str) -> bool {
    let words = fold(text);
    if words.is_empty() {
        return false;
    }
    if words
        .split(' ')
        .all(|word| HESITATIONS.contains(&word) || repeated_syllable(word))
    {
        return true;
    }
    SUBTITLE_CREDITS.replace_all(&words, " ").trim().is_empty()
}

#[cfg(test)]
mod tests {
    use super::{is_invented, is_silent};

    fn tone(dbfs: f32, seconds: f32) -> Vec<f32> {
        let amplitude = 2_f32.sqrt() * 10_f32.powf(dbfs / 20.0);
        (0..(16_000.0 * seconds) as usize)
            .map(|i| amplitude * (2.0 * std::f32::consts::PI * 440.0 * i as f32 / 16_000.0).sin())
            .collect()
    }

    #[test]
    fn a_silent_recording_is_recognised() {
        assert!(is_silent(&vec![0.0; 96_000]));
        assert!(is_silent(&tone(-70.0, 1.0)));
        // Une voix basse, en classe, reste bien au-dessus.
        assert!(!is_silent(&tone(-45.0, 1.0)));
        // Un seul moment parlé suffit.
        let mut mostly_silent = vec![0.0; 48_000];
        mostly_silent.extend(tone(-30.0, 0.1));
        assert!(!is_silent(&mostly_silent));
        assert!(!is_silent(&[]));
    }

    #[test]
    fn credits_and_hesitations_written_on_silence_are_invented() {
        for heard in [
            "Sous-titrage Société Radio-Canada",
            "Sous-titres réalisés par la communauté d'Amara.org",
            "Sous-titrage ST' 501",
            "Merci d'avoir regardé cette vidéo !",
            "Euh...",
            "Hum, euh.",
            "Lalalala.",
            "nanana",
        ] {
            assert!(is_invented(heard), "{heard}");
        }
    }

    #[test]
    fn real_dictations_that_mention_these_words_are_kept() {
        for said in [
            "Les sous-titres de la vidéo sont en anglais.",
            "Euh, la portance augmente avec l'incidence.",
            "Merci pour le corrigé du TD.",
            "Papa arrive.",
            "ananas",
            "111",
            "2222.",
            "121212",
            "1 + 1 = 2",
            "",
        ] {
            assert!(!is_invented(said), "{said}");
        }
    }
}
