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
 *
 * 300 caractères : la voix de l'école (Kokoro, processeur du PC fixe, 02/11)
 * rend 88 caractères en 2,5 s et lit environ 1,9 fois plus vite que le temps
 * réel ; au-delà, le premier son se fait attendre (8,6 s pour 255 caractères
 * en deux longues phrases).
 */
export function speechChunks(text: string, max = 300): string[] {
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

type SpeakOptions = {
  uiLanguage: string;
  rate: number;
  onEnd?: () => void;
  /** Le mot en cours de lecture, en positions dans le texte lu (1.2). */
  onWord?: (start: number, end: number) => void;
};

const WORD_CHARACTER = /[\p{L}\p{N}'’-]/u;

/** Le mot qui contient la position `index` ; vide sur une espace. */
export function wordAt(text: string, index: number): [number, number] {
  let start = Math.max(0, Math.min(index, text.length));
  let end = start;
  while (start > 0 && WORD_CHARACTER.test(text[start - 1])) start--;
  while (end < text.length && WORD_CHARACTER.test(text[end])) end++;
  return [start, end];
}

function announceWord(options: SpeakOptions, text: string, index: number) {
  const [start, end] = wordAt(text, index);
  if (end > start) options.onWord?.(start, end);
}

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

function play(
  source: string,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio(source);
    audio.ontimeupdate = () => {
      if (audio.duration) onProgress(audio.currentTime / audio.duration);
    };
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
  // Où commence chaque morceau dans le texte, pour surligner le bon mot.
  const offsets: number[] = [];
  for (const chunk of chunks) {
    const from = offsets.length ? offsets[offsets.length - 1] : 0;
    offsets.push(text.indexOf(chunk, from));
  }
  let next = schoolAudio(chunks[0], options.rate);
  for (let index = 0; index < chunks.length; index++) {
    const audio = await next;
    if (run !== reading) return;
    if (!audio) {
      // Voix de l'école absente ou en panne : la voix Windows lit la suite.
      speakWithSystem(text.slice(offsets[index]), options, offsets[index]);
      return;
    }
    if (index + 1 < chunks.length)
      next = schoolAudio(chunks[index + 1], options.rate);
    // shortcut: le mot lu est estimé à la proportion du temps écoulé, le MP3
    // ne dit pas où en est la voix ; à revoir si le décalage gêne les élèves.
    const chunk = chunks[index];
    await play(audio, (fraction) =>
      announceWord(
        options,
        text,
        offsets[index] + Math.floor(fraction * chunk.length),
      ),
    );
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

function speakWithSystem(
  text: string,
  options: SpeakOptions,
  offset = 0,
): boolean {
  const synthesis = window.speechSynthesis;
  if (!synthesis) return false;
  synthesis.cancel();
  const language = speechLanguage(text, options.uiLanguage);
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = pickVoice(synthesis.getVoices(), language);
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang ?? language;
  utterance.rate = options.rate;
  utterance.onboundary = (event) => {
    if (event.name !== "word") return;
    const [start, end] = wordAt(text, event.charIndex);
    if (end > start) options.onWord?.(offset + start, offset + end);
  };
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
