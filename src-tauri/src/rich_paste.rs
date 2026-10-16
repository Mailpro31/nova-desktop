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

/// L'image d'un snippet vocal (`snippet_images`) : le repère que le texte du
/// snippet porte à sa place.
static IMAGE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\{\{image:([a-f0-9]{16,64}\.(?:png|jpe?g|gif|webp))\}\}").expect("image pattern")
});

/// Le texte sans ses repères d'image : ce que reçoivent le Bloc-notes, un
/// terminal ou une frappe directe, qui ne savent pas coller une image.
pub fn without_images(text: &str) -> String {
    if !IMAGE.is_match(text) {
        return text.to_string();
    }
    let stripped = IMAGE.replace_all(text, "");
    let lines: Vec<String> = stripped
        .split('\n')
        .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
        .collect();
    lines.join("\n").trim().to_string()
}

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

/// Le gras dit en Markdown (`**…**`), après échappement, et les images des
/// snippets à la place de leur repère.
fn inline(text: &str, images: &dyn Fn(&str) -> Option<String>) -> String {
    let escaped = escape(text);
    let bold = BOLD.replace_all(&escaped, "<b>$1</b>");
    IMAGE
        .replace_all(&bold, |found: &regex::Captures| match images(&found[1]) {
            Some(uri) => format!("<img src=\"{uri}\">"),
            None => String::new(),
        })
        .into_owned()
}

/// Une ligne qui commence par un repère : le repère en gras.
fn paragraph(line: &str, images: &dyn Fn(&str) -> Option<String>) -> String {
    if let Some(found) = MARKER.captures(line) {
        let label = escape(found[1].trim());
        return match found.get(2) {
            Some(rest) => {
                let rest = rest.as_str().trim_start().trim_start_matches(':').trim();
                format!(
                    "<p class=MsoNormal><b>{label} :</b> {}</p>",
                    inline(rest, images)
                )
            }
            None => format!("<p class=MsoNormal><b>{label}</b></p>"),
        };
    }
    format!("<p class=MsoNormal>{}</p>", inline(line, images))
}

/// Vrai si le texte porte une mise en forme que le HTML rend mieux.
fn has_structure(text: &str) -> bool {
    text.lines().map(str::trim).any(|line| {
        HEADING.is_match(line)
            || BULLET.is_match(line)
            || NUMBERED.is_match(line)
            || MARKER.is_match(line)
            || BOLD.is_match(line)
            || IMAGE.is_match(line)
    })
}

/// Un paragraphe vide, que Word garde : collé au milieu d'une ligne, il la
/// termine, et la suite part sur une ligne neuve. Un `<p></p>` sans contenu est
/// ignoré par Word (mesuré par automatisation COM, 07/10).
const LINE_BREAK_BEFORE: &str = "<p class=MsoNormal><o:p>&nbsp;</o:p></p>";

/// Le HTML à coller à côté du texte, ou `None` si le texte n'a aucune
/// structure : il se colle alors exactement comme avant.
pub fn to_html(text: &str) -> Option<String> {
    to_html_with(text, &|_| None)
}

/// Comme `to_html`, avec les images des snippets : `images` rend la `data:`
/// URI d'un nom d'image, ou `None` si elle n'existe plus (le repère disparaît).
pub fn to_html_with(text: &str, images: &dyn Fn(&str) -> Option<String>) -> Option<String> {
    if !has_structure(text) {
        return None;
    }
    let mut html = String::new();
    if text.trim_start_matches([' ', '\t']).starts_with('\n') {
        html.push_str(LINE_BREAK_BEFORE);
    }
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
                inline(&content, images)
            ));
            continue;
        }
        close(&mut html, &mut list);
        if let Some(found) = HEADING.captures(line) {
            let level = found[1].len();
            html.push_str(&format!(
                "<h{level}>{}</h{level}>",
                inline(&found[2], images)
            ));
        } else {
            html.push_str(&paragraph(line, images));
        }
    }
    close(&mut html, &mut list);
    Some(html)
}

/// Le HTML d'un bloc que l'élève colle où il veut, comme la fiche de
/// révision : il commence toujours sur son propre paragraphe.
///
/// Mesuré dans Word (11/10, automatisation COM) : collée au milieu d'une
/// ligne, la fiche fondait la phrase déjà écrite dans son premier titre, qui
/// devenait « Titre 1 ». Le paragraphe vide de `LINE_BREAK_BEFORE` termine la
/// ligne d'abord ; sur une ligne vide, il n'ajoute qu'une ligne blanche.
pub fn block_html(text: &str) -> Option<String> {
    to_html(&format!(
        "
{}",
        text.trim_start()
    ))
}

/// Le texte à coller, séparé de la dictée précédente, et s'il s'arrête au
/// milieu d'une ligne.
///
/// Test de Sash, 07/10 : vingt dictées collées dans Word se suivaient sans
/// espace (« … égale à 2x.⚠ Important : … »), et un repère ne commençait pas
/// une nouvelle ligne.
///
/// - Une dictée structurée (repère, titre, liste) commence sur une nouvelle
///   ligne si la précédente s'est arrêtée au milieu d'une ligne, et se termine
///   par un retour : la suivante repart sur une ligne neuve.
/// - Une phrase simple est suivie d'une espace si le réglage le demande.
pub fn separate(text: &str, previous_mid_line: bool, trailing_space: bool) -> (String, bool) {
    if has_structure(text) {
        let mut out = text.to_string();
        if previous_mid_line && !text.starts_with('\n') {
            out.insert(0, '\n');
        }
        if !out.ends_with('\n') {
            out.push('\n');
        }
        return (out, false);
    }
    if text.ends_with('\n') {
        return (text.to_string(), false);
    }
    if trailing_space {
        (format!("{text} "), true)
    } else {
        (text.to_string(), true)
    }
}

#[cfg(test)]
mod tests {
    use super::{block_html, separate, to_html, to_html_with, without_images};

    #[test]
    fn a_snippet_image_is_pasted_as_an_image() {
        let text = "Voici le schéma : {{image:0123456789abcdef.png}} fin.";
        let html = to_html_with(text, &|name| {
            (name == "0123456789abcdef.png").then(|| "data:image/png;base64,AAAA".to_string())
        })
        .unwrap();
        assert_eq!(
            html,
            "<p class=MsoNormal>Voici le schéma : <img src=\"data:image/png;base64,AAAA\"> fin.</p>"
        );
        // Le texte simple n'a jamais le repère.
        assert_eq!(without_images(text), "Voici le schéma : fin.");
        assert_eq!(without_images("{{image:0123456789abcdef.png}}"), "");
        // Une image disparue : le repère part aussi du HTML.
        assert!(!to_html(text).unwrap().contains("{{image"));
        // Un texte sans image ne change pas.
        assert_eq!(without_images("Une phrase."), "Une phrase.");
    }

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
    fn a_revision_sheet_starts_its_own_paragraph() {
        let html = block_html(
            "# Mécanique des fluides
## Définitions
- Fluide parfait",
        )
        .unwrap();
        assert!(html.starts_with("<p class=MsoNormal><o:p>&nbsp;</o:p></p><h1>"));
        // Un texte sans structure n'a toujours pas de HTML.
        assert!(block_html("Une phrase.").is_none());
    }

    #[test]
    fn a_marker_after_a_sentence_starts_a_new_line() {
        let (text, mid_line) = separate("⚠ Important : la dérivée.", true, true);
        assert_eq!(text, "\n⚠ Important : la dérivée.\n");
        assert!(!mid_line);
        let html = to_html(&text).unwrap();
        assert!(html.starts_with("<p class=MsoNormal><o:p>&nbsp;</o:p></p><p class=MsoNormal><b>"));
        // Après un repère, on est déjà sur une ligne neuve : pas de ligne vide.
        let (text, _) = separate("🔢 Formule : x²", false, true);
        assert_eq!(text, "🔢 Formule : x²\n");
        assert!(!to_html(&text).unwrap().contains("&nbsp;"));
    }

    #[test]
    fn plain_sentences_are_separated_by_a_space() {
        assert_eq!(
            separate("La dérivée de x² est égale à 2x.", false, true),
            ("La dérivée de x² est égale à 2x. ".to_string(), true)
        );
        assert_eq!(
            separate("Bonjour.", true, false),
            ("Bonjour.".to_string(), true)
        );
        // « À la ligne, … » dit en tête : déjà sur une ligne neuve.
        assert_eq!(
            separate("\nLa conclusion porte sur la stabilité du vol.", true, true),
            (
                "\nLa conclusion porte sur la stabilité du vol. ".to_string(),
                true
            )
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
