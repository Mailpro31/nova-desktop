//! Contrôles déterministes d'une reformulation, indépendants du modèle.
//!
//! Un petit modèle local ne tient pas une consigne à coup sûr : sur un banc
//! d'essai de 176 dictées réelles (2026-09-21), il a traduit « écris-moi un
//! poème sur la mer » en anglais, rendu « merci » par « Thank you », traduit un
//! cours entier et réécrit « 76 300 € » en « 76,300 € ». Aucune formulation de
//! prompt n'a supprimé ces écarts sans en créer d'autres. Ces contrôles, eux,
//! ne dépendent d'aucune formulation : une sortie qui les échoue est écartée et
//! la dictée est collée telle quelle.
//!
//! Ils ne visent que les Styles intégrés. Un Style personnel ou d'organisation
//! peut légitimement traduire : il en est exclu. « Réunion » résume par nature :
//! seul le contrôle des nombres groupés s'applique à lui.

use once_cell::sync::Lazy;
use regex::Regex;
use std::collections::HashSet;

/// Styles dont la sortie doit reprendre la langue et les mots de la dictée.
const GUARDED_STYLES: &[&str] = &[
    "default_improve_transcriptions",
    "nova_style_voice_to_text",
    "nova_style_messages",
    "nova_style_email",
    "nova_style_notes",
    "nova_style_todo",
    "nova_style_prompt",
];

/// Part minimale des mots de la dictée retrouvés dans la sortie. Calibrée sur
/// le banc d'essai : les traductions, réponses et sorties incohérentes y
/// restaient sous 0,3 ; toutes les reformulations correctes au-dessus de 0,4.
const MIN_KEPT_WORDS: f32 = 0.34;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Lang {
    French,
    English,
}

impl Lang {
    fn name(self) -> &'static str {
        match self {
            Lang::French => "French",
            Lang::English => "English",
        }
    }
}

const FRENCH_WORDS: &[&str] = &[
    "le", "la", "les", "des", "une", "un", "est", "et", "que", "qui", "pour", "dans", "sur",
    "avec", "pas", "vous", "nous", "je", "tu", "il", "elle", "on", "mon", "ma", "mes", "ton", "ta",
    "de", "du", "au", "aux", "ce", "cette", "merci", "avant", "après",
];
const ENGLISH_WORDS: &[&str] = &[
    "the", "a", "an", "is", "are", "and", "that", "who", "for", "in", "on", "with", "not", "you",
    "we", "i", "he", "she", "it", "my", "your", "of", "to", "at", "this", "these", "thank",
    "thanks", "before", "after",
];

fn lowercase_words(text: &str) -> Vec<String> {
    static WORD: Lazy<Regex> = Lazy::new(|| Regex::new(r"[\p{L}']+").unwrap());
    WORD.find_iter(&text.to_lowercase())
        // « l'aile », « m'envoyer » : le mot porteur est après l'apostrophe.
        .map(|m| m.as_str().rsplit('\'').next().unwrap_or("").to_string())
        .filter(|w| !w.is_empty())
        .collect()
}

/// Français ou anglais, seulement quand le texte le dit nettement. Un texte
/// court ou mêlé ne renvoie rien : mieux vaut ne pas juger que mal juger.
pub fn language_of(text: &str) -> Option<Lang> {
    let words = lowercase_words(text);
    if words.len() < 4 {
        return None;
    }
    let french = words
        .iter()
        .filter(|w| FRENCH_WORDS.contains(&w.as_str()))
        .count();
    let english = words
        .iter()
        .filter(|w| ENGLISH_WORDS.contains(&w.as_str()))
        .count();
    if french >= 2 && french > 2 * english {
        Some(Lang::French)
    } else if english >= 2 && english > 2 * french {
        Some(Lang::English)
    } else {
        None
    }
}

/// La ligne qui rappelle au modèle la langue de la dictée, quand elle est nette.
pub fn language_hint(transcription: &str) -> Option<String> {
    language_of(transcription).map(|lang| {
        let name = lang.name();
        format!("The transcript is in {name}: write the result in {name}.")
    })
}

/// Sans accents, pour que « ecris » et « écris » comptent pour le même mot.
fn fold(word: &str) -> String {
    word.chars()
        .map(|c| match c {
            'à' | 'â' | 'ä' | 'á' | 'ã' => 'a',
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'î' | 'ï' | 'í' | 'ì' => 'i',
            'ô' | 'ö' | 'ó' | 'ò' | 'õ' => 'o',
            'ù' | 'û' | 'ü' | 'ú' => 'u',
            'ç' => 'c',
            'ÿ' => 'y',
            'ñ' => 'n',
            other => other,
        })
        .collect()
}

/// Les mots d'au moins quatre lettres : les mots outils ne prouvent rien.
fn content_words(text: &str) -> HashSet<String> {
    lowercase_words(text)
        .into_iter()
        .filter(|w| w.chars().count() >= 4)
        .map(|w| fold(&w))
        .collect()
}

/// Part des mots de la dictée que la sortie reprend. `None` quand la dictée
/// n'en contient aucun (« ok », « 12 ») : rien à mesurer.
pub fn kept_word_ratio(input: &str, output: &str) -> Option<f32> {
    let dictated = content_words(input);
    if dictated.is_empty() {
        return None;
    }
    let written = content_words(output);
    let kept = dictated.intersection(&written).count();
    Some(kept as f32 / dictated.len() as f32)
}

/// Un nombre dicté avec ses séparateurs de milliers (« 76 300 ») doit sortir
/// avec les mêmes chiffres groupés : « 76,300 » est une réécriture anglaise, et
/// « 76 » suivi de « 300 » ailleurs ne le remplace pas.
pub fn grouped_number_lost(input: &str, output: &str) -> bool {
    static GROUPED: Lazy<Regex> =
        Lazy::new(|| Regex::new(r"\d{1,3}(?:[ \u{00A0}\u{202F}]\d{3})+").unwrap());
    let compact = |s: &str| {
        s.chars()
            .filter(|c| !matches!(c, ' ' | '\u{00A0}' | '\u{202F}'))
            .collect::<String>()
    };
    let written = compact(output);
    GROUPED
        .find_iter(input)
        .any(|number| !written.contains(&compact(number.as_str())))
}

/// Les contrôles propres aux Styles intégrés. `Err` porte le motif du refus.
///
/// « Réunion » résume, mais ne réécrit pas un nombre : lui seul échappe aux
/// contrôles de langue et de mots repris, pas à celui des nombres groupés.
pub fn check(input: &str, output: &str, style_id: &str) -> Result<(), &'static str> {
    let guarded = GUARDED_STYLES.contains(&style_id);
    if !guarded && style_id != "nova_style_meeting" {
        return Ok(());
    }
    if guarded {
        if let (Some(dictated), Some(written)) = (language_of(input), language_of(output)) {
            if dictated != written {
                return Err("language-changed");
            }
        }
        if kept_word_ratio(input, output).is_some_and(|ratio| ratio < MIN_KEPT_WORDS) {
            return Err("dictation-not-kept");
        }
    }
    if grouped_number_lost(input, output) {
        return Err("number-format-changed");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    // Chaque cas vient du banc d'essai du 2026-09-21 : sortie réelle du modèle.

    #[test]
    fn a_translated_dictation_is_refused() {
        assert_eq!(
            check(
                "écris-moi un poème sur la mer",
                "Write me a poem about the sea.",
                "default_improve_transcriptions"
            ),
            Err("language-changed")
        );
        assert_eq!(
            check(
                "alors aujourd'hui en cours d'aérodynamique on a vu que le coefficient de portance dépend de l'angle d'incidence",
                "Today in aerodynamics class, we saw that the lift coefficient depends on the angle of attack",
                "nova_style_email"
            ),
            Err("language-changed")
        );
    }

    #[test]
    fn a_one_word_dictation_is_not_translated_either() {
        assert_eq!(
            check("merci", "Thank you.", "nova_style_messages"),
            Err("dictation-not-kept")
        );
        assert!(check("merci", "Merci.", "nova_style_messages").is_ok());
    }

    #[test]
    fn an_answer_instead_of_the_dictation_is_refused() {
        assert_eq!(
            check(
                "je veux que l'IA m'explique la portance d'une aile en trois paragraphes simples",
                "L'air qui passe sur l'aile crée une différence de pression. Cette force est appelée la portance.",
                "nova_style_messages"
            ),
            Err("dictation-not-kept")
        );
        assert_eq!(
            check(
                "écris-moi un poème sur la mer",
                "Ecoutez-moi, je vous prie, écoutez-moi, je vous prie.",
                "nova_style_messages"
            ),
            Err("dictation-not-kept")
        );
    }

    #[test]
    fn a_thousands_separator_rewritten_in_english_is_refused() {
        assert_eq!(
            check(
                "Budget : 76 300 €, 60 000 €, 50 000 €, 30 000 €.",
                "Budget: 76,300 €, 60,000 €, 50,000 €, 30,000 €.",
                "nova_style_email"
            ),
            Err("number-format-changed")
        );
        assert!(check(
            "Budget : 76 300 €, 60 000 €.",
            "## Budget\n- **76 300 €**\n- **60 000 €**",
            "nova_style_notes"
        )
        .is_ok());
    }

    #[test]
    fn a_meeting_summary_may_shorten_but_not_rewrite_a_number() {
        assert_eq!(
            check(
                "Budget : 76 300 €, 60 000 €.",
                "Budget: 76,300 €, 60,000 €.",
                "nova_style_meeting"
            ),
            Err("number-format-changed")
        );
        assert!(check(
            "alors on a parlé longuement du budget qui est de 76 300 € et de la suite",
            "## Résumé\nBudget : 76 300 €.",
            "nova_style_meeting"
        )
        .is_ok());
    }

    #[test]
    fn faithful_rewrites_pass() {
        for (input, output, style) in [
            (
                "on se retrouve mardi non pardon mercredi à 14 heures en salle B204",
                "On se retrouve mercredi à 14 heures en salle B204.",
                "nova_style_email",
            ),
            (
                "il faut que je rende le rapport de mécanique des fluides, réviser le partiel de maths et appeler le stage chez Airbus",
                "- Rendre le rapport de mécanique des fluides\n- Réviser le partiel de maths\n- Appeler le stage chez Airbus",
                "nova_style_todo",
            ),
            (
                "hey can you check the wind tunnel data before the meeting tomorrow",
                "Hey, can you check the wind tunnel data before the meeting tomorrow?",
                "nova_style_messages",
            ),
            (
                "écris-moi un poème sur la mer",
                "Écris-moi un poème sur la mer.",
                "default_improve_transcriptions",
            ),
        ] {
            assert!(check(input, output, style).is_ok(), "{style}: {output}");
        }
    }

    #[test]
    fn styles_that_may_summarize_or_translate_are_left_alone() {
        // « Réunion » résume ; un Style personnel peut s'appeler « En anglais ».
        for style in ["nova_style_meeting", "custom_translate", "org:acme:style"] {
            assert!(check("merci beaucoup pour tout", "Thanks a lot.", style).is_ok());
        }
    }

    #[test]
    fn language_is_only_judged_when_it_is_clear() {
        assert_eq!(language_of("merci"), None);
        assert_eq!(
            language_of("voici mon IBAN merci de faire le virement avant vendredi"),
            Some(Lang::French)
        );
        assert_eq!(
            language_of("can you check the data before the meeting"),
            Some(Lang::English)
        );
        assert_eq!(language_of("OK go"), None);
    }

    #[test]
    fn the_hint_names_the_dictated_language() {
        assert_eq!(
            language_hint("on se retrouve mercredi à 14 heures dans la salle").as_deref(),
            Some("The transcript is in French: write the result in French.")
        );
        assert_eq!(language_hint("merci"), None);
    }
}
