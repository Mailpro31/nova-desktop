import type { HistoryEntry } from "@/bindings";

/**
 * Exporter ses dictées pour réviser : des notes (Markdown), des cartes de
 * révision (Anki) et une carte mentale (OPML, que Xmind, SimpleMind, Mindomo
 * et Freeplane ouvrent). Tout est fait par des règles fixes, à partir des
 * repères et des blocs que l'élève a dits (`spoken_marks.rs`) : rien n'est
 * inventé, rien ne part sur Internet.
 */

/** Le texte que l'élève a reçu : la version mise en forme, sinon sa dictée. */
export function noteText(entry: HistoryEntry): string {
  return (
    (entry.post_processed_text ?? "").trim() || entry.transcription_text.trim()
  );
}

/** Les dictées dans l'ordre où elles ont été faites, vides exclues. */
export function inCourseOrder(entries: HistoryEntry[]): HistoryEntry[] {
  return [...entries]
    .filter((entry) => noteText(entry).length > 0)
    .sort((a, b) => a.timestamp - b.timestamp);
}

/** Un repère ou un bloc posé en tête : « 📘 Définition : … ». */
export interface MarkedNote {
  label: string;
  body: string;
}

// Les repères de `spoken_marks.rs`, sans leur numéro (« 🧪 Exemple 2 »).
const LABEL =
  /^((?:⚠|🔁|❓|📘|⏸|✏|📐|📌|🛠|💬|🧪|✍|🔢|🖼)️?\s+[^:\n]+?)(?:\s*:\s*|$)/u;

export function splitMarker(text: string): MarkedNote | null {
  const found = LABEL.exec(text);
  if (!found) return null;
  return { label: found[1].trim(), body: text.slice(found[0].length).trim() };
}

/** Le nom d'un repère, sans son numéro : « 🧪 Exemple 2 » → « 🧪 Exemple ». */
function labelFamily(label: string): string {
  return label.replace(/\s+\d+$/u, "");
}

/** Une ancre de diapositive : « 🖼 Diapo 12 », « 🖼 Slide 4 ». */
function isSlide(label: string): boolean {
  return label.startsWith("🖼");
}

/** L'heure d'une dictée, « 10:42 », à l'heure du poste. */
export function clockTime(timestamp: number, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000));
}

// Au-delà de dix minutes sans dictée (pause, changement de partie), l'heure
// est rappelée : elle sert à recaler les notes sur le déroulé du cours.
const PAUSE_SECONDS = 10 * 60;

/**
 * Les notes du cours, dans l'ordre. Une ancre « Diapo 12 » devient un titre,
 * avec son heure : le document se parcourt diapositive par diapositive dans
 * le volet de navigation de Word. L'heure est aussi rappelée au début et
 * après chaque pause.
 */
export function toMarkdown(
  entries: HistoryEntry[],
  title: string,
  clock: (timestamp: number) => string = (timestamp) => clockTime(timestamp),
): string {
  const lines = [`# ${title}`, ""];
  let previous: number | null = null;
  for (const entry of inCourseOrder(entries)) {
    const marked = splitMarker(noteText(entry));
    const paused =
      previous === null || entry.timestamp - previous >= PAUSE_SECONDS;
    previous = entry.timestamp;
    if (marked && isSlide(marked.label)) {
      lines.push(`## ${marked.label} · ${clock(entry.timestamp)}`, "");
      if (marked.body) lines.push(marked.body, "");
      continue;
    }
    if (paused) lines.push(`*${clock(entry.timestamp)}*`, "");
    if (marked) {
      lines.push(
        marked.body
          ? `**${marked.label} :** ${marked.body}`
          : `**${marked.label}**`,
      );
    } else {
      lines.push(noteText(entry));
    }
    lines.push("");
  }
  return lines.join("\n");
}

// Les blocs qui font une carte de révision : on doit pouvoir s'interroger
// dessus. « À revoir » ou « J'ai décroché » sont des rappels, pas des cartes.
const CARD_FAMILIES = [
  "📘 Définition",
  "📘 Definition",
  "📐 Théorème",
  "📐 Theorem",
  "📐 Propriété",
  "📐 Property",
  "📌 À retenir",
  "📌 Key point",
  "🛠 Méthode",
  "🛠 Method",
  "🔢 Formule",
];

export interface RevisionCard {
  front: string;
  back: string;
  tag: string;
}

/**
 * Une carte par bloc à réviser. Une définition dite « X est Y » donne la
 * question « X ? » ; sinon, la carte demande le bloc par son nom et ses
 * premiers mots. Le verso est toujours le texte exact de l'élève.
 */
export function revisionCards(entries: HistoryEntry[]): RevisionCard[] {
  const cards: RevisionCard[] = [];
  for (const entry of inCourseOrder(entries)) {
    const marked = splitMarker(noteText(entry));
    if (!marked || !marked.body) continue;
    const family = labelFamily(marked.label);
    if (!CARD_FAMILIES.includes(family)) continue;
    const tag = family
      .replace(/^\S+\s+/u, "")
      .toLowerCase()
      .replace(/\s+/gu, "_");
    const definition = /^(.{2,80}?)\s+(?:est|sont|is|are)\s+/iu.exec(
      marked.body,
    );
    const front =
      family.startsWith("📘") && definition
        ? `${definition[1].replace(/[.,;:]$/u, "")} ?`
        : `${marked.label} : ${firstWords(marked.body, 6)}`;
    cards.push({ front, back: marked.body, tag });
  }
  return cards;
}

function firstWords(text: string, count: number): string {
  const words = text.split(/\s+/u);
  return words.length <= count ? text : `${words.slice(0, count).join(" ")}…`;
}

function csvField(value: string): string {
  return /[;"\n]/u.test(value) ? `"${value.replace(/"/gu, '""')}"` : value;
}

/** Le format d'import texte d'Anki 2.1.54+, avec ses lignes d'en-tête. */
export function toAnkiCsv(entries: HistoryEntry[], deck: string): string {
  const header = [
    "#separator:Semicolon",
    "#html:false",
    "#notetype:Basic",
    `#deck:${deck.replace(/[\n;]/gu, " ")}`,
    "#tags column:3",
  ];
  const rows = revisionCards(entries).map((card) =>
    [card.front, card.back, `nova ${card.tag}`].map(csvField).join(";"),
  );
  return [...header, ...rows, ""].join("\n");
}

function xml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

/**
 * Une carte mentale : le cours au centre, une branche par sorte de repère
 * (Définitions, À revoir…), et une branche « Notes » pour le reste, dans
 * l'ordre du cours.
 */
export function toOpml(
  entries: HistoryEntry[],
  title: string,
  notesLabel: string,
): string {
  const branches = new Map<string, string[]>();
  for (const entry of inCourseOrder(entries)) {
    const marked = splitMarker(noteText(entry));
    const branch = marked ? labelFamily(marked.label) : notesLabel;
    // Une diapositive garde son numéro : sans lui, la branche ne dit rien.
    const text = !marked
      ? noteText(entry)
      : isSlide(marked.label) && marked.body
        ? `${marked.label} : ${marked.body}`
        : marked.body || marked.label;
    const list = branches.get(branch) ?? [];
    list.push(text.replace(/\s*\n\s*/gu, " "));
    branches.set(branch, list);
  }
  const body = [...branches.entries()]
    .map(
      ([branch, items]) =>
        `      <outline text="${xml(branch)}">\n` +
        items
          .map((item) => `        <outline text="${xml(item)}"/>`)
          .join("\n") +
        `\n      </outline>`,
    )
    .join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    `  <head><title>${xml(title)}</title></head>`,
    "  <body>",
    `    <outline text="${xml(title)}">`,
    body,
    "    </outline>",
    "  </body>",
    "</opml>",
    "",
  ].join("\n");
}

/** Un nom de fichier sûr : « Nova — notes du 5 octobre 2026.md ». */
export function exportFileName(title: string, extension: string): string {
  return `${title.replace(/[\\/:*?"<>|]/gu, "-").trim()}.${extension}`;
}
