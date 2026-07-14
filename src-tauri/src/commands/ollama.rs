//! Installation clé-en-main d'Ollama — l'« Intelligence privée » locale de Nova.
//!
//! Un seul clic dans l'app : on télécharge l'installeur Windows avec une barre de
//! progression (exactement comme le téléchargement des modèles), on l'installe en
//! silence, on attend que le service réponde sur localhost:11434, puis on tire un
//! modèle par défaut — le tout via l'événement `ollama-install-progress` que le
//! frontend écoute.

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Emitter};

const OLLAMA_BASE: &str = "http://localhost:11434";
#[cfg(target_os = "windows")]
const OLLAMA_SETUP_URL: &str = "https://ollama.com/download/OllamaSetup.exe";

/// Progression émise vers le frontend pendant l'installation / le pull.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct OllamaInstallProgress {
    /// checking | downloading | installing | starting | pulling | done | error
    pub stage: String,
    /// 0..100 pour l'étape en cours ; -1 = indéterminé.
    pub percentage: f64,
    pub message: String,
}

/// État courant d'Ollama (pour l'UI : bouton « Installer » vs « Installé »).
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct OllamaStatus {
    pub running: bool,
    pub models: Vec<String>,
}

fn emit_progress(app: &AppHandle, stage: &str, percentage: f64, message: impl Into<String>) {
    let _ = app.emit(
        "ollama-install-progress",
        OllamaInstallProgress {
            stage: stage.to_string(),
            percentage,
            message: message.into(),
        },
    );
}

/// Le service Ollama répond-il ?
async fn is_ollama_up() -> bool {
    reqwest::Client::new()
        .get(format!("{}/api/tags", OLLAMA_BASE))
        .timeout(std::time::Duration::from_secs(2))
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

/// Statut d'Ollama : tourne-t-il, et quels modèles sont présents.
#[tauri::command]
#[specta::specta]
pub async fn ollama_status() -> Result<OllamaStatus, String> {
    let resp = reqwest::Client::new()
        .get(format!("{}/api/tags", OLLAMA_BASE))
        .timeout(std::time::Duration::from_secs(3))
        .send()
        .await;

    match resp {
        Ok(r) if r.status().is_success() => {
            let json: serde_json::Value = r.json().await.unwrap_or_else(|_| serde_json::json!({}));
            let models = json
                .get("models")
                .and_then(|m| m.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|m| m.get("name").and_then(|n| n.as_str()).map(String::from))
                        .collect()
                })
                .unwrap_or_default();
            Ok(OllamaStatus {
                running: true,
                models,
            })
        }
        _ => Ok(OllamaStatus {
            running: false,
            models: vec![],
        }),
    }
}

/// Installe Ollama en un clic (Windows) puis tire `model` s'il est fourni.
/// Émet la progression sur `ollama-install-progress`.
#[tauri::command]
#[specta::specta]
pub async fn install_ollama_engine(app: AppHandle, model: Option<String>) -> Result<(), String> {
    emit_progress(&app, "checking", -1.0, "Vérification d'Ollama…");

    if !is_ollama_up().await {
        #[cfg(target_os = "windows")]
        {
            install_ollama_windows(&app).await?;
        }
        #[cfg(not(target_os = "windows"))]
        {
            let msg = "L'installation automatique n'est disponible que sur Windows.";
            emit_progress(&app, "error", -1.0, msg);
            return Err(msg.to_string());
        }
    }

    // Attendre que le service réponde (jusqu'à ~60 s).
    emit_progress(&app, "starting", -1.0, "Démarrage de l'Intelligence privée…");
    let mut up = false;
    for _ in 0..60 {
        if is_ollama_up().await {
            up = true;
            break;
        }
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    }
    if !up {
        let msg = "Ollama est installé mais le service ne répond pas sur localhost:11434.";
        emit_progress(&app, "error", -1.0, msg);
        return Err(msg.to_string());
    }

    // Tirer le modèle par défaut si demandé.
    if let Some(m) = model {
        let m = m.trim();
        if !m.is_empty() {
            pull_model(&app, m).await?;
        }
    }

    emit_progress(&app, "done", 100.0, "Intelligence privée prête.");
    Ok(())
}

#[cfg(target_os = "windows")]
async fn install_ollama_windows(app: &AppHandle) -> Result<(), String> {
    use futures_util::StreamExt;
    use std::io::Write;

    // 1) Télécharger l'installeur avec progression.
    emit_progress(app, "downloading", 0.0, "Téléchargement d'Ollama…");
    let resp = reqwest::Client::new()
        .get(OLLAMA_SETUP_URL)
        .send()
        .await
        .map_err(|e| format!("Téléchargement impossible : {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Téléchargement échoué (HTTP {}).", resp.status()));
    }
    let total = resp.content_length().unwrap_or(0);
    let tmp = std::env::temp_dir().join("NovaOllamaSetup.exe");
    let mut file =
        std::fs::File::create(&tmp).map_err(|e| format!("Fichier temporaire : {e}"))?;
    let mut downloaded: u64 = 0;
    let mut stream = resp.bytes_stream();
    let mut last = std::time::Instant::now();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Erreur de flux : {e}"))?;
        file.write_all(&chunk)
            .map_err(|e| format!("Écriture disque : {e}"))?;
        downloaded += chunk.len() as u64;
        if last.elapsed() >= std::time::Duration::from_millis(150) {
            let pct = if total > 0 {
                downloaded as f64 / total as f64 * 100.0
            } else {
                -1.0
            };
            emit_progress(app, "downloading", pct, "Téléchargement d'Ollama…");
            last = std::time::Instant::now();
        }
    }
    drop(file);

    // 2) Lancer l'installeur en silence (Ollama = installeur Inno Setup).
    emit_progress(app, "installing", -1.0, "Installation d'Ollama…");
    let status = std::process::Command::new(&tmp)
        .args(["/VERYSILENT", "/NORESTART"])
        .status()
        .map_err(|e| format!("Lancement de l'installeur impossible : {e}"))?;
    if !status.success() {
        return Err("L'installeur Ollama s'est terminé en erreur.".to_string());
    }
    let _ = std::fs::remove_file(&tmp);
    Ok(())
}

/// Tire un modèle via l'API native d'Ollama (`/api/pull`, NDJSON en streaming).
async fn pull_model(app: &AppHandle, model: &str) -> Result<(), String> {
    use futures_util::StreamExt;

    emit_progress(app, "pulling", 0.0, format!("Téléchargement du modèle {model}…"));
    let resp = reqwest::Client::new()
        .post(format!("{}/api/pull", OLLAMA_BASE))
        .json(&serde_json::json!({ "model": model, "stream": true }))
        .send()
        .await
        .map_err(|e| format!("Téléchargement du modèle impossible : {e}"))?;
    if !resp.status().is_success() {
        return Err(format!(
            "Téléchargement du modèle échoué (HTTP {}).",
            resp.status()
        ));
    }

    let mut stream = resp.bytes_stream();
    let mut buf = String::new();
    let mut last = std::time::Instant::now();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Flux du modèle : {e}"))?;
        buf.push_str(&String::from_utf8_lossy(&chunk));
        // NDJSON : une ligne JSON par mise à jour {status,total,completed}.
        while let Some(nl) = buf.find('\n') {
            let line: String = buf.drain(..=nl).collect();
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
                let completed = v.get("completed").and_then(|x| x.as_u64()).unwrap_or(0);
                let total = v.get("total").and_then(|x| x.as_u64()).unwrap_or(0);
                let status = v.get("status").and_then(|x| x.as_str()).unwrap_or("");
                if last.elapsed() >= std::time::Duration::from_millis(200) {
                    let pct = if total > 0 {
                        completed as f64 / total as f64 * 100.0
                    } else {
                        -1.0
                    };
                    emit_progress(app, "pulling", pct, format!("Modèle {model} — {status}"));
                    last = std::time::Instant::now();
                }
            }
        }
    }
    Ok(())
}
