#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
use crate::apple_intelligence;
use crate::audio_feedback::{play_feedback_sound, play_feedback_sound_blocking, SoundType};
use crate::audio_toolkit::{is_microphone_access_denied, is_no_input_device_error, VadPolicy};
use crate::managers::audio::AudioRecordingManager;
use crate::managers::history::HistoryManager;
use crate::managers::model::ModelManager;
use crate::managers::transcription::StreamWorkKind;
use crate::managers::transcription::TranscriptionManager;
use crate::settings::{get_settings, AppSettings, OverlayStyle, APPLE_INTELLIGENCE_PROVIDER_ID};
use crate::shortcut;
use crate::tray::{change_tray_icon, TrayIconState};
use crate::utils::{
    self, show_processing_overlay, show_recording_overlay, show_transcribing_overlay,
};
use crate::TranscriptionCoordinator;
use ferrous_opencc::{config::BuiltinConfig, OpenCC};
use log::{debug, error, warn};
use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::future::Future;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::Manager;
use tauri::{AppHandle, Emitter};

const CANCELLATION_POLL_INTERVAL: Duration = Duration::from_millis(25);

/// Borne dure de toute la reformulation (démarrage du moteur + appel LLM).
/// Au-delà, on colle le texte brut : l'utilisateur ne reste jamais bloqué.
const POST_PROCESS_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Clone, serde::Serialize)]
struct RecordingErrorEvent {
    error_type: String,
    detail: Option<String>,
}

/// Drop guard that notifies the [`TranscriptionCoordinator`] when the
/// transcription pipeline finishes — whether it completes normally or panics.
struct FinishGuard(AppHandle);
impl Drop for FinishGuard {
    fn drop(&mut self) {
        if let Some(c) = self.0.try_state::<TranscriptionCoordinator>() {
            c.notify_processing_finished();
        }
    }
}

// Shortcut Action Trait
pub trait ShortcutAction: Send + Sync {
    fn start(&self, app: &AppHandle, binding_id: &str, shortcut_str: &str);
    fn stop(&self, app: &AppHandle, binding_id: &str, shortcut_str: &str);
}

// Transcribe Action
struct TranscribeAction {
    post_process: bool,
}

/// Field name for structured output JSON schema
const TRANSCRIPTION_FIELD: &str = "transcription";

/// Strip invisible Unicode characters that some LLMs may insert
fn strip_invisible_chars(s: &str) -> String {
    s.replace(['\u{200B}', '\u{200C}', '\u{200D}', '\u{FEFF}'], "")
}

/// Retire un bloc de code Markdown ``` ... ``` qui engloberait TOUTE la réponse
/// (les petits modèles en ajoutent parfois). La balise de langage optionnelle
/// (```json…) est ignorée. Texte inchangé s'il n'y a pas de bloc englobant.
fn strip_code_fence(t: &str) -> &str {
    let t = t.trim();
    if let Some(rest) = t.strip_prefix("```") {
        if let Some(body_end) = rest.rfind("```") {
            let after_lang = match rest.find('\n') {
                Some(nl) if nl < body_end => &rest[nl + 1..body_end],
                _ => &rest[..body_end],
            };
            return after_lang.trim_matches('\n').trim();
        }
    }
    t
}

/// Retire un préambule méta explicite (« Voici le texte reformulé : », « Here is
/// the rewritten text: »…) en tête de réponse. TRÈS conservateur : seules des
/// formules qui référencent clairement l'acte de reformuler sont retirées, et
/// uniquement si un « : » suit tôt sur la première ligne — pour ne JAMAIS amputer
/// un vrai contenu (ex. « Voici le compte-rendu : … » est conservé tel quel).
fn strip_leading_meta_preamble(t: &str) -> &str {
    const METAS: &[&str] = &[
        "voici le texte",
        "voici la reformulation",
        "voici votre texte",
        "voici la version",
        "voici le message",
        "voici votre message",
        "voici le résultat",
        "voici ce que",
        "here is the",
        "here's the",
        "here is your",
        "sure, here",
        "bien sûr, voici",
    ];
    let lower = t.to_lowercase();
    if !METAS.iter().any(|m| lower.starts_with(m)) {
        return t;
    }
    if let Some(colon) = t.find(':') {
        let first_nl = t.find('\n').unwrap_or(t.len());
        if colon < first_nl && colon <= 60 {
            let after = t[colon + 1..].trim_start();
            if !after.is_empty() {
                return after;
            }
        }
    }
    t
}

/// Retire UNE paire de guillemets qui envelopperait toute la réponse (« … »,
/// " … ", “ … ”…). Un guillemet interne (apostrophe de « l'équipe ») ne déclenche
/// rien : on ne retire que si le PREMIER et le DERNIER caractère forment une paire.
fn strip_wrapping_quotes(t: &str) -> &str {
    let t = t.trim();
    const PAIRS: &[(char, char)] = &[
        ('"', '"'),
        ('\'', '\''),
        ('«', '»'),
        ('\u{201C}', '\u{201D}'), // “ ”
        ('\u{2018}', '\u{2019}'), // ‘ ’
        ('\u{201E}', '\u{201C}'), // „ “
        ('\u{300C}', '\u{300D}'), // 「 」
    ];
    if t.chars().count() < 2 {
        return t;
    }
    if let (Some(f), Some(l)) = (t.chars().next(), t.chars().next_back()) {
        for &(o, c) in PAIRS {
            if f == o && l == c {
                return t[f.len_utf8()..t.len() - l.len_utf8()].trim();
            }
        }
    }
    t
}

/// Nettoie la sortie brute d'un modèle de reformulation : caractères invisibles,
/// bloc de code englobant, préambule méta, puis guillemets englobants. Sûr sur
/// les deux moteurs (s'applique à la RÉPONSE, jamais à la requête).
fn clean_llm_output(s: &str) -> String {
    let s = strip_invisible_chars(s);
    strip_wrapping_quotes(strip_leading_meta_preamble(strip_code_fence(s.trim())))
        .trim()
        .to_string()
}

/// Température d'échantillonnage selon le Style. Styles fidèles → 0 (sortie
/// reproductible, fin du « incohérent d'une fois à l'autre ») ; styles qui
/// restructurent (e-mail, notes, prompt, to-do, styles personnels) → un peu de
/// liberté pour un rendu plus naturel.
fn temperature_for_style(style_id: &str) -> f32 {
    const FAITHFUL: &[&str] = &[
        "default_improve_transcriptions",
        "nova_style_messages",
        "nova_style_voice_to_text",
    ];
    if FAITHFUL.contains(&style_id) {
        0.0
    } else {
        0.4
    }
}

/// Build a system prompt from the user's prompt template.
/// Removes `${output}` placeholder since the transcription is sent as the user message.
fn build_system_prompt(prompt_template: &str) -> String {
    prompt_template.replace("${output}", "").trim().to_string()
}

/// Bloc d'instructions listant les raccourcis personnels (variables) de
/// l'utilisateur. On ne transmet QUE les noms de clés au modèle (jamais les
/// valeurs — un IBAN ou une adresse ne quittent donc jamais la machine, même via
/// Turbo). L'IA place un repère `{{clé}}` là où l'information doit apparaître ;
/// la valeur exacte est réinjectée après coup par `resolve_variable_tokens`.
/// Renvoie une chaîne vide s'il n'y a aucune variable renseignée.
fn custom_variables_block(variables: &[crate::settings::CustomVariable]) -> String {
    let keys: Vec<String> = variables
        .iter()
        .filter(|v| !v.key.trim().is_empty() && !v.value.trim().is_empty())
        .map(|v| format!("- {}", v.key.trim()))
        .collect();
    if keys.is_empty() {
        return String::new();
    }
    // Les accolades `{{clé}}` sont dans une chaîne littérale simple (pas un
    // `format!`), donc aucun échappement nécessaire.
    let instructions = "\n\nInformations personnelles de l'utilisateur. Si le \
texte dicté fait référence à l'une d'elles (par son nom ou une formulation \
proche), place le repère {{clé}} (doubles accolades, avec le nom EXACT de la \
clé) à l'endroit voulu dans ta réponse, à la place de la valeur. N'écris JAMAIS \
la valeur toi-même, ne recopie pas le mot dicté : mets uniquement le repère. \
Exemple : si « iban » est une clé et que l'utilisateur dit « envoie mon iban », \
réponds « Envoie mon {{iban}} ». N'invente aucun repère hors de cette liste. \
Clés disponibles :\n";
    format!("{}{}", instructions, keys.join("\n"))
}

/// Réinjecte les valeurs exactes des raccourcis personnels là où l'IA a laissé
/// un repère `{{clé}}` (voir `custom_variables_block`). Chaque repère est
/// remplacé par la valeur EXACTE de la variable correspondante (nom de clé
/// rogné, insensible à la casse). Un repère inconnu — ou dont la variable est
/// vide — est réduit à son texte intérieur (`{{adresse}}` → `adresse`), jamais
/// laissé avec ses accolades ni inventé. Sûr sur l'UTF-8 : on ne découpe que sur
/// des frontières de caractères. Idempotence garantie : après remplacement il ne
/// reste plus de repère, donc aucune double insertion possible.
fn resolve_variable_tokens(text: &str, variables: &[crate::settings::CustomVariable]) -> String {
    // Rien à faire s'il n'y a aucun repère.
    if !text.contains("{{") {
        return text.to_string();
    }
    let lookup: Vec<(String, String)> = variables
        .iter()
        .filter(|v| !v.key.trim().is_empty() && !v.value.trim().is_empty())
        .map(|v| (v.key.trim().to_lowercase(), v.value.trim().to_string()))
        .collect();

    let bytes = text.as_bytes();
    let mut out = String::with_capacity(text.len());
    let mut i = 0usize;
    while i < text.len() {
        // Ouverture d'un repère `{{` ? (`{` est ASCII, l'indexation octet est sûre)
        if bytes[i] == b'{' && i + 1 < text.len() && bytes[i + 1] == b'{' {
            // `i + 2` tombe sur une frontière de caractère (deux `{` ASCII).
            if let Some(rel) = text[i + 2..].find("}}") {
                let inner = text[i + 2..i + 2 + rel].trim();
                let needle = inner.to_lowercase();
                match lookup.iter().find(|(k, _)| *k == needle) {
                    Some((_, value)) => out.push_str(value),
                    // Repère inconnu ou variable vide → on garde le mot tel quel.
                    None => out.push_str(inner),
                }
                i = i + 2 + rel + 2; // saute la fermeture `}}`
                continue;
            }
        }
        // Caractère ordinaire : avance d'un caractère UTF-8 complet.
        let ch_len = text[i..].chars().next().map(|c| c.len_utf8()).unwrap_or(1);
        out.push_str(&text[i..i + ch_len]);
        i += ch_len;
    }
    out
}

/// Vrai si le caractère fait partie d'un « mot » (lettre ou chiffre) : sert à
/// borner le remplacement des raccourcis aux mots entiers.
fn is_word_char(c: char) -> bool {
    c.is_alphanumeric()
}

/// Remplace toutes les occurrences de `key` (mot entier, insensible à la casse
/// ASCII) par `value`. Sûr sur l'UTF-8 : on ne compare que des tranches alignées
/// sur des frontières de caractères, jamais d'indexation croisée.
fn replace_keyword_ci(haystack: &str, key: &str, value: &str) -> String {
    let klen = key.len();
    if klen == 0 || klen > haystack.len() {
        return haystack.to_string();
    }
    let mut result = String::with_capacity(haystack.len());
    let mut i = 0usize;
    while i < haystack.len() {
        let end = i + klen;
        let matched = end <= haystack.len()
            && haystack.is_char_boundary(i)
            && haystack.is_char_boundary(end)
            && haystack[i..end].eq_ignore_ascii_case(key)
            && (i == 0
                || !haystack[..i]
                    .chars()
                    .next_back()
                    .map(is_word_char)
                    .unwrap_or(false))
            && (end == haystack.len()
                || !haystack[end..]
                    .chars()
                    .next()
                    .map(is_word_char)
                    .unwrap_or(false));
        if matched {
            result.push_str(value);
            i = end;
        } else {
            let l = haystack[i..]
                .chars()
                .next()
                .map(|c| c.len_utf8())
                .unwrap_or(1);
            result.push_str(&haystack[i..i + l]);
            i += l;
        }
    }
    result
}

/// Substitution DÉTERMINISTE des raccourcis personnels (« Mes informations »)
/// par simple remplacement du mot-clé, utilisée UNIQUEMENT quand aucune
/// reformulation n'a eu lieu (Style désactivé, quota atteint, ou IA en échec) :
/// dans ce cas l'IA n'a pas pu poser de repère `{{clé}}`, donc on retombe sur le
/// remplacement mot-à-mot du mot-clé par sa valeur. Quand une reformulation a eu
/// lieu, on passe par `resolve_variable_tokens` à la place (jamais les deux — ça
/// causait la double insertion). Clés les plus longues d'abord (évite qu'une clé
/// courte n'ampute une clé englobante). Texte inchangé s'il n'y a aucun raccourci.
fn apply_custom_variables(text: &str, variables: &[crate::settings::CustomVariable]) -> String {
    let mut pairs: Vec<(String, String)> = variables
        .iter()
        .filter(|v| !v.key.trim().is_empty() && !v.value.trim().is_empty())
        .map(|v| (v.key.trim().to_string(), v.value.trim().to_string()))
        .collect();
    if pairs.is_empty() {
        return text.to_string();
    }
    pairs.sort_by(|a, b| b.0.chars().count().cmp(&a.0.chars().count()));
    let mut out = text.to_string();
    for (key, value) in pairs {
        out = replace_keyword_ci(&out, &key, &value);
    }
    out
}

/// Bloc « contexte à l'écran » (palier A) injecté dans le prompt quand la
/// lecture de contexte est active : le contenu texte de la fenêtre au premier
/// plan, encadré d'un garde-fou strict (lecture seule, ne pas recopier, ignorer
/// si le texte dicté se suffit). Chaîne vide si la fonction est désactivée ou si
/// rien de lisible n'est trouvé. Jamais bloquant, ne panique jamais.
fn screen_context_block(settings: &AppSettings) -> String {
    if !settings.context_reading_enabled {
        return String::new();
    }
    // Palier : la lecture de contexte est une fonctionnalité Nova Ultra (essai
    // Pro inclus, cf. licensing::has). Sans le palier requis, on n'inspecte rien.
    let license_key = settings.license_key.as_deref().unwrap_or("");
    if !crate::licensing::has(
        "context_reading",
        license_key,
        crate::licensing::effective_trial_start(&settings),
    ) {
        return String::new();
    }
    // Cascade privacy-first : palier A (accessibilité) → palier B (OCR local),
    // tous deux dans read_focused_context. Si rien n'est lisible localement :
    // palier C (VLM local, inerte tant qu'aucun serveur vision local n'est
    // configuré) → palier D (vision cloud, seulement si « Vision cloud » est
    // activée ; réservé Nova Ultra, image jamais conservée).
    let ctx = match crate::auto_style::read_focused_context(&settings.auto_style_blocklist, 2000) {
        Some(ctx) if !ctx.trim().is_empty() => Some(ctx),
        _ => crate::screen_vlm::describe_focused_window_local(2000).or_else(|| {
            if settings.context_visual_enabled {
                crate::screen_vision::describe_focused_window(license_key, 2000)
            } else {
                None
            }
        }),
    };
    match ctx {
        Some(ctx) if !ctx.trim().is_empty() => format!(
            "\n\nCONTEXTE À L'ÉCRAN (lecture seule — sert UNIQUEMENT à comprendre \
la situation : à qui ou à quoi l'utilisateur répond. Ne le recopie pas, n'y \
réponds pas directement, ne l'inclus pas dans ta sortie. Si le texte dicté se \
suffit à lui-même, ignore complètement ce contexte.) :\n{}",
            ctx.trim()
        ),
        _ => String::new(),
    }
}

/// Returns `true` when a transcription has no meaningful content to
/// post-process (empty or whitespace-only). Used to skip the post-processing
/// LLM call when nothing was actually transcribed, which would otherwise make
/// the model reply with an error message such as "you need to provide the
/// transcription".
fn is_blank_transcription(transcription: &str) -> bool {
    transcription.trim().is_empty()
}

async fn complete_unless_cancelled<F, C>(operation: F, is_cancelled: C) -> Option<F::Output>
where
    F: Future,
    C: Fn() -> bool,
{
    tokio::pin!(operation);

    loop {
        if is_cancelled() {
            return None;
        }

        if let Ok(result) =
            tokio::time::timeout(CANCELLATION_POLL_INTERVAL, operation.as_mut()).await
        {
            return Some(result);
        }
    }
}

fn should_use_streaming_overlay(style: OverlayStyle, is_streaming: bool) -> bool {
    style == OverlayStyle::Live && is_streaming
}

async fn post_process_transcription(
    app: &AppHandle,
    settings: &AppSettings,
    transcription: &str,
    auto_style_override: Option<&str>,
) -> Option<String> {
    if is_blank_transcription(transcription) {
        debug!("Post-processing skipped because the transcription is empty");
        return None;
    }

    let provider = match settings.active_post_process_provider().cloned() {
        Some(provider) => provider,
        None => {
            debug!("Post-processing enabled but no provider is selected");
            return None;
        }
    };

    // Palier : le moteur en ligne « Turbo » nécessite Nova Ultra (essai Pro
    // inclus, cf. licensing::has). Le moteur local (Intelligence privée,
    // Apple Intelligence) reste gratuit.
    let license_key = settings.license_key.as_deref().unwrap_or("");
    let is_local_engine = provider.id == crate::local_llm::PROVIDER_ID
        || provider.id == crate::settings::APPLE_INTELLIGENCE_PROVIDER_ID;
    if !is_local_engine
        && !crate::licensing::has(
            "online_engine",
            license_key,
            crate::licensing::effective_trial_start(&settings),
        )
    {
        debug!("Turbo (moteur en ligne) réservé à Nova Ultra — reformulation ignorée");
        // Le repli sur le texte brut doit être VISIBLE : sans ce signal,
        // l'utilisateur croyait la reformulation « cassée » alors qu'elle est
        // simplement réservée à Nova Ultra.
        let _ = app.emit("online-engine-locked", ());
        return None;
    }

    let model = settings
        .post_process_models
        .get(&provider.id)
        .cloned()
        .unwrap_or_default();

    if model.trim().is_empty() {
        debug!(
            "Post-processing skipped because provider '{}' has no model configured",
            provider.id
        );
        return None;
    }

    // Style « Automatique » : l'id résolu au moment du `stop` (fenêtre au premier
    // plan) prime sur le Style stocké. Sinon on garde le Style sélectionné.
    let selected_prompt_id = match auto_style_override {
        Some(id) => id.to_string(),
        None => match &settings.post_process_selected_prompt_id {
            Some(id) => id.clone(),
            None => {
                debug!("Post-processing skipped because no prompt is selected");
                return None;
            }
        },
    };

    let prompt = match settings
        .post_process_prompts
        .iter()
        .find(|prompt| prompt.id == selected_prompt_id)
    {
        Some(prompt) => prompt.prompt.clone(),
        None => {
            debug!(
                "Post-processing skipped because prompt '{}' was not found",
                selected_prompt_id
            );
            return None;
        }
    };

    // Palier : les Styles au-delà des gratuits nécessitent Nova Pro ; les Styles
    // PERSONNELS (créés par l'utilisateur, hors presets intégrés) nécessitent
    // Nova Ultra (`custom_styles`). Sans le palier requis, on retombe sur le
    // Style « Transcription améliorée » (gratuit) — la dictée est quand même
    // nettoyée, jamais bloquée.
    let style_is_free = crate::licensing::FREE_STYLE_IDS.contains(&selected_prompt_id.as_str());
    let required_feature = if crate::licensing::is_builtin_style(&selected_prompt_id) {
        "all_styles"
    } else {
        "custom_styles"
    };
    // Style effectivement appliqué (après repli éventuel sur le gratuit) : sert à
    // choisir la température (fidèle vs libre) cohérente avec le prompt réel.
    let mut effective_style_id = selected_prompt_id.clone();
    let prompt = if !style_is_free
        && !crate::licensing::has(
            required_feature,
            license_key,
            crate::licensing::effective_trial_start(&settings),
        ) {
        debug!(
            "Style '{}' réservé ({}) — repli sur le Style gratuit",
            selected_prompt_id, required_feature
        );
        effective_style_id = "default_improve_transcriptions".to_string();
        settings
            .post_process_prompts
            .iter()
            .find(|p| p.id == "default_improve_transcriptions")
            .map(|p| p.prompt.clone())
            .unwrap_or(prompt)
    } else {
        prompt
    };

    if prompt.trim().is_empty() {
        debug!("Post-processing skipped because the selected prompt is empty");
        return None;
    }

    // Température : seulement pour les moteurs OpenAI-compatibles LOCAUX
    // (Intelligence privée / custom) dont on connaît le modèle et qui acceptent
    // sûrement le champ. JAMAIS pour Turbo (relais au modèle serveur inconnu :
    // certains modèles « reasoning » refusent une température ≠ 1). Voir le champ
    // `temperature` de `ChatCompletionRequest`.
    let temperature = if provider.id == crate::local_llm::PROVIDER_ID || provider.id == "custom" {
        Some(temperature_for_style(&effective_style_id))
    } else {
        None
    };

    // Intelligence privée : démarre (ou confirme actif) le moteur local
    // embarqué avec le profil sélectionné (`model` porte l'id du profil ici,
    // pas un nom de modèle). Jamais bloquant pour la dictée : un échec ne
    // fait qu'annuler la reformulation, le texte brut reste collé.
    if provider.id == crate::local_llm::PROVIDER_ID {
        if let Err(e) = crate::local_llm::ensure_server_running(app, &model).await {
            debug!("Intelligence privée indisponible : {e}");
            return None;
        }
    }

    debug!(
        "Starting LLM post-processing with provider '{}' (model: {})",
        provider.id, model
    );

    // Turbo : la « clé » transmise est le jeton de licence — le serveur relaie
    // vers le fournisseur avec SA propre clé (jamais exposée). Les autres
    // fournisseurs utilisent la clé saisie par l'utilisateur.
    let api_key = if provider.id == "nova_turbo" {
        license_key.to_string()
    } else {
        settings
            .post_process_api_keys
            .get(&provider.id)
            .cloned()
            .unwrap_or_default()
    };

    // Disable reasoning for providers where post-processing rarely benefits from it.
    // - custom: top-level reasoning_effort (works for local OpenAI-compat servers)
    // - openrouter: nested reasoning object; exclude:true also keeps reasoning text
    //   out of the response so it can't pollute structured-output JSON parsing
    let (reasoning_effort, reasoning) = match provider.id.as_str() {
        // Moteurs locaux OpenAI-compatibles (custom / Intelligence privée).
        "custom" => (Some("none".to_string()), None),
        id if id == crate::local_llm::PROVIDER_ID => (Some("none".to_string()), None),
        "openrouter" => (
            None,
            Some(crate::llm_client::ReasoningConfig {
                effort: Some("none".to_string()),
                exclude: Some(true),
            }),
        ),
        _ => (None, None),
    };

    // Contexte à l'écran (palier A) : lu une fois ici, réutilisé dans les deux
    // chemins de prompt (structuré et hérité). Vide si la fonction est éteinte.
    let context_block = screen_context_block(settings);

    if provider.supports_structured_output {
        debug!("Using structured outputs for provider '{}'", provider.id);

        let system_prompt = format!(
            "{}{}{}",
            build_system_prompt(&prompt),
            custom_variables_block(&settings.custom_variables),
            context_block
        );
        let user_content = transcription.to_string();

        // Handle Apple Intelligence separately since it uses native Swift APIs
        if provider.id == APPLE_INTELLIGENCE_PROVIDER_ID {
            #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
            {
                if !apple_intelligence::check_apple_intelligence_availability() {
                    debug!(
                        "Apple Intelligence selected but not currently available on this device"
                    );
                    return None;
                }

                let token_limit = model.trim().parse::<i32>().unwrap_or(0);
                return match apple_intelligence::process_text_with_system_prompt(
                    &system_prompt,
                    &user_content,
                    token_limit,
                ) {
                    Ok(result) => {
                        let result = clean_llm_output(&result);
                        if result.trim().is_empty() {
                            debug!("Apple Intelligence returned an empty response");
                            None
                        } else {
                            debug!(
                                "Apple Intelligence post-processing succeeded. Output length: {} chars",
                                result.len()
                            );
                            Some(result)
                        }
                    }
                    Err(err) => {
                        error!("Apple Intelligence post-processing failed: {}", err);
                        None
                    }
                };
            }

            #[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
            {
                debug!("Apple Intelligence provider selected on unsupported platform");
                return None;
            }
        }

        // Define JSON schema for transcription output
        let json_schema = serde_json::json!({
            "type": "object",
            "properties": {
                (TRANSCRIPTION_FIELD): {
                    "type": "string",
                    "description": "The cleaned and processed transcription text"
                }
            },
            "required": [TRANSCRIPTION_FIELD],
            "additionalProperties": false
        });

        match crate::llm_client::send_chat_completion_with_schema(
            &provider,
            api_key.clone(),
            &model,
            user_content,
            Some(system_prompt),
            Some(json_schema),
            temperature,
            reasoning_effort.clone(),
            reasoning.clone(),
        )
        .await
        {
            Ok(Some(content)) => {
                // Parse the JSON response to extract the transcription field
                match serde_json::from_str::<serde_json::Value>(&content) {
                    Ok(json) => {
                        if let Some(transcription_value) =
                            json.get(TRANSCRIPTION_FIELD).and_then(|t| t.as_str())
                        {
                            let result = clean_llm_output(transcription_value);
                            if result.trim().is_empty() {
                                // Blank reformulation → fall back to raw text
                                // (never leave the cursor empty).
                                debug!("Structured output returned an empty transcription; falling back to raw text");
                                return None;
                            }
                            debug!(
                                "Structured output post-processing succeeded for provider '{}'. Output length: {} chars",
                                provider.id,
                                result.len()
                            );
                            return Some(result);
                        } else {
                            error!("Structured output response missing 'transcription' field");
                            return Some(clean_llm_output(&content));
                        }
                    }
                    Err(e) => {
                        error!(
                            "Failed to parse structured output JSON: {}. Returning raw content.",
                            e
                        );
                        return Some(clean_llm_output(&content));
                    }
                }
            }
            Ok(None) => {
                error!("LLM API response has no content");
                return None;
            }
            Err(e) => {
                warn!(
                    "Structured output failed for provider '{}': {}. Falling back to legacy mode.",
                    provider.id, e
                );
                // Fall through to legacy mode below
            }
        }
    }

    // Legacy mode: Replace ${output} variable in the prompt with the actual text
    let processed_prompt = format!(
        "{}{}{}",
        prompt.replace("${output}", transcription),
        custom_variables_block(&settings.custom_variables),
        context_block
    );
    debug!("Processed prompt length: {} chars", processed_prompt.len());

    match crate::llm_client::send_chat_completion(
        &provider,
        api_key,
        &model,
        processed_prompt,
        temperature,
        reasoning_effort,
        reasoning,
    )
    .await
    {
        Ok(Some(content)) => {
            let content = clean_llm_output(&content);
            if content.trim().is_empty() {
                // Blank reformulation → fall back to raw text (never empty cursor).
                debug!("LLM returned empty content; falling back to raw text");
                return None;
            }
            debug!(
                "LLM post-processing succeeded for provider '{}'. Output length: {} chars",
                provider.id,
                content.len()
            );
            Some(content)
        }
        Ok(None) => {
            error!("LLM API response has no content");
            None
        }
        Err(e) => {
            error!(
                "LLM post-processing failed for provider '{}': {}. Falling back to original transcription.",
                provider.id,
                e
            );
            None
        }
    }
}

async fn maybe_convert_chinese_variant(
    effective_language: &str,
    transcription: &str,
) -> Option<String> {
    // Gate on the language the model actually transcribed in (the effective
    // language), not the persisted intent. A leftover zh-Hans/zh-Hant intent
    // from a previously selected model must not run OpenCC S2T/T2S over output a
    // non-Chinese model produced — that would silently rewrite any shared CJK
    // characters (e.g. Japanese kanji) in the result.
    let is_simplified = effective_language == "zh-Hans";
    let is_traditional = effective_language == "zh-Hant";

    if !is_simplified && !is_traditional {
        debug!("effective language is not Simplified or Traditional Chinese; skipping conversion");
        return None;
    }

    debug!(
        "Starting Chinese variant conversion using OpenCC for language: {}",
        effective_language
    );

    // Use OpenCC to convert based on selected language
    let config = if is_simplified {
        // Convert Traditional Chinese to Simplified Chinese
        BuiltinConfig::Tw2sp
    } else {
        // Convert Simplified Chinese to Traditional Chinese
        BuiltinConfig::S2tw
    };

    match OpenCC::from_config(config) {
        Ok(converter) => {
            let converted = converter.convert(transcription);
            debug!(
                "OpenCC translation completed. Input length: {}, Output length: {}",
                transcription.len(),
                converted.len()
            );
            Some(converted)
        }
        Err(e) => {
            error!("Failed to initialize OpenCC converter: {}. Falling back to original transcription.", e);
            None
        }
    }
}

pub(crate) struct ProcessedTranscription {
    pub final_text: String,
    pub post_processed_text: Option<String>,
    pub post_process_prompt: Option<String>,
}

/// Resolve the persisted language *intent* into the language the currently-loaded
/// model will actually use — the same capability-aware coercion the transcription
/// paths apply (see [`crate::managers::model::effective_language`]). Post-processing
/// resolves it independently so it agrees with the language the transcription ran
/// in, without threading a value through the pipeline.
fn resolve_effective_language(app: &AppHandle, settings: &AppSettings) -> String {
    let tm = app.state::<Arc<TranscriptionManager>>();
    let model_manager = app.state::<Arc<ModelManager>>();
    let active_model = tm
        .get_current_model()
        .unwrap_or_else(|| settings.selected_model.clone());
    match model_manager.get_model_info(&active_model) {
        Some(info) => crate::managers::model::effective_language(
            &settings.selected_language,
            &info.supported_languages,
            info.supports_language_detection,
        ),
        None => settings.selected_language.clone(),
    }
}

pub(crate) async fn process_transcription_output(
    app: &AppHandle,
    transcription: &str,
    post_process: bool,
    auto_style_override: Option<String>,
) -> ProcessedTranscription {
    let settings = get_settings(app);
    let mut final_text = transcription.to_string();
    let mut post_processed_text: Option<String> = None;
    let mut post_process_prompt: Option<String> = None;
    // Vrai dès qu'une reformulation IA a réellement produit un texte : décide
    // quel mécanisme de raccourcis personnels s'applique ensuite (repères vs
    // remplacement mot-à-mot — jamais les deux).
    let mut reformulation_applied = false;

    // Resolve the language the transcription actually ran in (the persisted
    // intent coerced against the loaded model's capabilities) so OpenCC keys off
    // the effective language rather than a possibly-stale intent.
    let effective_language = resolve_effective_language(app, &settings);
    if let Some(converted_text) =
        maybe_convert_chinese_variant(&effective_language, transcription).await
    {
        final_text = converted_text;
    }

    if post_process {
        // Quota Free : les reformulations sont plafonnées à 10/jour. Au-delà, on
        // saute le Style et on colle le texte brut (jamais de curseur vide), en
        // informant le frontend. La dictée, elle, n'est jamais bloquée.
        if crate::quota::is_rewrite_blocked(app) {
            debug!("Reformulation ignorée : quota gratuit quotidien atteint");
            let _ = app.emit("quota-blocked", ());
        } else {
            // Filet de sécurité global : quoi qu'il arrive côté moteur (serveur
            // local qui pend, réseau mort, modèle en chargement), la
            // reformulation ne peut pas dépasser POST_PROCESS_TIMEOUT. Au-delà,
            // on colle le texte brut et on informe — jamais de spinner infini.
            match tokio::time::timeout(
                POST_PROCESS_TIMEOUT,
                post_process_transcription(
                    app,
                    &settings,
                    &final_text,
                    auto_style_override.as_deref(),
                ),
            )
            .await
            {
                Ok(Some(processed_text)) => {
                    reformulation_applied = true;
                    post_processed_text = Some(processed_text.clone());
                    final_text = processed_text;
                    // Une reformulation a réellement été appliquée : on la décompte.
                    crate::quota::record_rewrite(app);

                    // Style effectif (le Style auto résolu prime, pour l'historique).
                    let effective_id = auto_style_override
                        .as_deref()
                        .or(settings.post_process_selected_prompt_id.as_deref());
                    if let Some(prompt_id) = effective_id {
                        if let Some(prompt) = settings
                            .post_process_prompts
                            .iter()
                            .find(|prompt| prompt.id == prompt_id)
                        {
                            post_process_prompt = Some(prompt.prompt.clone());
                        }
                    }
                }
                Ok(None) => {}
                Err(_) => {
                    log::warn!(
                        "Reformulation abandonnée après {:?} — texte brut collé",
                        POST_PROCESS_TIMEOUT
                    );
                    let _ = app.emit("post-process-timeout", ());
                }
            }
        }
    } else if final_text != transcription {
        post_processed_text = Some(final_text.clone());
    }

    // Raccourcis personnels (« Mes informations ») — DEUX chemins EXCLUSIFS, pour
    // ne jamais insérer la valeur deux fois (l'ancien code lançait les deux, d'où
    // le doublon « iban » collé en double) :
    //  • reformulation appliquée → l'IA a placé des repères `{{clé}}` dans une
    //    phrase logique ; on y réinjecte la valeur EXACTE (jamais transmise au
    //    modèle) via `resolve_variable_tokens` ;
    //  • pas de reformulation (Style désactivé, quota atteint, IA en échec) →
    //    aucun repère n'a pu être posé, on retombe sur le remplacement
    //    déterministe du mot-clé sur le texte brut.
    let substituted = if reformulation_applied {
        resolve_variable_tokens(&final_text, &settings.custom_variables)
    } else {
        apply_custom_variables(&final_text, &settings.custom_variables)
    };
    if substituted != final_text {
        final_text = substituted;
        post_processed_text = Some(final_text.clone());
    }

    ProcessedTranscription {
        final_text,
        post_processed_text,
        post_process_prompt,
    }
}

impl ShortcutAction for TranscribeAction {
    fn start(&self, app: &AppHandle, binding_id: &str, _shortcut_str: &str) {
        // La dictée est TOUJOURS illimitée au palier gratuit. Seules les
        // reformulations (Styles) sont plafonnées, plus bas dans
        // `process_transcription_output` : jamais de blocage avant l'enregistrement.
        let start_time = Instant::now();
        debug!("TranscribeAction::start called for binding: {}", binding_id);

        // Load model in the background
        let tm = app.state::<Arc<TranscriptionManager>>();
        let rm = app.state::<Arc<AudioRecordingManager>>();

        // Load ASR model and VAD model in parallel
        let kickoff_started = Instant::now();
        tm.initiate_model_load();
        let rm_clone = Arc::clone(&rm);
        std::thread::spawn(move || {
            if let Err(e) = rm_clone.preload_vad() {
                debug!("VAD pre-load failed: {}", e);
            }
        });
        let kickoff_elapsed = kickoff_started.elapsed();

        let binding_id = binding_id.to_string();
        let tray_started = Instant::now();
        change_tray_icon(app, TrayIconState::Recording);
        let tray_elapsed = tray_started.elapsed();

        // Get the microphone mode to determine audio feedback timing
        let plan_started = Instant::now();
        let settings = get_settings(app);
        let is_always_on = settings.always_on_microphone;

        let selected_model_info = app
            .state::<Arc<ModelManager>>()
            .get_model_info(&settings.selected_model);

        // Use the app-facing model capability as the single pre-recording source
        // for live streaming decisions. Unknown support is represented as false
        // until the model registry is updated by discovery or runtime load.
        let model_supports_streaming = selected_model_info
            .as_ref()
            .map(|m| m.supports_streaming)
            .unwrap_or(false);
        let vad_policy = if !settings.vad_enabled {
            VadPolicy::Disabled
        } else if model_supports_streaming {
            VadPolicy::Streaming
        } else {
            VadPolicy::Offline
        };
        if model_supports_streaming {
            tm.start_stream();
        }
        let plan_elapsed = plan_started.elapsed();

        // Sizing the overlay follows the same advertised capability. A model that
        // doesn't stream (or whose capability is not known yet) gets the compact
        // pill instead of an oversized transparent live window.
        let overlay_started = Instant::now();
        match settings.overlay_style {
            OverlayStyle::Live if model_supports_streaming => utils::show_streaming_overlay(app),
            OverlayStyle::Live | OverlayStyle::Minimal => show_recording_overlay(app),
            OverlayStyle::None => {} // show_overlay_state no-ops on None anyway
        }
        // Everything above runs before capture can begin, so each span here is
        // added keypress->capture latency.
        debug!(
            "start-path pre-recording steps: model_kickoff={:?} tray={:?} settings+stream_plan={:?} overlay={:?}",
            kickoff_elapsed,
            tray_elapsed,
            plan_elapsed,
            overlay_started.elapsed()
        );
        debug!("Microphone mode - always_on: {}", is_always_on);

        let mut recording_error: Option<String> = None;
        if is_always_on {
            // Always-on mode: Play audio feedback immediately, then apply mute after sound finishes
            debug!("Always-on mode: Playing audio feedback immediately");
            let rm_clone = Arc::clone(&rm);
            let app_clone = app.clone();
            // The blocking helper exits immediately if audio feedback is disabled,
            // so we can always reuse this thread to ensure mute happens right after playback.
            std::thread::spawn(move || {
                play_feedback_sound_blocking(&app_clone, SoundType::Start);
                rm_clone.apply_mute();
            });

            if let Err(e) = rm.try_start_recording(&binding_id, vad_policy) {
                debug!("Recording failed: {}", e);
                recording_error = Some(e);
            }
        } else {
            // On-demand mode: Start recording first, then play audio feedback, then apply mute
            // This allows the microphone to be activated before playing the sound
            debug!("On-demand mode: Starting recording first, then audio feedback");
            let recording_start_time = Instant::now();
            match rm.try_start_recording(&binding_id, vad_policy) {
                Ok(()) => {
                    debug!("Recording started in {:?}", recording_start_time.elapsed());
                    // Small delay to ensure microphone stream is active
                    let app_clone = app.clone();
                    let rm_clone = Arc::clone(&rm);
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(100));
                        debug!("Handling delayed audio feedback/mute sequence");
                        // Helper handles disabled audio feedback by returning early, so we reuse it
                        // to keep mute sequencing consistent in every mode.
                        play_feedback_sound_blocking(&app_clone, SoundType::Start);
                        rm_clone.apply_mute();
                    });
                }
                Err(e) => {
                    debug!("Failed to start recording: {}", e);
                    recording_error = Some(e);
                }
            }
        }

        if recording_error.is_none() {
            // Dynamically register the cancel shortcut in a separate task to avoid deadlock
            shortcut::register_cancel_shortcut(app);
        } else {
            // Starting failed (for example due to blocked microphone permissions).
            // Revert UI state so we don't stay stuck in the recording overlay.
            tm.cancel_stream();
            utils::hide_recording_overlay(app);
            change_tray_icon(app, TrayIconState::Idle);
            if let Some(err) = recording_error {
                let error_type = if is_microphone_access_denied(&err) {
                    "microphone_permission_denied"
                } else if is_no_input_device_error(&err) {
                    "no_input_device"
                } else {
                    "unknown"
                };
                let _ = app.emit(
                    "recording-error",
                    RecordingErrorEvent {
                        error_type: error_type.to_string(),
                        detail: Some(err),
                    },
                );
            }
        }

        debug!(
            "TranscribeAction::start completed in {:?}",
            start_time.elapsed()
        );
    }

    fn stop(&self, app: &AppHandle, binding_id: &str, _shortcut_str: &str) {
        // Unregister the cancel shortcut when transcription stops
        shortcut::unregister_cancel_shortcut(app);

        let stop_time = Instant::now();
        debug!("TranscribeAction::stop called for binding: {}", binding_id);

        let ah = app.clone();
        let rm = Arc::clone(&app.state::<Arc<AudioRecordingManager>>());
        let tm = Arc::clone(&app.state::<Arc<TranscriptionManager>>());
        let hm = Arc::clone(&app.state::<Arc<HistoryManager>>());

        change_tray_icon(app, TrayIconState::Transcribing);
        // Stop should give immediate visual feedback. Live streaming can keep
        // the larger panel, but it still switches from listening to a working
        // spinner while the stream finalizes. Non-streaming paths use the
        // compact transcribing pill (None no-ops in show_*).
        let style = get_settings(app).overlay_style;
        // Capture this before finalizing the stream so every later working state
        // targets the same overlay that was shown for this transcription.
        let use_streaming_overlay = should_use_streaming_overlay(style, tm.is_streaming());
        if use_streaming_overlay {
            tm.emit_stream_working(StreamWorkKind::Transcribing);
        } else {
            show_transcribing_overlay(app);
        }

        // Unmute before playing audio feedback so the stop sound is audible
        rm.remove_mute();

        // Play audio feedback for recording stop
        play_feedback_sound(app, SoundType::Stop);

        let binding_id = binding_id.to_string(); // Clone binding_id for the async task
                                                 // La dictée principale applique aussi les Styles dès que la reformulation
                                                 // est activée (toggle « Reformulation par IA (Styles) », ON par défaut) :
                                                 // la reformulation ne dépend plus d'un second raccourci dédié. Le
                                                 // raccourci de post-traitement (`self.post_process`) force l'application
                                                 // même si le toggle était coupé.
        let post_process = self.post_process || get_settings(app).post_process_enabled;
        let cancel_generation = rm.cancel_generation();

        // Style « Automatique » : on lit la fenêtre au premier plan MAINTENANT
        // (au relâchement de la touche, là où l'utilisateur regarde) — plus
        // fiable qu'au collage, car la transcription tourne en async ensuite.
        // Un seul appel synchrone, défensif : renvoie None si l'auto n'est pas
        // sélectionné ou si la lecture échoue (le Style choisi est alors gardé).
        let auto_style_override = if post_process {
            crate::auto_style::resolve_override(&get_settings(app))
        } else {
            None
        };

        tauri::async_runtime::spawn(async move {
            let _guard = FinishGuard(ah.clone());
            debug!(
                "Starting async transcription task for binding: {}",
                binding_id
            );

            let stop_recording_time = Instant::now();
            if let Some(samples) = rm.stop_recording(&binding_id, cancel_generation) {
                debug!(
                    "Recording stopped and samples retrieved in {:?}, sample count: {}",
                    stop_recording_time.elapsed(),
                    samples.len()
                );

                if rm.was_cancelled_since(cancel_generation) {
                    debug!("Transcription operation cancelled after recording stop");
                    tm.cancel_stream();
                    utils::hide_recording_overlay(&ah);
                    change_tray_icon(&ah, TrayIconState::Idle);
                    return;
                }

                if samples.is_empty() {
                    debug!("Recording produced no audio samples; skipping persistence");
                    // Tear down any streaming worker so its channel doesn't leak
                    // and block the next start_stream.
                    tm.cancel_stream();
                    utils::hide_recording_overlay(&ah);
                    change_tray_icon(&ah, TrayIconState::Idle);
                } else {
                    // Save WAV concurrently with transcription
                    let sample_count = samples.len();
                    let file_name = format!("handy-{}.wav", chrono::Utc::now().timestamp());
                    let wav_path = hm.recordings_dir().join(&file_name);
                    let wav_path_for_verify = wav_path.clone();
                    let samples_for_wav = samples.clone();
                    let wav_handle = tauri::async_runtime::spawn_blocking(move || {
                        crate::audio_toolkit::save_wav_file(&wav_path, &samples_for_wav)
                    });

                    // Transcribe concurrently with WAV save. If a live stream was
                    // running, finalize it and use its text (all audio was already
                    // fed to the stream); otherwise batch-transcribe the samples.
                    let transcription_time = Instant::now();
                    let transcription_result = match tm.finalize_stream() {
                        // A finalized stream with usable text wins. An empty result
                        // (no active stream, produced nothing, or a finalize error
                        // after the engine was returned) falls back to a full batch
                        // transcription of the same audio. A finalize timeout is
                        // surfaced instead — the worker may still hold the engine,
                        // so a batch fallback would contend with it.
                        Ok(Some(text)) if !text.trim().is_empty() => Ok(text),
                        Ok(_) => tm.transcribe(samples),
                        Err(err) => Err(err),
                    };

                    // Await WAV save and verify
                    let wav_saved = match wav_handle.await {
                        Ok(Ok(())) => {
                            match crate::audio_toolkit::verify_wav_file(
                                &wav_path_for_verify,
                                sample_count,
                            ) {
                                Ok(()) => true,
                                Err(e) => {
                                    error!("WAV verification failed: {}", e);
                                    false
                                }
                            }
                        }
                        Ok(Err(e)) => {
                            error!("Failed to save WAV file: {}", e);
                            false
                        }
                        Err(e) => {
                            error!("WAV save task panicked: {}", e);
                            false
                        }
                    };

                    if rm.was_cancelled_since(cancel_generation) {
                        debug!("Transcription operation cancelled before output handling");
                        utils::hide_recording_overlay(&ah);
                        change_tray_icon(&ah, TrayIconState::Idle);
                        return;
                    }

                    match transcription_result {
                        Ok(transcription) => {
                            debug!(
                                "Transcription completed in {:?}: '{}'",
                                transcription_time.elapsed(),
                                transcription
                            );

                            if post_process {
                                if use_streaming_overlay {
                                    tm.emit_stream_working(StreamWorkKind::Polishing);
                                } else {
                                    show_processing_overlay(&ah);
                                }
                            }
                            let Some(processed) = complete_unless_cancelled(
                                process_transcription_output(
                                    &ah,
                                    &transcription,
                                    post_process,
                                    auto_style_override.clone(),
                                ),
                                || rm.was_cancelled_since(cancel_generation),
                            )
                            .await
                            else {
                                debug!("Transcription operation cancelled during output handling");
                                utils::hide_recording_overlay(&ah);
                                change_tray_icon(&ah, TrayIconState::Idle);
                                return;
                            };

                            if rm.was_cancelled_since(cancel_generation) {
                                debug!("Transcription operation cancelled before paste");
                                utils::hide_recording_overlay(&ah);
                                change_tray_icon(&ah, TrayIconState::Idle);
                                return;
                            }

                            // Save to history if WAV was saved
                            if wav_saved {
                                if let Err(err) = hm.save_entry(
                                    file_name,
                                    transcription,
                                    post_process,
                                    processed.post_processed_text.clone(),
                                    processed.post_process_prompt.clone(),
                                ) {
                                    error!("Failed to save history entry: {}", err);
                                }
                            }

                            if processed.final_text.is_empty() {
                                utils::hide_recording_overlay(&ah);
                                change_tray_icon(&ah, TrayIconState::Idle);
                            } else {
                                let ah_clone = ah.clone();
                                let paste_time = Instant::now();
                                let final_text = processed.final_text;
                                // Compté dans le quota Free après un collage réussi.
                                let paste_char_count = final_text.chars().count() as u32;
                                let rm_for_paste = Arc::clone(&rm);
                                ah.run_on_main_thread(move || {
                                    if rm_for_paste.was_cancelled_since(cancel_generation) {
                                        debug!("Transcription operation cancelled before paste");
                                        utils::hide_recording_overlay(&ah_clone);
                                        change_tray_icon(&ah_clone, TrayIconState::Idle);
                                        return;
                                    }

                                    match utils::paste(final_text, ah_clone.clone()) {
                                        Ok(()) => {
                                            crate::week_stats::record_chars(
                                                &ah_clone,
                                                paste_char_count,
                                            );
                                            debug!(
                                                "Text pasted successfully in {:?}",
                                                paste_time.elapsed()
                                            );
                                        }
                                        Err(e) => {
                                            error!("Failed to paste transcription: {}", e);
                                            let _ = ah_clone.emit("paste-error", ());
                                        }
                                    }
                                    utils::hide_recording_overlay(&ah_clone);
                                    change_tray_icon(&ah_clone, TrayIconState::Idle);
                                })
                                .unwrap_or_else(|e| {
                                    error!("Failed to run paste on main thread: {:?}", e);
                                    utils::hide_recording_overlay(&ah);
                                    change_tray_icon(&ah, TrayIconState::Idle);
                                });
                            }
                        }
                        Err(err) => {
                            if rm.was_cancelled_since(cancel_generation) {
                                debug!(
                                    "Transcription operation cancelled after transcription error"
                                );
                                utils::hide_recording_overlay(&ah);
                                change_tray_icon(&ah, TrayIconState::Idle);
                                return;
                            }

                            error!("Transcription failed: {}", err);
                            // Surface the failure to the UI (toast). The full
                            // message is also in handy.log via the line above.
                            let _ = ah.emit("transcription-error", err.to_string());
                            // Save entry with empty text so user can retry
                            if wav_saved {
                                if let Err(save_err) = hm.save_entry(
                                    file_name,
                                    String::new(),
                                    post_process,
                                    None,
                                    None,
                                ) {
                                    error!("Failed to save failed history entry: {}", save_err);
                                }
                            }
                            utils::hide_recording_overlay(&ah);
                            change_tray_icon(&ah, TrayIconState::Idle);
                        }
                    }
                }
            } else {
                debug!("No samples retrieved from recording stop");
                // Tear down any streaming worker so its channel doesn't leak.
                tm.cancel_stream();
                utils::hide_recording_overlay(&ah);
                change_tray_icon(&ah, TrayIconState::Idle);
            }
        });

        debug!(
            "TranscribeAction::stop completed in {:?}",
            stop_time.elapsed()
        );
    }
}

// Cancel Action
struct CancelAction;

impl ShortcutAction for CancelAction {
    fn start(&self, app: &AppHandle, _binding_id: &str, _shortcut_str: &str) {
        utils::cancel_current_operation(app);
    }

    fn stop(&self, _app: &AppHandle, _binding_id: &str, _shortcut_str: &str) {
        // Nothing to do on stop for cancel
    }
}

// Test Action
struct TestAction;

impl ShortcutAction for TestAction {
    fn start(&self, app: &AppHandle, binding_id: &str, shortcut_str: &str) {
        log::info!(
            "Shortcut ID '{}': Started - {} (App: {})", // Changed "Pressed" to "Started" for consistency
            binding_id,
            shortcut_str,
            app.package_info().name
        );
    }

    fn stop(&self, app: &AppHandle, binding_id: &str, shortcut_str: &str) {
        log::info!(
            "Shortcut ID '{}': Stopped - {} (App: {})", // Changed "Released" to "Stopped" for consistency
            binding_id,
            shortcut_str,
            app.package_info().name
        );
    }
}

// Static Action Map
pub static ACTION_MAP: Lazy<HashMap<String, Arc<dyn ShortcutAction>>> = Lazy::new(|| {
    let mut map = HashMap::new();
    map.insert(
        "transcribe".to_string(),
        Arc::new(TranscribeAction {
            post_process: false,
        }) as Arc<dyn ShortcutAction>,
    );
    map.insert(
        "transcribe_with_post_process".to_string(),
        Arc::new(TranscribeAction { post_process: true }) as Arc<dyn ShortcutAction>,
    );
    map.insert(
        "cancel".to_string(),
        Arc::new(CancelAction) as Arc<dyn ShortcutAction>,
    );
    map.insert(
        "test".to_string(),
        Arc::new(TestAction) as Arc<dyn ShortcutAction>,
    );
    map
});

#[cfg(test)]
mod tests {
    use super::{
        apply_custom_variables, clean_llm_output, complete_unless_cancelled,
        custom_variables_block, is_blank_transcription, replace_keyword_ci,
        resolve_variable_tokens, should_use_streaming_overlay, temperature_for_style,
    };
    use crate::settings::CustomVariable;
    use crate::settings::OverlayStyle;
    use std::future;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use std::thread;
    use std::time::Duration;

    #[test]
    fn blank_transcription_is_detected() {
        assert!(is_blank_transcription(""));
        assert!(is_blank_transcription("   "));
        assert!(is_blank_transcription("\t\n  \r\n"));
    }

    #[test]
    fn non_blank_transcription_is_kept() {
        assert!(!is_blank_transcription("hello"));
        assert!(!is_blank_transcription("  hello  "));
    }

    fn var(key: &str, value: &str) -> CustomVariable {
        CustomVariable {
            key: key.to_string(),
            value: value.to_string(),
        }
    }

    #[test]
    fn keyword_substitution_is_case_insensitive_and_word_bounded() {
        // Casse ignorée, ponctuation adjacente conservée.
        assert_eq!(
            replace_keyword_ci("Voici mon iban.", "mon IBAN", "FR76 3000"),
            "Voici FR76 3000."
        );
        // Ne remplace pas à l'intérieur d'un mot plus long.
        assert_eq!(
            replace_keyword_ci("abcmon ibanxyz", "mon iban", "X"),
            "abcmon ibanxyz"
        );
    }

    #[test]
    fn custom_variables_apply_longest_key_first() {
        let vars = vec![var("mon IBAN", "FR76 3000"), var("IBAN", "GENERIC")];
        // La clé la plus longue gagne : « mon IBAN » n'est pas amputé par « IBAN ».
        assert_eq!(
            apply_custom_variables("Envoie mon IBAN stp", &vars),
            "Envoie FR76 3000 stp"
        );
    }

    #[test]
    fn custom_variables_noop_without_entries() {
        assert_eq!(apply_custom_variables("rien à faire", &[]), "rien à faire");
        // Clé ou valeur vide ignorée.
        let vars = vec![var("  ", "x"), var("clé", "  ")];
        assert_eq!(apply_custom_variables("clé", &vars), "clé");
    }

    #[test]
    fn variable_tokens_are_replaced_by_exact_value() {
        let vars = vec![var("iban", "FR76 3000 1234"), var("adresse", "12 rue X")];
        // Repère `{{clé}}` → valeur exacte, une seule fois, dans la phrase.
        assert_eq!(
            resolve_variable_tokens("Voici mon {{iban}} pour le virement.", &vars),
            "Voici mon FR76 3000 1234 pour le virement."
        );
        // Plusieurs repères, insensible à la casse et aux espaces intérieurs.
        assert_eq!(
            resolve_variable_tokens("{{IBAN}} et {{ adresse }}", &vars),
            "FR76 3000 1234 et 12 rue X"
        );
    }

    #[test]
    fn variable_tokens_no_double_insertion() {
        // Cas du bug d'origine : l'IA garde le libellé « IBAN : » ET pose le
        // repère. La valeur ne doit apparaître qu'UNE fois (le libellé « IBAN »
        // nu n'est pas un repère, il est laissé tel quel).
        let vars = vec![var("iban", "FR76 3000")];
        assert_eq!(
            resolve_variable_tokens("IBAN : {{iban}}", &vars),
            "IBAN : FR76 3000"
        );
    }

    #[test]
    fn variable_tokens_unknown_or_empty_kept_as_word() {
        // Variable renseignée absente / repère inconnu → mot intérieur gardé,
        // jamais d'accolades résiduelles, jamais de valeur inventée.
        let vars = vec![var("iban", "FR76")];
        assert_eq!(
            resolve_variable_tokens("mon {{adresse}} et {{iban}}", &vars),
            "mon adresse et FR76"
        );
        // Variable au champ vide → traitée comme inconnue (mot gardé tel quel).
        let vars_empty = vec![var("adresse", "   ")];
        assert_eq!(
            resolve_variable_tokens("mon {{adresse}}", &vars_empty),
            "mon adresse"
        );
    }

    #[test]
    fn variable_tokens_noop_without_markers() {
        let vars = vec![var("iban", "FR76")];
        // Aucun repère : texte strictement inchangé (le mot « iban » nu reste).
        assert_eq!(
            resolve_variable_tokens("je parle de mon iban", &vars),
            "je parle de mon iban"
        );
        // Accolade seule non fermée : laissée telle quelle, pas de panique.
        assert_eq!(
            resolve_variable_tokens("prix {{ à définir", &vars),
            "prix {{ à définir"
        );
    }

    #[test]
    fn variable_tokens_utf8_safe_around_markers() {
        let vars = vec![var("iban", "FR76")];
        // Caractères multi-octets autour du repère : découpe sûre.
        assert_eq!(
            resolve_variable_tokens("réémettre → {{iban}} café", &vars),
            "réémettre → FR76 café"
        );
    }

    #[test]
    fn clean_output_strips_wrapping_quotes() {
        assert_eq!(clean_llm_output("\"Bonjour le monde\""), "Bonjour le monde");
        assert_eq!(clean_llm_output("« Bonjour »"), "Bonjour");
        assert_eq!(clean_llm_output("\u{201C}Salut\u{201D}"), "Salut");
        // Apostrophe interne : NE déclenche PAS le retrait (1er car. n'est pas un guillemet).
        assert_eq!(clean_llm_output("L'équipe est prête"), "L'équipe est prête");
    }

    #[test]
    fn clean_output_strips_meta_preamble_but_keeps_real_content() {
        assert_eq!(
            clean_llm_output("Voici le texte reformulé : Bonjour à tous"),
            "Bonjour à tous"
        );
        assert_eq!(
            clean_llm_output("Here is the rewritten text: Hello there"),
            "Hello there"
        );
        // Préambule méta PUIS guillemets englobants.
        assert_eq!(
            clean_llm_output("Voici le texte : \"Merci beaucoup\""),
            "Merci beaucoup"
        );
        // NE DOIT PAS amputer un vrai contenu qui commence par « Voici … : ».
        assert_eq!(
            clean_llm_output("Voici le compte-rendu : réunion à 15h"),
            "Voici le compte-rendu : réunion à 15h"
        );
    }

    #[test]
    fn clean_output_strips_code_fence() {
        assert_eq!(clean_llm_output("```\ndu code\n```"), "du code");
        assert_eq!(clean_llm_output("```json\n{\"a\":1}\n```"), "{\"a\":1}");
    }

    #[test]
    fn clean_output_noop_on_plain_text_and_strips_zero_width() {
        assert_eq!(
            clean_llm_output("Un texte tout simple."),
            "Un texte tout simple."
        );
        assert_eq!(clean_llm_output("a\u{200B}b"), "ab");
    }

    #[test]
    fn temperature_is_zero_for_faithful_styles_else_creative() {
        assert_eq!(temperature_for_style("default_improve_transcriptions"), 0.0);
        assert_eq!(temperature_for_style("nova_style_messages"), 0.0);
        assert_eq!(temperature_for_style("nova_style_voice_to_text"), 0.0);
        assert_eq!(temperature_for_style("nova_style_email"), 0.4);
        assert_eq!(temperature_for_style("nova_style_notes"), 0.4);
        assert_eq!(temperature_for_style("nova_style_prompt"), 0.4);
        assert_eq!(temperature_for_style("nova_style_todo"), 0.4);
        // Style personnel inconnu → un peu de liberté par défaut.
        assert_eq!(temperature_for_style("mon_style_perso"), 0.4);
    }

    #[test]
    fn custom_variables_block_sends_keys_only_and_asks_for_markers() {
        let vars = vec![var("iban", "FR76 3000 SECRET"), var("adresse", "12 rue X")];
        let block = custom_variables_block(&vars);
        // Les noms de clés sont listés…
        assert!(block.contains("- iban"));
        assert!(block.contains("- adresse"));
        // …mais JAMAIS les valeurs (elles ne quittent pas la machine).
        assert!(!block.contains("FR76 3000 SECRET"));
        assert!(!block.contains("12 rue X"));
        // …et on demande bien le repère `{{clé}}`.
        assert!(block.contains("{{clé}}"));
        // Vide s'il n'y a aucune variable renseignée.
        assert_eq!(custom_variables_block(&[]), "");
        let empty_val = vec![var("iban", "  ")];
        assert_eq!(custom_variables_block(&empty_val), "");
    }

    #[test]
    fn completed_operation_returns_its_output() {
        let result = tauri::async_runtime::block_on(complete_unless_cancelled(
            future::ready("done"),
            || false,
        ));

        assert_eq!(result, Some("done"));
    }

    #[test]
    fn pending_operation_stops_after_cancellation() {
        let cancelled = Arc::new(AtomicBool::new(false));
        let cancelled_for_thread = Arc::clone(&cancelled);
        let cancel_thread = thread::spawn(move || {
            thread::sleep(Duration::from_millis(10));
            cancelled_for_thread.store(true, Ordering::Release);
        });

        let result = tauri::async_runtime::block_on(complete_unless_cancelled(
            future::pending::<()>(),
            || cancelled.load(Ordering::Acquire),
        ));

        cancel_thread.join().unwrap();
        assert_eq!(result, None);
    }

    #[test]
    fn live_overlay_uses_streaming_states_only_for_streaming_models() {
        assert!(should_use_streaming_overlay(OverlayStyle::Live, true));
        assert!(!should_use_streaming_overlay(OverlayStyle::Live, false));
        assert!(!should_use_streaming_overlay(OverlayStyle::Minimal, true));
        assert!(!should_use_streaming_overlay(OverlayStyle::None, true));
    }
}
