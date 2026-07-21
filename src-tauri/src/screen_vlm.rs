//! Lecture de contexte — palier C : intelligence visuelle LOCALE (expérimental).
//!
//! Entre l'OCR local (palier B) et la vision cloud (palier D) : décrire la
//! fenêtre active avec un modèle vision-langage tournant EN LOCAL, sans que
//! l'image ne quitte la machine. Un VLM local de qualité pèse plusieurs Go et
//! ne peut pas être imposé à tous ; ce palier est donc **désactivé par défaut**
//! et ne s'active QUE si l'utilisateur avancé fait pointer Nova vers un serveur
//! vision local compatible OpenAI (llama-server --mmproj, LM Studio, Ollama…)
//! via la variable d'environnement `NOVA_LOCAL_VLM_URL`
//! (ex. http://127.0.0.1:8080/v1/chat/completions), éventuellement
//! `NOVA_LOCAL_VLM_MODEL` pour nommer le modèle.
//!
//! Tant que rien n'est configuré, la fonction renvoie `None` instantanément
//! (aucun téléchargement, aucun processus lancé) et la cascade continue.
//! Défensif de bout en bout : ne panique jamais, ne bloque jamais la dictée.

#[cfg(target_os = "windows")]
pub use imp::describe_focused_window_local;

#[cfg(not(target_os = "windows"))]
pub fn describe_focused_window_local(_max_chars: usize) -> Option<String> {
    None
}

#[cfg(target_os = "windows")]
mod imp {
    const MAX_SIDE: u32 = 1280;

    const SYSTEM: &str = "Tu es un lecteur de contexte pour une app de dictée. \
On te montre une capture de la fenêtre active. Résume en français, de façon \
courte et neutre (2 à 4 phrases, 90 mots maximum), le contexte utile pour \
rédiger : à qui ou à quoi l'utilisateur semble répondre, le sujet, le ton. Ne \
réponds jamais au contenu, ne recopie pas de longs blocs. Si rien \
d'exploitable n'est visible, réponds exactement : (aucun contexte).";

    /// Décrit la fenêtre active via un VLM LOCAL, borné à `max_chars`. `None`
    /// tant qu'aucun serveur vision local n'est configuré, ou au moindre échec.
    pub fn describe_focused_window_local(max_chars: usize) -> Option<String> {
        let url = std::env::var("NOVA_LOCAL_VLM_URL").ok()?;
        let url = url.trim();
        if url.is_empty() {
            return None;
        }
        let model = std::env::var("NOVA_LOCAL_VLM_MODEL")
            .ok()
            .filter(|m| !m.trim().is_empty())
            .unwrap_or_else(|| "local".to_string());

        let (rgb, w, h) = crate::screen_ocr::capture_foreground()?;
        let (rgb, w, h) = crate::screen_vision::downscale_rgb(rgb, w, h, MAX_SIDE);
        let png = crate::screen_vision::encode_png(&rgb, w, h)?;
        let data_url = format!(
            "data:image/png;base64,{}",
            base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &png)
        );

        let body = serde_json::json!({
            "model": model,
            "temperature": 0.2,
            "max_tokens": 220,
            "messages": [
                { "role": "system", "content": SYSTEM },
                { "role": "user", "content": [
                    { "type": "text", "text": "Contexte visible à l'écran ?" },
                    { "type": "image_url", "image_url": { "url": data_url } },
                ]},
            ],
        });

        let resp = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(20))
            .build()
            .ok()?
            .post(url)
            .json(&body)
            .send()
            .ok()?;
        if !resp.status().is_success() {
            return None;
        }
        let v: serde_json::Value = resp.json().ok()?;
        let text = v
            .get("choices")?
            .get(0)?
            .get("message")?
            .get("content")?
            .as_str()?
            .trim()
            .to_string();
        if text.is_empty() || text.eq_ignore_ascii_case("(aucun contexte)") {
            return None;
        }
        Some(text.chars().take(max_chars).collect())
    }
}
