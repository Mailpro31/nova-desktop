//! Notes structurées — des notes brutes rangées selon leur type.
//!
//! En édition Organization, la structure est écrite par le serveur
//! (`/api/structured-notes`). En édition Personal, elle l'est ici, avec la même
//! formulation, et envoyée au moteur de réécriture choisi dans Styles. Le poste
//! ne reçoit jamais de consigne de l'interface : seulement un type connu.

use log::debug;
use tauri::AppHandle;

use crate::settings::get_settings;

/// Les cinq types et leurs sections, dans l'ordre. Identiques au serveur.
pub const NOTE_TYPES: [(&str, &[&str]); 5] = [
    (
        "meeting",
        &[
            "Summary",
            "Decisions",
            "Action items (owner and deadline when stated)",
            "Open questions",
        ],
    ),
    (
        "lecture",
        &[
            "Summary",
            "Key concepts",
            "Definitions and formulas",
            "Examples",
            "Questions to review",
        ],
    ),
    (
        "observation",
        &["Observation", "Hypothesis", "Method", "Result", "Action"],
    ),
    (
        "ideas",
        &["Ideas", "Why they matter", "Open questions", "Next steps"],
    ),
    ("free", &["Summary", "Key points", "Details", "Next steps"]),
];

/// La consigne d'un type, ou `None` si le type est inconnu.
pub fn instruction(note_type: &str, member_instruction: &str) -> Option<String> {
    let (_, sections) = NOTE_TYPES.iter().find(|(id, _)| *id == note_type)?;
    let mut text = format!(
        "Organize the raw notes into these sections, in this order: {}. \
         Give each section a short heading and use bullet points inside it. Omit a \
         section that has nothing to put in it. Keep every fact, number, name and \
         date exactly as written, never invent anything, and mark what is unclear \
         as uncertain. Write in the same language as the notes.",
        sections.join(", ")
    );
    let extra = member_instruction.trim();
    if !extra.is_empty() {
        text.push_str("\nAdditional instruction: ");
        text.push_str(extra);
    }
    Some(text)
}

/// Nova Personal : structure les notes avec le moteur de réécriture choisi.
///
/// Même choix de moteur que la réécriture des dictées pour « Turbo » : le
/// moteur local d'abord quand il est prêt, puis Turbo si l'offre l'autorise.
/// Un moteur explicitement choisi (local, clé personnelle) est utilisé seul.
#[tauri::command]
#[specta::specta]
pub async fn format_structured_notes_locally(
    app: AppHandle,
    text: String,
    note_type: String,
    instruction: String,
) -> Result<String, String> {
    if text.trim().is_empty() {
        return Err("empty-notes".to_string());
    }
    let system_prompt = self::instruction(&note_type, &instruction)
        .ok_or_else(|| "unknown-note-type".to_string())?;

    let settings = get_settings(&app);
    let selected = settings
        .active_post_process_provider()
        .cloned()
        .ok_or_else(|| "no-rewrite-engine".to_string())?;

    let license_key = settings.license_key.as_deref().unwrap_or("");
    let local_id = crate::local_llm::PROVIDER_ID;
    let mut candidates = Vec::new();
    if selected.id == "nova_turbo" {
        let local_profile = settings
            .post_process_models
            .get(local_id)
            .cloned()
            .unwrap_or_default();
        let local_ready = !local_profile.trim().is_empty()
            && crate::local_llm::profile_is_supported(&local_profile)
            && crate::local_llm::profiles_status(&app)
                .iter()
                .any(|profile| profile.id == local_profile && profile.is_downloaded);
        if local_ready {
            if let Some(local) = settings.post_process_provider(local_id) {
                candidates.push(local.clone());
            }
        }
        let paid_turbo = crate::licensing::has("cloud_styles", license_key, 0);
        let free_turbo = crate::licensing::effective_tier(license_key, 0)
            == crate::licensing::Tier::Free
            && !crate::quota::is_rewrite_blocked(&app);
        if paid_turbo || free_turbo {
            candidates.push(selected.clone());
        }
    } else {
        candidates.push(selected.clone());
    }

    for provider in candidates {
        let model = settings
            .post_process_models
            .get(&provider.id)
            .cloned()
            .unwrap_or_default();
        if model.trim().is_empty() {
            continue;
        }
        if provider.id == local_id {
            if let Err(error) = crate::local_llm::ensure_server_running(&app, &model).await {
                debug!("Structured notes: local engine unavailable: {error}");
                continue;
            }
        }
        let api_key = if provider.id == "nova_turbo" {
            if crate::licensing::has("cloud_styles", license_key, 0) {
                license_key.to_string()
            } else {
                settings.free_token.clone()
            }
        } else {
            settings
                .post_process_api_keys
                .get(&provider.id)
                .cloned()
                .unwrap_or_default()
        };
        let (reasoning_effort, reasoning) = match provider.id.as_str() {
            "custom" => (Some("none".to_string()), None),
            id if id == local_id => (Some("none".to_string()), None),
            "openrouter" => (
                None,
                Some(crate::llm_client::ReasoningConfig {
                    effort: Some("none".to_string()),
                    exclude: Some(true),
                }),
            ),
            _ => (None, None),
        };
        match crate::llm_client::send_chat_completion_with_schema(
            &provider,
            api_key,
            &model,
            text.clone(),
            Some(system_prompt.clone()),
            None,
            None,
            reasoning_effort,
            reasoning,
            crate::llm_client::OutputBudget::Report,
        )
        .await
        {
            Ok(Some(content)) if !content.trim().is_empty() => {
                return Ok(content.trim().to_string());
            }
            Ok(_) => debug!("Structured notes: '{}' returned nothing", provider.id),
            Err(error) => debug!("Structured notes: '{}' failed: {error}", provider.id),
        }
    }
    Err("structured-notes-failed".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_type_has_its_own_sections() {
        let meeting = instruction("meeting", "").unwrap();
        assert!(meeting.contains("Decisions"));
        assert!(meeting.contains("Action items"));
        let lecture = instruction("lecture", "").unwrap();
        assert!(lecture.contains("Key concepts"));
        let observation = instruction("observation", "").unwrap();
        assert!(observation.contains("Hypothesis"));
        let all: std::collections::HashSet<String> = NOTE_TYPES
            .iter()
            .map(|(id, _)| instruction(id, "").unwrap())
            .collect();
        assert_eq!(all.len(), NOTE_TYPES.len());
    }

    #[test]
    fn every_instruction_keeps_facts_and_language() {
        for (id, _) in NOTE_TYPES {
            let text = instruction(id, "").unwrap();
            assert!(text.contains("never invent"));
            assert!(text.contains("same language"));
        }
    }

    #[test]
    fn an_unknown_type_has_no_instruction() {
        assert!(instruction("poem", "").is_none());
    }

    #[test]
    fn the_member_instruction_is_added_after_the_structure() {
        let text = instruction("free", "  put dates in bold ").unwrap();
        assert!(text.contains("Summary"));
        assert!(text.ends_with("Additional instruction: put dates in bold"));
    }
}
