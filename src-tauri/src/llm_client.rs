use crate::settings::PostProcessProvider;
use log::debug;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE, REFERER, USER_AGENT};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

/// Délai maximal d'une requête de reformulation. Sans lui, un serveur local
/// qui accepte la connexion sans jamais répondre (modèle en chargement, swap,
/// deadlock) figeait le pipeline sur l'état « processing » indéfiniment.
const LLM_REQUEST_TIMEOUT: Duration = Duration::from_secs(45);

#[derive(Debug, Serialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Serialize)]
struct JsonSchema {
    name: String,
    strict: bool,
    schema: Value,
}

#[derive(Debug, Serialize)]
struct ResponseFormat {
    #[serde(rename = "type")]
    format_type: String,
    json_schema: JsonSchema,
}

#[derive(Debug, Serialize, Clone, Default)]
pub struct ReasoningConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub effort: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exclude: Option<bool>,
}

#[derive(Debug, Serialize)]
struct ChatCompletionRequest {
    model: String,
    messages: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    response_format: Option<ResponseFormat>,
    // Échantillonnage. Omis (None) → le serveur garde son défaut (souvent ~0.8,
    // trop « créatif » pour une reformulation fidèle). Renseigné uniquement pour
    // les moteurs OpenAI-compatibles LOCAUX (Intelligence privée, custom) dont on
    // connaît le modèle ; jamais pour Turbo (relais serveur au modèle inconnu :
    // un modèle « reasoning » côté serveur peut refuser une température ≠ 1).
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reasoning_effort: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reasoning: Option<ReasoningConfig>,
    /// Extension llama-server : conserve le préfixe stable dans le cache KV.
    /// Omise pour les fournisseurs distants qui pourraient refuser ce champ.
    #[serde(skip_serializing_if = "Option::is_none")]
    cache_prompt: Option<bool>,
    /// Une dictée doit produire un texte de taille comparable. Borner la sortie
    /// évite qu'un petit modèle boucle et dépasse le budget de latence.
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
    message: ChatMessageResponse,
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ChatMessageResponse {
    content: Option<String>,
}

/// Ce que le modèle local a le droit d'écrire.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutputBudget {
    /// Une réécriture : à peu près la longueur de la dictée. Un budget serré
    /// est aussi une protection — une réponse hors sujet est coupée, et la
    /// dictée collée à sa place.
    Rewrite,
    /// Un compte rendu ou des notes structurées : des titres et des listes. Au
    /// budget d'une réécriture, un compte rendu de cinq minutes de réunion était
    /// coupé à 384 jetons, et Nova rendait le dialogue brut.
    Report,
}

fn local_max_tokens(user_content: &str, budget: OutputBudget) -> u32 {
    let estimated_input_tokens = user_content.chars().count().div_ceil(3) as u32;
    match budget {
        OutputBudget::Rewrite => (estimated_input_tokens + 24).clamp(48, 384),
        OutputBudget::Report => (estimated_input_tokens * 4 / 5 + 256).clamp(512, 1_280),
    }
}

/// Build headers for API requests based on provider type
fn build_headers(provider: &PostProcessProvider, api_key: &str) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();

    // Common headers
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(REFERER, HeaderValue::from_static("https://novaspeak.app"));
    headers.insert(
        USER_AGENT,
        HeaderValue::from_static("Nova/1.0 (+https://novaspeak.app)"),
    );
    headers.insert("X-Title", HeaderValue::from_static("Nova"));

    // Provider-specific auth headers
    if !api_key.is_empty() {
        if provider.id == "anthropic" {
            headers.insert(
                "x-api-key",
                HeaderValue::from_str(api_key)
                    .map_err(|e| format!("Invalid API key header value: {}", e))?,
            );
            headers.insert("anthropic-version", HeaderValue::from_static("2023-06-01"));
        } else {
            headers.insert(
                AUTHORIZATION,
                HeaderValue::from_str(&format!("Bearer {}", api_key))
                    .map_err(|e| format!("Invalid authorization header value: {}", e))?,
            );
        }
    }

    Ok(headers)
}

/// Create an HTTP client with provider-specific headers
fn create_client(provider: &PostProcessProvider, api_key: &str) -> Result<reqwest::Client, String> {
    let headers = build_headers(provider, api_key)?;
    reqwest::Client::builder()
        .default_headers(headers)
        .timeout(LLM_REQUEST_TIMEOUT)
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))
}

/// Send a chat completion request with structured output support
/// When json_schema is provided, uses structured outputs mode
/// system_prompt is used as the system message when provided
/// reasoning_effort sets the OpenAI-style top-level field (e.g., "none", "low", "medium", "high")
/// reasoning sets the OpenRouter-style nested object (effort + exclude)
#[allow(clippy::too_many_arguments)]
pub async fn send_chat_completion_with_schema(
    provider: &PostProcessProvider,
    api_key: String,
    model: &str,
    user_content: String,
    system_prompt: Option<String>,
    json_schema: Option<Value>,
    temperature: Option<f32>,
    reasoning_effort: Option<String>,
    reasoning: Option<ReasoningConfig>,
    budget: OutputBudget,
) -> Result<Option<String>, String> {
    let base_url = provider.base_url.trim_end_matches('/');
    let url = format!("{}/chat/completions", base_url);

    debug!("Sending chat completion request to: {}", url);

    let client = create_client(provider, &api_key)?;

    let is_local = provider.id == crate::local_llm::PROVIDER_ID;
    // Determine this while the request text is still available. It is moved
    // into the user message below, so calculating it in the request literal
    // would borrow a moved String.
    let max_tokens = is_local.then(|| local_max_tokens(&user_content, budget));

    // Build messages vector
    let mut messages = Vec::new();

    // Add system prompt if provided
    if let Some(system) = system_prompt {
        messages.push(ChatMessage {
            role: "system".to_string(),
            content: system,
        });
    }

    // Add user message
    messages.push(ChatMessage {
        role: "user".to_string(),
        content: user_content,
    });

    // Build response_format if schema is provided
    let response_format = json_schema.map(|schema| ResponseFormat {
        format_type: "json_schema".to_string(),
        json_schema: JsonSchema {
            name: "transcription_output".to_string(),
            strict: true,
            schema,
        },
    });

    let request_body = ChatCompletionRequest {
        model: model.to_string(),
        messages,
        response_format,
        temperature,
        reasoning_effort,
        reasoning,
        cache_prompt: is_local.then_some(true),
        max_tokens,
    };

    let response = client
        .post(&url)
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Failed to read error response".to_string());
        return Err(format!(
            "API request failed with status {}: {}",
            status, error_text
        ));
    }

    let completion: ChatCompletionResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse API response: {}", e))?;

    let Some(choice) = completion.choices.first() else {
        return Ok(None);
    };
    if choice.finish_reason.as_deref() == Some("length") {
        return Err("LLM output reached its token limit".to_string());
    }
    Ok(choice.message.content.clone())
}

#[cfg(test)]
mod tests {
    use super::{local_max_tokens, OutputBudget};

    #[test]
    fn local_output_budget_is_bounded_and_scales_with_input() {
        let rewrite = |text: &str| local_max_tokens(text, OutputBudget::Rewrite);
        assert_eq!(rewrite(""), 48);
        assert_eq!(rewrite(&"a".repeat(300)), 124);
        assert_eq!(rewrite(&"a".repeat(1_000)), 358);
        assert_eq!(rewrite(&"a".repeat(2_000)), 384);
    }

    #[test]
    fn a_report_gets_room_for_its_headings_and_lists() {
        // Cinq minutes de réunion : 4 337 caractères, coupés à 384 jetons avant.
        let report = local_max_tokens(&"a".repeat(4_337), OutputBudget::Report);
        assert!(report > 384 * 2, "{report}");
        assert_eq!(local_max_tokens("", OutputBudget::Report), 512);
        // Borné : il doit tenir, avec la dictée, dans le contexte du moteur.
        assert_eq!(
            local_max_tokens(&"a".repeat(50_000), OutputBudget::Report),
            1_280
        );
    }
}

/// Fetch available models from an OpenAI-compatible API
/// Returns a list of model IDs
pub async fn fetch_models(
    provider: &PostProcessProvider,
    api_key: String,
) -> Result<Vec<String>, String> {
    let base_url = provider.base_url.trim_end_matches('/');
    let url = format!("{}/models", base_url);

    debug!("Fetching models from: {}", url);

    let client = create_client(provider, &api_key)?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch models: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!(
            "Model list request failed ({}): {}",
            status, error_text
        ));
    }

    let parsed: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let mut models = Vec::new();

    // Handle OpenAI format: { data: [ { id: "..." }, ... ] }
    if let Some(data) = parsed.get("data").and_then(|d| d.as_array()) {
        for entry in data {
            if let Some(id) = entry.get("id").and_then(|i| i.as_str()) {
                models.push(id.to_string());
            } else if let Some(name) = entry.get("name").and_then(|n| n.as_str()) {
                models.push(name.to_string());
            }
        }
    }
    // Handle array format: [ "model1", "model2", ... ]
    else if let Some(array) = parsed.as_array() {
        for entry in array {
            if let Some(model) = entry.as_str() {
                models.push(model.to_string());
            }
        }
    }

    Ok(models)
}
