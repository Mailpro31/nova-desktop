//! Le collage mis en forme : titres, listes, gras et repères arrivent tels
//! quels dans Word, OneNote ou Google Docs.
//!
//! Nova collait du texte brut : « ## Mécanique » ou « - fluide parfait »
//! restaient écrits avec leurs symboles. Le presse-papier reçoit désormais
//! **deux** versions : du HTML pour les applications qui le lisent, et le
//! texte exact d'avant pour toutes les autres (Bloc-notes, terminal, éditeur
//! de code, messageries en texte simple), qui ne voient aucun changement.
//!
//! Mesuré dans Word (05/10, automatisation COM) : un `<p>` nu y devient
//! « Normal (Web) » en Times New Roman, étranger au document. Les classes de
//! Word (`MsoNormal`, `MsoListParagraph`) et les titres `<h1>`–`<h3>` sont,
//! eux, rattachés aux styles du document de l'élève — sa police, ses titres.
//!
//! Un texte sans aucune structure n'a pas de HTML : il se colle exactement
//! comme avant.

use once_cell::sync::Lazy;
use regex::Regex;

static HEADING: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^(#{1,3})\s+(.+)$").expect("heading pattern"));
static BULLET: Lazy<Regex> = Lazy::new(|| Regex::new(r"^[-*•]\s+(.+)$").expect("bullet pattern"));
static NUMBERED: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^\d{1,3}[.)]\s+(.+)$").expect("numbered pattern"));
static BOLD: Lazy<Regex> = Lazy::new(|| Regex::new(r"\*\*([^*\n]+?)\*\*").expect("bold pattern"));
/// Les repères et blocs de `spoken_marks.rs`, en tête de ligne.
static MARKER: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^((?:⚠|🔁|❓|📘|⏸|✏|📐|📌|🛠|💬|🧪|✍|🔢|🖼)\u{FE0F}?\s+[^:\n]+?)(\s*:\s*.*)?$")
        .expect("marker pattern")
});

#[derive(Clone, Copy, PartialEq, Eq)]
enum List {
    None,
    Bullets,
    Numbers,
}

fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/// Le gras dit en Markdown (`**…**`), après échappement.
fn inline(text: &str) -> String {
    BOLD.replace_all(&escape(text), "<b>$1</b>").into_owned()
}

/// Une ligne qui commence par un repère : le repère en gras.
fn paragraph(line: &str) -> String {
    if let Some(found) = MARKER.captures(line) {
        let label = escape(found[1].trim());
        return match found.get(2) {
            Some(rest) => {
                let rest = rest.as_str().trim_start().trim_start_matches(':').trim();
                format!("<p class=MsoNormal><b>{label} :</b> {}</p>", inline(rest))
            }
            None => format!("<p class=MsoNormal><b>{label}</b></p>"),
        };
    }
    format!("<p class=MsoNormal>{}</p>", inline(line))
}

/// Vrai si le texte porte une mise en forme que le HTML rend mieux.
fn has_structure(text: &str) -> bool {
    text.lines().map(str::trim).any(|line| {
        HEADING.is_match(line)
            || BULLET.is_match(line)
            || NUMBERED.is_match(line)
            || MARKER.is_match(line)
            || BOLD.is_match(line)
    })
}

/// Le HTML à coller à côté du texte, ou `None` si le texte n'a aucune
/// structure : il se colle alors exactement comme avant.
pub fn to_html(text: &str) -> Option<String> {
    if !has_structure(text) {
        return None;
    }
    let mut html = String::new();
    let mut list = List::None;
    let close = |html: &mut String, list: &mut List| {
        match *list {
            List::Bullets => html.push_str("</ul>"),
            List::Numbers => html.push_str("</ol>"),
            List::None => {}
        }
        *list = List::None;
    };
    for line in text.lines().map(str::trim) {
        if line.is_empty() {
            close(&mut html, &mut list);
            continue;
        }
        let item = BULLET
            .captures(line)
            .map(|found| (List::Bullets, found[1].to_string()))
            .or_else(|| {
                NUMBERED
                    .captures(line)
                    .map(|found| (List::Numbers, found[1].to_string()))
            });
        if let Some((kind, content)) = item {
            if list != kind {
                close(&mut html, &mut list);
                html.push_str(if kind == List::Bullets {
                    "<ul>"
                } else {
                    "<ol>"
                });
                list = kind;
            }
            html.push_str(&format!(
                "<li class=MsoListParagraph>{}</li>",
                inline(&content)
            ));
            continue;
        }
        close(&mut html, &mut list);
        if let Some(found) = HEADING.captures(line) {
            let level = found[1].len();
            html.push_str(&format!("<h{level}>{}</h{level}>", inline(&found[2])));
        } else {
            html.push_str(&paragraph(line));
        }
    }
    close(&mut html, &mut list);
    Some(html)
}

#[cfg(test)]
mod tests {
    use super::to_html;

    #[test]
    fn plain_dictation_has_no_html() {
        assert_eq!(to_html("Le partiel est le 12 mars à 14 heures."), None);
        assert_eq!(to_html("Premier point.\nDeuxième point."), None);
        // Un tiret dans une phrase n'est pas une liste.
        assert_eq!(to_html("Le rapport - version finale - est prêt."), None);
    }

    #[test]
    fn course_notes_become_word_styles() {
        let html = to_html(
            "# Mécanique des fluides\n\n## Définitions\n- Fluide parfait\n- Fluide **visqueux**\n\nFin du cours.",
        )
        .unwrap();
        assert_eq!(
            html,
            "<h1>Mécanique des fluides</h1><h2>Définitions</h2><ul>\
             <li class=MsoListParagraph>Fluide parfait</li>\
             <li class=MsoListParagraph>Fluide <b>visqueux</b></li></ul>\
             <p class=MsoNormal>Fin du cours.</p>"
        );
    }

    #[test]
    fn numbered_steps_become_an_ordered_list() {
        assert_eq!(
            to_html("1. On isole x.\n2) On divise.").unwrap(),
            "<ol><li class=MsoListParagraph>On isole x.</li>\
             <li class=MsoListParagraph>On divise.</li></ol>"
        );
    }

    #[test]
    fn a_study_marker_is_written_in_bold() {
        assert_eq!(
            to_html("⚠ Important : La dérivée d'une constante est nulle.").unwrap(),
            "<p class=MsoNormal><b>⚠ Important :</b> La dérivée d'une constante est nulle.</p>"
        );
        assert_eq!(
            to_html("⏸ J'ai décroché").unwrap(),
            "<p class=MsoNormal><b>⏸ J'ai décroché</b></p>"
        );
        assert_eq!(
            to_html("🔢 Formule : Δ = b² − 4ac.").unwrap(),
            "<p class=MsoNormal><b>🔢 Formule :</b> Δ = b² − 4ac.</p>"
        );
        assert_eq!(
            to_html("🖼 Diapo 12 : La loi de Bernoulli.").unwrap(),
            "<p class=MsoNormal><b>🖼 Diapo 12 :</b> La loi de Bernoulli.</p>"
        );
    }

    #[test]
    fn html_characters_are_escaped() {
        assert_eq!(
            to_html("- a < b & c > d").unwrap(),
            "<ul><li class=MsoListParagraph>a &lt; b &amp; c &gt; d</li></ul>"
        );
    }
}
