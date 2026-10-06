//! Envoyer les cartes de révision d'un cours dans Anki, d'un clic.
//!
//! L'export CSV demandait d'ouvrir Anki, de trouver « Importer », de choisir
//! le fichier et de vérifier les colonnes : quatre étapes de trop pour un élève
//! dyspraxique. AnkiConnect permet de les envoyer directement, si Anki est
//! ouvert sur le poste.
//!
//! Les erreurs sont des codes courts, traduits par l'interface :
//! `anki_not_running`, `anki_too_old`, `anki_no_model`, `anki_error`.

use std::time::Duration;

use serde::Serialize;
use serde_json::{json, Value};
use specta::Type;

use crate::anki::{
    choose_model, deck_name, notes, request, result, AnkiCard, ANKI_CONNECT_URL,
    ANKI_CONNECT_VERSION,
};

/// Ce qui a été envoyé : les cartes ajoutées, et celles qu'Anki n'a pas
/// reprises, presque toujours parce qu'elles étaient déjà dans le paquet.
#[derive(Debug, Clone, Serialize, Type)]
pub struct AnkiSendResult {
    pub deck: String,
    pub added: u32,
    pub skipped: u32,
}

async fn call(client: &reqwest::Client, action: &str, params: Value) -> Result<Value, String> {
    let response = client
        .post(ANKI_CONNECT_URL)
        .json(&request(action, params))
        .send()
        .await
        .map_err(|_| "anki_not_running".to_string())?;
    let body: Value = response
        .json()
        .await
        .map_err(|_| "anki_not_running".to_string())?;
    result(body).map_err(|message| {
        log::warn!("AnkiConnect refused {action}: {message}");
        "anki_error".to_string()
    })
}

#[tauri::command]
#[specta::specta]
pub async fn anki_send_cards(
    title: String,
    cards: Vec<AnkiCard>,
) -> Result<AnkiSendResult, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|_| "anki_not_running".to_string())?;

    let version = call(&client, "version", json!({})).await?;
    if version.as_u64().unwrap_or(0) < ANKI_CONNECT_VERSION {
        return Err("anki_too_old".into());
    }

    let models: Vec<String> =
        serde_json::from_value(call(&client, "modelNames", json!({})).await?).unwrap_or_default();
    let model = choose_model(&models).ok_or_else(|| "anki_no_model".to_string())?;
    let fields: Vec<String> = serde_json::from_value(
        call(&client, "modelFieldNames", json!({ "modelName": model })).await?,
    )
    .unwrap_or_default();
    if fields.len() < 2 {
        return Err("anki_no_model".into());
    }

    let deck = deck_name(&title);
    call(&client, "createDeck", json!({ "deck": deck })).await?;

    let all = notes(&deck, &model, &fields, &cards);
    // Une carte déjà dans le paquet n'est pas recréée : on demande d'abord ce
    // qu'Anki accepterait, pour ne pas faire échouer tout l'envoi.
    let addable: Vec<bool> =
        serde_json::from_value(call(&client, "canAddNotes", json!({ "notes": all })).await?)
            .unwrap_or_default();
    let to_add: Vec<Value> = all
        .into_iter()
        .zip(addable.iter().copied().chain(std::iter::repeat(false)))
        .filter_map(|(note, ok)| ok.then_some(note))
        .collect();

    let added = if to_add.is_empty() {
        0
    } else {
        let ids: Vec<Option<u64>> =
            serde_json::from_value(call(&client, "addNotes", json!({ "notes": to_add })).await?)
                .unwrap_or_default();
        ids.iter().filter(|id| id.is_some()).count() as u32
    };

    Ok(AnkiSendResult {
        deck,
        added,
        skipped: cards.len() as u32 - added,
    })
}
