//! Moteur de reformulation « Intelligence privée » — 100 % local, embarqué,
//! zéro installation manuelle (remplace l'ancienne dépendance à Ollama).
//!
//! Principe : au lieu de demander à l'utilisateur d'installer un service tiers
//! (Ollama), l'app télécharge elle-même, une seule fois, le binaire officiel
//! `llama-server` du projet llama.cpp (portable, sans installeur) et un petit
//! modèle Qwen2.5-Instruct au format GGUF, puis pilote ce binaire comme un
//! sous-processus lié à `127.0.0.1` uniquement. `llama-server` expose une API
//! compatible OpenAI (`/v1/chat/completions`) — le même format que Turbo et
//! qu'Ollama — donc `llm_client.rs` n'a besoin d'aucune modification : il ne
//! sait même pas que le fournisseur a changé.
//!
//! Trois profils de taille (Nova Air / Aura / Apex) correspondant aux Styles
//! déjà utilisés pour les profils de puissance ; un profil est recommandé
//! automatiquement selon la RAM détectée, l'utilisateur reste libre de choisir.
//! Tout est défensif : un échec de téléchargement ou de démarrage ne bloque
//! jamais la dictée, seule la reformulation est indisponible (repli sur le
//! texte brut, cf. `actions.rs`).

use serde::{Deserialize, Serialize};
use specta::Type;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Child;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

/// Port local fixe. Jamais exposé au réseau (`--host 127.0.0.1`).
pub const LOCAL_LLM_PORT: u16 = 8721;

/// Identifiant du fournisseur dans `post_process_providers` (voir settings.rs).
pub const PROVIDER_ID: &str = "nova_local";

#[derive(Debug, Clone, Copy)]
pub struct LlmProfileSpec {
    pub id: &'static str,
    /// Dépôt Hugging Face contenant les quantifications GGUF officielles.
    pub repo_id: &'static str,
    pub approx_size_mb: u64,
    /// RAM totale (Go) à partir de laquelle ce profil est recommandé.
    pub min_ram_gb: u64,
}

/// Nova Air / Aura / Apex — même vocabulaire que les profils de puissance
/// existants ; ici, la taille du modèle de reformulation local embarqué.
///
/// Palier produit : Air est le seul profil du plan Free ; Aura et Apex
/// nécessitent Nova Pro (et restent disponibles en Ultra). Air doit donc
/// rester un moteur « normal », pas un modèle-jouet — d'où 1.5B plutôt que
/// 0.5B malgré l'inférence 100 % CPU (pas de délestage GPU avec
/// llama-server ici) : en dessous, la reformulation devient peu fiable.
pub const PROFILES: &[LlmProfileSpec] = &[
    LlmProfileSpec {
        id: "air",
        repo_id: "Qwen/Qwen2.5-1.5B-Instruct-GGUF",
        approx_size_mb: 1000,
        min_ram_gb: 0,
    },
    LlmProfileSpec {
        id: "aura",
        repo_id: "Qwen/Qwen2.5-3B-Instruct-GGUF",
        approx_size_mb: 2100,
        min_ram_gb: 8,
    },
    LlmProfileSpec {
        id: "apex",
        repo_id: "Qwen/Qwen2.5-7B-Instruct-GGUF",
        approx_size_mb: 4700,
        min_ram_gb: 16,
    },
];

fn spec(profile_id: &str) -> Option<&'static LlmProfileSpec> {
    PROFILES.iter().find(|p| p.id == profile_id)
}

/// Détecte la RAM totale et recommande le plus gros profil que la machine
/// peut raisonnablement faire tourner. Défensif : RAM inconnue → "air".
pub fn recommended_profile_id() -> &'static str {
    let mut sys = sysinfo::System::new();
    sys.refresh_memory();
    let total_ram_gb = sys.total_memory() / (1024 * 1024 * 1024);

    PROFILES
        .iter()
        .rev() // du plus gros au plus petit
        .find(|p| total_ram_gb >= p.min_ram_gb)
        .map(|p| p.id)
        .unwrap_or("air")
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct LlmProfileStatus {
    pub id: String,
    pub approx_size_mb: u64,
    pub is_downloaded: bool,
    pub is_recommended: bool,
}

fn local_llm_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = crate::portable::app_data_dir(app)
        .map_err(|e| format!("Dossier de données introuvable : {e}"))?
        .join("local-llm");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Création du dossier : {e}"))?;
    Ok(dir)
}

fn model_path(app: &AppHandle, profile_id: &str) -> Result<PathBuf, String> {
    Ok(local_llm_dir(app)?.join(format!("{profile_id}.gguf")))
}

#[cfg(windows)]
fn server_binary_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(local_llm_dir(app)?.join("llama-server.exe"))
}

/// Statut des 3 profils pour l'UI (taille, téléchargé, recommandé).
pub fn profiles_status(app: &AppHandle) -> Vec<LlmProfileStatus> {
    let recommended = recommended_profile_id();
    PROFILES
        .iter()
        .map(|p| LlmProfileStatus {
            id: p.id.to_string(),
            approx_size_mb: p.approx_size_mb,
            is_downloaded: model_path(app, p.id)
                .map(|path| path.is_file())
                .unwrap_or(false),
            is_recommended: p.id == recommended,
        })
        .collect()
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct LlmDownloadProgress {
    /// "model" | "engine"
    pub stage: String,
    pub profile_id: String,
    pub downloaded: u64,
    pub total: u64,
    /// 0..100, -1 = indéterminé.
    pub percentage: f64,
}

fn emit_progress(app: &AppHandle, stage: &str, profile_id: &str, downloaded: u64, total: u64) {
    let percentage = if total > 0 {
        (downloaded as f64 / total as f64) * 100.0
    } else {
        -1.0
    };
    let _ = app.emit(
        "llm-download-progress",
        LlmDownloadProgress {
            stage: stage.to_string(),
            profile_id: profile_id.to_string(),
            downloaded,
            total,
            percentage,
        },
    );
}

/// Interroge l'API Hugging Face pour trouver le meilleur fichier GGUF d'un
/// dépôt (préférence q4_k_m — bon compromis qualité/poids — puis repli sur
/// d'autres quantifications si absente). Résolution dynamique plutôt qu'un
/// nom de fichier figé : robuste si le dépôt change la liste de ses fichiers.
async fn resolve_gguf_filename(repo_id: &str) -> Result<String, String> {
    let url = format!("https://huggingface.co/api/models/{repo_id}");
    let resp = reqwest::Client::new()
        .get(&url)
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| format!("Hugging Face injoignable : {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Hugging Face a répondu {}", resp.status()));
    }
    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Réponse Hugging Face invalide : {e}"))?;
    let files: Vec<String> = json
        .get("siblings")
        .and_then(|s| s.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|s| s.get("rfilename").and_then(|f| f.as_str()))
                .filter(|f| f.to_lowercase().ends_with(".gguf"))
                .map(String::from)
                .collect()
        })
        .unwrap_or_default();

    for preferred in ["q4_k_m", "q4_0", "q5_k_m", "q8_0"] {
        if let Some(f) = files.iter().find(|f| f.to_lowercase().contains(preferred)) {
            return Ok(f.clone());
        }
    }
    files
        .into_iter()
        .next()
        .ok_or_else(|| format!("Aucun fichier .gguf trouvé dans {repo_id}"))
}

/// Télécharge un fichier avec progression, en streaming (jamais tout en
/// mémoire — les modèles font plusieurs centaines de Mo).
async fn download_with_progress(
    app: &AppHandle,
    url: &str,
    dest: &Path,
    stage: &str,
    profile_id: &str,
) -> Result<(), String> {
    use futures_util::StreamExt;

    let resp = reqwest::Client::new()
        .get(url)
        .timeout(std::time::Duration::from_secs(20 * 60))
        .send()
        .await
        .map_err(|e| format!("Téléchargement impossible : {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Téléchargement échoué (HTTP {}).", resp.status()));
    }
    let total = resp.content_length().unwrap_or(0);

    let tmp = dest.with_extension("part");
    let mut file = std::fs::File::create(&tmp).map_err(|e| format!("Fichier temporaire : {e}"))?;
    let mut downloaded: u64 = 0;
    let mut stream = resp.bytes_stream();
    let mut last = std::time::Instant::now();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Erreur de flux : {e}"))?;
        file.write_all(&chunk)
            .map_err(|e| format!("Écriture disque : {e}"))?;
        downloaded += chunk.len() as u64;
        if last.elapsed() >= std::time::Duration::from_millis(150) {
            emit_progress(app, stage, profile_id, downloaded, total);
            last = std::time::Instant::now();
        }
    }
    drop(file);
    std::fs::rename(&tmp, dest).map_err(|e| format!("Déplacement du fichier : {e}"))?;
    emit_progress(app, stage, profile_id, downloaded, downloaded.max(total));
    Ok(())
}

/// Télécharge le modèle GGUF du profil demandé s'il est absent.
pub async fn ensure_model_downloaded(app: &AppHandle, profile_id: &str) -> Result<(), String> {
    let spec = spec(profile_id).ok_or_else(|| format!("Profil inconnu : {profile_id}"))?;
    let dest = model_path(app, profile_id)?;
    if dest.is_file() {
        return Ok(());
    }
    let filename = resolve_gguf_filename(spec.repo_id).await?;
    let url = format!(
        "https://huggingface.co/{}/resolve/main/{}",
        spec.repo_id, filename
    );
    download_with_progress(app, &url, &dest, "model", profile_id).await
}

/// Trouve l'URL du dernier binaire Windows `llama-server` publié par le
/// projet llama.cpp (build CPU portable — le plus compatible, aucun pilote
/// GPU requis). Résolution dynamique via l'API GitHub, pas de version figée.
#[cfg(windows)]
async fn resolve_server_asset_url() -> Result<String, String> {
    let url = "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest";
    let resp = reqwest::Client::new()
        .get(url)
        .header("User-Agent", "nova-desktop")
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| format!("GitHub injoignable : {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("GitHub a répondu {}", resp.status()));
    }
    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Réponse GitHub invalide : {e}"))?;
    let assets = json
        .get("assets")
        .and_then(|a| a.as_array())
        .ok_or("Réponse GitHub sans assets")?;

    let is_arm = cfg!(target_arch = "aarch64");
    let want = if is_arm { "win-arm64" } else { "win-cpu-x64" };

    assets
        .iter()
        .find_map(|a| {
            let name = a.get("name")?.as_str()?;
            if name.to_lowercase().contains(want) && name.to_lowercase().ends_with(".zip") {
                a.get("browser_download_url")?.as_str().map(String::from)
            } else {
                None
            }
        })
        .ok_or_else(|| {
            "Aucun binaire Windows trouvé dans la dernière version de llama.cpp".to_string()
        })
}

/// Télécharge et extrait `llama-server.exe` s'il est absent. Extraction via
/// `Expand-Archive` (PowerShell, toujours présent sur Windows) — évite
/// d'ajouter une dépendance de décompression zip rien que pour cette étape
/// ponctuelle.
#[cfg(windows)]
pub async fn ensure_server_binary(app: &AppHandle) -> Result<(), String> {
    let dest = server_binary_path(app)?;
    if dest.is_file() {
        return Ok(());
    }
    let dir = local_llm_dir(app)?;
    let zip_url = resolve_server_asset_url().await?;
    let zip_path = dir.join("llama-server.zip");
    download_with_progress(app, &zip_url, &zip_path, "engine", "").await?;

    let extract_dir = dir.join("engine-extract");
    let _ = std::fs::remove_dir_all(&extract_dir);
    std::fs::create_dir_all(&extract_dir).map_err(|e| format!("Dossier d'extraction : {e}"))?;

    let status = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            &format!(
                "Expand-Archive -LiteralPath '{}' -DestinationPath '{}' -Force",
                zip_path.display(),
                extract_dir.display()
            ),
        ])
        .status()
        .map_err(|e| format!("Extraction impossible : {e}"))?;
    if !status.success() {
        return Err("L'extraction de l'archive a échoué.".to_string());
    }

    // L'archive peut contenir le binaire à la racine ou dans un sous-dossier :
    // on cherche `llama-server.exe` récursivement (une profondeur suffit en
    // pratique pour ces archives).
    let found = find_file_recursive(&extract_dir, "llama-server.exe", 3);
    let found = found.ok_or_else(|| "llama-server.exe introuvable dans l'archive.".to_string())?;
    std::fs::copy(&found, &dest).map_err(|e| format!("Copie du binaire : {e}"))?;

    let _ = std::fs::remove_file(&zip_path);
    let _ = std::fs::remove_dir_all(&extract_dir);
    Ok(())
}

#[cfg(windows)]
fn find_file_recursive(dir: &Path, name: &str, max_depth: u32) -> Option<PathBuf> {
    if max_depth == 0 {
        return None;
    }
    let entries = std::fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && path.file_name().map(|n| n == name).unwrap_or(false) {
            return Some(path);
        }
        if path.is_dir() {
            if let Some(found) = find_file_recursive(&path, name, max_depth - 1) {
                return Some(found);
            }
        }
    }
    None
}

#[cfg(not(windows))]
pub async fn ensure_server_binary(_app: &AppHandle) -> Result<(), String> {
    Err("L'Intelligence privée locale n'est disponible que sous Windows.".to_string())
}

/// Processus `llama-server` en cours, et profil qu'il sert actuellement.
/// État géré par Tauri (`app.manage(...)`).
pub struct LocalLlmProcess(Mutex<Option<(Child, String)>>);

impl Default for LocalLlmProcess {
    fn default() -> Self {
        Self(Mutex::new(None))
    }
}

async fn is_server_up() -> bool {
    reqwest::Client::new()
        .get(format!("http://127.0.0.1:{LOCAL_LLM_PORT}/health"))
        .timeout(std::time::Duration::from_secs(2))
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

/// S'assure que `llama-server` tourne avec le bon profil chargé. Démarre (ou
/// redémarre si le profil a changé) le sous-processus au besoin, attend qu'il
/// réponde. Ne panique jamais ; toute erreur redescend proprement pour que
/// l'appelant retombe sur le texte brut.
#[cfg(windows)]
pub async fn ensure_server_running(app: &AppHandle, profile_id: &str) -> Result<(), String> {
    use tauri::Manager;

    let state = app.state::<LocalLlmProcess>();
    let already_running_same_profile = {
        let guard = state
            .0
            .lock()
            .map_err(|_| "État du moteur local corrompu")?;
        guard
            .as_ref()
            .map(|(_, current)| current == profile_id)
            .unwrap_or(false)
    };
    if already_running_same_profile && is_server_up().await {
        return Ok(());
    }

    ensure_server_binary(app).await?;
    ensure_model_downloaded(app, profile_id).await?;

    // Arrête l'instance précédente (profil différent, ou processus mort).
    {
        let mut guard = state
            .0
            .lock()
            .map_err(|_| "État du moteur local corrompu")?;
        if let Some((mut child, _)) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    let model = model_path(app, profile_id)?;
    let binary = server_binary_path(app)?;
    let child = std::process::Command::new(&binary)
        .args([
            "--model",
            &model.to_string_lossy(),
            "--host",
            "127.0.0.1",
            "--port",
            &LOCAL_LLM_PORT.to_string(),
            "-c",
            "4096",
            "-ngl",
            "0",
        ])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Démarrage du moteur local impossible : {e}"))?;

    {
        let mut guard = state
            .0
            .lock()
            .map_err(|_| "État du moteur local corrompu")?;
        *guard = Some((child, profile_id.to_string()));
    }

    for _ in 0..60 {
        if is_server_up().await {
            return Ok(());
        }
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }
    Err("Le moteur local n'a pas démarré à temps.".to_string())
}

#[cfg(not(windows))]
pub async fn ensure_server_running(_app: &AppHandle, _profile_id: &str) -> Result<(), String> {
    Err("L'Intelligence privée locale n'est disponible que sous Windows.".to_string())
}

/// Arrête le sous-processus `llama-server`, s'il tourne. Appelé à la
/// fermeture de l'app (voir `lib.rs`, `RunEvent::Exit`) — jamais de processus
/// fantôme laissé derrière soi.
pub fn shutdown(app: &AppHandle) {
    use tauri::Manager;
    if let Some(state) = app.try_state::<LocalLlmProcess>() {
        if let Ok(mut guard) = state.0.lock() {
            if let Some((mut child, _)) = guard.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}
