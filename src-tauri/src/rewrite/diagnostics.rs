use serde::Serialize;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RewriteDiagnostic {
    pub engine: String,
    pub model_profile: String,
    pub prompt_version: &'static str,
    pub attempt: u8,
    pub duration_ms: u128,
    pub status: &'static str,
    pub failure_kind: Option<String>,
}

pub fn classify_failure(message: &str) -> &'static str {
    let lower = message.to_ascii_lowercase();
    if lower.contains("401") || lower.contains("403") || lower.contains("unauthorized") {
        "authentication"
    } else if lower.contains("429") || lower.contains("quota") {
        "quota"
    } else if lower.contains("timed out") || lower.contains("timeout") {
        "timeout"
    } else if lower.contains("connect") || lower.contains("dns") || lower.contains("network") {
        "connection"
    } else if lower.contains("model") || lower.contains("server") {
        "local-engine"
    } else {
        "provider"
    }
}

pub fn emit(
    app: &AppHandle,
    engine: &str,
    model_profile: &str,
    attempt: u8,
    duration: Duration,
    status: &'static str,
    failure_kind: Option<&str>,
) {
    let event = RewriteDiagnostic {
        engine: engine.to_string(),
        model_profile: model_profile.to_string(),
        prompt_version: super::prompt::PROMPT_VERSION,
        attempt,
        duration_ms: duration.as_millis(),
        status,
        failure_kind: failure_kind.map(str::to_string),
    };
    // Ne jamais journaliser la dictée, le contexte écran ou les valeurs des
    // raccourcis personnels. Cet événement contient uniquement la télémétrie
    // technique nécessaire au diagnostic local.
    if let Ok(serialized) = serde_json::to_string(&event) {
        log::info!(target: "nova::rewrite", "rewrite_event {serialized}");
    }
    let _ = app.emit("rewrite-diagnostic", event);
}

#[cfg(test)]
mod tests {
    use super::classify_failure;

    #[test]
    fn classifies_actionable_provider_failures() {
        assert_eq!(
            classify_failure("API request failed with status 401"),
            "authentication"
        );
        assert_eq!(classify_failure("429 quota"), "quota");
        assert_eq!(classify_failure("operation timed out"), "timeout");
        assert_eq!(classify_failure("connection refused"), "connection");
    }
}
