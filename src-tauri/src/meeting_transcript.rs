//! Assemblage du dialogue d'une réunion à partir de deux flux transcrits.
//!
//! Le mode réunion capte DEUX sources séparées — le micro de l'utilisateur
//! (« Vous ») et le son des autres participants (« Autres ») — puis les
//! transcrit indépendamment à la fin. Chaque source produit une suite de prises
//! de parole horodatées. Ce module les fusionne en UN dialogue chronologique
//! prêt à résumer : « qui a dit quoi, et dans quel ordre ».
//!
//! C'est la pièce qui fait la qualité du compte rendu (un simple bloc « tout ce
//! que vous avez dit » puis « tout ce qu'ils ont dit » serait inexploitable pour
//! une synthèse). Logique PURE, sans audio ni API Windows : entièrement testable
//! sur la plateforme de développement.

/// Qui parle dans une prise de parole. Volontairement limité à deux rôles : la
/// capture par flux distingue l'utilisateur du reste, mais ne sépare pas les
/// participants entre eux (un seul flux « sortant » fusionné). Ne jamais
/// prétendre le contraire dans le rendu.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Speaker {
    /// L'utilisateur (flux micro).
    You,
    /// Les autres participants (flux loopback de l'app de réunion), non
    /// distingués individuellement.
    Others,
}

/// Une prise de parole transcrite, datée par rapport au DÉBUT de la réunion.
#[derive(Debug, Clone, PartialEq)]
pub struct Utterance {
    /// Décalage depuis le début de la réunion, en millisecondes. Sert à
    /// entrelacer les deux flux dans l'ordre réel de la conversation.
    pub start_ms: u64,
    pub speaker: Speaker,
    /// Texte transcrit. Peut être vide (silence transcrit en rien) — filtré.
    pub text: String,
}

/// Étiquettes de locuteur affichées dans le dialogue. Passées en paramètre pour
/// rester traduisibles côté appelant (l'app parle 22 langues) plutôt que figées
/// en français dans le backend.
pub struct SpeakerLabels<'a> {
    pub you: &'a str,
    pub others: &'a str,
}

/// Fusionne les prises de parole des deux flux en un dialogue chronologique.
///
/// - tri par horodatage (stable : à temps égal, l'ordre d'entrée est conservé) ;
/// - les prises de parole vides ou blanches sont ignorées (un silence ne produit
///   pas de ligne) ;
/// - les prises CONSÉCUTIVES du même locuteur sont regroupées sous une seule
///   étiquette, pour un rendu lisible (« Vous : … » n'est pas répété à chaque
///   segment) ;
/// - chaque bloc est préfixé de son étiquette : « Vous : … » / « Autres : … ».
///
/// Le résultat est prêt à être passé au Style « Réunion » pour synthèse.
pub fn assemble_dialogue(mut utterances: Vec<Utterance>, labels: &SpeakerLabels) -> String {
    // Tri STABLE : deux prises de parole au même instant (ex. chevauchement
    // arrondi à la même milliseconde) gardent leur ordre d'origine plutôt que
    // d'être permutées arbitrairement.
    utterances.sort_by_key(|u| u.start_ms);

    let mut lines: Vec<String> = Vec::new();
    let mut current: Option<(Speaker, String)> = None;

    for utterance in utterances {
        let text = utterance.text.trim();
        if text.is_empty() {
            continue;
        }

        match &mut current {
            // Même locuteur qui poursuit : on accumule dans le même bloc.
            Some((speaker, buffer)) if *speaker == utterance.speaker => {
                buffer.push(' ');
                buffer.push_str(text);
            }
            // Changement de locuteur (ou tout premier bloc) : on ferme le bloc
            // courant et on en ouvre un nouveau.
            _ => {
                if let Some((speaker, buffer)) = current.take() {
                    lines.push(format_line(speaker, &buffer, labels));
                }
                current = Some((utterance.speaker, text.to_string()));
            }
        }
    }

    if let Some((speaker, buffer)) = current {
        lines.push(format_line(speaker, &buffer, labels));
    }

    lines.join("\n")
}

fn format_line(speaker: Speaker, text: &str, labels: &SpeakerLabels) -> String {
    let label = match speaker {
        Speaker::You => labels.you,
        Speaker::Others => labels.others,
    };
    format!("{label} : {text}")
}

#[cfg(test)]
mod tests {
    use super::*;

    const LABELS: SpeakerLabels = SpeakerLabels {
        you: "Vous",
        others: "Autres",
    };

    fn u(start_ms: u64, speaker: Speaker, text: &str) -> Utterance {
        Utterance {
            start_ms,
            speaker,
            text: text.to_string(),
        }
    }

    #[test]
    fn empty_meeting_yields_empty_dialogue() {
        assert_eq!(assemble_dialogue(vec![], &LABELS), "");
    }

    #[test]
    fn interleaves_the_two_streams_by_time() {
        // Les deux flux sont transcrits séparément et arrivent donc groupés par
        // source ; l'assemblage doit rétablir l'ordre réel de la conversation.
        let dialogue = assemble_dialogue(
            vec![
                u(0, Speaker::You, "Bonjour à tous"),
                u(4000, Speaker::You, "on peut commencer"),
                u(2000, Speaker::Others, "Bonjour"),
            ],
            &LABELS,
        );
        assert_eq!(
            dialogue,
            "Vous : Bonjour à tous\nAutres : Bonjour\nVous : on peut commencer"
        );
    }

    #[test]
    fn consecutive_same_speaker_utterances_are_grouped() {
        // Deux segments consécutifs du même locuteur ne doivent pas répéter
        // l'étiquette : un seul bloc « Vous : … … ».
        let dialogue = assemble_dialogue(
            vec![
                u(0, Speaker::You, "Premier point"),
                u(1000, Speaker::You, "deuxième point"),
            ],
            &LABELS,
        );
        assert_eq!(dialogue, "Vous : Premier point deuxième point");
    }

    #[test]
    fn blank_utterances_are_dropped() {
        // Un silence transcrit en vide (ou en espaces) ne doit pas créer de ligne
        // ni casser le regroupement des blocs autour de lui.
        let dialogue = assemble_dialogue(
            vec![
                u(0, Speaker::You, "Avant"),
                u(1000, Speaker::You, "   "),
                u(2000, Speaker::You, "après"),
            ],
            &LABELS,
        );
        assert_eq!(dialogue, "Vous : Avant après");
    }

    #[test]
    fn equal_timestamps_keep_input_order() {
        // À horodatage égal, le tri stable préserve l'ordre d'entrée : pas de
        // permutation arbitraire d'un chevauchement.
        let dialogue = assemble_dialogue(
            vec![
                u(1500, Speaker::You, "moi d'abord"),
                u(1500, Speaker::Others, "puis eux"),
            ],
            &LABELS,
        );
        assert_eq!(dialogue, "Vous : moi d'abord\nAutres : puis eux");
    }

    #[test]
    fn labels_are_caller_provided_for_translation() {
        // Les étiquettes viennent de l'appelant (i18n), pas figées dans le
        // backend : un appelant anglophone obtient « You »/« Others ».
        let en = SpeakerLabels {
            you: "You",
            others: "Others",
        };
        let dialogue = assemble_dialogue(vec![u(0, Speaker::Others, "Hi")], &en);
        assert_eq!(dialogue, "Others : Hi");
    }
}
