//! Découpe un flux audio continu en PRISES DE PAROLE datées.
//!
//! Le mode réunion capte deux flux 16 kHz mono en continu. Pour produire un
//! dialogue chronologique (voir [`crate::meeting_transcript`]), il faut savoir
//! QUAND chaque personne a parlé, pas seulement ce qu'elle a dit : on découpe
//! donc chaque flux en prises de parole séparées par des silences, chacune datée
//! par rapport au début de la réunion.
//!
//! Approche : détection de silence par énergie, par fenêtres courtes. Volontaire-
//! ment simple et SANS modèle — donc entièrement testable hors audio réel, et
//! sans coût mémoire/CPU d'un VAD neuronal tournant en continu pendant toute la
//! réunion. La détection de voix par modèle (SileroVad, déjà dans le dépôt) reste
//! une amélioration possible plus tard ; l'interface de ce module ne changerait
//! pas.
//!
//! Logique PURE : ni audio ni API Windows. Testable sur la plateforme de dev.

/// Une prise de parole datée, prête à être transcrite puis étiquetée.
#[derive(Debug, Clone, PartialEq)]
pub struct TimedUtterance {
    /// Décalage depuis le début du flux, en millisecondes.
    pub start_ms: u64,
    /// Échantillons 16 kHz mono de la prise de parole (silence de fin inclus —
    /// le moteur de transcription le gère sans souci, et le trimmer serait une
    /// source de bugs pour un gain nul).
    pub samples: Vec<f32>,
}

/// Réglages de la segmentation. Les valeurs par défaut ([`SegmenterConfig::default`])
/// visent la parole de réunion ; exposées pour les tests et un éventuel réglage.
#[derive(Debug, Clone, Copy)]
pub struct SegmenterConfig {
    /// Fréquence d'échantillonnage du flux (16 kHz pour Nova).
    pub sample_rate: u32,
    /// Taille d'une fenêtre d'analyse, en échantillons. À 16 kHz, 320 = 20 ms.
    pub window: usize,
    /// Une fenêtre est « parlée » si son niveau crête atteint ce seuil. Bas, pour
    /// ne pas rater une voix lointaine, mais au-dessus du bruit de fond numérique.
    pub voiced_peak: f32,
    /// Nombre de fenêtres silencieuses CONSÉCUTIVES qui closent une prise de
    /// parole. À 20 ms/fenêtre, 25 = 500 ms de silence — assez pour séparer deux
    /// tours de parole sans couper une phrase à la moindre respiration.
    pub silence_windows_to_close: usize,
}

impl Default for SegmenterConfig {
    fn default() -> Self {
        Self {
            sample_rate: 16_000,
            window: 320,
            voiced_peak: 0.02,
            silence_windows_to_close: 25,
        }
    }
}

struct Current {
    start_sample: u64,
    samples: Vec<f32>,
    /// Fenêtres silencieuses vues depuis la dernière fenêtre parlée.
    trailing_silence_windows: usize,
}

/// Segmenteur à flux : on lui `push` des blocs d'échantillons au fil de la
/// capture ; il renvoie les prises de parole CLOSES (silence suffisant derrière
/// elles). En fin de réunion, [`flush`](Self::flush) rend la dernière prise en
/// cours.
pub struct UtteranceSegmenter {
    config: SegmenterConfig,
    /// Total d'échantillons consommés — sert d'horloge (index → millisecondes).
    processed_samples: u64,
    /// Échantillons reçus mais pas encore alignés sur une fenêtre entière.
    leftover: Vec<f32>,
    current: Option<Current>,
}

impl UtteranceSegmenter {
    pub fn new(config: SegmenterConfig) -> Self {
        Self {
            config,
            processed_samples: 0,
            leftover: Vec::new(),
            current: None,
        }
    }

    fn sample_to_ms(&self, sample: u64) -> u64 {
        sample * 1000 / self.config.sample_rate as u64
    }

    /// Alimente le segmenteur avec un bloc d'échantillons ; renvoie les prises de
    /// parole closes par ce bloc (souvent aucune). Les échantillons qui ne
    /// complètent pas une fenêtre sont conservés pour le prochain appel.
    pub fn push(&mut self, input: &[f32]) -> Vec<TimedUtterance> {
        let mut closed = Vec::new();
        let window = self.config.window;

        // Reprend le reliquat de la fois précédente pour ne pas perdre d'audio ni
        // décaler l'horloge d'échantillons.
        let mut buf = std::mem::take(&mut self.leftover);
        buf.extend_from_slice(input);

        let full_windows = buf.len() / window;
        for w in 0..full_windows {
            let start = w * window;
            let win = &buf[start..start + window];
            let window_start_sample = self.processed_samples + start as u64;

            let peak = win
                .iter()
                .filter(|s| s.is_finite())
                .fold(0.0_f32, |m, s| m.max(s.abs()));
            let voiced = peak >= self.config.voiced_peak;

            match &mut self.current {
                // On est dans une prise de parole.
                Some(cur) => {
                    cur.samples.extend_from_slice(win);
                    if voiced {
                        cur.trailing_silence_windows = 0;
                    } else {
                        cur.trailing_silence_windows += 1;
                        if cur.trailing_silence_windows >= self.config.silence_windows_to_close {
                            let cur = self.current.take().unwrap();
                            closed.push(TimedUtterance {
                                start_ms: self.sample_to_ms(cur.start_sample),
                                samples: cur.samples,
                            });
                        }
                    }
                }
                // Aucune prise en cours : seule une fenêtre parlée en ouvre une.
                None => {
                    if voiced {
                        self.current = Some(Current {
                            start_sample: window_start_sample,
                            samples: win.to_vec(),
                            trailing_silence_windows: 0,
                        });
                    }
                }
            }
        }

        // Avance l'horloge des seuls échantillons CONSOMMÉS (fenêtres entières) ;
        // le reste redevient le reliquat.
        let consumed = full_windows * window;
        self.processed_samples += consumed as u64;
        self.leftover = buf.split_off(consumed);

        closed
    }

    /// Clôt et renvoie la prise de parole en cours, s'il y en a une (fin de
    /// réunion). Le reliquat sous la taille d'une fenêtre est négligé : quelques
    /// millisecondes sans intérêt pour la transcription.
    pub fn flush(&mut self) -> Option<TimedUtterance> {
        self.current.take().map(|cur| TimedUtterance {
            start_ms: self.sample_to_ms(cur.start_sample),
            samples: cur.samples,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Config de test lisible : fenêtre de 10 échantillons, 3 fenêtres de silence
    /// closent une prise. Fréquence 1000 Hz → 1 échantillon = 1 ms, horodatage
    /// facile à vérifier.
    fn test_config() -> SegmenterConfig {
        SegmenterConfig {
            sample_rate: 1000,
            window: 10,
            voiced_peak: 0.5,
            silence_windows_to_close: 3,
        }
    }

    /// `n` fenêtres d'un niveau donné (constant sur la fenêtre).
    fn windows(level: f32, n: usize, window: usize) -> Vec<f32> {
        vec![level; n * window]
    }

    #[test]
    fn silence_only_yields_no_utterance() {
        let mut seg = UtteranceSegmenter::new(test_config());
        let closed = seg.push(&windows(0.0, 10, 10));
        assert!(closed.is_empty());
        assert!(seg.flush().is_none());
    }

    #[test]
    fn a_voiced_run_then_silence_closes_one_utterance() {
        let mut seg = UtteranceSegmenter::new(test_config());
        let mut audio = windows(1.0, 4, 10); // 4 fenêtres parlées
        audio.extend(windows(0.0, 3, 10)); // 3 fenêtres de silence → clôture
        let closed = seg.push(&audio);
        assert_eq!(closed.len(), 1);
        assert_eq!(closed[0].start_ms, 0);
        // 4 fenêtres parlées + 3 de silence = 70 échantillons inclus.
        assert_eq!(closed[0].samples.len(), 70);
    }

    #[test]
    fn a_brief_pause_does_not_split_an_utterance() {
        // 2 fenêtres de silence (< seuil de 3) ne closent pas : une respiration
        // ne doit pas couper la phrase en deux.
        let mut seg = UtteranceSegmenter::new(test_config());
        let mut audio = windows(1.0, 2, 10);
        audio.extend(windows(0.0, 2, 10)); // pause brève
        audio.extend(windows(1.0, 2, 10)); // reprise
        let closed = seg.push(&audio);
        assert!(closed.is_empty(), "une pause brève ne doit pas clore");
        let last = seg.flush().expect("une prise reste ouverte");
        assert_eq!(last.start_ms, 0);
    }

    #[test]
    fn start_time_reflects_leading_silence() {
        // Le silence initial repousse le début de la prise : l'horodatage doit
        // pointer la PREMIÈRE fenêtre parlée, pas le début du flux.
        let mut seg = UtteranceSegmenter::new(test_config());
        let mut audio = windows(0.0, 5, 10); // 50 ms de silence d'abord
        audio.extend(windows(1.0, 2, 10)); // puis la voix
        let closed = seg.push(&audio);
        assert!(closed.is_empty());
        let utt = seg.flush().expect("prise ouverte");
        assert_eq!(utt.start_ms, 50);
    }

    #[test]
    fn two_utterances_separated_by_a_long_silence() {
        let mut seg = UtteranceSegmenter::new(test_config());
        let mut audio = windows(1.0, 2, 10); // prise 1 @ 0 ms
        audio.extend(windows(0.0, 3, 10)); // silence long → clôt la 1
        audio.extend(windows(1.0, 2, 10)); // prise 2
        let closed = seg.push(&audio);
        assert_eq!(closed.len(), 1);
        assert_eq!(closed[0].start_ms, 0);
        // Prise 2 démarre après 2+3 fenêtres = 50 ms.
        let second = seg.flush().expect("prise 2 ouverte");
        assert_eq!(second.start_ms, 50);
    }

    #[test]
    fn samples_are_reassembled_across_pushes() {
        // Un bloc coupé au milieu d'une fenêtre : le reliquat doit être repris au
        // push suivant sans décaler l'horloge ni perdre d'échantillons.
        let mut seg = UtteranceSegmenter::new(test_config());
        // 15 échantillons parlés : 1 fenêtre complète (10) + 5 en reliquat.
        assert!(seg.push(&vec![1.0; 15]).is_empty());
        // 5 échantillons parlés (complète la 2e fenêtre) puis silence pour clore.
        let mut rest = vec![1.0; 5];
        rest.extend(windows(0.0, 3, 10));
        let closed = seg.push(&rest);
        assert_eq!(closed.len(), 1);
        assert_eq!(closed[0].start_ms, 0);
        // 2 fenêtres parlées (20) + 3 silence (30) = 50 échantillons.
        assert_eq!(closed[0].samples.len(), 50);
    }
}
