import { describe, expect, test } from "bun:test";

import en from "../../i18n/locales/en/translation.json";
import {
  ASK_NOVA,
  ASK_NOVA_ID,
  NOVA_COMMAND_SKILLS,
  targetLanguageName,
} from "./catalog";
import {
  clientCommandMessage,
  commandMessage,
  isCommandRefusal,
  leavesDocumentUntouched,
  type ClientCommandError,
} from "./errors";
import type { CommandError } from "@/bindings";

/**
 * Toutes les variantes d'erreur du moteur natif, énumérées à la main.
 *
 * L'exhaustivité est vérifiée deux fois : le `switch` de `commandMessage` la
 * garantit à la compilation, cette liste la garantit à l'exécution. Ajouter une
 * variante côté Rust sans la traiter ici fera donc échouer quelque chose.
 */
const ALL_ERRORS: CommandError[] = [
  { kind: "Busy" },
  { kind: "NonTextClipboard" },
  { kind: "NoSelection" },
  { kind: "Unsupported" },
  { kind: "TargetChanged" },
  { kind: "Clipboard", detail: "write failed" },
  { kind: "Input", detail: "enigo unavailable" },
];

const ALL_CLIENT_ERRORS: ClientCommandError[] = [
  "offline",
  "failed",
  "emptyResult",
  "refused",
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

function expectTranslated(key: string) {
  expect(typeof lookup(key)).toBe("string");
}

describe("messages d'erreur", () => {
  test("chaque variante native a un titre et un corps traduits", () => {
    for (const error of ALL_ERRORS) {
      const message = commandMessage(error);
      expectTranslated(message.titleKey);
      expectTranslated(message.bodyKey);
    }
  });

  test("chaque erreur côté client a un titre et un corps traduits", () => {
    for (const error of ALL_CLIENT_ERRORS) {
      const message = clientCommandMessage(error);
      expectTranslated(message.titleKey);
      expectTranslated(message.bodyKey);
    }
  });

  test("le détail technique ne transparaît jamais dans le message", () => {
    // Le détail peut contenir un chemin ou un message système : il ne doit pas
    // remonter jusqu'à l'utilisateur, ni même changer le message affiché.
    expect(commandMessage({ kind: "Clipboard", detail: "C:/secret" })).toEqual(
      commandMessage({ kind: "Clipboard", detail: "autre chose" }),
    );
  });

  test("un refus du moteur laisse le document intact", () => {
    expect(leavesDocumentUntouched({ kind: "TargetChanged" })).toBe(true);
    expect(leavesDocumentUntouched({ kind: "NonTextClipboard" })).toBe(true);
    // Une panne de frappe survient après l'écriture : rien n'est promis.
    expect(leavesDocumentUntouched({ kind: "Input", detail: "x" })).toBe(false);
  });
});

describe("catalogue", () => {
  test("quatre actions, toutes traduites et en aperçu", () => {
    expect(NOVA_COMMAND_SKILLS).toHaveLength(4);
    for (const skill of NOVA_COMMAND_SKILLS) {
      // Aucune action ne remplace directement pendant la phase expérimentale.
      expect(skill.outputMode).toBe("preview");
      expect(skill.requiresSelection).toBe(true);
      expectTranslated(skill.nameKey);
      expectTranslated(skill.descriptionKey);
    }
  });

  test("Ask Nova est décrit comme les autres mais reste hors de la liste", () => {
    expectTranslated(ASK_NOVA.nameKey);
    expectTranslated(ASK_NOVA.descriptionKey);
    // Sa consigne vient de l'utilisateur : il ne peut pas être exécuté d'un clic.
    expect(NOVA_COMMAND_SKILLS.some((s) => s.id === ASK_NOVA_ID)).toBe(false);
  });

  test("les consignes sont non vides et déterministes", () => {
    for (const skill of NOVA_COMMAND_SKILLS) {
      const first = skill.instruction("French");
      expect(first.length).toBeGreaterThan(0);
      expect(skill.instruction("French")).toBe(first);
    }
  });

  test("expliquer et résumer ne se réduisent pas à reformuler", () => {
    // Banc d'essai du 2026-09-22 : sans ces précisions, un modèle de quelques
    // milliards de paramètres rendait une paraphrase dans les deux cas.
    const byId = Object.fromEntries(
      NOVA_COMMAND_SKILLS.map((s) => [s.id, s.instruction("French")]),
    );
    expect(byId.explain).toContain("define each technical term");
    expect(byId.explain).toContain("Do not simply rephrase it");
    expect(byId.summarize).toContain("at most a third of its length");
  });

  test("la traduction nomme la langue cible", () => {
    const translate = NOVA_COMMAND_SKILLS.find((s) => s.id === "translate")!;
    expect(translate.instruction("Japanese")).toContain("Japanese");
  });

  test("l'original n'est comparé que pour les réécritures", () => {
    const byId = Object.fromEntries(
      NOVA_COMMAND_SKILLS.map((s) => [s.id, s.showsOriginal]),
    );
    expect(byId.improve).toBe(true);
    expect(byId.translate).toBe(true);
    // Une explication ne se compare pas au texte qui l'a provoquée.
    expect(byId.explain).toBe(false);
    expect(byId.summarize).toBe(false);
  });

  test("aucune provenance non implémentée n'est déclarée", () => {
    // Le type prévoit `campus` et `personal` pour plus tard ; rien ne doit les
    // produire tant que le serveur ne distribue aucun Skill.
    for (const skill of [...NOVA_COMMAND_SKILLS, ASK_NOVA]) {
      expect(skill.source).toBe("builtin");
      expect(skill.availability).toBe("experimental");
    }
  });
});

describe("targetLanguageName", () => {
  test("accepte une locale régionale", () => {
    expect(targetLanguageName("zh-TW")).toBe("Chinese");
    expect(targetLanguageName("fr")).toBe("French");
  });

  test("retombe sur l'anglais plutôt que sur un code brut", () => {
    // Envoyer « xx » au modèle produirait une traduction imprévisible.
    expect(targetLanguageName("xx")).toBe("English");
  });
});

describe("fidélité des commandes (banc du RTX, 06/10)", () => {
  test("Améliorer demande une correction minimale, sans réécrire", () => {
    const improve = NOVA_COMMAND_SKILLS.find((s) => s.id === "improve")!;
    const instruction = improve.instruction("French");
    expect(instruction).toContain(
      "Correct the spelling, grammar and punctuation",
    );
    expect(instruction).toContain("Keep every word that is correctly spelled");
    expect(instruction).toContain("keep who the text is addressed to");
    // Le serveur la classe comme une réécriture : mêmes nombres, mêmes mots.
    expect(instruction).not.toContain("Improve the wording");
  });

  test("un résultat écarté par le serveur est reconnu, une panne non", () => {
    expect(
      isCommandRefusal(
        new Error(
          'HTTP 422 Unprocessable Entity: {"detail":{"code":"COMMAND_REFUSED","reason":"language-changed"}}',
        ),
      ),
    ).toBe(true);
    expect(
      isCommandRefusal(new Error("HTTP 503: AI_RUNTIME_UNAVAILABLE")),
    ).toBe(false);
    expect(isCommandRefusal(undefined)).toBe(false);
  });

  test("le résultat porte la mention d'un texte produit par l'IA", () => {
    expectTranslated("novaCommands.generatedNote");
  });
});
