/**
 * La lecture à voix haute : l'aide la mieux établie pour un élève dyslexique
 * (méta-analyse Wood et al. 2018, 22 études).
 *
 * Elle passe par la synthèse vocale du système — les voix Windows, sans
 * connexion et sans rien envoyer : une note de cours n'a pas à quitter le
 * poste pour être lue.
 */

const FRENCH = new Set(
  "le la les des une un est et que qui pour dans sur avec pas vous nous je tu il elle on de du au aux ce cette".split(
    " ",
  ),
);
const ENGLISH = new Set(
  "the a an is are and that who for in on with not you we i he she it my your of to at this these".split(
    " ",
  ),
);

/**
 * La langue dans laquelle lire : celle du texte quand il la dit nettement,
 * celle de l'interface sinon.
 */
export function speechLanguage(text: string, uiLanguage: string): string {
  const words = (text.toLowerCase().match(/[\p{L}']+/gu) ?? []).map(
    (word) => word.split("'").pop() ?? word,
  );
  if (words.length >= 4) {
    const french = words.filter((word) => FRENCH.has(word)).length;
    const english = words.filter((word) => ENGLISH.has(word)).length;
    if (french >= 2 && french > 2 * english) return "fr";
    if (english >= 2 && english > 2 * french) return "en";
  }
  return uiLanguage.split("-")[0];
}

/**
 * La voix qui lira : la langue exacte d'abord (« fr-FR »), une variante sinon
 * (« fr-CA »), une voix installée plutôt qu'une voix en ligne. Aucune voix de
 * la langue : aucune — une note française lue par une voix anglaise est
 * incompréhensible.
 */
export function pickVoice(
  voices: readonly SpeechSynthesisVoice[],
  language: string,
): SpeechSynthesisVoice | null {
  const matching = voices.filter(
    (voice) => voice.lang.toLowerCase().split(/[-_]/)[0] === language,
  );
  if (matching.length === 0) return null;
  const rank = (voice: SpeechSynthesisVoice) => {
    const [base, region] = voice.lang.toLowerCase().split(/[-_]/);
    const exact = region === base ? 0 : 1;
    return exact * 2 + (voice.localService ? 0 : 1);
  };
  return [...matching].sort((a, b) => rank(a) - rank(b))[0];
}

/** Lit un texte ; arrête toute lecture en cours d'abord. */
export function speak(
  text: string,
  options: { uiLanguage: string; rate: number; onEnd?: () => void },
): boolean {
  const synthesis = window.speechSynthesis;
  if (!synthesis || !text.trim()) return false;
  synthesis.cancel();
  const language = speechLanguage(text, options.uiLanguage);
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = pickVoice(synthesis.getVoices(), language);
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang ?? language;
  utterance.rate = options.rate;
  if (options.onEnd) {
    utterance.onend = options.onEnd;
    utterance.onerror = options.onEnd;
  }
  synthesis.speak(utterance);
  return true;
}

export function stopSpeaking(): void {
  window.speechSynthesis?.cancel();
}
