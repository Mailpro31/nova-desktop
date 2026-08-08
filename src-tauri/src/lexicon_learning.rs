//! Apprentissage progressif du lexique personnel.
//!
//! Boucle de CORRECTION DE TEXTE — jamais un système de commandes. À chaque
//! dictée, on détecte (avec la même mécanique n-grammes / Levenshtein / Soundex
//! que la correction, voir `audio_toolkit::text`) les noms propres et acronymes
//! récurrents qui ne sont PAS encore couverts par le lexique. On se contente de
//! COMPTER ces observations : rien n'est ajouté au lexique sans une confirmation
//! EXPLICITE de l'utilisateur. Une fois qu'un candidat revient assez souvent, il
//! est proposé discrètement dans l'UI (« Vouliez-vous dire « X » ? »).
//!
//! Garanties :
//! - jamais d'adoption sur une seule occurrence (seuil de récurrence) ;
//! - jamais d'adoption sans l'accord de l'utilisateur (accept explicite) ;
//! - un refus (`dismissed`) est définitif : le terme n'est plus jamais reproposé
//!   ni recompté ;
//! - entièrement défensif : une erreur d'apprentissage n'affecte jamais la
//!   dictée.

use crate::audio_toolkit::detect_lexicon_candidates;
use crate::settings::{self, AppSettings, LexiconCandidate};
use tauri::{AppHandle, Emitter};

/// Nombre de dictées où un candidat doit être vu avant d'être proposé. Toujours
/// > 1 : jamais de proposition sur une seule occurrence.
const PROMOTE_THRESHOLD: u32 = 3;

/// Plafond du tampon d'observations, pour borner la croissance du store.
const MAX_CANDIDATES: usize = 64;

/// Observe une dictée et met à jour les comptes des candidats détectés.
/// Non bloquant et défensif : l'apprentissage est un bonus, jamais un point de
/// panne du pipeline de dictée.
pub fn observe_dictation(app: &AppHandle, text: &str) {
    let mut settings = settings::get_settings(app);
    if !settings.lexicon_learning_enabled {
        return;
    }

    let detected = detect_lexicon_candidates(
        text,
        &settings.custom_words,
        settings.word_correction_threshold,
    );
    if detected.is_empty() {
        return;
    }

    let mut newly_ready = false;
    let mut changed = false;

    for term in detected {
        // Déjà ajouté au lexique entre-temps : on n'observe plus.
        if settings
            .custom_words
            .iter()
            .any(|w| w.eq_ignore_ascii_case(&term))
        {
            continue;
        }

        match settings
            .lexicon_candidates
            .iter_mut()
            .find(|c| c.term.eq_ignore_ascii_case(&term))
        {
            Some(existing) => {
                if existing.dismissed {
                    continue; // refus définitif : jamais recompté
                }
                let was_ready = existing.count >= PROMOTE_THRESHOLD;
                existing.count = existing.count.saturating_add(1);
                changed = true;
                if !was_ready && existing.count >= PROMOTE_THRESHOLD {
                    newly_ready = true;
                }
            }
            None => {
                settings.lexicon_candidates.push(LexiconCandidate {
                    term,
                    count: 1,
                    dismissed: false,
                });
                changed = true;
            }
        }
    }

    if !changed {
        return;
    }

    prune_candidates(&mut settings.lexicon_candidates);
    settings::write_settings(app, settings);

    if newly_ready {
        // Le frontend relit les suggestions en attente et affiche l'invite.
        let _ = app.emit("lexicon-suggestion", ());
    }
}

/// Borne le tampon : conserve les candidats déjà refusés (pour ne jamais les
/// reproposer) et, parmi les autres, les plus vus, jusqu'à [`MAX_CANDIDATES`].
fn prune_candidates(candidates: &mut Vec<LexiconCandidate>) {
    if candidates.len() <= MAX_CANDIDATES {
        return;
    }
    candidates.sort_by(|a, b| b.dismissed.cmp(&a.dismissed).then(b.count.cmp(&a.count)));
    candidates.truncate(MAX_CANDIDATES);
}

/// Suggestions prêtes à être proposées : vues au moins [`PROMOTE_THRESHOLD`]
/// fois, non refusées, pas déjà dans le lexique.
pub fn pending_suggestions(settings: &AppSettings) -> Vec<String> {
    if !settings.lexicon_learning_enabled {
        return Vec::new();
    }
    settings
        .lexicon_candidates
        .iter()
        .filter(|c| !c.dismissed && c.count >= PROMOTE_THRESHOLD)
        .filter(|c| {
            !settings
                .custom_words
                .iter()
                .any(|w| w.eq_ignore_ascii_case(&c.term))
        })
        .map(|c| c.term.clone())
        .collect()
}

/// Accepte une suggestion : ajoute le terme au lexique personnel et retire le
/// candidat du tampon. Idempotent si le terme y est déjà.
pub fn accept(app: &AppHandle, term: &str) {
    let mut settings = settings::get_settings(app);

    let resolved = settings
        .lexicon_candidates
        .iter()
        .position(|c| c.term.eq_ignore_ascii_case(term))
        .map(|i| settings.lexicon_candidates.remove(i).term)
        .unwrap_or_else(|| term.to_string());

    if !settings
        .custom_words
        .iter()
        .any(|w| w.eq_ignore_ascii_case(&resolved))
    {
        settings.custom_words.push(resolved);
    }

    settings::write_settings(app, settings);
}

/// Ignore définitivement une suggestion : le candidat est marqué `dismissed` et
/// ne sera plus jamais proposé ni recompté.
pub fn dismiss(app: &AppHandle, term: &str) {
    let mut settings = settings::get_settings(app);
    match settings
        .lexicon_candidates
        .iter_mut()
        .find(|c| c.term.eq_ignore_ascii_case(term))
    {
        Some(c) => c.dismissed = true,
        None => settings.lexicon_candidates.push(LexiconCandidate {
            term: term.to_string(),
            count: 0,
            dismissed: true,
        }),
    }
    settings::write_settings(app, settings);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candidate(term: &str, count: u32, dismissed: bool) -> LexiconCandidate {
        LexiconCandidate {
            term: term.to_string(),
            count,
            dismissed,
        }
    }

    #[test]
    fn pending_requires_threshold() {
        let mut s = AppSettings::default();
        s.lexicon_candidates = vec![
            candidate("Marseille", PROMOTE_THRESHOLD, false),
            candidate("Lyon", PROMOTE_THRESHOLD - 1, false),
        ];
        let pending = pending_suggestions(&s);
        assert_eq!(pending, vec!["Marseille".to_string()]);
    }

    #[test]
    fn pending_excludes_dismissed_and_existing() {
        let mut s = AppSettings::default();
        s.custom_words = vec!["Berlin".to_string()];
        s.lexicon_candidates = vec![
            candidate("Berlin", PROMOTE_THRESHOLD + 2, false), // déjà dans le lexique
            candidate("Nantes", PROMOTE_THRESHOLD, true),      // refusé
            candidate("Toulouse", PROMOTE_THRESHOLD, false),   // valide
        ];
        let pending = pending_suggestions(&s);
        assert_eq!(pending, vec!["Toulouse".to_string()]);
    }

    #[test]
    fn pending_empty_when_learning_disabled() {
        let mut s = AppSettings::default();
        s.lexicon_learning_enabled = false;
        s.lexicon_candidates = vec![candidate("Marseille", PROMOTE_THRESHOLD, false)];
        assert!(pending_suggestions(&s).is_empty());
    }

    #[test]
    fn prune_keeps_dismissed_and_most_seen() {
        let mut candidates: Vec<LexiconCandidate> = (0..MAX_CANDIDATES as u32 + 10)
            .map(|i| candidate(&format!("term{i}"), i, false))
            .collect();
        candidates.push(candidate("refused", 0, true));
        prune_candidates(&mut candidates);
        assert_eq!(candidates.len(), MAX_CANDIDATES);
        assert!(candidates
            .iter()
            .any(|c| c.term == "refused" && c.dismissed));
    }
}
