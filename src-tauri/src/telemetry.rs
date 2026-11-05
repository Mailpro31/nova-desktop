//! Rapport de plantage (Sentry) — **DORMANT** tant que `NOVA_SENTRY_DSN` est
//! vide (exactement comme `licensing` reste dormant sans clé publique).
//!
//! But : voir les vrais plantages sur les machines Windows des utilisateurs
//! (panics Rust), qu'on ne peut pas reproduire en développement. Aucune donnée
//! dictée, aucun texte utilisateur, aucune donnée personnelle n'est transmise :
//! `send_default_pii` est désactivé et `clean` retire tout ce qui pourrait en
//! porter (message tronqué, nom de l'ordinateur, fils d'Ariane). L'école peut
//! couper l'envoi (`crash_reports` de `/api/me`, 5.2). Si le DSN est absent,
//! `init` ne fait rien et ne coûte rien.

use sentry::protocol::{Event, Exception};
use std::sync::atomic::{AtomicBool, Ordering};

// shortcut: ouvert jusqu'à la première lecture de `/api/me`, donc un plantage au
// démarrage part même si l'école a fermé la case ; persister la décision si une
// école le demande.
static ALLOWED: AtomicBool = AtomicBool::new(true);

/// La décision de l'école ; sans école, les rapports restent ouverts.
pub fn set_allowed(allowed: bool) {
    ALLOWED.store(allowed, Ordering::Relaxed);
}

/// Initialise le rapport de plantage si `NOVA_SENTRY_DSN` est défini.
/// Le garde retourné doit rester en vie toute la durée du process (il l'est :
/// `run()` le garde jusqu'à la fermeture de l'app). `None` = dormant.
pub fn init() -> Option<sentry::ClientInitGuard> {
    // DSN embarqué à la COMPILATION (option_env!) — c'est la CI de release qui
    // le fournit, depuis un secret GitHub, pour qu'il soit présent dans l'exe
    // distribué (un DSN Sentry est conçu pour être côté client, non secret).
    // Repli sur la variable d'environnement au runtime, pratique en dev.
    let dsn = option_env!("NOVA_SENTRY_DSN")
        .map(str::to_string)
        .or_else(|| std::env::var("NOVA_SENTRY_DSN").ok())?;
    let dsn = dsn.trim();
    if dsn.is_empty() {
        return None;
    }
    let guard = sentry::init((
        dsn.to_string(),
        sentry::ClientOptions {
            release: sentry::release_name!(),
            // jamais de données personnelles ni d'IP.
            send_default_pii: false,
            // un fil d'Ariane peut citer une dictée : aucun.
            max_breadcrumbs: 0,
            before_send: Some(std::sync::Arc::new(|event| {
                clean(event, ALLOWED.load(Ordering::Relaxed))
            })),
            ..Default::default()
        },
    ));
    Some(guard)
}

/// Une erreur de l'interface (exception non rattrapée, rendu cassé), rapportée
/// comme un plantage Rust : même nettoyage, même interrupteur de l'école.
#[tauri::command]
#[specta::specta]
pub fn report_ui_error(name: String, message: String) {
    let exception = Exception {
        ty: name,
        value: Some(message),
        ..Default::default()
    };
    sentry::capture_event(Event {
        exception: vec![exception].into(),
        level: sentry::Level::Error,
        ..Default::default()
    });
}

/// Ce qui part réellement : rien si l'école a fermé la case, sinon l'endroit
/// du plantage sans aucun texte qui pourrait venir d'un élève.
fn clean(mut event: Event<'static>, allowed: bool) -> Option<Event<'static>> {
    if !allowed {
        return None;
    }
    event.request = None;
    event.user = None;
    // le nom de l'ordinateur est souvent celui de l'élève.
    event.server_name = None;
    event.breadcrumbs = Default::default();
    event.extra.clear();
    event.logentry = None;
    event.message = event.message.as_deref().map(scrub);
    for exception in event.exception.values.iter_mut() {
        exception.ty = scrub(&exception.ty);
        exception.value = exception.value.as_deref().map(scrub);
    }
    Some(event)
}

/// Un message de plantage peut citer ce qui a été dicté (`unwrap()` sur une
/// erreur, un `format!`) : on garde ce qui précède le premier « : », sans ce
/// qui est entre guillemets, sur 160 caractères au plus.
fn scrub(text: &str) -> String {
    let head = text.split(": ").next().unwrap_or_default();
    let mut out = String::new();
    let mut closing: Option<char> = None;
    for c in head.chars() {
        match closing {
            Some(end) if c == end => {
                out.push(c);
                closing = None;
            }
            Some(_) => {}
            None => {
                out.push(c);
                closing = match c {
                    '"' => Some('"'),
                    '\'' => Some('\''),
                    '«' => Some('»'),
                    '“' => Some('”'),
                    _ => None,
                };
                if closing.is_some() {
                    out.push('…');
                }
            }
        }
    }
    out.chars().take(160).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn panic_event(value: &str) -> Event<'static> {
        Event {
            exception: vec![Exception {
                ty: "panic".into(),
                value: Some(value.into()),
                ..Default::default()
            }]
            .into(),
            message: Some(format!("dicté : {value}")),
            server_name: Some("PC-de-Camille".into()),
            ..Default::default()
        }
    }

    #[test]
    fn a_dictated_text_never_leaves_the_computer() {
        let event = clean(
            panic_event("called `Result::unwrap()` on an `Err` value: \"la poussée d'Archimède\""),
            true,
        )
        .unwrap();
        let sent = format!("{:?}", event);
        assert!(!sent.contains("Archimède"), "{sent}");
        assert!(!sent.contains("Camille"), "{sent}");
        assert_eq!(
            event.exception.values[0].value.as_deref(),
            Some("called `Result::unwrap()` on an `Err` value")
        );
    }

    #[test]
    fn quoted_text_is_dropped_even_without_a_colon() {
        assert_eq!(scrub("échec de l'enregistrement"), "échec de l'…");
        assert_eq!(
            scrub("index \"secret\" hors bornes"),
            "index \"…\" hors bornes"
        );
        assert_eq!(scrub(&"x".repeat(500)).chars().count(), 160);
    }

    #[test]
    fn nothing_is_sent_when_the_school_said_no() {
        assert!(clean(panic_event("boom"), false).is_none());
    }
}
