import { describe, expect, test } from "bun:test";
import type { HistoryEntry } from "@/bindings";
import {
  exportFileName,
  inCourseOrder,
  noteText,
  revisionCards,
  splitMarker,
  toAnkiCsv,
  toMarkdown,
  toOpml,
} from "./revisionExport";

let next = 0;
function entry(text: string, at: number, raw = text): HistoryEntry {
  next += 1;
  return {
    id: next,
    file_name: `handy-${at}.wav`,
    timestamp: at,
    saved: false,
    title: "",
    transcription_text: raw,
    post_processed_text: text === raw ? null : text,
    post_process_prompt: null,
    post_process_requested: true,
  } as HistoryEntry;
}

// Un cours dicté, dans le désordre où l'historique le rend (plus récent d'abord).
const course = [
  entry("⏸ J'ai décroché", 1060),
  entry("🔢 Formule : Δ = b² − 4ac.", 1050),
  entry("📐 Théorème : Dans un triangle rectangle, a² + b² = c².", 1040),
  entry("🔁 À revoir : Le théorème de Bernoulli.", 1030),
  entry(
    "📘 Définition : La viscosité est la résistance d'un fluide à l'écoulement.",
    1020,
    "Définition, la viscosité est la résistance d'un fluide à l'écoulement.",
  ),
  entry("Le cours commence par les fluides parfaits.", 1010),
  entry("   ", 1005),
];

describe("export pour réviser", () => {
  test("le texte exporté est celui que l'élève a reçu", () => {
    expect(noteText(course[4])).toBe(
      "📘 Définition : La viscosité est la résistance d'un fluide à l'écoulement.",
    );
    expect(inCourseOrder(course).map((e) => e.timestamp)).toEqual([
      1010, 1020, 1030, 1040, 1050, 1060,
    ]);
  });

  test("les repères sont reconnus, avec ou sans contenu", () => {
    expect(splitMarker("⚠ Important : La dérivée.")).toEqual({
      label: "⚠ Important",
      body: "La dérivée.",
    });
    expect(splitMarker("🧪 Exemple 2 : Un dé.")).toEqual({
      label: "🧪 Exemple 2",
      body: "Un dé.",
    });
    expect(splitMarker("⏸ J'ai décroché")).toEqual({
      label: "⏸ J'ai décroché",
      body: "",
    });
    expect(splitMarker("Le cours commence.")).toBeNull();
  });

  test("les notes Markdown suivent le cours", () => {
    const md = toMarkdown(course, "Mécanique des fluides", (at) => `t${at}`);
    expect(
      md.startsWith("# Mécanique des fluides\n\n*t1010*\n\nLe cours commence"),
    ).toBe(true);
    // Moins de dix minutes entre deux dictées : l'heure n'est pas répétée.
    expect(md).not.toContain("*t1020*");
    expect(md).toContain(
      "**📘 Définition :** La viscosité est la résistance d'un fluide à l'écoulement.",
    );
    expect(md).toContain("**⏸ J'ai décroché**");
  });

  test("une carte par bloc à réviser, jamais pour un simple rappel", () => {
    const cards = revisionCards(course);
    expect(cards.map((card) => card.front)).toEqual([
      "La viscosité ?",
      "📐 Théorème : Dans un triangle rectangle, a² +…",
      "🔢 Formule : Δ = b² − 4ac.",
    ]);
    expect(cards[0].back).toBe(
      "La viscosité est la résistance d'un fluide à l'écoulement.",
    );
    expect(cards[0].tag).toBe("définition");
  });

  test("le fichier Anki a ses en-têtes et protège les points-virgules", () => {
    const csv = toAnkiCsv(
      [entry("📌 À retenir : Deux cas ; le second est rare.", 2000)],
      "Nova; cours",
    );
    expect(csv.split("\n").slice(0, 5)).toEqual([
      "#separator:Semicolon",
      "#html:false",
      "#notetype:Basic",
      "#deck:Nova  cours",
      "#tags column:3",
    ]);
    expect(csv).toContain(
      '"📌 À retenir : Deux cas ; le second est…";"Deux cas ; le second est rare.";nova à_retenir',
    );
  });

  test("la carte mentale range les repères en branches", () => {
    const opml = toOpml(course, "Fluides & <cours>", "Notes");
    expect(opml).toContain('<outline text="Fluides &amp; &lt;cours&gt;">');
    expect(opml).toContain('<outline text="📘 Définition">');
    expect(opml).toContain(
      "<outline text=\"La viscosité est la résistance d'un fluide à l'écoulement.\"/>",
    );
    expect(opml).toContain('<outline text="Notes">');
    expect(opml).toContain('<outline text="⏸ J\'ai décroché">');
  });

  test("une ancre de diapositive devient un titre, avec son heure", () => {
    const slides = [
      entry("Le venturi accélère le fluide.", 5000),
      entry("🖼 Diapo 13", 4990),
      entry("Après la pause.", 4000),
      entry("🖼 Diapo 12 : La loi de Bernoulli.", 2000),
    ];
    expect(splitMarker("🖼 Diapo 12 : La loi de Bernoulli.")).toEqual({
      label: "🖼 Diapo 12",
      body: "La loi de Bernoulli.",
    });
    expect(toMarkdown(slides, "Fluides", (at) => `t${at}`)).toBe(
      [
        "# Fluides",
        "",
        "## 🖼 Diapo 12 · t2000",
        "",
        "La loi de Bernoulli.",
        "",
        "*t4000*",
        "",
        "Après la pause.",
        "",
        "## 🖼 Diapo 13 · t4990",
        "",
        "Le venturi accélère le fluide.",
        "",
      ].join("\n"),
    );
    // Une diapositive n'est pas une carte de révision.
    expect(revisionCards(slides)).toEqual([]);
    // Dans la carte mentale, elle garde son numéro.
    const opml = toOpml(slides, "Fluides", "Notes");
    expect(opml).toContain('<outline text="🖼 Diapo">');
    expect(opml).toContain(
      '<outline text="🖼 Diapo 12 : La loi de Bernoulli."/>',
    );
    expect(opml).toContain('<outline text="🖼 Diapo 13"/>');
  });

  test("le nom de fichier ne garde aucun caractère interdit", () => {
    expect(exportFileName("Cours: 5/10 ?", "md")).toBe("Cours- 5-10 -.md");
  });
});
