//! Repères d'étude et mise en page dictés.
//!
//! Pendant le cours, l'élève marque ce qu'il dicte : « Important, la dérivée
//! d'une constante est nulle » devient « ⚠ Important : la dérivée d'une
//! constante est nulle ». « À la ligne » et « nouveau paragraphe » passent à
//! la ligne au lieu d'être écrits en toutes lettres.
//!
//! Tout est fait par des règles fixes, avant et après le modèle : rien n'est
//! inventé, le résultat est le même hors ligne, et aucune phrase dictée ne
//! déclenche d'action. Le texte seul change.
//!
//! Les déclencheurs sont prudents :
//! - un repère ne compte qu'en tout début de dictée, suivi d'une ponctuation
//!   ou de rien (« important de noter que… » reste du contenu) ;
//! - « à la ligne » et « nouveau paragraphe » ne comptent que dits seuls,
//!   entre deux ponctuations (« la ligne d'arrivée » ne bouge pas) ;
//! - « point à la ligne », qui n'est jamais du contenu, compte partout.

use once_cell::sync::Lazy;
use regex::{Captures, Regex};

/// Un repère d'étude posé en tête de la dictée.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StudyMarker {
    /// Ce qui s'affiche dans la note, par exemple « ⚠ Important ».
    pub label: &'static str,
    /// Le séparateur avant le contenu : « : » en français, « : » serré en anglais.
    separator: &'static str,
}

const FR: &str = " : ";
const EN: &str = ": ";

/// `(déclencheur, repère, séparateur)`. Le déclencheur le plus long l'emporte.
const MARKERS: &[(&str, &str, &str)] = &[
    ("important", "⚠ Important", FR),
    ("très important", "⚠ Important", FR),
    ("c'est important", "⚠ Important", FR),
    ("à revoir", "🔁 À revoir", FR),
    ("a revoir", "🔁 À revoir", FR),
    ("à retravailler", "🔁 À revoir", FR),
    ("to review", "🔁 To review", EN),
    ("question", "❓ Question", FR),
    ("question pour le prof", "❓ Question", FR),
    ("question pour le professeur", "❓ Question", FR),
    ("question au prof", "❓ Question", FR),
    ("définition", "📘 Définition", FR),
    ("definition", "📘 Definition", EN),
    ("j'ai décroché", "⏸ J'ai décroché", FR),
    ("j'ai perdu le fil", "⏸ J'ai décroché", FR),
    ("i lost track", "⏸ I lost track", EN),
    ("schéma à reprendre", "✏ Schéma à reprendre", FR),
    ("schéma au tableau", "✏ Schéma à reprendre", FR),
    ("diagram to redo", "✏ Diagram to redo", EN),
];

/// La dictée prête pour le Style : son repère éventuel, mis de côté, et le
/// contenu, mise en page appliquée.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreparedDictation {
    pub marker: Option<StudyMarker>,
    pub body: String,
}

impl PreparedDictation {
    /// Remet le repère devant le texte que le Style a rendu.
    pub fn finish(&self, text: &str) -> String {
        match self.marker {
            Some(marker) => marker.wrap(text),
            None => text.to_string(),
        }
    }
}

impl StudyMarker {
    /// Le repère, suivi du contenu s'il y en a un.
    pub fn wrap(&self, text: &str) -> String {
        let text = text.trim();
        if text.is_empty() {
            self.label.to_string()
        } else {
            format!("{}{}{}", self.label, self.separator, text)
        }
    }
}

/// Met le repère de côté, puis applique la mise en page dictée au contenu.
pub fn prepare(text: &str) -> PreparedDictation {
    let (marker, body) = match split_study_marker(text) {
        Some((marker, body)) => (Some(marker), body),
        None => (None, text.to_string()),
    };
    PreparedDictation {
        marker,
        body: apply_layout_commands(&body),
    }
}

/// Le repère dit en tête de dictée, et le reste. `None` si la dictée ne
/// commence pas par un repère suivi d'une ponctuation ou de rien.
pub fn split_study_marker(text: &str) -> Option<(StudyMarker, String)> {
    let start = text.len() - text.trim_start().len();
    let rest = &text[start..];
    let (marker, after) = MARKERS
        .iter()
        .filter_map(|(trigger, label, separator)| {
            let end = trigger_end(rest, trigger)?;
            Some((
                trigger.chars().count(),
                StudyMarker { label, separator },
                &rest[end..],
            ))
        })
        .max_by_key(|(length, _, _)| *length)
        .map(|(_, marker, after)| (marker, after))?;
    Some((marker, capitalize_first(after.trim())))
}

/// Fin du déclencheur dans `rest`, ponctuation qui le suit comprise, ou
/// `None` s'il n'est pas là, ou s'il continue une phrase.
fn trigger_end(rest: &str, trigger: &str) -> Option<usize> {
    let mut chars = rest.char_indices();
    let mut end = 0;
    for expected in trigger.chars() {
        let (index, found) = chars.next()?;
        if !same_letter(found, expected) {
            return None;
        }
        end = index + found.len_utf8();
    }
    let after = &rest[end..];
    let spaced = after.trim_start();
    if spaced.is_empty() {
        return Some(rest.len());
    }
    let punctuation: usize = spaced
        .chars()
        .take_while(|c| MARKER_PUNCTUATION.contains(*c))
        .map(char::len_utf8)
        .sum();
    if punctuation == 0 {
        // Un mot suit sans pause : « question de cours », « important de noter ».
        return None;
    }
    Some(rest.len() - spaced.len() + punctuation)
}

const MARKER_PUNCTUATION: &str = ".,;:!?…-–—";

fn same_letter(found: char, expected: char) -> bool {
    let normalize = |c: char| if c == '’' { '\'' } else { c };
    normalize(found)
        .to_lowercase()
        .eq(normalize(expected).to_lowercase())
}

fn capitalize_first(text: &str) -> String {
    let mut chars = text.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().chain(chars).collect(),
        None => String::new(),
    }
}

/// « point à la ligne », partout : on ne le dit jamais pour dire autre chose.
static FULL_STOP_NEW_LINE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?iu)[ \t]*[.,;:]?[ \t]*\bpoint[ \t]+(?:à|a)[ \t]+la[ \t]+ligne\b[ \t]*[.,;:!?…]*[ \t]*",
    )
    .expect("full stop new line pattern")
});

/// « à la ligne », « nouveau paragraphe » : seulement dits seuls, entre le
/// début de la dictée ou une ponctuation, et une ponctuation ou la fin.
static NEW_LINE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?iu)(^|[.,;:!?…\n])[ \t]*(retour[ \t]+(?:à|a)[ \t]+la[ \t]+ligne|(?:à|a)[ \t]+la[ \t]+ligne|nouvelle[ \t]+ligne|nouveau[ \t]+paragraphe|new[ \t]+paragraph|new[ \t]+line)[ \t]*(?:[.,;:!?…]+[ \t]*|$)",
    )
    .expect("new line pattern")
});

static LINE_START: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"[ \t]*\n[ \t]*(\p{Ll})?").expect("line start pattern"));

static EXTRA_BLANK_LINES: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\n{3,}").expect("blank lines pattern"));

/// Les retours à la ligne dictés, appliqués. Le texte est rendu tel quel s'il
/// n'en contient aucun.
pub fn apply_layout_commands(text: &str) -> String {
    let mut with_lines = FULL_STOP_NEW_LINE.replace_all(text, ".\n").into_owned();
    // Une commande consomme la ponctuation qui la suit : la suivante, dite
    // juste après, n'est reconnue qu'au tour d'après.
    for _ in 0..8 {
        let next = NEW_LINE.replace_all(&with_lines, new_line).into_owned();
        if next == with_lines {
            break;
        }
        with_lines = next;
    }
    if with_lines == text {
        return text.to_string();
    }
    let tidy = LINE_START.replace_all(&with_lines, |caps: &Captures| match caps.get(1) {
        Some(letter) => format!("\n{}", letter.as_str().to_uppercase()),
        None => "\n".to_string(),
    });
    EXTRA_BLANK_LINES
        .replace_all(&tidy, "\n\n")
        .trim()
        .to_string()
}

fn new_line(caps: &Captures) -> String {
    // Une virgule devant un retour à la ligne n'a plus de sens ; un point, si.
    let before = match &caps[1] {
        "," | ";" | ":" => "",
        other => other,
    };
    let breaks = if caps[2].to_lowercase().contains("paragraph") {
        "\n\n"
    } else {
        "\n"
    };
    format!("{before}{breaks}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn marked(text: &str) -> Option<(&'static str, String)> {
        split_study_marker(text).map(|(marker, body)| (marker.label, body))
    }

    #[test]
    fn a_marker_said_first_and_followed_by_a_pause_is_set_apart() {
        assert_eq!(
            marked("Important, la dérivée d'une constante est nulle."),
            Some((
                "⚠ Important",
                "La dérivée d'une constante est nulle.".into()
            ))
        );
        assert_eq!(
            marked("À revoir. Le théorème de Thalès"),
            Some(("🔁 À revoir", "Le théorème de Thalès".into()))
        );
        assert_eq!(
            marked("Définition : la viscosité est la résistance d'un fluide."),
            Some((
                "📘 Définition",
                "La viscosité est la résistance d'un fluide.".into()
            ))
        );
    }

    #[test]
    fn the_longest_trigger_wins() {
        assert_eq!(
            marked("Question pour le prof, pourquoi le signe change ?"),
            Some(("❓ Question", "Pourquoi le signe change ?".into()))
        );
        assert_eq!(
            marked("C’est important : rendre le TP vendredi."),
            Some(("⚠ Important", "Rendre le TP vendredi.".into()))
        );
    }

    #[test]
    fn a_marker_alone_is_a_marker_without_content() {
        assert_eq!(
            marked("J'ai décroché."),
            Some(("⏸ J'ai décroché", "".into()))
        );
        assert_eq!(
            marked("  schéma à reprendre  "),
            Some(("✏ Schéma à reprendre", "".into()))
        );
    }

    #[test]
    fn a_marker_word_inside_a_sentence_stays_content() {
        assert_eq!(marked("Important de noter que la masse se conserve."), None);
        assert_eq!(marked("Question de cours sur les intégrales."), None);
        assert_eq!(marked("C'est un point important, à revoir."), None);
        assert_eq!(marked("Importante, cette remarque."), None);
        assert_eq!(marked("La question, c'est la limite."), None);
    }

    #[test]
    fn the_marker_goes_back_in_front_of_the_styled_text() {
        let prepared = prepare("Important, la dérivée d'une constante est nulle.");
        assert_eq!(prepared.body, "La dérivée d'une constante est nulle.");
        assert_eq!(
            prepared.finish("La dérivée d'une constante est nulle."),
            "⚠ Important : la dérivée d'une constante est nulle."
                .replace("⚠ Important : l", "⚠ Important : L")
        );
        assert_eq!(prepare("I lost track.").finish(""), "⏸ I lost track");
        assert_eq!(
            prepare("To review, the chain rule").finish("The chain rule."),
            "🔁 To review: The chain rule."
        );
    }

    #[test]
    fn a_dictation_without_a_marker_is_unchanged() {
        let prepared = prepare("La masse se conserve.");
        assert_eq!(prepared.marker, None);
        assert_eq!(
            prepared.finish("La masse se conserve."),
            "La masse se conserve."
        );
    }

    #[test]
    fn a_new_line_said_alone_breaks_the_line() {
        assert_eq!(
            apply_layout_commands("Premier point. À la ligne. Deuxième point."),
            "Premier point.\nDeuxième point."
        );
        assert_eq!(
            apply_layout_commands("premier point, à la ligne, deuxième point"),
            "premier point\nDeuxième point"
        );
        assert_eq!(
            apply_layout_commands("Fin de la partie. Nouveau paragraphe. La suite."),
            "Fin de la partie.\n\nLa suite."
        );
        assert_eq!(
            apply_layout_commands("First item. New line. Second item."),
            "First item.\nSecond item."
        );
    }

    #[test]
    fn a_full_stop_new_line_works_anywhere() {
        assert_eq!(
            apply_layout_commands("la masse se conserve point à la ligne l'énergie aussi"),
            "la masse se conserve.\nL'énergie aussi"
        );
        // « point, à la ligne » : Whisper a écrit le mot « point », pas la
        // commande ; seul « à la ligne » compte.
        assert_eq!(
            apply_layout_commands("On marque un point, à la ligne, puis on recommence."),
            "On marque un point\nPuis on recommence."
        );
    }

    #[test]
    fn line_words_used_as_content_are_left_alone() {
        for text in [
            "Le coureur franchit la ligne d'arrivée.",
            "À la ligne trois du tableau, on lit 12.",
            "Le nouveau paragraphe du règlement entre en vigueur.",
            "Il faut aller à la ligne suivante du code.",
            "Le point de départ est à la ligne de base.",
        ] {
            assert_eq!(apply_layout_commands(text), text);
        }
    }

    #[test]
    fn repeated_commands_never_leave_more_than_one_blank_line() {
        assert_eq!(
            apply_layout_commands("Titre. Nouveau paragraphe. Nouveau paragraphe. Texte."),
            "Titre.\n\nTexte."
        );
    }

    #[test]
    fn marked_and_laid_out_text_is_stable_when_prepared_again() {
        let once = prepare("Important. Premier point. À la ligne. Deuxième point.");
        let pasted = once.finish(&once.body);
        let again = prepare(&pasted);
        assert_eq!(again.marker, None);
        assert_eq!(again.body, pasted);
    }
}
