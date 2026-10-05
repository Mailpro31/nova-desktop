//! L'emploi du temps de l'élève : ce qui se vérifie sans réseau ni fenêtre.
//!
//! Le calendrier est lu côté interface (`src/lib/timetable.ts`) ; ici, on
//! décide seulement si un lien et un fichier sont acceptables. Les commandes
//! sont dans `commands::timetable`.

/// Au-delà, ce n'est plus un emploi du temps : un calendrier d'un an d'école
/// pèse quelques centaines de kilo-octets.
pub const MAX_CALENDAR_BYTES: usize = 5 * 1024 * 1024;

/// Le lien d'abonnement, mis en forme, ou `None` s'il n'est pas acceptable.
///
/// « webcal:// » (le lien que proposent Outlook, ADE ou Hyperplanning pour
/// s'abonner) est lu en HTTPS. Un lien en clair est refusé : il contient en
/// général un jeton personnel, qui ne doit pas circuler sans chiffrement. Un
/// lien qui porte un identifiant et un mot de passe l'est aussi : Nova ne
/// garde pas de mot de passe.
pub fn normalize_link(raw: &str) -> Option<String> {
    let link = raw.trim();
    if link.is_empty() || link.chars().any(char::is_whitespace) {
        return None;
    }
    let lower = link.to_ascii_lowercase();
    let rest = ["https://", "webcal://", "webcals://"]
        .iter()
        .find(|scheme| lower.starts_with(*scheme))
        .map(|scheme| &link[scheme.len()..])?;
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    if host.is_empty() || host.contains('@') {
        return None;
    }
    Some(format!("https://{rest}"))
}

/// Le texte reçu est-il un calendrier ? Une page de connexion, renvoyée par
/// un lien expiré, ne l'est pas.
pub fn looks_like_calendar(text: &str) -> bool {
    text.trim_start_matches('\u{feff}')
        .trim_start()
        .get(..15)
        .is_some_and(|start| start.eq_ignore_ascii_case("BEGIN:VCALENDAR"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn subscription_links_are_read_over_https() {
        assert_eq!(
            normalize_link(
                " webcal://ade.ipsa.fr/jsp/custom/modules/plannings/anonymous_cal.jsp?data=abc "
            ),
            Some(
                "https://ade.ipsa.fr/jsp/custom/modules/plannings/anonymous_cal.jsp?data=abc"
                    .into()
            )
        );
        assert_eq!(
            normalize_link("HTTPS://outlook.office365.com/owa/calendar/x/reachcalendar.ics"),
            Some("https://outlook.office365.com/owa/calendar/x/reachcalendar.ics".into())
        );
        assert_eq!(
            normalize_link("webcals://example.org/cal.ics"),
            Some("https://example.org/cal.ics".into())
        );
    }

    #[test]
    fn unsafe_or_broken_links_are_refused() {
        for link in [
            "",
            "http://ade.ipsa.fr/cal.ics",
            "ftp://example.org/cal.ics",
            "https://",
            "https:///cal.ics",
            "https://eleve:motdepasse@example.org/cal.ics",
            "https://example.org/mon cal.ics",
            "ade.ipsa.fr/cal.ics",
        ] {
            assert_eq!(normalize_link(link), None, "{link}");
        }
    }

    #[test]
    fn only_a_calendar_is_accepted() {
        assert!(looks_like_calendar("BEGIN:VCALENDAR\r\nEND:VCALENDAR"));
        assert!(looks_like_calendar(
            "\u{feff}\r\nbegin:vcalendar\nEND:VCALENDAR"
        ));
        assert!(!looks_like_calendar(
            "<!DOCTYPE html><title>Connexion</title>"
        ));
        assert!(!looks_like_calendar("BEGIN:VCAL"));
        assert!(!looks_like_calendar(""));
    }
}
