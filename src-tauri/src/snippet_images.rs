//! Les images d'un snippet vocal (demande de Sash, 12/10) : « mon schéma »
//! colle le schéma, pas un texte.
//!
//! Le texte d'un snippet vit sur le serveur de l'établissement et se limite à
//! 4 000 caractères : une image n'y tient pas. Elle reste donc sur le poste,
//! dans le dossier de données de Nova, et le snippet ne porte qu'un repère,
//! `{{image:<nom>}}`. Au collage, `rich_paste` remplace le repère par l'image
//! dans le HTML (Word, OneNote, Google Docs) ; le texte simple ne le montre
//! jamais.

use base64::Engine;
use once_cell::sync::Lazy;
use regex::Regex;
use std::path::PathBuf;
use tauri::AppHandle;

const IMAGE_DIR: &str = "snippet-images";
/// Au-delà, le collage devient lent et le presse-papier très lourd.
pub const MAX_IMAGE_BYTES: usize = 5 * 1024 * 1024;

/// Un nom d'image : une empreinte et une extension, rien d'autre (pas de
/// chemin, donc pas de sortie du dossier).
static NAME: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^[a-f0-9]{16,64}\.(png|jpe?g|gif|webp)$").expect("image name"));

/// Le type d'image de ce nom, ou `None` s'il n'est pas un nom d'image.
pub fn mime_of(name: &str) -> Option<&'static str> {
    let ext = NAME.captures(name)?.get(1)?.as_str();
    Some(match ext {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        _ => "image/webp",
    })
}

/// Vrai si les premiers octets correspondent bien au type annoncé.
pub fn bytes_match(mime: &str, bytes: &[u8]) -> bool {
    match mime {
        "image/png" => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
        "image/jpeg" => bytes.starts_with(b"\xff\xd8\xff"),
        "image/gif" => bytes.starts_with(b"GIF8"),
        "image/webp" => bytes.len() > 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP",
        _ => false,
    }
}

fn image_path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    crate::portable::resolve_app_data(app, IMAGE_DIR)
        .map(|dir| dir.join(name))
        .map_err(|e| e.to_string())
}

/// L'image en `data:` URI, pour le HTML du presse-papier.
pub fn data_uri(app: &AppHandle, name: &str) -> Option<String> {
    let mime = mime_of(name)?;
    let bytes = std::fs::read(image_path(app, name).ok()?).ok()?;
    Some(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

/// Enregistre l'image d'un snippet et rend le repère à mettre dans son texte.
#[tauri::command]
#[specta::specta]
pub fn save_snippet_image(app: AppHandle, name: String, base64: String) -> Result<String, String> {
    let mime = mime_of(&name).ok_or("invalid-name")?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64.as_bytes())
        .map_err(|_| "invalid-data")?;
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err("too-large".into());
    }
    if !bytes_match(mime, &bytes) {
        return Err("not-an-image".into());
    }
    let path = image_path(&app, &name)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(format!("{{{{image:{name}}}}}"))
}

#[cfg(test)]
mod tests {
    use super::{bytes_match, mime_of};

    #[test]
    fn only_a_plain_image_name_is_accepted() {
        assert_eq!(mime_of("0123456789abcdef.png"), Some("image/png"));
        assert_eq!(mime_of("0123456789abcdef.jpeg"), Some("image/jpeg"));
        for bad in [
            "../../secret.png",
            "0123456789abcdef.exe",
            "schema.png",
            "0123456789abcdef.png/..",
            "",
        ] {
            assert_eq!(mime_of(bad), None, "{bad}");
        }
    }

    #[test]
    fn the_bytes_must_be_the_announced_image() {
        assert!(bytes_match("image/png", b"\x89PNG\r\n\x1a\n...."));
        assert!(!bytes_match("image/png", b"MZ\x90\x00 un exe"));
        assert!(bytes_match("image/webp", b"RIFF\0\0\0\0WEBPVP8 "));
    }
}
