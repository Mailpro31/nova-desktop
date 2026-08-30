import { describe, expect, test } from "bun:test";

import en from "../../../i18n/locales/en/translation.json";
import { deriveSituation, type HeroSituation } from "./useHomeState";

const HEALTHY = {
  dictation: "idle" as const,
  dictationError: null,
  loaded: true,
  permissions: "ready",
  microphoneName: "Built-in Microphone",
  needsModelDownload: false,
  shortcut: "Ctrl+Space",
  campusLocal: false,
};

const ALL_SITUATIONS: HeroSituation[] = [
  "listening",
  "processing",
  "insertionFailed",
  "checking",
  "permissionsNeeded",
  "microphoneMissing",
  "modelMissing",
  "shortcutMissing",
  "campusLocal",
  "ready",
];

function lookup(key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[part]
          : undefined,
      en,
    );
}

describe("situation du héros", () => {
  test("tout va bien → prêt", () => {
    expect(deriveSituation(HEALTHY)).toBe("ready");
  });

  test("rien n'est affirmé avant que les sondes aient répondu", () => {
    expect(deriveSituation({ ...HEALTHY, loaded: false })).toBe("checking");
  });

  test("chaque empêchement a sa situation", () => {
    expect(deriveSituation({ ...HEALTHY, permissions: "action-needed" })).toBe(
      "permissionsNeeded",
    );
    expect(deriveSituation({ ...HEALTHY, microphoneName: null })).toBe(
      "microphoneMissing",
    );
    expect(deriveSituation({ ...HEALTHY, needsModelDownload: true })).toBe(
      "modelMissing",
    );
    expect(deriveSituation({ ...HEALTHY, shortcut: null })).toBe(
      "shortcutMissing",
    );
  });

  test("campus hors ligne dégrade sans bloquer", () => {
    // La dictée fonctionne toujours en local : ce n'est pas un empêchement,
    // donc jamais un écran d'erreur.
    expect(deriveSituation({ ...HEALTHY, campusLocal: true })).toBe(
      "campusLocal",
    );
  });

  test("un empêchement l'emporte sur une simple dégradation", () => {
    // Sans micro, dire « Nova Local est actif » serait rassurant à tort.
    expect(
      deriveSituation({
        ...HEALTHY,
        campusLocal: true,
        microphoneName: null,
      }),
    ).toBe("microphoneMissing");
  });

  test("le raccourci n'est jamais inventé", () => {
    // Sans raccourci enregistré, l'accueil doit basculer sur une situation qui
    // propose une action, pas afficher une touche par défaut imaginaire.
    expect(deriveSituation({ ...HEALTHY, shortcut: "" })).toBe(
      "shortcutMissing",
    );
  });
});

describe("dictée en cours", () => {
  test("l'écoute et le traitement passent avant tout le reste", () => {
    // Même micro refusé : si le moteur dit qu'il écoute, c'est qu'il écoute.
    expect(
      deriveSituation({
        ...HEALTHY,
        dictation: "listening",
        permissions: "action-needed",
      }),
    ).toBe("listening");
    expect(deriveSituation({ ...HEALTHY, dictation: "processing" })).toBe(
      "processing",
    );
  });

  test("un échec d'insertion se distingue, un échec micro non", () => {
    // Le texte récupérable est une information que rien d'autre ne donne.
    expect(
      deriveSituation({
        ...HEALTHY,
        dictation: "error",
        dictationError: "insertion",
      }),
    ).toBe("insertionFailed");
    // Le micro a déjà sa situation, avec une consigne plus complète.
    expect(
      deriveSituation({
        ...HEALTHY,
        dictation: "error",
        dictationError: "microphone",
        permissions: "action-needed",
      }),
    ).toBe("permissionsNeeded");
  });

  test("au repos, la disponibilité reprend la main", () => {
    expect(deriveSituation(HEALTHY)).toBe("ready");
  });
});

describe("libellés du héros", () => {
  test("chaque situation a un titre traduit", () => {
    for (const situation of ALL_SITUATIONS) {
      expect(typeof lookup(`home.hero.${situation}.title`)).toBe("string");
    }
  });

  test("chaque situation qui demande une action l'explique", () => {
    const needsDetail = ALL_SITUATIONS.filter(
      (s) =>
        s !== "checking" &&
        s !== "ready" &&
        // Pendant une dictée, le titre suffit : il n'y a rien à faire.
        s !== "listening" &&
        s !== "processing",
    );
    for (const situation of needsDetail) {
      expect(typeof lookup(`home.hero.${situation}.detail`)).toBe("string");
    }
  });
});
