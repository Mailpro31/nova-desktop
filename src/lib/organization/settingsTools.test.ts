import { describe, expect, test } from "bun:test";

import { organizationSettingsTools } from "./settingsTools";

/**
 * Deux fonctions servies par l'organisation n'avaient plus aucun écran.
 *
 * `/api/engineering-notes` et le cours AI Essentials existaient côté serveur,
 * et leurs écrans existaient côté poste, mais rien ne les affichait : un
 * établissement pouvait ouvrir les notes d'ingénieur sans qu'aucun membre ne
 * les trouve, et un étudiant qui passait le cours au premier lancement ne
 * pouvait plus jamais le reprendre.
 *
 * Réglages les propose de nouveau, chacun seulement quand l'organisation
 * l'ouvre.
 */

const everythingOpen = {
  aiSkillsCapability: true,
  aiSkillsPolicyEnabled: true,
  engineeringNotesCapability: true,
  organizationType: "education" as const,
};

describe("AI Essentials", () => {
  test("une école qui ouvre AI Skills le propose", () => {
    expect(organizationSettingsTools(everythingOpen).aiEssentials).toBe(true);
  });

  test("la capacité fermée le retire", () => {
    expect(
      organizationSettingsTools({
        ...everythingOpen,
        aiSkillsCapability: false,
      }).aiEssentials,
    ).toBe(false);
  });

  test("la politique AI Skills désactivée le retire aussi", () => {
    expect(
      organizationSettingsTools({
        ...everythingOpen,
        aiSkillsPolicyEnabled: false,
      }).aiEssentials,
    ).toBe(false);
  });

  test("une entreprise ne reçoit pas un cours écrit pour des études", () => {
    expect(
      organizationSettingsTools({
        ...everythingOpen,
        organizationType: "business",
      }).aiEssentials,
    ).toBe(false);
  });

  test("tant que le serveur n'a pas annoncé d'école, rien n'est supposé", () => {
    expect(
      organizationSettingsTools({ ...everythingOpen, organizationType: null })
        .aiEssentials,
    ).toBe(false);
  });
});

describe("Notes d'ingénieur", () => {
  test("proposées dès que l'organisation ouvre la capacité", () => {
    expect(organizationSettingsTools(everythingOpen).engineeringNotes).toBe(
      true,
    );
    expect(
      organizationSettingsTools({
        ...everythingOpen,
        organizationType: "business",
      }).engineeringNotes,
    ).toBe(true);
  });

  test("retirées quand la capacité est fermée", () => {
    expect(
      organizationSettingsTools({
        ...everythingOpen,
        engineeringNotesCapability: false,
      }).engineeringNotes,
    ).toBe(false);
  });
});
