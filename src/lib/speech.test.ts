import { describe, expect, test } from "bun:test";

import { pickVoice, speechLanguage } from "./speech";

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
