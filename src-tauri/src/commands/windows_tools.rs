//! Les outils de Windows et d'Edge que Nova ouvre pour l'élève (1.4) : déjà
//! sur le poste, gratuits, et rien ne passe par Nova.

#[cfg(target_os = "windows")]
fn start(target: &[&str]) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    std::process::Command::new("cmd")
        .args(["/C", "start", ""])
        .args(target)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("cannot open {target:?}: {e}"))
}

#[cfg(not(target_os = "windows"))]
fn start(_target: &[&str]) -> Result<(), String> {
    Err("Windows only".to_string())
}

/// Les suggestions de mots de Windows se règlent dans « Saisie ».
#[tauri::command]
#[specta::specta]
pub fn open_windows_typing_settings() -> Result<(), String> {
    start(&["ms-settings:typing"])
}

/// La page lue par Edge : le texte, échappé, et le rappel des raccourcis.
fn reading_page(text: &str, hint: &str) -> String {
    let escape = |value: &str| {
        value
            .replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
    };
    let paragraphs: String = text
        .split('\n')
        .filter(|line| !line.trim().is_empty())
        .map(|line| format!("<p>{}</p>\n", escape(line.trim())))
        .collect();
    format!(
        "<!doctype html>\n<html lang=\"fr\"><head><meta charset=\"utf-8\"><title>Nova</title></head>\n\
         <body><p><small>{}</small></p>\n<main>\n{paragraphs}</main></body></html>\n",
        escape(hint)
    )
}

/// Ouvre le texte dans Edge : sa lecture à voix haute et son Lecteur immersif
/// sont alors à un raccourci. C'est l'élève qui choisit Edge ; ses voix en
/// ligne passent par Microsoft, pas par Nova.
///
/// shortcut: un seul fichier temporaire, remplacé à chaque lecture et laissé
/// sur le poste ; à revoir si une école demande qu'aucun texte n'y reste.
#[tauri::command]
#[specta::specta]
pub fn read_in_edge(text: String, hint: String) -> Result<(), String> {
    let page = std::env::temp_dir().join("nova-lecture.html");
    std::fs::write(&page, reading_page(&text, &hint)).map_err(|e| e.to_string())?;
    let url = format!(
        "file:///{}",
        page.to_string_lossy()
            .replace('\\', "/")
            .replace(' ', "%20")
    );
    // `msedge` : Edge, même quand le navigateur par défaut est un autre.
    start(&["msedge", &url])
}

#[cfg(test)]
mod tests {
    use super::reading_page;

    #[test]
    fn le_texte_est_echappe_et_coupe_en_paragraphes() {
        let page = reading_page("a < b & c\n\nfin <script>", "F9");
        assert!(page.contains("<p>a &lt; b &amp; c</p>\n<p>fin &lt;script&gt;</p>"));
        assert!(page.contains("<small>F9</small>"));
        assert!(!page.contains("<script>"));
    }
}
