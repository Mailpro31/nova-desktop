import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Le mode débogage et l'onglet « Fondamentaux IA » quittent l'application.
 *
 * Le mode débogage ne fonctionnait pas : un interrupteur, un raccourci
 * Ctrl+Shift+D et une page entière pour des réglages que personne ne
 * retrouvait. Les journaux détaillés restent disponibles en lançant Nova avec
 * `--debug`, ce qui suffit au support.
 *
 * Le cours « Fondamentaux IA » vivait à deux endroits, Réglages et Apprendre :
 * il ne reste que dans Apprendre, la page des cours.
 */

const read = (path: string) => readFileSync(path, "utf8");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === "i18n" ? [] : sources(path);
    }
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)
      ? [path]
      : [];
  });
}

describe("mode débogage retiré", () => {
  test("la barre latérale n'a plus de page Débogage", () => {
    const sidebar = read("src/components/Sidebar.tsx");
    expect(sidebar).not.toContain("DebugSettings");
    expect(sidebar).not.toContain("sidebar.debug");
  });

  test("aucun raccourci ne bascule le mode débogage", () => {
    expect(read("src/App.tsx")).not.toContain("debug_mode");
  });

  test("aucun écran ne lit ni ne modifie le mode débogage", () => {
    const readers = sources("src")
      .filter((path) => !path.endsWith("bindings.ts"))
      .filter((path) => read(path).includes("debug_mode"))
      .filter((path) => !path.endsWith(join("stores", "settingsStore.ts")));
    expect(readers).toEqual([]);
  });

  test("l'interrupteur et la page Débogage n'existent plus", () => {
    expect(existsSync("src/components/settings/DebugModeToggle.tsx")).toBe(
      false,
    );
    expect(existsSync("src/components/settings/debug/DebugSettings.tsx")).toBe(
      false,
    );
  });
});

describe("Réglages sans « Fondamentaux IA »", () => {
  test("l'onglet du cours a quitté Réglages", () => {
    const settings = read(
      "src/components/settings/configuration/ConfigurationSettings.tsx",
    );
    expect(settings).not.toContain("aiEssentials");
    expect(settings).not.toContain("CampusAiSkills");
  });

  test("le cours reste accessible depuis Apprendre", () => {
    expect(read("src/components/settings/learn/LearnSettings.tsx")).toContain(
      "CampusAiSkills",
    );
  });
});
