//! Rapport de plantage (Sentry) — **DORMANT** tant que `NOVA_SENTRY_DSN` est
//! vide (exactement comme `licensing` reste dormant sans clé publique).
//!
//! But : voir les vrais plantages sur les machines Windows des utilisateurs
//! (panics Rust), qu'on ne peut pas reproduire en développement. Aucune donnée
//! dictée, aucun texte utilisateur, aucune donnée personnelle n'est transmise :
//! `send_default_pii` est désactivé et un `before_send` retire par sécurité les
//! champs `request`/`user`. Si le DSN est absent, `init` ne fait rien et ne
//! coûte rien.

/// Initialise le rapport de plantage si `NOVA_SENTRY_DSN` est défini.
/// Le garde retourné doit rester en vie toute la durée du process (il l'est :
/// `run()` le garde jusqu'à la fermeture de l'app). `None` = dormant.
pub fn init() -> Option<sentry::ClientInitGuard> {
    let dsn = std::env::var("NOVA_SENTRY_DSN").ok()?;
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
            max_breadcrumbs: 30,
            // ceinture-bretelles : on ne transmet jamais de contenu utilisateur.
            before_send: Some(std::sync::Arc::new(|mut event: sentry::protocol::Event| {
                event.request = None;
                event.user = None;
                Some(event)
            })),
            ..Default::default()
        },
    ));
    Some(guard)
}
