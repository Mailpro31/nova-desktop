//! Détection automatique du Style de reformulation d'après l'application au
//! premier plan (Style « Automatique »).
//!
//! Conception (voir l'étude d'intégration) : résolution PONCTUELLE au moment où
//! l'utilisateur relâche la touche de dictée (`TranscribeAction::stop`) — un
//! seul appel `GetForegroundWindow`, aucun thread de fond, aucun hook, aucune
//! pompe de messages. C'est la façon dont l'ancien Nova procédait, et c'est
//! robuste : la fenêtre lue est celle que l'utilisateur regarde à cet instant.
//!
//! Confidentialité par design : si l'exécutable au premier plan figure sur la
//! liste noire (gestionnaire de mots de passe, banque…), on ne lit MÊME PAS le
//! titre de la fenêtre — on retombe sur le Style par défaut.
//!
//! Tout est défensif (« jamais de plantage ») : le moindre échec Win32 renvoie
//! le Style par défaut. La résolution `resolve_auto_style` est PURE (donc
//! testable hors Windows).

use crate::settings::AppSettings;
use std::collections::HashMap;

/// Id réservé du Style « Automatique » (valeur possible de
/// `post_process_selected_prompt_id`). Jamais un vrai `LLMPrompt`.
pub const AUTO_STYLE_ID: &str = "auto";

/// Style appliqué quand aucune règle ne correspond (générique, gratuit).
const DEFAULT_AUTO_STYLE_ID: &str = "default_improve_transcriptions";

/// Liste noire intégrée : ces exécutables ne sont jamais inspectés (ni titre ni
/// process routé) — confidentialité par défaut, complétée par l'utilisateur.
const BUILTIN_BLOCKLIST: &[&str] = &[
    "keepass",
    "keepassxc",
    "keepassx",
    "1password",
    "onepassword",
    "bitwarden",
    "lastpass",
    "dashlane",
    "keeper",
    "nordpass",
    "enpass",
    "roboform",
    "protonpass",
    "proton pass",
    "passwordsafe",
    "stickypassword",
    "truekey",
    "psono",
    "vaultwarden",
];

/// Règles intégrées : (id de Style, repères de titre, repères de process).
/// Repères de titre = correspondance MOT ENTIER (pas de sous-chaîne) ; repères
/// de process = nom d'exécutable (correspondance simple, les exes sont distincts).
// Règles intégrées, PRIORITÉ décroissante (première catégorie qui matche gagne) :
// E-mail → Messages → Prompt → To-do → Notes.
//
// Prudence anti-faux-positifs : les repères de TITRE sont des noms de marque ou
// des expressions multi-mots distinctives (jamais un mot courant isolé comme
// « chat », « word », « note », « line », « height »…). Les mots trop génériques
// sont, quand c'est possible, relégués aux repères de PROCESS (nom d'exe, borné
// en mot entier : « line » matche « line.exe » mais pas « outline.exe »).
const BUILTIN_RULES: &[(&str, &[&str], &[&str])] = &[
    (
        "nova_style_email",
        &[
            // Services / clients (EN)
            "gmail", "google mail", "googlemail", "inbox", "outlook",
            "outlook.com", "hotmail", "live mail", "microsoft outlook",
            "office 365 mail", "thunderbird", "betterbird", "proton mail",
            "protonmail", "tutanota", "tuta mail", "mailbox.org", "posteo",
            "yahoo mail", "icloud mail", "aol mail", "gmx", "mail.com",
            "web.de", "fastmail", "zoho mail", "superhuman", "spark mail",
            "mailbird", "em client", "postbox", "canary mail",
            "newton mail", "bluemail", "k-9 mail", "roundcube", "horde",
            "squirrelmail", "zimbra", "rainloop", "yandex mail", "mail.ru",
            "seznam",
            // FR
            "courriel", "courrier", "boîte de réception", "boite de reception",
            "boîte mail", "messagerie", "webmail", "laposte.net",
            "mail orange", "orange mail", "sfr mail", "bbox mail",
        ],
        &[
            "outlook", "olk", "thunderbird", "betterbird", "protonmail",
            "mailspring", "mailbird", "emclient", "postbox", "canary",
            "bluemail", "spark", "spike",
        ],
    ),
    (
        "nova_style_messages",
        &[
            // Apps de messagerie / chat (marques)
            "whatsapp", "whatsapp web", "messenger", "facebook messenger",
            "telegram", "discord", "slack", "microsoft teams",
            "teams", "google chat", "hangouts", "wechat", "weixin",
            "kakaotalk", "viber", "snapchat", "instagram", "instagram direct",
            "imessage", "google messages", "android messages", "skype",
            "mattermost", "rocket.chat", "zulip", "threema",
            "beeper", "gitter", "webex", "groupme", "kik",
            "olvid", "tchap", "jami", "teamspeak", "guilded",
            // FR
            "messagerie instantanée", "messages privés",
        ],
        &[
            "whatsapp", "messenger", "telegram", "signal", "discord", "slack",
            "teams", "ms-teams", "wechat", "line", "kakaotalk", "viber",
            "snapchat", "instagram", "skype", "mattermost", "rocketchat",
            "zulip", "element", "session", "wire", "threema", "beeper",
            "webex", "groupme", "olvid", "tchap", "jami", "teamspeak",
            "guilded", "revolt", "franz", "ferdium", "rambox", "caprine",
        ],
    ),
    (
        "nova_style_prompt",
        &[
            "chatgpt", "chat gpt", "openai", "gpt-4", "gpt-4o", "gpt-5",
            "claude", "claude.ai", "anthropic", "gemini", "google gemini",
            "copilot", "microsoft copilot", "github copilot",
            "perplexity", "mistral", "le chat mistral", "deepseek", "grok",
            "character.ai", "character ai", "huggingface", "hugging face",
            "huggingchat", "google ai studio", "ai studio", "notebooklm",
            "phind", "you.com", "pi.ai", "meta ai", "qwen", "kimi", "doubao",
            "jasper", "writesonic", "copy.ai", "notion ai", "cursor",
            "windsurf", "codeium", "tabnine", "replit ai", "lovable",
            "bolt.new", "v0.dev", "librechat", "openrouter",
        ],
        &[
            "chatgpt", "claude", "msty", "lmstudio", "jan", "gpt4all",
            "cursor", "windsurf", "librechat", "anythingllm", "ollama",
        ],
    ),
    (
        "nova_style_todo",
        &[
            "todoist", "ticktick", "microsoft to do", "google tasks",
            "omnifocus", "things 3", "any.do", "remember the milk", "trello",
            "asana", "clickup", "monday.com", "jira", "linear", "basecamp",
            "wrike", "teamwork", "sunsama", "akiflow", "superlist", "taskade",
            "meistertask", "github issues", "github projects", "gitlab issues",
            "azure boards", "youtrack", "shortcut",
            // FR / EN génériques mais sûrs (multi-mots)
            "liste de tâches", "liste de taches", "to-do list", "to do list",
            "mes tâches",
        ],
        &[
            "todoist", "ticktick", "omnifocus", "things3", "trello", "asana",
            "clickup", "jira", "linear", "basecamp", "wrike", "sunsama",
            "akiflow", "superlist", "taskade", "meistertask",
        ],
    ),
    (
        "nova_style_notes",
        &[
            "notion", "obsidian", "onenote", "one note", "evernote", "logseq",
            "joplin", "roam research", "craft docs", "anytype", "apple notes",
            "google keep", "google docs", "microsoft word", "word online",
            "dropbox paper", "coda", "confluence", "nuclino", "slite",
            "standard notes", "simplenote", "zoho notebook", "samsung notes",
            "notepad", "notepad++", "typora", "zettlr", "mem.ai",
            "tana", "capacities", "amplenote", "supernotes", "workflowy",
            "dynalist", "quip", "hackmd", "apple pages", "libreoffice writer",
            "onlyoffice", "zoho writer",
            // FR
            "bloc-notes", "prise de notes",
        ],
        &[
            "notion", "obsidian", "onenote", "evernote", "logseq", "joplin",
            "anytype", "craft", "standardnotes", "simplenote", "notepad",
            "typora", "zettlr", "tana", "capacities", "workflowy", "quip",
            "winword", "soffice", "marktext", "ghostwriter",
        ],
    ),
];

/// Le titre `haystack` contient-il `needle` en tant que MOT ENTIER ? Bornes
/// Unicode-correctes (accents inclus) via `char::is_alphanumeric`, pour éviter
/// les faux positifs (« signal » dans « signal processing », « chat » dans
/// « Le chat »). `haystack` et `needle` sont supposés déjà en minuscules.
fn whole_word_contains(haystack: &str, needle: &str) -> bool {
    if needle.is_empty() {
        return false;
    }
    let mut from = 0;
    while let Some(rel) = haystack[from..].find(needle) {
        let idx = from + rel;
        let end = idx + needle.len();
        let before_ok = idx == 0
            || !haystack[..idx]
                .chars()
                .next_back()
                .is_some_and(|c| c.is_alphanumeric());
        let after_ok = end >= haystack.len()
            || !haystack[end..]
                .chars()
                .next()
                .is_some_and(|c| c.is_alphanumeric());
        if before_ok && after_ok {
            return true;
        }
        from = end;
        if from >= haystack.len() {
            break;
        }
    }
    false
}

/// Résolution PURE : (titre, process, règles utilisateur) → id de Style concret.
/// Ne renvoie jamais `AUTO_STYLE_ID` (toujours un Style applicable, ou le
/// défaut). Testable hors Windows.
pub fn resolve_auto_style(
    title: &str,
    process: &str,
    user_rules: &HashMap<String, Vec<String>>,
) -> String {
    let title_l = title.to_lowercase();
    let proc_l = process.to_lowercase();

    // Règles utilisateur d'abord (prioritaires) : repères testés sur titre ET
    // process, en MOT ENTIER pour éviter les faux positifs.
    for (style_id, tokens) in user_rules {
        if tokens.iter().any(|t| {
            let t = t.trim().to_lowercase();
            !t.is_empty()
                && (whole_word_contains(&title_l, &t) || whole_word_contains(&proc_l, &t))
        }) {
            return style_id.clone();
        }
    }

    for (style_id, title_tokens, proc_tokens) in BUILTIN_RULES {
        let hit = title_tokens.iter().any(|t| whole_word_contains(&title_l, t))
            || proc_tokens.iter().any(|t| whole_word_contains(&proc_l, t));
        if hit {
            return (*style_id).to_string();
        }
    }

    DEFAULT_AUTO_STYLE_ID.to_string()
}

/// L'exécutable est-il sur liste noire (intégrée ou utilisateur) ?
fn is_blocked(process: &str, user_blocklist: &[String]) -> bool {
    if process.is_empty() {
        return false;
    }
    let p = process.to_lowercase();
    BUILTIN_BLOCKLIST.iter().any(|b| p.contains(b))
        || user_blocklist.iter().any(|b| {
            let b = b.trim().to_lowercase();
            !b.is_empty() && p.contains(&b)
        })
}

/// Si le Style sélectionné est « Automatique », capture la fenêtre au premier
/// plan et renvoie l'id de Style concret à appliquer. Sinon `None` (le pipeline
/// garde le Style sélectionné). Ne panique jamais.
pub fn resolve_override(settings: &AppSettings) -> Option<String> {
    if settings.post_process_selected_prompt_id.as_deref() != Some(AUTO_STYLE_ID) {
        return None;
    }

    let (title, process) = current_foreground(&settings.auto_style_blocklist);

    // Les règles personnalisées sont réservées à Nova Ultra ; sans licence, on
    // n'utilise que les règles intégrées (l'auto fonctionne quand même).
    let license_key = settings.license_key.as_deref().unwrap_or("");
    let empty = HashMap::new();
    let rules = if crate::licensing::has("custom_auto_rules", license_key) {
        &settings.auto_style_rules
    } else {
        &empty
    };

    Some(resolve_auto_style(&title, &process, rules))
}

// ---------------------------------------------------------------------------
// Capture de la fenêtre au premier plan (Windows). Repli vide partout ailleurs.
// ---------------------------------------------------------------------------

/// (titre, nom d'exécutable en minuscules). Chaînes vides si indisponible ou si
/// l'application est sur liste noire (le titre n'est alors JAMAIS lu).
#[cfg(target_os = "windows")]
fn current_foreground(user_blocklist: &[String]) -> (String, String) {
    use windows::core::PWSTR;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId,
    };

    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return (String::new(), String::new());
        }

        // Nom du process.
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid as *mut u32));
        let mut process = String::new();
        if pid != 0 {
            if let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
                let mut buf = [0u16; 260];
                let mut size = buf.len() as u32;
                let ok =
                    QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut size)
                        .is_ok();
                let _ = CloseHandle(handle);
                if ok {
                    let full = String::from_utf16_lossy(&buf[..size as usize]);
                    process = full
                        .rsplit(['\\', '/'])
                        .next()
                        .unwrap_or("")
                        .to_lowercase();
                }
            }
        }

        // Confidentialité : app sur liste noire → on ne lit pas le titre.
        if is_blocked(&process, user_blocklist) {
            return (String::new(), String::new());
        }

        // Titre de la fenêtre.
        let len = GetWindowTextLengthW(hwnd);
        let title = if len > 0 {
            let mut buf = vec![0u16; len as usize + 1];
            let n = GetWindowTextW(hwnd, &mut buf);
            if n > 0 {
                String::from_utf16_lossy(&buf[..n as usize])
            } else {
                String::new()
            }
        } else {
            String::new()
        };

        (title, process)
    }
}

#[cfg(not(target_os = "windows"))]
fn current_foreground(_user_blocklist: &[String]) -> (String, String) {
    (String::new(), String::new())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn no_rules() -> HashMap<String, Vec<String>> {
        HashMap::new()
    }

    #[test]
    fn detects_email_from_title() {
        assert_eq!(
            resolve_auto_style("Boîte de réception (12) - moi - Gmail", "chrome.exe", &no_rules()),
            "nova_style_email"
        );
    }

    #[test]
    fn detects_messages_from_process() {
        assert_eq!(
            resolve_auto_style("", "discord.exe", &no_rules()),
            "nova_style_messages"
        );
    }

    #[test]
    fn detects_prompt() {
        assert_eq!(
            resolve_auto_style("ChatGPT - Google Chrome", "chrome.exe", &no_rules()),
            "nova_style_prompt"
        );
    }

    #[test]
    fn whole_word_avoids_false_positives() {
        // « signal » (repère process-only) ne doit pas matcher dans un titre.
        assert_eq!(
            resolve_auto_style("Signal processing basics", "chrome.exe", &no_rules()),
            "default_improve_transcriptions"
        );
        // « chat » ne doit pas déclencher (le repère est « google chat », entier).
        assert_eq!(
            resolve_auto_style("Le chat de la voisine", "chrome.exe", &no_rules()),
            "default_improve_transcriptions"
        );
    }

    #[test]
    fn empty_context_falls_back_to_default() {
        assert_eq!(
            resolve_auto_style("", "", &no_rules()),
            "default_improve_transcriptions"
        );
    }

    #[test]
    fn detects_notes_and_todo() {
        assert_eq!(
            resolve_auto_style("Mon document — Notion", "chrome.exe", &no_rules()),
            "nova_style_notes"
        );
        assert_eq!(
            resolve_auto_style("Aujourd'hui - Todoist", "chrome.exe", &no_rules()),
            "nova_style_todo"
        );
    }

    #[test]
    fn process_matching_is_whole_word() {
        // « line » (LINE messagerie) matche line.exe…
        assert_eq!(
            resolve_auto_style("", "line.exe", &no_rules()),
            "nova_style_messages"
        );
        // …mais PAS outline.exe (pas de faux positif).
        assert_eq!(
            resolve_auto_style("Plan — Outline", "outline.exe", &no_rules()),
            "default_improve_transcriptions"
        );
    }

    #[test]
    fn user_rule_takes_priority() {
        let mut rules = HashMap::new();
        rules.insert("nova_style_email".to_string(), vec!["moncrm".to_string()]);
        assert_eq!(
            resolve_auto_style("MonCRM - tableau de bord", "chrome.exe", &rules),
            "nova_style_email"
        );
    }

    #[test]
    fn blocklist_hides_context() {
        assert!(is_blocked("keepassxc.exe", &[]));
        assert!(is_blocked("mabanque.exe", &["mabanque".to_string()]));
        assert!(!is_blocked("chrome.exe", &[]));
    }
}
