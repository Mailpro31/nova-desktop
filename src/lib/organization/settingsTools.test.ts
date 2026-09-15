import { describe, expect, test } from "bun:test";

import { organizationSettingsTools } from "./settingsTools";

/**
 * Le cours AI Essentials existait côté serveur et côté poste, mais rien ne
 * l'affichait : un étudiant qui le passait au premier lancement ne pouvait
 * plus jamais le reprendre. Il est proposé de nouveau, seulement quand
 * l'organisation l'ouvre. Les notes d'ingénieur sont devenues la catégorie
 * « Notes structurées », testée dans `structuredNotes.test.ts`.
 */

const everythingOpen = {
  aiSkillsCapability: true,
  aiSkillsPolicyEnabled: true,
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
