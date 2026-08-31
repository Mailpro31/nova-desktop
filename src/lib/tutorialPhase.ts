/**
 * L'état de la carte « Essayez Nova », et la garantie qu'elle ne reste jamais
 * en chargement.
 *
 * ## Le défaut que ce module corrige
 *
 * `TutorialOnboarding` déduisait son état d'une seule chose : l'entrée
 * d'historique porte-t-elle un texte reformulé ? Sinon, elle affichait
 * « Application du Style… » avec une roue qui tourne — **indéfiniment**, sans
 * délai, sans écouter le moindre signal d'échec.
 *
 * Or le backend enregistre volontairement une entrée à **texte vide** quand la
 * dictée a échoué, « so user can retry » (`actions.rs`). Cette entrée arrive
 * donc exactement comme une dictée réussie en attente de reformulation. Sur le
 * poste Lab, le serveur a répondu HTTP 400, le repli local n'avait aucun modèle
 * (le paquet Lab n'en télécharge aucun, par conception), l'entrée vide a été
 * sauvée — et la carte a tourné pour toujours pendant que deux notifications
 * annonçaient l'échec juste à côté.
 *
 * ## La règle
 *
 * Le chargement est un état **transitoire et borné**. Trois choses en sortent,
 * et chacune suffit : un échec signalé, un texte vide, un délai dépassé. C'est
 * ce que `tutorialPhase` encode, et c'est vérifiable sans monter React.
 */

/** Au-delà de ce délai, on cesse d'attendre la reformulation. */
export const POLISH_TIMEOUT_MS = 12_000;

export type TutorialPhase =
  /** Aucune dictée reçue : on explique le raccourci. */
  | "waiting"
  /** Reformulation en cours — **le seul état de chargement**, borné. */
  | "polishing"
  /** Texte brut obtenu, sans reformulation : résultat utilisable, pas d'attente. */
  | "captured"
  /** Texte reformulé obtenu. */
  | "polished"
  /** La dictée a échoué : on le dit, on ne fait pas semblant d'attendre. */
  | "failed";

export interface TutorialSignals {
  /** Texte brut de la dernière entrée, `null` si aucune n'est arrivée. */
  rawText: string | null;
  /** Texte reformulé, `null` tant qu'il n'est pas arrivé. */
  polishedText: string | null;
  /**
   * Le backend a signalé un échec — `transcription-error` ou
   * `campus-server-unreachable`. Ces événements existaient déjà et n'étaient
   * simplement écoutés nulle part sur cet écran.
   */
  failed: boolean;
  /** L'attente de reformulation a dépassé `POLISH_TIMEOUT_MS`. */
  polishTimedOut: boolean;
}

/**
 * L'état à afficher, pour un ensemble de signaux donné.
 *
 * Fonction totale : toute combinaison d'entrées désigne un état, et un seul
 * d'entre eux est un chargement.
 */
export function tutorialPhase(signals: TutorialSignals): TutorialPhase {
  // Un résultat reformulé prime sur tout le reste : même si une erreur est
  // survenue depuis, l'utilisateur a bien vu Nova fonctionner.
  if (signals.polishedText !== null && signals.polishedText.trim() !== "") {
    return "polished";
  }
  if (signals.failed) return "failed";
  if (signals.rawText === null) return "waiting";
  // Entrée à texte vide : c'est l'échec enregistré par `actions.rs`, pas une
  // reformulation en cours. La confondre avec une attente est précisément ce
  // qui produisait la roue perpétuelle.
  if (signals.rawText.trim() === "") return "failed";
  return signals.polishTimedOut ? "captured" : "polishing";
}

/**
 * Cet état montre-t-il une roue de chargement ?
 *
 * Exposé pour que le test puisse énoncer l'invariant sans connaître le rendu :
 * aucun signal d'échec, de vide ou de délai ne peut laisser l'interface en
 * chargement.
 */
export function isTutorialLoading(phase: TutorialPhase): boolean {
  return phase === "polishing";
}
