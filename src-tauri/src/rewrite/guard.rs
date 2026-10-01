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
//! seul le contrôle des nombres groupés s'applique à lui. « Notes de cours »,
//! à l'inverse, a les contrôles les plus stricts : les notes d'un élève ne
//! doivent rien ajouter ni rien perdre.

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

/// Un nombre groupé réécrit avec une virgule ou un point (« 76 300 » →
/// « 76,300 ») : en français, « 76,300 » se lit 76 virgule 3. Contrairement à
/// [`grouped_number_lost`], un nombre simplement absent ne compte pas — un
/// compte rendu résume.
pub fn grouped_number_reformatted(input: &str, output: &str) -> bool {
    static GROUPED: Lazy<Regex> =
        Lazy::new(|| Regex::new(r"\d{1,3}(?:[ \u{00A0}\u{202F}]\d{3})+").unwrap());
    static PUNCTUATED: Lazy<Regex> = Lazy::new(|| Regex::new(r"\d{1,3}(?:[,.]\d{3})+").unwrap());
    let digits = |s: &str| s.chars().filter(char::is_ascii_digit).collect::<String>();
    let dictated: HashSet<String> = GROUPED
        .find_iter(input)
        .map(|n| digits(n.as_str()))
        .collect();
    PUNCTUATED
        .find_iter(output)
        .any(|n| dictated.contains(&digits(n.as_str())))
}

/// La dictée porte-t-elle un repère `{{clé}}` de « Mes informations » ?
///
/// Les termes du lexique personnel sont protégés par le même mécanisme
/// (`{{nvxlexN}}`), mais ils ne justifient aucune réécriture : un mot du
/// lexique dans la dictée ne doit pas lever le contrôle des mots repris.
fn has_personal_value_marker(text: &str) -> bool {
    static MARKER: Lazy<Regex> = Lazy::new(|| Regex::new(r"\{\{([^{}\r\n]+)\}\}").unwrap());
    MARKER
        .captures_iter(text)
        .any(|marker| !marker[1].starts_with("nvxlex"))
}

/// Le Style « Notes de cours » : la dictée d'un élève, mise en forme, rien de
/// plus. Il a ses propres contrôles, plus stricts que ceux des autres Styles.
pub const COURSE_NOTES_STYLE: &str = "nova_style_course_notes";

/// Part minimale des mots de la dictée retrouvés dans les notes. Plus haute
/// que [`MIN_KEPT_WORDS`] : des notes de cours ne résument pas. Une reprise
/// (« non pardon… ») écarte légitimement une partie de la dictée ; les mots de
/// reprise et les nombres en lettres ne sont donc pas comptés.
const COURSE_MIN_KEPT_WORDS: f32 = 0.5;

/// Part maximale des mots des notes absents de la dictée. Laisse la place à
/// une correction d'orthographe (« photo synthèse » → « photosynthèse ») et
/// aux libellés de structure ; pas à un exemple ni à une explication.
const COURSE_MAX_ADDED_WORDS: f32 = 0.2;

/// Libellés de structure que les notes peuvent ajouter sans que l'élève les
/// ait dits : ils mettent en forme, ils n'apportent aucun fait.
const STRUCTURE_WORDS: &[&str] = &[
    "retenir",
    "definition",
    "important",
    "attention",
    "chapitre",
    "partie",
    "titre",
    "remarque",
];

/// Mots qui annoncent une reprise ou meublent : une note qui les écarte ne
/// perd rien.
const FILLER_WORDS: &[&str] = &[
    "pardon", "plutot", "enfin", "attends", "attend", "oublie", "bref", "voila", "donc", "alors",
    "genre", "euh", "hmm", "bon",
];

/// Nombres en lettres : les notes les écrivent en chiffres, ils ne comptent
/// donc ni comme mots perdus ni comme mots ajoutés.
const NUMBER_WORDS: &[&str] = &[
    "zero",
    "deux",
    "trois",
    "quatre",
    "cinq",
    "sept",
    "huit",
    "neuf",
    "onze",
    "douze",
    "treize",
    "quatorze",
    "quinze",
    "seize",
    "vingt",
    "trente",
    "quarante",
    "cinquante",
    "soixante",
    "cent",
    "cents",
    "mille",
    "million",
    "millions",
    "milliard",
    "milliards",
    "virgule",
    "pourcent",
    "three",
    "four",
    "five",
    "seven",
    "eight",
    "nine",
    "eleven",
    "twelve",
    "twenty",
    "thirty",
    "forty",
    "fifty",
    "hundred",
    "thousand",
];

/// Singulier approximatif : « chapitres » et « chapitre » sont le même mot.
fn singular(word: &str) -> String {
    if word.chars().count() > 4 && (word.ends_with('s') || word.ends_with('x')) {
        word[..word.len() - 1].to_string()
    } else {
        word.to_string()
    }
}

/// Les mots porteurs des notes de cours : quatre lettres au moins, sans
/// accents, au singulier, hors nombres en lettres et mots de reprise.
fn course_words(text: &str) -> HashSet<String> {
    content_words(text)
        .into_iter()
        .filter(|w| !NUMBER_WORDS.contains(&w.as_str()) && !FILLER_WORDS.contains(&w.as_str()))
        .map(|w| singular(&w))
        .collect()
}

/// Valeur d'un mot-nombre français (sans accents).
fn number_word_value(word: &str) -> Option<u64> {
    Some(match word {
        "zero" => 0,
        "un" | "une" => 1,
        "deux" => 2,
        "trois" => 3,
        "quatre" => 4,
        "cinq" => 5,
        "six" => 6,
        "sept" => 7,
        "huit" => 8,
        "neuf" => 9,
        "dix" => 10,
        "onze" => 11,
        "douze" => 12,
        "treize" => 13,
        "quatorze" => 14,
        "quinze" => 15,
        "seize" => 16,
        "vingt" | "vingts" => 20,
        "trente" => 30,
        "quarante" => 40,
        "cinquante" => 50,
        "soixante" => 60,
        "cent" | "cents" => 100,
        "mille" => 1_000,
        "million" | "millions" => 1_000_000,
        "milliard" | "milliards" => 1_000_000_000,
        _ => return None,
    })
}

/// La valeur d'une suite de mots-nombres (« mille sept cent quatre-vingt-
/// treize » → 1793).
fn number_value(values: &[u64]) -> u64 {
    let (mut total, mut current, mut previous) = (0u64, 0u64, None);
    for &value in values {
        match value {
            100 => current = current.max(1) * 100,
            1_000 | 1_000_000 | 1_000_000_000 => {
                total += current.max(1) * value;
                current = 0;
            }
            // « quatre-vingt » : quatre fois vingt, pas quatre plus vingt.
            20 if previous == Some(4) => current = current - 4 + 80,
            _ => current += value,
        }
        previous = Some(value);
    }
    total + current
}

/// Les nombres dits en lettres dans un texte, en chiffres (« vingt mars » →
/// « 20 », « six virgule zéro deux » → « 6,02 »).
///
/// Une suite s'arrête à la ponctuation et au premier mot qui n'est pas un
/// nombre ; « et » n'y entre que dans « vingt et un », « soixante et onze ».
/// « un » ou « une » seuls sont des articles, pas des nombres.
pub fn spoken_numbers(text: &str) -> Vec<String> {
    static TOKEN: Lazy<Regex> = Lazy::new(|| Regex::new(r"[\p{L}]+|\d+|[^\s\p{L}\d\-']").unwrap());
    let tokens: Vec<String> = TOKEN
        .find_iter(&text.to_lowercase())
        .map(|m| fold(m.as_str()))
        .collect();
    let value_at = |i: usize| tokens.get(i).and_then(|t| number_word_value(t));
    let mut numbers = Vec::new();
    let mut i = 0;
    while i < tokens.len() {
        if value_at(i).is_none() {
            i += 1;
            continue;
        }
        let start = i;
        let mut values = Vec::new();
        while i < tokens.len() {
            if let Some(value) = value_at(i) {
                values.push(value);
                i += 1;
            } else if tokens[i] == "et"
                && values.last().is_some_and(|v| (20..=60).contains(v))
                && matches!(
                    tokens.get(i + 1).map(String::as_str),
                    Some("un" | "une" | "onze")
                )
            {
                i += 1;
            } else {
                break;
            }
        }
        if values.len() == 1 && matches!(tokens[start].as_str(), "un" | "une") {
            continue;
        }
        let mut number = number_value(&values).to_string();
        // « virgule » : les chiffres qui suivent sont des décimales, dites une
        // à une (« zéro deux ») ou d'un bloc (« vingt-cinq »).
        if tokens.get(i).map(String::as_str) == Some("virgule") && value_at(i + 1).is_some() {
            i += 1;
            let mut decimals = String::new();
            while let Some(value) = value_at(i) {
                decimals.push_str(&value.to_string());
                i += 1;
            }
            number = format!("{number},{decimals}");
        }
        numbers.push(number);
    }
    numbers
}

/// Tous les nombres d'un texte, quelle que soit leur écriture : chiffres
/// (« 76 300 », « 6,02 » ou « 6.02 »), exposants (« x² »), lettres (« vingt »)
/// et puissances dites (« au carré » → 2, « au cube » → 3).
fn numbers_in(text: &str) -> HashSet<String> {
    static DIGITS: Lazy<Regex> =
        Lazy::new(|| Regex::new(r"\d+(?:[ \u{00A0}\u{202F}]\d{3})*(?:[,.]\d+)?").unwrap());
    static SUPERSCRIPT: Lazy<Regex> = Lazy::new(|| Regex::new(r"[⁰¹²³⁴⁵⁶⁷⁸⁹]+").unwrap());
    static POWER: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)\bcarr[ée]s?\b|\bcubes?\b").unwrap());
    let mut numbers: HashSet<String> = DIGITS
        .find_iter(text)
        .map(|m| {
            m.as_str()
                .chars()
                .filter(|c| !matches!(c, ' ' | '\u{00A0}' | '\u{202F}'))
                .map(|c| if c == '.' { ',' } else { c })
                .collect()
        })
        .collect();
    for m in SUPERSCRIPT.find_iter(text) {
        numbers.insert(
            m.as_str()
                .chars()
                .map(|c| match c {
                    '⁰' => '0',
                    '¹' => '1',
                    '²' => '2',
                    '³' => '3',
                    '⁴' => '4',
                    '⁵' => '5',
                    '⁶' => '6',
                    '⁷' => '7',
                    '⁸' => '8',
                    _ => '9',
                })
                .collect(),
        );
    }
    for m in POWER.find_iter(text) {
        let power = if m.as_str().to_lowercase().starts_with("cub") {
            "3"
        } else {
            "2"
        };
        numbers.insert(power.to_string());
    }
    numbers.extend(spoken_numbers(text));
    numbers
}

/// Une sortie qui s'emballe — le modèle répète la même tournure jusqu'à la
/// limite de longueur — est bien plus longue que la dictée : des notes mettent
/// en forme, elles ne triplent pas un texte.
fn is_runaway(input: &str, output: &str) -> bool {
    output.chars().count() > input.chars().count() * 2 + 80
}

/// Part des mots des notes que l'élève n'a pas dits. `None` quand les notes
/// n'ont aucun mot porteur.
pub fn added_word_ratio(input: &str, output: &str) -> Option<f32> {
    let dictated = course_words(input);
    let written: HashSet<String> = course_words(output)
        .into_iter()
        .filter(|w| !STRUCTURE_WORDS.contains(&w.as_str()))
        .collect();
    if written.is_empty() {
        return None;
    }
    let added = written.difference(&dictated).count();
    Some(added as f32 / written.len() as f32)
}

/// Jours et mois, en français et en anglais, sans accents. « may » et « march »
/// n'y sont pas : en anglais ce sont d'abord des verbes.
const DATE_WORDS: &[&str] = &[
    "lundi",
    "mardi",
    "mercredi",
    "jeudi",
    "vendredi",
    "samedi",
    "dimanche",
    "janvier",
    "fevrier",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "aout",
    "septembre",
    "octobre",
    "novembre",
    "decembre",
    "demain",
    "hier",
    "aujourdhui",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
    "january",
    "february",
    "april",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
    "tomorrow",
    "yesterday",
    "today",
    "tonight",
];

/// Périodes qui, avec « prochain » ou « dernier », fixent une échéance : « la
/// semaine prochaine », « next week ».
const DATE_PERIODS: &[&str] = &["semaine", "mois", "annee", "an", "week", "month", "year"];
const DATE_RELATIVES: &[&str] = &[
    "prochain",
    "prochaine",
    "dernier",
    "derniere",
    "next",
    "last",
];

/// Les mots d'un texte, en minuscules, sans accents ni apostrophes
/// (« aujourd'hui » → « aujourdhui »).
fn date_tokens(text: &str) -> Vec<String> {
    static WORD: Lazy<Regex> = Lazy::new(|| Regex::new(r"[\p{L}']+").unwrap());
    WORD.find_iter(&text.to_lowercase())
        .map(|m| fold(&m.as_str().replace('\'', "")))
        .collect()
}

/// Les dates dites en toutes lettres : jours, mois, « demain », « la semaine
/// prochaine ». Un « avant vendredi » devenu « la semaine prochaine » change
/// une échéance sans qu'aucun chiffre ne bouge.
pub fn dates_in(text: &str) -> HashSet<String> {
    let tokens = date_tokens(text);
    let mut dates = HashSet::new();
    for (i, token) in tokens.iter().enumerate() {
        if DATE_WORDS.contains(&token.as_str()) {
            dates.insert(token.clone());
        }
        if DATE_PERIODS.contains(&token.as_str()) {
            let relative = [i.checked_sub(1), Some(i + 1)]
                .into_iter()
                .flatten()
                .filter_map(|j| tokens.get(j))
                .find(|word| DATE_RELATIVES.contains(&word.as_str()));
            if let Some(relative) = relative {
                dates.insert(format!("{token} {relative}"));
            }
        }
    }
    dates
}

/// Mots qui annoncent une reprise : ce qui est dit juste avant peut être
/// écarté.
const CORRECTION_MARKERS: &[&str] = &["pardon", "plutot", "attends", "sorry", "rather"];

/// Nombre de mots, avant une reprise, que la reprise peut remplacer.
const CORRECTION_WINDOW: usize = 6;

fn is_fact_token(word: &str) -> bool {
    let folded = fold(word);
    word.chars().any(|c| c.is_ascii_digit())
        || number_word_value(&folded).is_some()
        || DATE_WORDS.contains(&folded.as_str())
}

/// La dictée sans ce qu'une reprise a abandonné : les quelques mots dits juste
/// avant « pardon », « plutôt », « je veux dire », ou avant un « non » suivi
/// d'un nombre ou d'une date (« le 12 non le 13 »). La valeur retenue, elle,
/// reste : c'est elle qui doit se retrouver dans la sortie.
fn without_abandoned(text: &str) -> String {
    let raw: Vec<&str> = text.split_whitespace().collect();
    let words: Vec<String> = raw
        .iter()
        .map(|w| {
            fold(&w.to_lowercase())
                .trim_matches(|c: char| !c.is_alphanumeric())
                .to_string()
        })
        .collect();
    let mut dropped = vec![false; raw.len()];
    let mut i = 0;
    while i < words.len() {
        let phrase = words.get(i..i + 3).map(|w| w.join(" ")).unwrap_or_default();
        let span = if CORRECTION_MARKERS.contains(&words[i].as_str()) {
            1
        } else if phrase == "je veux dire" {
            3
        } else if matches!(
            words.get(i..i + 2).map(|w| w.join(" ")).as_deref(),
            Some("i mean") | Some("no wait")
        ) {
            2
        } else if matches!(words[i].as_str(), "non" | "no")
            && words.get(i + 1).is_some_and(|next| is_fact_token(next))
        {
            1
        } else {
            0
        };
        if span > 0 {
            for flag in dropped
                .iter_mut()
                .take(i + span)
                .skip(i.saturating_sub(CORRECTION_WINDOW))
            {
                *flag = true;
            }
            i += span;
        } else {
            i += 1;
        }
    }
    raw.iter()
        .zip(dropped)
        .filter(|(_, gone)| !gone)
        .map(|(word, _)| *word)
        .collect::<Vec<_>>()
        .join(" ")
}

/// Retire la numérotation d'une liste (« 1. », « 2) ») : la mise en forme
/// ajoute ces numéros, ce ne sont pas des nombres inventés.
fn without_list_numbering(text: &str) -> String {
    static NUMBERING: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?m)^\s*\d+[.)]\s+").unwrap());
    NUMBERING.replace_all(text, "").into_owned()
}

/// Les nombres et les dates de la sortie face à ceux de la dictée.
///
/// Un nombre ou une date que la personne n'a pas dits est refusé partout.
/// Un nombre ou une date dits et absents de la sortie l'est quand
/// `lost_matters` — partout sauf dans un compte rendu, qui résume. Ce qu'une
/// reprise a abandonné peut disparaître ; la valeur retenue, jamais.
fn facts_refusal(input: &str, output: &str, lost_matters: bool) -> Option<&'static str> {
    // Les repères (`{{nvxlex0}}`, `{{adresse}}`) protègent un terme pendant la
    // réécriture : leurs chiffres n'ont pas été dits.
    static MARKER: Lazy<Regex> = Lazy::new(|| Regex::new(r"\{\{[^{}]*\}\}").unwrap());
    let input = &MARKER.replace_all(input, " ").into_owned();
    let output = without_list_numbering(&MARKER.replace_all(output, " "));
    let written_numbers = numbers_in(&output);
    let written_dates = dates_in(&output);
    if written_numbers
        .difference(&numbers_in(input))
        .next()
        .is_some()
    {
        return Some("number-changed");
    }
    if written_dates.difference(&dates_in(input)).next().is_some() {
        return Some("date-changed");
    }
    if lost_matters {
        let required = without_abandoned(input);
        if numbers_in(&required)
            .difference(&written_numbers)
            .next()
            .is_some()
        {
            return Some("number-lost");
        }
        if dates_in(&required)
            .difference(&written_dates)
            .next()
            .is_some()
        {
            return Some("date-lost");
        }
    }
    None
}

/// Styles qui corrigent sans réécrire : ils n'ajoutent presque rien.
const FAITHFUL_STYLES: &[&str] = &[
    "default_improve_transcriptions",
    "nova_style_voice_to_text",
    "nova_style_messages",
];

/// Part de mots ajoutés au-delà de laquelle un Style fidèle a réécrit.
const FAITHFUL_MAX_ADDED_WORDS: f32 = 0.25;

/// En dessous de ce nombre de mots porteurs, la part ajoutée ne mesure rien :
/// dans « on se voit au sinéma ce soir », corriger un seul mot mal entendu en
/// ajoute déjà un sur trois. Un poème ou une réponse inventés dépassent
/// largement ce seuil.
const FAITHFUL_MIN_WRITTEN_WORDS: usize = 6;

/// Les contrôles des notes de cours. Dans l'ordre : une sortie qui s'emballe,
/// la langue, les nombres (le défaut le plus coûteux pour un élève), puis ce
/// qui a été ajouté, puis ce qui a été perdu.
fn check_course_notes(input: &str, output: &str) -> Result<(), &'static str> {
    if is_runaway(input, output) {
        return Err("output-runaway");
    }
    if let (Some(dictated), Some(written)) = (language_of(input), language_of(output)) {
        if dictated != written {
            return Err("language-changed");
        }
    }
    // Un nombre que l'élève n'a pas dit — une date de partiel décalée, une
    // année d'histoire changée — est l'erreur la plus coûteuse : il la
    // révisera. Un nombre perdu vient juste après. Dit en chiffres ou en
    // lettres, c'est la même valeur qui est comparée.
    if let Some(reason) = facts_refusal(input, output, true) {
        return Err(reason);
    }
    if added_word_ratio(input, output).is_some_and(|ratio| ratio > COURSE_MAX_ADDED_WORDS) {
        return Err("content-added");
    }
    if !has_personal_value_marker(input) {
        let dictated = course_words(input);
        if !dictated.is_empty() {
            let written = course_words(output);
            let kept = dictated.intersection(&written).count() as f32 / dictated.len() as f32;
            if kept < COURSE_MIN_KEPT_WORDS {
                return Err("dictation-not-kept");
            }
        }
    }
    Ok(())
}

/// Les contrôles propres aux Styles intégrés. `Err` porte le motif du refus.
///
/// « Réunion » résume : il échappe aux contrôles de langue, de mots repris et
/// de nombres omis, mais pas à celui des nombres réécrits.
pub fn check(input: &str, output: &str, style_id: &str) -> Result<(), &'static str> {
    if style_id == COURSE_NOTES_STYLE {
        return check_course_notes(input, output);
    }
    if style_id == "nova_style_meeting" {
        if grouped_number_reformatted(input, output) {
            return Err("number-format-changed");
        }
        // Un compte rendu résume : il peut omettre, jamais inventer.
        return match facts_refusal(input, output, false) {
            Some(reason) => Err(reason),
            None => Ok(()),
        };
    }
    if !GUARDED_STYLES.contains(&style_id) {
        return Ok(());
    }
    if let (Some(dictated), Some(written)) = (language_of(input), language_of(output)) {
        if dictated != written {
            return Err("language-changed");
        }
    }
    // Une dictée qui porte un repère de « Mes informations » peut être
    // réécrite en entier, et c'est voulu : « envoie-lui mon adresse » devient
    // « Voici mon adresse : {{mon adresse}}. », qui ne reprend qu'un mot sur
    // trois. Le repère, dont la présence est déjà exigée, relie la sortie à la
    // dictée bien mieux qu'un compte de mots.
    if !has_personal_value_marker(input)
        && kept_word_ratio(input, output).is_some_and(|ratio| ratio < MIN_KEPT_WORDS)
    {
        return Err("dictation-not-kept");
    }
    if grouped_number_lost(input, output) {
        return Err("number-format-changed");
    }
    if let Some(reason) = facts_refusal(input, output, true) {
        return Err(reason);
    }
    if FAITHFUL_STYLES.contains(&style_id)
        && !has_personal_value_marker(input)
        && course_words(output).len() >= FAITHFUL_MIN_WRITTEN_WORDS
        && added_word_ratio(input, output).is_some_and(|ratio| ratio > FAITHFUL_MAX_ADDED_WORDS)
    {
        return Err("content-added");
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
        // Un compte rendu résume : un nombre omis n'est pas une erreur.
        assert!(check(
            "on a dépensé 1 850 euros sur les 3 000, la batterie coûte 140 euros",
            "## Résumé\nLe budget est presque consommé.",
            "nova_style_meeting"
        )
        .is_ok());
    }

    #[test]
    fn a_personal_value_request_may_be_rewritten_as_a_message() {
        // Sortie réelle du modèle local, banc d'essai du 2026-09-22 : refusée
        // par erreur en 1.0.44, la dictée brute était collée à la place.
        assert!(check(
            "envoie-lui {{mon adresse}} s'il te plaît",
            "Voici mon adresse : {{mon adresse}}.",
            "nova_style_messages"
        )
        .is_ok());
        // Un terme du lexique protégé n'est pas une valeur personnelle.
        assert_eq!(
            check(
                "envoie-lui le rapport {{nvxlex0}} s'il te plaît",
                "Voici mon adresse. {{nvxlex0}}",
                "nova_style_messages"
            ),
            Err("dictation-not-kept")
        );
        // Sans repère, une sortie sans rapport reste refusée.
        assert_eq!(
            check(
                "envoie-lui le rapport s'il te plaît",
                "Voici mon adresse.",
                "nova_style_messages"
            ),
            Err("dictation-not-kept")
        );
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

    // --- Tous les Styles : ni nombre ni date inventés, perdus ou changés ---
    //
    // Décision du 01/10 : quelle que soit la personne qui dicte, Nova ne
    // change jamais ce qu'elle a dit. Les dates en toutes lettres comptent
    // autant que les chiffres : le 29/09, le mode réunion avait transformé
    // « avant vendredi » en « la semaine prochaine », sans aucun chiffre.

    #[test]
    fn a_meeting_summary_cannot_invent_a_deadline() {
        assert_eq!(
            check(
                "Sasha commande les hélices avant vendredi",
                "Sasha a commandé les hélices avant. La batterie doit être testée la semaine prochaine.",
                "nova_style_meeting"
            ),
            Err("date-changed")
        );
    }

    #[test]
    fn a_changed_day_or_number_is_refused_in_every_built_in_style() {
        assert_eq!(
            check(
                "le rendez-vous est jeudi à 14 heures en salle B204",
                "Bonjour,

Le rendez-vous est vendredi à 14 heures en salle B204.

Cordialement",
                "nova_style_email"
            ),
            Err("date-changed")
        );
        assert_eq!(
            check(
                "il faut relire les pages douze à quinze pour demain",
                "- Relire les pages 12 à 16 pour demain",
                "nova_style_todo"
            ),
            Err("number-changed")
        );
        assert_eq!(
            check(
                "il faut trois exemplaires et deux copies du dossier",
                "Il faut 3 exemplaires du dossier.",
                "default_improve_transcriptions"
            ),
            Err("number-lost")
        );
    }

    #[test]
    fn a_self_correction_may_drop_the_abandoned_value() {
        assert!(check(
            "le rendez-vous est le 12 non pardon le 13 en salle B204",
            "Le rendez-vous est le 13 en salle B204.",
            "default_improve_transcriptions"
        )
        .is_ok());
    }

    #[test]
    fn a_self_correction_never_lets_the_final_value_be_lost() {
        // Le modèle a gardé la version abandonnée et perdu la bonne.
        assert_eq!(
            check(
                "le rendez-vous est le 12 non pardon le 13 en salle B204",
                "Le rendez-vous est le 12 en salle B204.",
                "default_improve_transcriptions"
            ),
            Err("number-lost")
        );
    }

    #[test]
    fn list_numbering_is_not_an_invented_number() {
        assert!(check(
            "il faut lancer le développement puis préparer la maquette avec Marc",
            "1. Lancer le développement.
2. Préparer la maquette avec Marc.",
            "nova_style_notes"
        )
        .is_ok());
    }

    #[test]
    fn a_meeting_summary_may_still_leave_out_a_date() {
        assert!(check(
            "on se voit lundi pour faire le point et on livre vendredi au client",
            "## Résumé
Livraison au client vendredi.",
            "nova_style_meeting"
        )
        .is_ok());
    }

    #[test]
    fn a_faithful_style_cannot_add_content() {
        assert_eq!(
            check(
                "je passe te voir cet après-midi",
                "Je passe te voir cet après-midi pour discuter du budget, des priorités et des prochaines étapes du projet.",
                "nova_style_messages"
            ),
            Err("content-added")
        );
    }

    #[test]
    fn a_faithful_style_may_fix_a_misheard_word_in_a_short_dictation() {
        assert_eq!(
            check(
                "on se voit au sinéma ce soir",
                "On se voit au cinéma ce soir.",
                "default_improve_transcriptions"
            ),
            Ok(())
        );
    }

    #[test]
    fn a_marker_is_not_a_dictated_number() {
        // `{{nvxlex0}}` protège un terme du lexique pendant la réécriture : son
        // chiffre n'a pas été dit, sa perte n'est pas celle d'un nombre.
        assert_eq!(
            check(
                "je relis {{nvxlex0}} avec Paul ce soir",
                "Je relis avec Paul ce soir.",
                "default_improve_transcriptions"
            ),
            Ok(())
        );
        assert_eq!(
            check(
                "je relis la fiche ce soir",
                "Je relis la fiche {{nvxlex3}} ce soir.",
                "nova_style_notes"
            ),
            Ok(())
        );
    }

    #[test]
    fn a_self_correction_abandons_only_what_precedes_it() {
        let kept = without_abandoned("le rendez-vous est le 12 non pardon le 13 en salle B204");
        assert!(!kept.contains("12"), "{kept}");
        assert!(kept.contains("13") && kept.contains("B204"), "{kept}");
        let plain = "on a 3 exemplaires et 2 copies";
        assert_eq!(without_abandoned(plain), plain);
    }

    #[test]
    fn dates_said_in_words_are_recognised() {
        assert!(dates_in("avant vendredi").contains("vendredi"));
        assert!(dates_in("la semaine prochaine").contains("semaine prochaine"));
        assert!(dates_in("le 3 mars, puis demain").contains("mars"));
        assert!(dates_in("before Friday, next week").contains("friday"));
        assert!(dates_in("un cours sur les nombres").is_empty());
    }

    #[test]
    fn styles_that_may_summarize_or_translate_are_left_alone() {
        // « Réunion » résume ; un Style personnel peut s'appeler « En anglais ».
        for style in ["nova_style_meeting", "custom_translate", "org:acme:style"] {
            assert!(check("merci beaucoup pour tout", "Thanks a lot.", style).is_ok());
        }
    }

    // --- Notes de cours : la dictée d'un élève, rien de plus ---
    //
    // Mesuré le 29/09 sur le moteur du serveur : des notes de cours générées
    // avaient perdu la date du partiel et deux seuils, inventé des exemples,
    // et une fois inversé une formule. Un élève dys repère mal ces erreurs en
    // relisant : elles doivent être refusées avant d'être collées.

    const COURSE: &str = "nova_style_course_notes";

    #[test]
    fn course_notes_that_add_an_example_are_refused() {
        assert_eq!(
            check(
                "la portance augmente avec l'angle d'incidence jusqu'au décrochage",
                "La portance augmente avec l'angle d'incidence jusqu'au décrochage.
Par exemple, un avion au décollage cabre pour gagner de la portance avant de risquer le décrochage.",
                COURSE
            ),
            Err("content-added")
        );
    }

    #[test]
    fn course_notes_that_explain_instead_of_noting_are_refused() {
        assert_eq!(
            check(
                "la dérivée de x carré c'est deux x",
                "Dérivée de x² : 2x. Cela signifie que la pente de la parabole double quand x double, ce qui explique sa courbure.",
                COURSE
            ),
            Err("content-added")
        );
    }

    #[test]
    fn course_notes_that_drop_part_of_the_lecture_are_refused() {
        assert_eq!(
            check(
                "le partiel aura lieu le douze mars, il portera sur les chapitres trois et quatre, les calculatrices sont interdites et il faudra justifier chaque résultat",
                "Partiel le 12 mars : chapitres 3 et 4.",
                COURSE
            ),
            Err("dictation-not-kept")
        );
    }

    #[test]
    fn course_notes_that_lose_a_dictated_figure_are_refused() {
        assert_eq!(
            check(
                "au-delà de 12 % d'humidité le composite perd 30 % de sa résistance",
                "Au-delà d'un certain taux d'humidité, le composite perd 30 % de sa résistance.",
                COURSE
            ),
            Err("number-lost")
        );
    }

    // Sorties réelles du banc du 30/09 (modèle local Qwen3-4B), toutes passées
    // à tort par le contrôle de la première version : dictés en lettres, les
    // nombres échappaient à toute comparaison.

    #[test]
    fn a_date_the_model_changed_is_refused() {
        assert_eq!(
            check(
                "pour lundi il faut faire les exercices douze et treize page quarante-cinq et relire le chapitre cinq, important le partiel c'est le vingt mars",
                "pour lundi il faut faire les exercices 12 et 13 page 45 et relire le chapitre 5.
À retenir : le partiel est le 23 mars.",
                COURSE
            ),
            Err("number-changed")
        );
        assert_eq!(
            check(
                "partie deux la révolution française, elle commence en mille sept cent quatre-vingt-neuf, le quatorze juillet c'est la prise de la bastille, en mille sept cent quatre-vingt-douze non pardon en mille sept cent quatre-vingt-treize louis seize est exécuté",
                "Partie 2 la révolution française, elle commence en 1789, le 14 juillet c'est la prise de la bastille, en 1789 non pardon en 1790 louis seize est exécuté.",
                COURSE
            ),
            Err("number-changed")
        );
    }

    #[test]
    fn a_runaway_output_is_refused() {
        let input = "partie deux la révolution française, elle commence en mille sept cent quatre-vingt-neuf, le quatorze juillet c'est la prise de la bastille, en mille sept cent quatre-vingt-douze non pardon en mille sept cent quatre-vingt-treize louis seize est exécuté";
        let output = format!(
            "Partie deux, la Révolution française, elle commence en 1789, le 14 juillet c'est la prise de la Bastille, en 1789 non{}",
            ", en 1789".repeat(80)
        );
        assert_eq!(check(input, &output, COURSE), Err("output-runaway"));
    }

    #[test]
    fn numbers_said_in_words_are_read_like_digits() {
        assert_eq!(
            spoken_numbers("mille sept cent quatre-vingt-treize"),
            vec!["1793".to_string()]
        );
        assert_eq!(
            spoken_numbers("les exercices douze et treize page quarante-cinq"),
            vec!["12".to_string(), "13".to_string(), "45".to_string()]
        );
        assert_eq!(
            spoken_numbers("soixante et onze, quatre-vingt-dix-neuf, deux mille vingt-six"),
            vec!["71".to_string(), "99".to_string(), "2026".to_string()]
        );
        assert_eq!(
            spoken_numbers("six virgule zéro deux fois dix puissance vingt-trois"),
            vec!["6,02".to_string(), "10".to_string(), "23".to_string()]
        );
        // « un » est d'abord un article : seul, il ne compte pas.
        assert!(spoken_numbers("un accord entre une ou deux personnes").contains(&"2".to_string()));
        assert!(!spoken_numbers("un accord entre une personne").contains(&"1".to_string()));
    }

    #[test]
    fn a_power_written_as_a_symbol_is_the_same_number() {
        // « x au carré » → x², « trois x au carré » → 3x².
        assert!(check(
            "à retenir la dérivée de x au carré c'est deux x et la dérivée de x au cube c'est trois x au carré",
            "À retenir : la dérivée de x² est 2x et la dérivée de x³ est 3x².",
            COURSE
        )
        .is_ok());
    }

    #[test]
    fn faithful_course_notes_pass() {
        for (input, output) in [
            // Titre annoncé, définition, point à retenir : la structure vient de
            // la dictée, les mots aussi.
            (
                "chapitre trois la photosynthèse, définition la photosynthèse c'est la transformation du dioxyde de carbone en glucose grâce à la lumière, à retenir elle produit du dioxygène",
                "Chapitre 3 : la photosynthèse

Photosynthèse : transformation du dioxyde de carbone en glucose grâce à la lumière.
À retenir : elle produit du dioxygène.",
            ),
            // Nombres dictés en lettres, écrits en chiffres ; reprise résolue.
            (
                "la Révolution commence en mille sept cent quatre-vingt-neuf non pardon la prise de la Bastille c'est le quatorze juillet mille sept cent quatre-vingt-neuf",
                "La prise de la Bastille : 14 juillet 1789.",
            ),
            // Cours de langue : la citation anglaise reste en anglais.
            (
                "le present perfect se forme avec have plus participe passé par exemple I have finished my homework",
                "Present perfect : have + participe passé.
Exemple : « I have finished my homework ».",
            ),
            // Énumération dictée, mise en liste.
            (
                "les trois états de la matière sont solide liquide et gazeux",
                "Les trois états de la matière :
- solide
- liquide
- gazeux",
            ),
        ] {
            assert!(check(input, output, COURSE).is_ok(), "{output}");
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
