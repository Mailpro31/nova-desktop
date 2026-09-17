//! Styles désactivés par l'organisation.
//!
//! Le serveur annonce la liste dans `/api/me` (`style_policy.disabled_style_ids`).
//! Le poste ne l'applique pas seulement à l'affichage : un Style déjà choisi, ou
//! désigné par le Style automatique, ne s'applique plus. La dictée n'est jamais
//! perdue pour autant : elle retombe sur un Style intégré encore autorisé, et
//! reste brute seulement si l'organisation les a tous retirés.
//!
//! Hors organisation, la liste est vide et rien ne change.

use std::sync::RwLock;

/// Les Styles de repli, du plus proche d'une dictée nettoyée au plus fidèle.
pub const FALLBACK_STYLE_IDS: [&str; 2] =
    ["default_improve_transcriptions", "nova_style_voice_to_text"];

static DISABLED: RwLock<Vec<String>> = RwLock::new(Vec::new());

/// Retient la liste annoncée par le serveur ; `None` l'efface.
pub fn set_disabled(ids: Option<Vec<String>>) {
    let mut guard = DISABLED
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    *guard = ids.unwrap_or_default();
}

/// La liste actuellement retenue.
pub fn disabled() -> Vec<String> {
    DISABLED
        .read()
        .map(|guard| guard.clone())
        .unwrap_or_else(|poisoned| poisoned.into_inner().clone())
}

/// Le Style à appliquer quand `selected` est choisi et que `disabled` est retiré.
///
/// `None` : aucun Style autorisé ne reste, la dictée part sans reformulation.
pub fn permitted_style(selected: &str, disabled: &[String]) -> Option<String> {
    let allowed = |id: &str| !disabled.iter().any(|value| value == id);
    if allowed(selected) {
        return Some(selected.to_string());
    }
    FALLBACK_STYLE_IDS
        .iter()
        .find(|id| allowed(id))
        .map(|id| id.to_string())
}

/// `permitted_style` avec la liste annoncée par le serveur.
pub fn permitted(selected: &str) -> Option<String> {
    permitted_style(selected, &disabled())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ids(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| value.to_string()).collect()
    }

    #[test]
    fn a_style_that_is_not_disabled_is_kept() {
        assert_eq!(
            permitted_style("nova_style_email", &ids(&["nova_style_prompt"])),
            Some("nova_style_email".to_string())
        );
        assert_eq!(
            permitted_style("nova_style_email", &[]),
            Some("nova_style_email".to_string())
        );
    }

    #[test]
    fn a_disabled_style_falls_back_to_the_cleaned_up_transcription() {
        assert_eq!(
            permitted_style("nova_style_prompt", &ids(&["nova_style_prompt"])),
            Some("default_improve_transcriptions".to_string())
        );
    }

    #[test]
    fn the_next_fallback_is_used_when_the_first_is_disabled_too() {
        assert_eq!(
            permitted_style(
                "nova_style_prompt",
                &ids(&["nova_style_prompt", "default_improve_transcriptions"])
            ),
            Some("nova_style_voice_to_text".to_string())
        );
    }

    #[test]
    fn no_style_is_applied_when_every_fallback_is_disabled() {
        assert_eq!(
            permitted_style(
                "nova_style_prompt",
                &ids(&[
                    "nova_style_prompt",
                    "default_improve_transcriptions",
                    "nova_style_voice_to_text"
                ])
            ),
            None
        );
    }

    #[test]
    fn the_announced_list_is_kept_until_it_is_cleared() {
        set_disabled(Some(ids(&["nova_style_todo"])));
        assert_eq!(disabled(), ids(&["nova_style_todo"]));
        assert_eq!(
            permitted("nova_style_todo"),
            Some("default_improve_transcriptions".to_string())
        );
        set_disabled(None);
        assert!(disabled().is_empty());
    }
}
