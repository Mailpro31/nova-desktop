//! Envoyer des cartes de révision dans Anki, par AnkiConnect.
//!
//! AnkiConnect est le module d'Anki qui écoute sur `127.0.0.1:8765` et reçoit
//! des demandes en JSON. Ce fichier ne contient que ce qui se décide sans
//! réseau : quel modèle de note utiliser, comment nommer le paquet, à quoi
//! ressemble une note. L'envoi lui-même est dans `commands::anki`.
//!
//! Rien ne part ailleurs que vers l'Anki de l'élève, sur son poste.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use specta::Type;

/// L'adresse d'AnkiConnect : toujours locale, jamais réglable.
pub const ANKI_CONNECT_URL: &str = "http://127.0.0.1:8765";
/// La version du protocole que Nova parle.
pub const ANKI_CONNECT_VERSION: u64 = 6;

/// Une carte telle que l'historique la fabrique (`revisionCards`).
#[derive(Debug, Clone, Deserialize, Serialize, Type, PartialEq, Eq)]
pub struct AnkiCard {
    pub front: String,
    pub back: String,
    pub tag: String,
}

/// Le modèle « recto / verso » d'Anki porte le nom de la langue d'Anki : on
/// le cherche par ces noms, puis par ressemblance.
const BASIC_MODEL_NAMES: &[&str] = &[
    "Basic",
    "Basique",
    "Einfach",
    "Básico",
    "Base",
    "Basis",
    "Basico",
    "Podstawowy",
    "Основная",
];

/// Le modèle de note à utiliser parmi ceux de l'Anki de l'élève, ou `None`.
/// Les variantes (« Basic (and reversed card) », « Cloze ») sont écartées :
/// elles créeraient des cartes que l'élève n'a pas demandées.
pub fn choose_model(models: &[String]) -> Option<String> {
    for wanted in BASIC_MODEL_NAMES {
        if let Some(found) = models.iter().find(|name| name.as_str() == *wanted) {
            return Some(found.clone());
        }
    }
    models
        .iter()
        .find(|name| {
            let lower = name.to_lowercase();
            (lower.starts_with("basic") || lower.starts_with("basique")) && !lower.contains('(')
        })
        .cloned()
}

/// Le nom du paquet. « :: » sépare les sous-paquets dans Anki : un titre qui
/// en contiendrait créerait une arborescence que l'élève n'a pas voulue.
pub fn deck_name(title: &str) -> String {
    let cleaned = title.replace("::", ":").trim().to_string();
    if cleaned.is_empty() {
        "Nova".to_string()
    } else {
        cleaned
    }
}

/// Un champ Anki est du HTML : le texte de l'élève y est échappé, et ses
/// retours à la ligne gardés.
pub fn field_html(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('\n', "<br>")
}

/// Les notes à envoyer. Une carte déjà présente dans le paquet n'est pas
/// recréée : `allowDuplicate` est faux, à l'échelle du paquet.
pub fn notes(deck: &str, model: &str, fields: &[String], cards: &[AnkiCard]) -> Vec<Value> {
    let (front, back) = (&fields[0], &fields[1]);
    cards
        .iter()
        .map(|card| {
            let mut tags = vec!["nova".to_string()];
            let tag = card.tag.trim().replace(char::is_whitespace, "_");
            if !tag.is_empty() {
                tags.push(tag);
            }
            json!({
                "deckName": deck,
                "modelName": model,
                "fields": { front: field_html(&card.front), back: field_html(&card.back) },
                "tags": tags,
                "options": { "allowDuplicate": false, "duplicateScope": "deck" },
            })
        })
        .collect()
}

/// Une demande AnkiConnect.
pub fn request(action: &str, params: Value) -> Value {
    json!({ "action": action, "version": ANKI_CONNECT_VERSION, "params": params })
}

/// La réponse d'AnkiConnect : son résultat, ou son message d'erreur.
pub fn result(response: Value) -> Result<Value, String> {
    match response.get("error") {
        Some(Value::String(message)) => Err(message.clone()),
        _ => Ok(response.get("result").cloned().unwrap_or(Value::Null)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| value.to_string()).collect()
    }

    #[test]
    fn the_basic_model_is_found_in_any_language() {
        assert_eq!(
            choose_model(&names(&["Cloze", "Basic (and reversed card)", "Basic"])),
            Some("Basic".into())
        );
        assert_eq!(
            choose_model(&names(&[
                "Texte à trous",
                "Basique (et carte inversée)",
                "Basique"
            ])),
            Some("Basique".into())
        );
        assert_eq!(
            choose_model(&names(&["Basic-1a2b3"])),
            Some("Basic-1a2b3".into())
        );
        // Une variante seule ne convient pas.
        assert_eq!(
            choose_model(&names(&["Cloze", "Basic (type in the answer)"])),
            None
        );
        assert_eq!(choose_model(&[]), None);
    }

    #[test]
    fn a_deck_name_never_creates_sub_decks() {
        assert_eq!(
            deck_name("Nova — Fluides :: CM — 6 octobre 2026"),
            "Nova — Fluides : CM — 6 octobre 2026"
        );
        assert_eq!(deck_name("   "), "Nova");
    }

    #[test]
    fn a_note_carries_the_student_s_text_escaped() {
        let cards = vec![AnkiCard {
            front: "La viscosité ?".into(),
            back: "a < b & c\nligne 2".into(),
            tag: "définition".into(),
        }];
        let fields = names(&["Recto", "Verso"]);
        let built = notes("Nova", "Basique", &fields, &cards);
        assert_eq!(built.len(), 1);
        assert_eq!(built[0]["modelName"], "Basique");
        assert_eq!(built[0]["fields"]["Recto"], "La viscosité ?");
        assert_eq!(built[0]["fields"]["Verso"], "a &lt; b &amp; c<br>ligne 2");
        assert_eq!(built[0]["tags"], json!(["nova", "définition"]));
        assert_eq!(built[0]["options"]["allowDuplicate"], false);
    }

    #[test]
    fn an_anki_error_is_reported() {
        assert_eq!(
            result(json!({"result": null, "error": "deck was not found"})),
            Err("deck was not found".into())
        );
        assert_eq!(result(json!({"result": 6, "error": null})), Ok(json!(6)));
        assert_eq!(
            request("version", json!({}))["version"],
            ANKI_CONNECT_VERSION
        );
    }
}
