//! Les snippets et le vocabulaire de l'organisation, gardés pour dicter sans
//! son serveur.
//!
//! Le serveur de l'organisation les applique lui-même à chaque reformulation.
//! Mais quand il ne répond pas, la dictée bascule sur le moteur local, qui ne
//! les connaissait pas : « mon iban » restait « mon iban », et « ipsa » restait
//! « ipsa ». Ils sont donc lus avec le catalogue de l'organisation et gardés en
//! mémoire, puis appliqués comme sur le serveur :
//!
//! - un snippet devient un raccourci de « Mes informations » : son contenu ne
//!   part jamais au modèle, il est remis à l'identique après ;
//! - le vocabulaire est appliqué au texte final, sans toucher aux adresses
//!   e-mail, aux liens ni aux repères.

use once_cell::sync::Lazy;
use regex::Regex;
use std::sync::RwLock;

use crate::settings::CustomVariable;

/// Ce que l'organisation a publié pour l'écriture, et le compte de la personne.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct WritingAids {
    pub organization_id: Option<String>,
    /// `(terme, remplacement)` ; un remplacement vide fixe l'orthographe du terme.
    pub vocabulary: Vec<(String, String)>,
    /// `(déclencheur, contenu)`.
    pub snippets: Vec<(String, String)>,
}

static AIDS: RwLock<Option<WritingAids>> = RwLock::new(None);

/// Remplace ce qui est gardé. Un remplacement, jamais une fusion.
pub fn set(aids: WritingAids) {
    if let Ok(mut guard) = AIDS.write() {
        *guard = Some(aids);
    }
}

/// Oublie tout — déconnexion, ou changement d'organisation.
pub fn clear() {
    if let Ok(mut guard) = AIDS.write() {
        *guard = None;
    }
}

/// Ce qui est gardé pour cette organisation, et seulement pour elle.
pub fn for_organization(organization_id: Option<&str>) -> Option<WritingAids> {
    let organization_id = organization_id?;
    let guard = AIDS.read().ok()?;
    let aids = guard.as_ref()?;
    (aids.organization_id.as_deref() == Some(organization_id)).then(|| aids.clone())
}

/// Les snippets en raccourcis de « Mes informations », après ceux de la
/// personne : un raccourci personnel qui porte le même mot-clé l'emporte.
pub fn with_snippets(variables: &[CustomVariable], aids: &WritingAids) -> Vec<CustomVariable> {
    let mut merged = variables.to_vec();
    for (trigger, content) in &aids.snippets {
        let taken = merged
            .iter()
            .any(|variable| variable.key.trim().eq_ignore_ascii_case(trigger.trim()));
        if !taken && !trigger.trim().is_empty() && !content.trim().is_empty() {
            merged.push(CustomVariable {
                key: trigger.trim().to_string(),
                value: content.clone(),
            });
        }
    }
    merged
}

/// Le vocabulaire appliqué au texte, à l'identique, du terme le plus long au
/// plus court. Même règle que le serveur (`enforce_vocabulary`) : les adresses
/// e-mail, les liens et les repères `{{…}}` ne sont jamais touchés.
pub fn enforce_vocabulary(text: &str, vocabulary: &[(String, String)]) -> String {
    let mut entries: Vec<(String, String)> = vocabulary
        .iter()
        .filter(|(term, _)| !term.trim().is_empty())
        .map(|(term, replacement)| {
            let target = if replacement.trim().is_empty() {
                term.trim()
            } else {
                replacement.trim()
            };
            (term.trim().to_string(), target.to_string())
        })
        .collect();
    if entries.is_empty() {
        return text.to_string();
    }
    entries.sort_by_key(|(term, _)| std::cmp::Reverse(term.chars().count()));

    static PROTECTED: Lazy<Regex> =
        Lazy::new(|| Regex::new(r"\{\{[^{}\r\n]+\}\}|\S*@\S+|\b(?:https?://|www\.)\S+").unwrap());
    let mut out = String::with_capacity(text.len());
    let mut last = 0;
    for protected in PROTECTED.find_iter(text) {
        out.push_str(&apply_terms(&text[last..protected.start()], &entries));
        out.push_str(protected.as_str());
        last = protected.end();
    }
    out.push_str(&apply_terms(&text[last..], &entries));
    out
}

/// Les termes remplacés en mots entiers, casse ignorée. Pas de regard en
/// arrière dans le moteur `regex` : les bornes sont vérifiées à la main.
fn apply_terms(piece: &str, entries: &[(String, String)]) -> String {
    let mut text = piece.to_string();
    for (term, target) in entries {
        let Ok(pattern) = Regex::new(&format!("(?i){}", regex::escape(term))) else {
            continue;
        };
        let mut out = String::with_capacity(text.len());
        let mut last = 0;
        for found in pattern.find_iter(&text) {
            let before = text[..found.start()].chars().next_back();
            let after = text[found.end()..].chars().next();
            let after_next = text[found.end()..].chars().nth(1);
            let word_before = before.is_some_and(|c| c.is_alphanumeric() || c == '_');
            let word_after = after.is_some_and(|c| c.is_alphanumeric() || c == '_');
            // « ipsa.fr », « ipsa/cours » : un domaine ou un chemin, pas le terme.
            let joined_after =
                matches!(after, Some('.' | '/')) && after_next.is_some_and(|c| c.is_alphanumeric());
            let joined_before = matches!(before, Some('.' | '/' | '@'));
            if word_before || word_after || joined_after || joined_before {
                continue;
            }
            out.push_str(&text[last..found.start()]);
            out.push_str(target);
            last = found.end();
        }
        out.push_str(&text[last..]);
        text = out;
    }
    text
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vocab() -> Vec<(String, String)> {
        vec![
            ("IPSA".into(), String::new()),
            ("aeroelasticite".into(), "aéroélasticité".into()),
            ("Aero 2".into(), String::new()),
        ]
    }

    #[test]
    fn terms_are_spelled_exactly() {
        assert_eq!(
            enforce_vocabulary("le cours d'aeroelasticite a l'ipsa en aero 2", &vocab()),
            "le cours d'aéroélasticité a l'IPSA en Aero 2"
        );
    }

    #[test]
    fn emails_links_markers_and_longer_words_are_left_alone() {
        let text = "écris à scolarite@ipsa.fr ou va sur www.ipsa.fr, {{mon iban}}, ipsaland";
        assert_eq!(enforce_vocabulary(text, &vocab()), text);
    }

    #[test]
    fn snippets_become_personal_values_without_overriding_the_person() {
        let aids = WritingAids {
            organization_id: Some("ipsa".into()),
            vocabulary: vec![],
            snippets: vec![
                ("mon iban".into(), "FR76 3000 6000".into()),
                ("mon adresse".into(), "12 rue de l'École".into()),
            ],
        };
        let personal = vec![CustomVariable {
            key: "Mon adresse".into(),
            value: "7 impasse des Lilas".into(),
        }];
        let merged = with_snippets(&personal, &aids);
        assert_eq!(merged.len(), 2);
        assert_eq!(merged[0].value, "7 impasse des Lilas");
        assert_eq!(merged[1].key, "mon iban");
    }

    #[test]
    fn aids_belong_to_one_organization() {
        set(WritingAids {
            organization_id: Some("ipsa".into()),
            ..WritingAids::default()
        });
        assert!(for_organization(Some("ipsa")).is_some());
        assert!(for_organization(Some("autre")).is_none());
        assert!(for_organization(None).is_none());
        clear();
        assert!(for_organization(Some("ipsa")).is_none());
    }
}
