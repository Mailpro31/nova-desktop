import chatgpt from "@/assets/connections/chatgpt.png";
import claude from "@/assets/connections/claude.png";
import copilot from "@/assets/connections/copilot.png";
import deepl from "@/assets/connections/deepl.png";
import gemini from "@/assets/connections/gemini.png";
import googleTranslate from "@/assets/connections/google-traduction.png";
import larousse from "@/assets/connections/larousse.png";
import onenote from "@/assets/connections/onenote.png";
import outlook from "@/assets/connections/outlook.png";
import perplexity from "@/assets/connections/perplexity.png";
import todo from "@/assets/connections/todo.svg";
import wiktionary from "@/assets/connections/wiktionnaire.png";
import word from "@/assets/connections/word.png";
import youtube from "@/assets/connections/youtube.png";

/**
 * Les applications que la bulle sait atteindre (conception du 20/10).
 *
 * **Une connexion est une fiche, pas du code** : un nom, un logo, une adresse
 * avec la place du texte (`{q}`), et ce que l'application accepte. Ajouter une
 * application revient à écrire une ligne ici.
 *
 * Sans `{q}`, ou au-delà de `maxChars`, le texte est copié et le site ouvert :
 * l'élève colle avec Ctrl+V, et la bulle le lui dit. Jamais de texte coupé en
 * silence.
 */
export type ConnectionGroup =
  | "ai"
  | "translate"
  | "search"
  | "words"
  | "math"
  | "share"
  | "notes"
  | "agenda";

export type TextKind = "word" | "short" | "any";

export interface Connection {
  id: string;
  name: string;
  group: ConnectionGroup;
  /** Logo officiel ; sans logo, une pastille de la couleur de la marque. */
  logo?: string;
  color: string;
  url: string;
  /** Longueur au-delà de laquelle le texte passe par le presse-papiers. */
  maxChars: number;
  /** `word` : 1 à 3 mots ; `short` : une requête, réduite à ses premiers mots. */
  accepts: TextKind;
}

const AI_LIMIT = 1500;

export const CONNECTIONS: Connection[] = [
  // Comprendre : l'IA de l'élève, avec la consigne déjà écrite.
  {
    id: "chatgpt",
    name: "ChatGPT",
    group: "ai",
    logo: chatgpt,
    color: "#10a37f",
    url: "https://chatgpt.com/?q={q}",
    maxChars: AI_LIMIT,
    accepts: "any",
  },
  {
    id: "claude",
    name: "Claude",
    group: "ai",
    logo: claude,
    color: "#d97757",
    url: "https://claude.ai/new?q={q}",
    maxChars: AI_LIMIT,
    accepts: "any",
  },
  {
    id: "copilot",
    name: "Copilot",
    group: "ai",
    logo: copilot,
    color: "#2564eb",
    url: "https://copilot.microsoft.com/?q={q}",
    maxChars: AI_LIMIT,
    accepts: "any",
  },
  {
    id: "gemini",
    name: "Gemini",
    group: "ai",
    logo: gemini,
    color: "#4285f4",
    url: "https://gemini.google.com/app",
    maxChars: 0,
    accepts: "any",
  },
  {
    id: "lechat",
    name: "Le Chat",
    group: "ai",
    color: "#fa520f",
    url: "https://chat.mistral.ai/chat?q={q}",
    maxChars: AI_LIMIT,
    accepts: "any",
  },
  {
    id: "perplexity",
    name: "Perplexity",
    group: "ai",
    logo: perplexity,
    color: "#20808d",
    url: "https://www.perplexity.ai/search?q={q}",
    maxChars: AI_LIMIT,
    accepts: "any",
  },
  // Traduire.
  {
    id: "deepl",
    name: "DeepL",
    group: "translate",
    logo: deepl,
    color: "#0f2b46",
    url: "https://www.deepl.com/translator#auto/{lang}/{q}",
    maxChars: 1500,
    accepts: "any",
  },
  {
    id: "google-translate",
    name: "Google Traduction",
    group: "translate",
    logo: googleTranslate,
    color: "#4285f4",
    url: "https://translate.google.com/?sl=auto&tl={lang}&text={q}&op=translate",
    maxChars: 5000,
    accepts: "any",
  },
  // Chercher.
  {
    id: "youtube",
    name: "YouTube",
    group: "search",
    logo: youtube,
    color: "#ff0000",
    url: "https://www.youtube.com/results?search_query={q}",
    maxChars: 200,
    accepts: "short",
  },
  {
    id: "wikipedia",
    name: "Wikipédia",
    group: "search",
    color: "#636466",
    url: "https://fr.wikipedia.org/w/index.php?search={q}",
    maxChars: 200,
    accepts: "short",
  },
  {
    id: "google",
    name: "Google",
    group: "search",
    color: "#4285f4",
    url: "https://www.google.com/search?q={q}",
    maxChars: 200,
    accepts: "short",
  },
  {
    id: "scholar",
    name: "Google Scholar",
    group: "search",
    color: "#4d90fe",
    url: "https://scholar.google.com/scholar?q={q}",
    maxChars: 200,
    accepts: "short",
  },
  // Dictionnaires : un mot ou une courte expression.
  {
    id: "larousse",
    name: "Larousse",
    group: "words",
    logo: larousse,
    color: "#e2001a",
    url: "https://www.larousse.fr/dictionnaires/francais/{q}",
    maxChars: 60,
    accepts: "word",
  },
  {
    id: "synonyms",
    name: "Synonymes",
    group: "words",
    color: "#2f5d8a",
    url: "https://www.cnrtl.fr/synonymie/{q}",
    maxChars: 60,
    accepts: "word",
  },
  {
    id: "wiktionary",
    name: "Wiktionnaire",
    group: "words",
    logo: wiktionary,
    color: "#333333",
    url: "https://fr.wiktionary.org/wiki/{q}",
    maxChars: 60,
    accepts: "word",
  },
  // Maths.
  {
    id: "wolfram",
    name: "WolframAlpha",
    group: "math",
    color: "#dd1100",
    url: "https://www.wolframalpha.com/input?i={q}",
    maxChars: 300,
    accepts: "any",
  },
  // Partager.
  {
    id: "whatsapp",
    name: "WhatsApp",
    group: "share",
    color: "#25d366",
    url: "https://wa.me/?text={q}",
    maxChars: 1500,
    accepts: "any",
  },
  {
    id: "discord",
    name: "Discord",
    group: "share",
    color: "#5865f2",
    url: "https://discord.com/app",
    maxChars: 0,
    accepts: "any",
  },
  {
    id: "teams",
    name: "Teams",
    group: "share",
    color: "#5059c9",
    url: "https://teams.microsoft.com",
    maxChars: 0,
    accepts: "any",
  },
  {
    id: "mail",
    name: "E-mail",
    group: "share",
    logo: outlook,
    color: "#0078d4",
    url: "mailto:?body={q}",
    maxChars: 1500,
    accepts: "any",
  },
  {
    id: "gmail",
    name: "Gmail",
    group: "share",
    color: "#ea4335",
    url: "https://mail.google.com/mail/?view=cm&fs=1&body={q}",
    maxChars: 1500,
    accepts: "any",
  },
  // Mes notes : le texte est copié, l'application ouverte.
  {
    id: "onenote",
    name: "OneNote",
    group: "notes",
    logo: onenote,
    color: "#7719aa",
    url: "https://www.onenote.com/notebooks",
    maxChars: 0,
    accepts: "any",
  },
  {
    id: "word",
    name: "Word",
    group: "notes",
    logo: word,
    color: "#185abd",
    url: "https://www.office.com/launch/word",
    maxChars: 0,
    accepts: "any",
  },
  {
    id: "google-docs",
    name: "Google Docs",
    group: "notes",
    color: "#4285f4",
    url: "https://docs.new",
    maxChars: 0,
    accepts: "any",
  },
  {
    id: "notion",
    name: "Notion",
    group: "notes",
    color: "#000000",
    url: "https://www.notion.so",
    maxChars: 0,
    accepts: "any",
  },
  {
    id: "keep",
    name: "Google Keep",
    group: "notes",
    color: "#fbbc04",
    url: "https://keep.google.com",
    maxChars: 0,
    accepts: "any",
  },
  {
    id: "todo",
    name: "To Do",
    group: "notes",
    logo: todo,
    color: "#2564eb",
    url: "https://to-do.office.com/tasks/inbox",
    maxChars: 0,
    accepts: "any",
  },
  {
    id: "quizlet",
    name: "Quizlet",
    group: "notes",
    color: "#4255ff",
    url: "https://quizlet.com/create-set",
    maxChars: 0,
    accepts: "any",
  },
  // Agenda : un devoir, une date de rendu.
  {
    id: "outlook-calendar",
    name: "Agenda Outlook",
    group: "agenda",
    logo: outlook,
    color: "#0078d4",
    url: "https://outlook.office.com/calendar/deeplink/compose?subject={q}",
    maxChars: 120,
    accepts: "short",
  },
  {
    id: "google-calendar",
    name: "Google Agenda",
    group: "agenda",
    color: "#4285f4",
    url: "https://calendar.google.com/calendar/render?action=TEMPLATE&text={q}",
    maxChars: 120,
    accepts: "short",
  },
];

export const GROUP_ORDER: ConnectionGroup[] = [
  "ai",
  "translate",
  "search",
  "words",
  "math",
  "agenda",
  "notes",
  "share",
];

export function connectionById(id: string): Connection | undefined {
  return CONNECTIONS.find((connection) => connection.id === id);
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** L'application accepte-t-elle ce texte ? Une action qui ne convient pas est masquée. */
export function fits(connection: Connection, text: string): boolean {
  if (connection.accepts === "word") {
    const words = wordCount(text);
    return words >= 1 && words <= 3 && text.length <= connection.maxChars;
  }
  return true;
}

/** Les premiers mots d'un passage, pour une recherche : une requête, pas le passage. */
function query(text: string, maxChars: number): string {
  const words = text.trim().split(/\s+/).slice(0, 12).join(" ");
  return words.length > maxChars ? words.slice(0, maxChars) : words;
}

export interface Launch {
  url: string;
  /** Texte à mettre dans le presse-papiers avant d'ouvrir, quand l'adresse ne le porte pas. */
  clipboard?: string;
}

/**
 * L'adresse à ouvrir pour `text`, précédé de `prompt` pour une IA.
 *
 * `lang` est la langue cible des traducteurs (code ISO, « fr », « en »).
 */
export function launchFor(
  connection: Connection,
  text: string,
  prompt: string,
  lang: string,
  /** L'élève s'y est connecté : la question de l'adresse arrivera, rien à copier. */
  connected = false,
): Launch {
  const full =
    connection.group === "ai" && prompt
      ? `${prompt}\n\n${text.trim()}`
      : text.trim();
  const value =
    connection.accepts === "short" ? query(full, connection.maxChars) : full;
  const url = connection.url.replace("{lang}", lang);
  if (!url.includes("{q}")) return { url, clipboard: full };
  if (value.length > connection.maxChars) {
    // Trop long pour l'adresse : la page d'accueil du site, le texte à coller.
    const home = url.startsWith("http")
      ? new URL(url).origin
      : url.split("?")[0];
    return { url: home, clipboard: full };
  }
  return {
    url: url.replace("{q}", encodeURIComponent(value)),
    // Une IA demande souvent de se connecter d'abord, et la question de
    // l'adresse se perd alors : elle reste à coller (test de Sash, 24/10).
    clipboard: connection.group === "ai" && !connected ? full : undefined,
  };
}
