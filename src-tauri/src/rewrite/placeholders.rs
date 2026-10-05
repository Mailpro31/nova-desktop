//! Les valeurs qui changent toutes seules dans un snippet.
//!
//! Un snippet « en-tête du cours » qui contient `## Mécanique — {date}` écrit
//! la date du jour à chaque dictée. Les repères reconnus :
//! - `{date}` : « dimanche 4 octobre 2026 » ;
//! - `{jour}` / `{day}` : « dimanche » ;
//! - `{heure}` / `{time}` : « 14 h 30 » en français, « 2:30 PM » en anglais.
//!
//! Une dictée ne produit jamais d'accolades : seul le contenu d'un snippet,
//! personnel ou publié par l'école, peut en porter. Un repère inconnu reste
//! tel quel.

use chrono::{Datelike, NaiveDateTime, Timelike, Weekday};
use once_cell::sync::Lazy;
use regex::{Captures, Regex};

const FR_DAYS: [&str; 7] = [
    "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche",
];
const FR_MONTHS: [&str; 12] = [
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre",
];
const EN_DAYS: [&str; 7] = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
];
const EN_MONTHS: [&str; 12] = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

/// Les dates s'écrivent en français, en anglais, ou en chiffres pour les
/// autres langues.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DateLanguage {
    French,
    English,
    Numeric,
}

impl DateLanguage {
    /// D'après un code de langue (« fr », « en-US », « de »…).
    pub fn from_code(code: &str) -> Self {
        let code = code.to_ascii_lowercase();
        if code.starts_with("fr") {
            DateLanguage::French
        } else if code.starts_with("en") {
            DateLanguage::English
        } else {
            DateLanguage::Numeric
        }
    }
}

/// Les repères `{date}`, `{jour}`, `{heure}` (et leurs noms anglais)
/// remplacés par la date et l'heure données.
pub fn expand(text: &str, now: NaiveDateTime, language: DateLanguage) -> String {
    if !text.contains('{') {
        return text.to_string();
    }
    let weekday = weekday_index(now.weekday());
    let day = match language {
        DateLanguage::French => FR_DAYS[weekday].to_string(),
        DateLanguage::English => EN_DAYS[weekday].to_string(),
        DateLanguage::Numeric => format!("{:02}/{:02}", now.day(), now.month()),
    };
    let date = match language {
        DateLanguage::French => {
            let day_of_month = if now.day() == 1 {
                "1er".to_string()
            } else {
                now.day().to_string()
            };
            format!(
                "{} {} {} {}",
                FR_DAYS[weekday],
                day_of_month,
                FR_MONTHS[now.month0() as usize],
                now.year()
            )
        }
        DateLanguage::English => format!(
            "{}, {} {}, {}",
            EN_DAYS[weekday],
            EN_MONTHS[now.month0() as usize],
            now.day(),
            now.year()
        ),
        DateLanguage::Numeric => {
            format!("{:02}/{:02}/{}", now.day(), now.month(), now.year())
        }
    };
    let time = match language {
        DateLanguage::English => {
            let (pm, hour) = now.hour12();
            format!(
                "{hour}:{:02} {}",
                now.minute(),
                if pm { "PM" } else { "AM" }
            )
        }
        _ => format!("{} h {:02}", now.hour(), now.minute()),
    };
    // Casse ignorée (« {Date} ») ; un repère doublé (« {{date}} ») est un
    // repère interne de Nova, jamais touché.
    static PLACEHOLDER: Lazy<Regex> = Lazy::new(|| {
        Regex::new(r"(?i)(\{?)\{(date|jour|day|heure|time)\}(\}?)").expect("placeholder")
    });
    PLACEHOLDER
        .replace_all(text, |caps: &Captures| {
            if !caps[1].is_empty() || !caps[3].is_empty() {
                return caps[0].to_string();
            }
            match caps[2].to_lowercase().as_str() {
                "date" => date.clone(),
                "jour" | "day" => day.clone(),
                _ => time.clone(),
            }
        })
        .into_owned()
}

fn weekday_index(weekday: Weekday) -> usize {
    weekday.num_days_from_monday() as usize
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    fn at(year: i32, month: u32, day: u32, hour: u32, minute: u32) -> NaiveDateTime {
        NaiveDate::from_ymd_opt(year, month, day)
            .unwrap()
            .and_hms_opt(hour, minute, 0)
            .unwrap()
    }

    #[test]
    fn the_date_and_time_are_written_in_french() {
        let now = at(2026, 10, 4, 14, 5);
        assert_eq!(
            expand("## Mécanique — {date}, {heure}", now, DateLanguage::French),
            "## Mécanique — dimanche 4 octobre 2026, 14 h 05"
        );
        assert_eq!(expand("{jour}", now, DateLanguage::French), "dimanche");
        assert_eq!(
            expand("{date}", at(2026, 12, 1, 9, 0), DateLanguage::French),
            "mardi 1er décembre 2026"
        );
    }

    #[test]
    fn the_date_and_time_are_written_in_english() {
        let now = at(2026, 10, 4, 14, 5);
        assert_eq!(
            expand("{day}: {date} at {time}", now, DateLanguage::English),
            "Sunday: Sunday, October 4, 2026 at 2:05 PM"
        );
    }

    #[test]
    fn other_languages_get_digits() {
        let now = at(2026, 3, 9, 8, 30);
        assert_eq!(
            expand("{date} {heure}", now, DateLanguage::from_code("de")),
            "09/03/2026 8 h 30"
        );
    }

    #[test]
    fn text_without_a_known_value_is_unchanged() {
        let now = at(2026, 10, 4, 14, 5);
        for text in [
            "Rendez-vous lundi.",
            "{inconnu}",
            "{{mon adresse}}",
            "x {de} y",
        ] {
            assert_eq!(expand(text, now, DateLanguage::French), text);
        }
    }

    /// Chasse aux bugs du 05/10.
    #[test]
    fn case_is_ignored_and_double_braces_are_left_alone() {
        let now = at(2026, 10, 4, 14, 5);
        assert_eq!(
            expand("{Date} à {HEURE}", now, DateLanguage::French),
            "dimanche 4 octobre 2026 à 14 h 05"
        );
        assert_eq!(expand("{{date}}", now, DateLanguage::French), "{{date}}");
    }

    #[test]
    fn the_language_code_picks_the_wording() {
        assert_eq!(DateLanguage::from_code("fr-FR"), DateLanguage::French);
        assert_eq!(DateLanguage::from_code("en"), DateLanguage::English);
        assert_eq!(DateLanguage::from_code("auto"), DateLanguage::Numeric);
    }
}
