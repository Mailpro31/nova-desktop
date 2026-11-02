/**
 * La lecture à voix haute : l'aide la mieux établie pour un élève dyslexique
 * (méta-analyse Wood et al. 2018, 22 études).
 *
 * En français, elle passe d'abord par la voix naturelle du serveur de l'école
 * (1.1), quand l'école en a une : le texte ne va pas plus loin que ce
 * serveur. Sinon, la synthèse vocale du système — les voix Windows, sans
 * connexion et sans rien envoyer. Jamais les voix en ligne d'Edge, qui
 * envoient le texte chez Microsoft.
 */

import { commands } from "@/bindings";

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

/**
 * Le texte en morceaux d'au plus `max` caractères, coupés après une phrase
 * quand c'est possible : la voix de l'école lit le premier pendant qu'elle
 * prépare le suivant, et la lecture commence sans attendre tout le texte.
 */
export function speechChunks(text: string, max = 900): string[] {
  const sentences = text.match(/[^.!?…\n]+[.!?…]*\s*|\n+/g) ?? [];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    for (let start = 0; start < sentence.length; start += max) {
      const piece = sentence.slice(start, start + max);
      if (current.length + piece.length > max && current.trim()) {
        chunks.push(current.trim());
        current = "";
      }
      current += piece;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

type SpeakOptions = { uiLanguage: string; rate: number; onEnd?: () => void };

/** Faux dès que le serveur dit ne pas avoir de voix : inutile de redemander. */
let schoolVoice = true;
/** Chaque lecture a son numéro ; une lecture arrêtée ne joue plus rien. */
let reading = 0;
let finishCurrent: (() => void) | null = null;

async function schoolAudio(text: string, rate: number): Promise<string | null> {
  const result = await commands
    .organizationSpeech(text, rate)
    .catch(() => null);
  if (result?.status !== "ok") return null;
  if (result.data === null) schoolVoice = false;
  return result.data;
}

function play(source: string): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio(source);
    finishCurrent = () => {
      audio.pause();
      resolve();
    };
    audio.onended = () => resolve();
    audio.onerror = () => resolve();
    audio.play().catch(() => resolve());
  });
}

async function speakWithSchool(
  text: string,
  options: SpeakOptions,
  run: number,
) {
  const chunks = speechChunks(text);
  let next = schoolAudio(chunks[0], options.rate);
  for (let index = 0; index < chunks.length; index++) {
    const audio = await next;
    if (run !== reading) return;
    if (!audio) {
      // Voix de l'école absente ou en panne : la voix Windows lit la suite.
      speakWithSystem(chunks.slice(index).join(" "), options);
      return;
    }
    if (index + 1 < chunks.length)
      next = schoolAudio(chunks[index + 1], options.rate);
    await play(audio);
    if (run !== reading) return;
  }
  options.onEnd?.();
}

/** Lit un texte ; arrête toute lecture en cours d'abord. */
export function speak(text: string, options: SpeakOptions): boolean {
  if (!text.trim()) return false;
  stopSpeaking();
  if (schoolVoice && speechLanguage(text, options.uiLanguage) === "fr") {
    void speakWithSchool(text, options, reading);
    return true;
  }
  return speakWithSystem(text, options);
}

function speakWithSystem(text: string, options: SpeakOptions): boolean {
  const synthesis = window.speechSynthesis;
  if (!synthesis) return false;
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
  reading++;
  finishCurrent?.();
  finishCurrent = null;
  window.speechSynthesis?.cancel();
}
