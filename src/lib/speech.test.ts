import { describe, expect, test } from "bun:test";

import { pickVoice, speechChunks, speechLanguage, wordAt } from "./speech";

/**
 * La lecture à voix haute des notes — l'aide la mieux établie pour un élève
 * dyslexique (méta-analyse Wood et al. 2018). Lue avec une voix d'une autre
 * langue, une note française devient incompréhensible : c'est ce qu'on vérifie.
 */

const voice = (lang: string, name = lang, localService = true) =>
  ({ lang, name, localService }) as SpeechSynthesisVoice;

describe("la langue lue", () => {
  test("se déduit du texte quand il le dit nettement", () => {
    expect(
      speechLanguage("la dérivée de x au carré est égale à deux x", "en"),
    ).toBe("fr");
    expect(
      speechLanguage("I have finished my homework before the class", "fr"),
    ).toBe("en");
  });

  test("sinon, c'est celle de l'interface", () => {
    expect(speechLanguage("Pythagore", "fr")).toBe("fr");
    expect(speechLanguage("OK", "en")).toBe("en");
  });
});

describe("les morceaux lus par la voix de l'école", () => {
  test("coupés après une phrase, sans rien perdre", () => {
    const text = "Première phrase. Deuxième phrase ! Troisième ?";
    const chunks = speechChunks(text, 20);
    expect(chunks).toEqual([
      "Première phrase.",
      "Deuxième phrase !",
      "Troisième ?",
    ]);
  });

  test("une phrase trop longue est coupée, jamais au-delà du maximum", () => {
    const text = "a".repeat(25) + ". Fin.";
    const chunks = speechChunks(text, 10);
    expect(chunks.every((chunk) => chunk.length <= 10)).toBe(true);
    expect(chunks.join("")).toBe(text.replace(/\s+/g, ""));
  });

  test("la première phrase part seule : la voix de l'école commence plus tôt", () => {
    // Kokoro sur le RTX (11/11) : 4,3 s pour 132 caractères, rien avant la fin du morceau.
    expect(speechChunks("Un. Deux. Trois.")).toEqual(["Un.", "Deux. Trois."]);
  });

  test("un texte court reste en un morceau", () => {
    expect(speechChunks("Bonjour à tous.")).toEqual(["Bonjour à tous."]);
  });
});

describe("le mot surligné pendant la lecture", () => {
  const text = "La dérivée d'une constante, c'est zéro.";

  test("le mot entier, apostrophes et accents compris", () => {
    const [start, end] = wordAt(text, 5);
    expect(text.slice(start, end)).toBe("dérivée");
    const [s2, e2] = wordAt(text, text.indexOf("une"));
    expect(text.slice(s2, e2)).toBe("d'une");
  });

  test("rien sur une espace ou une ponctuation isolée", () => {
    const [start, end] = wordAt("a , b", 2);
    expect(end).toBe(start);
  });

  test("une position hors du texte reste dans le texte", () => {
    const [start, end] = wordAt(text, 999);
    expect(text.slice(start, end)).toBe("");
    expect(wordAt(text, -3)).toEqual([0, 2]);
  });
});

describe("la voix choisie", () => {
  test("la langue exacte d'abord", () => {
    const voices = [voice("en-US"), voice("fr-CA"), voice("fr-FR")];
    expect(pickVoice(voices, "fr")?.lang).toBe("fr-FR");
  });

  test("une variante de la langue ensuite", () => {
    expect(pickVoice([voice("en-US"), voice("fr-CA")], "fr")?.lang).toBe(
      "fr-CA",
    );
  });

  test("une voix installée sur le poste plutôt qu'une voix en ligne", () => {
    const voices = [
      voice("fr-FR", "Online", false),
      voice("fr-FR", "Hortense", true),
    ];
    expect(pickVoice(voices, "fr")?.name).toBe("Hortense");
  });

  test("aucune voix de la langue : aucune, plutôt qu'une voix étrangère", () => {
    expect(pickVoice([voice("en-US")], "fr")).toBeNull();
  });
});
