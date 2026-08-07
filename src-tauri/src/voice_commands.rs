//! Safe, deterministic voice editing commands.
//!
//! Commands only transform the current transcript or select a Nova style. They
//! never click, send, launch, delete, or otherwise mutate another application.

use once_cell::sync::Lazy;
use regex::Regex;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VoiceCommandResult {
    pub text: String,
    pub cancelled: bool,
    pub style_override: Option<String>,
    pub dictionary_word: Option<String>,
}

static PARAGRAPH: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)\b(?:nouveau paragraphe|new paragraph)\b[\s,;:.-]*").unwrap());
static NEW_LINE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\b(?:à la ligne|retour à la ligne|new line)\b[\s,;:.-]*").unwrap()
});
static QUESTION: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)\b(?:point d['’]interrogation|question mark)\b").unwrap());
static EXCLAMATION: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)\b(?:point d['’]exclamation|exclamation mark)\b").unwrap());

const STYLE_PREFIXES: &[(&[&str], &str)] = &[
    (&["nova réunion", "nova meeting"], "nova_style_meeting"),
    (&["nova liste", "nova todo"], "nova_style_todo"),
    (&["nova notes", "nova note"], "nova_style_notes"),
    (&["nova prompt"], "nova_style_prompt"),
    (&["nova message"], "nova_style_messages"),
    (&["nova e-mail", "nova email"], "nova_style_email"),
];

fn strip_style_prefix(text: &str) -> (String, Option<String>) {
    let trimmed = text.trim();
    let lower = trimmed.to_lowercase();
    for (prefixes, style) in STYLE_PREFIXES {
        for prefix in *prefixes {
            if lower == *prefix {
                return (String::new(), Some((*style).to_string()));
            }
            if lower.starts_with(prefix) {
                let boundary = trimmed[prefix.len()..].chars().next();
                if boundary.is_some_and(|c| c == ':' || c == ',' || c == '-' || c.is_whitespace()) {
                    let rest = trimmed[prefix.len()..]
                        .trim_start_matches([' ', ':', ',', '-', '–', '—'])
                        .trim()
                        .to_string();
                    return (rest, Some((*style).to_string()));
                }
            }
        }
    }
    (trimmed.to_string(), None)
}

pub fn apply(text: &str, enabled: bool) -> VoiceCommandResult {
    if !enabled {
        return VoiceCommandResult {
            text: text.to_string(),
            cancelled: false,
            style_override: None,
            dictionary_word: None,
        };
    }

    let normalized = text
        .trim()
        .trim_end_matches(['.', '!', '?'])
        .trim()
        .to_lowercase();
    if matches!(
        normalized.as_str(),
        "nova annule" | "nova cancel" | "annule la dictée" | "cancel dictation"
    ) {
        return VoiceCommandResult {
            text: String::new(),
            cancelled: true,
            style_override: None,
            dictionary_word: None,
        };
    }

    for prefix in ["nova retiens", "nova remember"] {
        if normalized.starts_with(prefix) {
            let word = text[prefix.len()..]
                .trim_start_matches([' ', ':', ',', '-', '–', '—'])
                .trim()
                .trim_end_matches(['.', '!', '?'])
                .trim();
            if !word.is_empty() && word.chars().count() <= 80 {
                return VoiceCommandResult {
                    text: String::new(),
                    cancelled: false,
                    style_override: None,
                    dictionary_word: Some(word.to_string()),
                };
            }
        }
    }

    let (with_style, style_override) = strip_style_prefix(text);
    let with_paragraphs = PARAGRAPH.replace_all(&with_style, "\n\n");
    let with_lines = NEW_LINE.replace_all(&with_paragraphs, "\n");
    let with_questions = QUESTION.replace_all(&with_lines, "?");
    let final_text = EXCLAMATION
        .replace_all(&with_questions, "!")
        .trim()
        .to_string();

    VoiceCommandResult {
        text: final_text,
        cancelled: false,
        style_override,
        dictionary_word: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancels_only_explicit_commands() {
        assert!(apply("Nova annule.", true).cancelled);
        assert!(!apply("Nova annule parfois la réunion", true).cancelled);
    }

    #[test]
    fn selects_meeting_style_and_keeps_content() {
        let result = apply("Nova réunion : budget nouveau paragraphe décisions", true);
        assert_eq!(result.style_override.as_deref(), Some("nova_style_meeting"));
        assert_eq!(result.text, "budget \n\ndécisions");
    }

    #[test]
    fn can_be_disabled_without_modifying_text() {
        let result = apply("nouveau paragraphe", false);
        assert_eq!(result.text, "nouveau paragraphe");
    }

    #[test]
    fn learns_a_bounded_dictionary_entry() {
        let result = apply("Nova retiens : Mailpro31.", true);
        assert_eq!(result.dictionary_word.as_deref(), Some("Mailpro31"));
        assert!(result.text.is_empty());
    }
}
