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
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Un repère d'étude posé en tête de la dictée.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StudyMarker {
    /// Ce qui s'affiche dans la note, par exemple « ⚠ Important ».
    pub label: &'static str,
    /// Le séparateur avant le contenu : « : » en français, « : » serré en anglais.
    separator: &'static str,
    /// Les exemples et les exercices se suivent : « Exemple 1 », « Exemple 2 ».
    numbered: bool,
    /// Le numéro que l'élève a dit (« Exemple 3, … »), qui prime.
    number: Option<u32>,
}

const FR: &str = " : ";
const EN: &str = ": ";
const NUMBERED: bool = true;
const PLAIN: bool = false;

/// `(déclencheur, repère, séparateur, numéroté)`. Le déclencheur le plus long
/// l'emporte.
const MARKERS: &[(&str, &str, &str, bool)] = &[
    ("important", "⚠ Important", FR, PLAIN),
    ("très important", "⚠ Important", FR, PLAIN),
    ("c'est important", "⚠ Important", FR, PLAIN),
    ("à revoir", "🔁 À revoir", FR, PLAIN),
    ("a revoir", "🔁 À revoir", FR, PLAIN),
    ("à retravailler", "🔁 À revoir", FR, PLAIN),
    ("to review", "🔁 To review", EN, PLAIN),
    ("question", "❓ Question", FR, PLAIN),
    ("question pour le prof", "❓ Question", FR, PLAIN),
    ("question pour le professeur", "❓ Question", FR, PLAIN),
    ("question au prof", "❓ Question", FR, PLAIN),
    ("définition", "📘 Définition", FR, PLAIN),
    ("definition", "📘 Definition", EN, PLAIN),
    ("j'ai décroché", "⏸ J'ai décroché", FR, PLAIN),
    ("j'ai perdu le fil", "⏸ J'ai décroché", FR, PLAIN),
    ("i lost track", "⏸ I lost track", EN, PLAIN),
    ("schéma à reprendre", "✏ Schéma à reprendre", FR, PLAIN),
    ("schéma au tableau", "✏ Schéma à reprendre", FR, PLAIN),
    ("diagram to redo", "✏ Diagram to redo", EN, PLAIN),
    // Les blocs de cours.
    ("théorème", "📐 Théorème", FR, PLAIN),
    ("theorem", "📐 Theorem", EN, PLAIN),
    ("propriété", "📐 Propriété", FR, PLAIN),
    ("property", "📐 Property", EN, PLAIN),
    ("à retenir", "📌 À retenir", FR, PLAIN),
    ("a retenir", "📌 À retenir", FR, PLAIN),
    ("key point", "📌 Key point", EN, PLAIN),
    ("méthode", "🛠 Méthode", FR, PLAIN),
    ("method", "🛠 Method", EN, PLAIN),
    ("remarque", "💬 Remarque", FR, PLAIN),
    ("exemple", "🧪 Exemple", FR, NUMBERED),
    ("example", "🧪 Example", EN, NUMBERED),
    ("exercice", "✍ Exercice", FR, NUMBERED),
    ("exercise", "✍ Exercise", EN, NUMBERED),
];

/// La dictée prête pour le Style : son repère éventuel, mis de côté, et le
/// contenu, mise en page appliquée.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreparedDictation {
    pub marker: Option<StudyMarker>,
    pub body: String,
}

impl PreparedDictation {
    /// Remet le repère devant le texte que le Style a rendu. Un exemple ou un
    /// exercice prend le numéro suivant du cours en cours.
    pub fn finish(&self, text: &str) -> String {
        match self.marker {
            Some(marker) if marker.numbered => {
                let number = NUMBERING
                    .lock()
                    .map(|mut numbering| {
                        numbering.next(marker.label, marker.number, Instant::now())
                    })
                    .unwrap_or(1);
                marker.wrap_numbered(text, Some(number))
            }
            Some(marker) => marker.wrap(text),
            None => text.to_string(),
        }
    }
}

impl StudyMarker {
    /// Le repère, suivi du contenu s'il y en a un.
    pub fn wrap(&self, text: &str) -> String {
        self.wrap_numbered(text, self.number)
    }

    fn wrap_numbered(&self, text: &str, number: Option<u32>) -> String {
        let label = match number {
            Some(number) => format!("{} {number}", self.label),
            None => self.label.to_string(),
        };
        let text = text.trim();
        if text.is_empty() {
            label
        } else {
            format!("{label}{}{text}", self.separator)
        }
    }
}

/// Au-delà de deux heures sans nouveau bloc de la même sorte, c'est un autre
/// cours : la numérotation repart de 1.
const COURSE_GAP: Duration = Duration::from_secs(2 * 60 * 60);

/// Le dernier numéro donné à chaque sorte de bloc, et quand.
#[derive(Default)]
pub struct Numbering {
    last: HashMap<&'static str, (u32, Instant)>,
}

impl Numbering {
    /// Le numéro du bloc : celui que l'élève a dit, sinon le suivant du même
    /// cours, sinon 1.
    pub fn next(&mut self, label: &'static str, said: Option<u32>, now: Instant) -> u32 {
        let number = said.unwrap_or_else(|| match self.last.get(label) {
            Some((number, at)) if now.saturating_duration_since(*at) < COURSE_GAP => number + 1,
            _ => 1,
        });
        self.last.insert(label, (number, now));
        number
    }
}

static NUMBERING: Lazy<Mutex<Numbering>> = Lazy::new(|| Mutex::new(Numbering::default()));

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
        .filter_map(|(trigger, label, separator, numbered)| {
            let (end, number) = trigger_end(rest, trigger, *numbered)?;
            Some((
                trigger.chars().count(),
                StudyMarker {
                    label,
                    separator,
                    numbered: *numbered,
                    number,
                },
                &rest[end..],
            ))
        })
        .max_by_key(|(length, _, _)| *length)
        .map(|(_, marker, after)| (marker, after))?;
    Some((marker, capitalize_first(after.trim())))
}

/// Fin du déclencheur dans `rest`, ponctuation qui le suit comprise, et le
/// numéro dit juste après pour un bloc numéroté. `None` si le déclencheur
/// n'est pas là, ou s'il continue une phrase.
fn trigger_end(rest: &str, trigger: &str, numbered: bool) -> Option<(usize, Option<u32>)> {
    let mut chars = rest.char_indices();
    let mut end = 0;
    for expected in trigger.chars() {
        let (index, found) = chars.next()?;
        if !same_letter(found, expected) {
            return None;
        }
        end = index + found.len_utf8();
    }
    let mut number = None;
    if numbered {
        if let Some((said, length)) = spoken_number(&rest[end..]) {
            number = Some(said);
            end += length;
        }
    }
    let after = &rest[end..];
    let spaced = after.trim_start();
    if spaced.is_empty() {
        return Some((rest.len(), number));
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
    Some((rest.len() - spaced.len() + punctuation, number))
}

const MARKER_PUNCTUATION: &str = ".,;:!?…-–—";

const NUMBER_WORDS: &[(&str, u32)] = &[
    ("un", 1),
    ("une", 1),
    ("deux", 2),
    ("trois", 3),
    ("quatre", 4),
    ("cinq", 5),
    ("six", 6),
    ("sept", 7),
    ("huit", 8),
    ("neuf", 9),
    ("dix", 10),
    ("one", 1),
    ("two", 2),
    ("three", 3),
    ("four", 4),
    ("five", 5),
    ("seven", 7),
    ("eight", 8),
    ("nine", 9),
    ("ten", 10),
];

/// Un numéro dit juste après le déclencheur (« 3 », « trois »), et la
/// longueur qu'il occupe, espaces compris. Un mot qui n'est pas un nombre
/// n'en est pas un : « Exemple de calcul » reste du contenu.
fn spoken_number(after: &str) -> Option<(u32, usize)> {
    let trimmed = after.trim_start();
    if trimmed.len() == after.len() {
        return None;
    }
    let leading = after.len() - trimmed.len();
    let word: String = trimmed
        .chars()
        .take_while(|c| c.is_alphanumeric())
        .collect();
    if word.is_empty() {
        return None;
    }
    let number = if word.chars().all(|c| c.is_ascii_digit()) {
        if word.len() > 3 {
            return None;
        }
        word.parse().ok()?
    } else {
        let lower = word.to_lowercase();
        NUMBER_WORDS
            .iter()
            .find(|(spoken, _)| *spoken == lower)
            .map(|(_, number)| *number)?
    };
    Some((number, leading + word.len()))
}

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
    fn course_blocks_are_set_apart_like_markers() {
        assert_eq!(
            marked("Théorème. Dans un triangle rectangle, a² + b² = c²."),
            Some((
                "📐 Théorème",
                "Dans un triangle rectangle, a² + b² = c².".into()
            ))
        );
        assert_eq!(
            marked("À retenir : la masse se conserve."),
            Some(("📌 À retenir", "La masse se conserve.".into()))
        );
        assert_eq!(
            marked("Méthode, on isole x puis on divise."),
            Some(("🛠 Méthode", "On isole x puis on divise.".into()))
        );
        assert_eq!(marked("Théorème de Pythagore."), None);
        assert_eq!(marked("Méthodes numériques, chapitre 2."), None);
    }

    #[test]
    fn an_example_said_with_its_number_keeps_it() {
        let (marker, body) = split_study_marker("Exemple 3, on lance un dé.").unwrap();
        assert_eq!(marker.number, Some(3));
        assert_eq!(body, "On lance un dé.");
        let (marker, _) = split_study_marker("Exercice deux : calculer la limite.").unwrap();
        assert_eq!(marker.number, Some(2));
        assert_eq!(
            marker.wrap("Calculer la limite."),
            "✍ Exercice 2 : Calculer la limite."
        );
    }

    #[test]
    fn example_words_inside_a_sentence_stay_content() {
        assert_eq!(marked("Exemple de calcul avec des fractions."), None);
        assert_eq!(marked("Exemple un peu plus dur, la dérivée."), None);
        assert_eq!(marked("Exemples à faire pour lundi."), None);
        assert_eq!(marked("Exercice 2000 du livre."), None);
    }

    #[test]
    fn examples_follow_each_other_within_a_course() {
        let mut numbering = Numbering::default();
        let start = Instant::now();
        let minute = Duration::from_secs(60);
        assert_eq!(numbering.next("🧪 Exemple", None, start), 1);
        assert_eq!(numbering.next("🧪 Exemple", None, start + minute), 2);
        // Les exercices ont leur propre suite.
        assert_eq!(numbering.next("✍ Exercice", None, start + minute), 1);
        // Un numéro dit prime, et la suite repart de lui.
        assert_eq!(numbering.next("🧪 Exemple", Some(5), start + 2 * minute), 5);
        assert_eq!(numbering.next("🧪 Exemple", None, start + 3 * minute), 6);
        // Trois heures plus tard, c'est un autre cours.
        assert_eq!(
            numbering.next("🧪 Exemple", None, start + 3 * 60 * minute),
            1
        );
    }

    #[test]
    fn a_numbered_block_is_stable_when_prepared_again() {
        let once = prepare("Exemple 4. Un dé à six faces.");
        let pasted = once.finish(&once.body);
        assert_eq!(pasted, "🧪 Exemple 4 : Un dé à six faces.");
        assert_eq!(prepare(&pasted).marker, None);
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
