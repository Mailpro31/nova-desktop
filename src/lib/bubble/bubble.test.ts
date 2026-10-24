import { describe, expect, test } from "bun:test";

import { CONNECTIONS, connectionById, fits, launchFor } from "./connections";
import { applies, suggest, traits } from "./suggest";

const pick = (text: string, editable = false, habits = {}) =>
  suggest(text, traits(text, editable), habits);

describe("suggestions de la bulle", () => {
  test("un mot : l'expliquer, ses synonymes, le dictionnaire", () => {
    expect(pick("photosynthèse")).toEqual([
      "explain",
      "open:synonyms",
      "open:larousse",
    ]);
  });

  test("une phrase de cours : expliquer, simplifier, mots difficiles", () => {
    expect(
      pick(
        "La pression dynamique dépend de la vitesse du fluide et de sa masse volumique.",
      ),
    ).toEqual(["explain", "simplify", "words"]);
  });

  test("un long passage se résume d'abord", () => {
    expect(
      pick("Le nombre de Reynolds caractérise un écoulement. ".repeat(15))[0],
    ).toBe("summarize");
  });

  test("un texte en anglais se traduit d'abord", () => {
    expect(
      pick(
        "The lift coefficient depends on the angle of attack of the wing.",
      )[0],
    ).toBe("translate");
  });

  test("une formule se calcule dans WolframAlpha", () => {
    expect(pick("x^2 + 3x - 4 = 0")).toContain("open:wolfram");
    expect(pick("1/2 + x = 3.5")).toContain("open:wolfram");
  });

  test("une date de rendu va dans l'agenda", () => {
    expect(
      pick(
        "Le TP de mécanique des fluides est à rendre le 12/11 avant midi.",
      )[0],
    ).toBe("open:outlook-calendar");
  });

  test("le texte de l'élève, dans un champ éditable, se corrige", () => {
    expect(pick("je pence que sa marche pas", true)[0]).toBe("improve");
  });

  test("une habitude prend la troisième place, sans changer les deux premières", () => {
    const text =
      "La pression dynamique dépend de la vitesse du fluide et de sa masse volumique.";
    expect(pick(text, false, { quiz: 4 })).toEqual([
      "explain",
      "simplify",
      "quiz",
    ]);
    expect(pick(text, false, { quiz: 2 })).toEqual([
      "explain",
      "simplify",
      "words",
    ]);
  });

  test("une habitude qui ne convient pas au texte n'est pas proposée", () => {
    const text = "Une phrase bien trop longue pour un dictionnaire de mots.";
    expect(applies("open:larousse", text)).toBe(false);
    expect(pick(text, false, { "open:larousse": 9 })).not.toContain(
      "open:larousse",
    );
  });
});

describe("connexions", () => {
  test("chaque fiche a un identifiant unique et une adresse", () => {
    const ids = CONNECTIONS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CONNECTIONS) expect(c.url).toMatch(/^(https:\/\/|mailto:)/);
  });

  test("une IA reçoit la consigne et le texte dans l'adresse", () => {
    const launch = launchFor(
      connectionById("chatgpt")!,
      "Bernoulli",
      "Explique :",
      "fr",
    );
    expect(launch.url).toBe(
      `https://chatgpt.com/?q=${encodeURIComponent("Explique :\n\nBernoulli")}`,
    );
    // Copiée aussi : après une connexion, l'IA a perdu la question de l'adresse.
    expect(launch.clipboard).toBe("Explique :\n\nBernoulli");
  });

  test("une IA où l'élève est connecté ne touche pas au presse-papiers", () => {
    const launch = launchFor(
      connectionById("chatgpt")!,
      "Bernoulli",
      "Explique :",
      "fr",
      true,
    );
    expect(launch.clipboard).toBeUndefined();
  });

  test("la date de rendu va dans l'agenda choisi", () => {
    const text = "Le TP est à rendre le 12/11.";
    expect(suggest(text, traits(text, false), {}, "google-calendar")[0]).toBe(
      "open:google-calendar",
    );
  });

  test("un texte trop long passe par le presse-papiers, jamais coupé", () => {
    const long = "mot ".repeat(600);
    const launch = launchFor(connectionById("deepl")!, long, "", "en");
    expect(launch.url).toBe("https://www.deepl.com");
    expect(launch.clipboard).toBe(long.trim());
  });

  test("une application sans adresse de texte reçoit le texte par le presse-papiers", () => {
    expect(launchFor(connectionById("discord")!, "Salut", "", "fr")).toEqual({
      url: "https://discord.com/app",
      clipboard: "Salut",
    });
  });

  test("une recherche prend les premiers mots, pas le passage", () => {
    const launch = launchFor(
      connectionById("youtube")!,
      "un deux trois quatre cinq six sept huit neuf dix onze douze treize",
      "",
      "fr",
    );
    expect(decodeURIComponent(launch.url.split("=")[1])).toBe(
      "un deux trois quatre cinq six sept huit neuf dix onze douze",
    );
  });

  test("le traducteur vise la langue demandée", () => {
    expect(launchFor(connectionById("deepl")!, "Hello", "", "fr").url).toBe(
      "https://www.deepl.com/translator#auto/fr/Hello",
    );
  });

  test("les dictionnaires n'acceptent qu'un à trois mots", () => {
    const larousse = connectionById("larousse")!;
    expect(fits(larousse, "portance")).toBe(true);
    expect(fits(larousse, "un deux trois quatre")).toBe(false);
  });

  test("l'e-mail garde son adresse mailto", () => {
    expect(launchFor(connectionById("mail")!, "Bonjour", "", "fr").url).toBe(
      "mailto:?body=Bonjour",
    );
  });
});
