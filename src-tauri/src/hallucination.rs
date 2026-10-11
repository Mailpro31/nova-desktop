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

/// Vrai si la transcription n'est faite que de crédits de sous-titres ou
/// d'hésitations : rien de ce que l'élève a dit.
pub fn is_invented(text: &str) -> bool {
    let words = fold(text);
    if words.is_empty() {
        return false;
    }
    if words.split(' ').all(|word| HESITATIONS.contains(&word)) {
        return true;
    }
    SUBTITLE_CREDITS.replace_all(&words, " ").trim().is_empty()
}

#[cfg(test)]
mod tests {
    use super::is_invented;

    #[test]
    fn credits_and_hesitations_written_on_silence_are_invented() {
        for heard in [
            "Sous-titrage Société Radio-Canada",
            "Sous-titres réalisés par la communauté d'Amara.org",
            "Sous-titrage ST' 501",
            "Merci d'avoir regardé cette vidéo !",
            "Euh...",
            "Hum, euh.",
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
            "",
        ] {
            assert!(!is_invented(said), "{said}");
        }
    }
}
