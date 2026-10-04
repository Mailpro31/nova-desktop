import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ENGLISH_MARKERS,
  LAYOUT_COMMANDS,
  STUDY_MARKERS,
} from "./StudyMarkersSection";

// L'écran montre à l'élève ce qu'il peut dire : chaque phrase doit être un
// vrai déclencheur des règles du poste, sinon l'élève la dirait pour rien.
const rules = readFileSync(
  join(import.meta.dir, "../../../../src-tauri/src/rewrite/spoken_marks.rs"),
  "utf8",
);

describe("repères vocaux", () => {
  test("chaque repère montré est un déclencheur, avec le texte écrit", () => {
    for (const { said, written } of STUDY_MARKERS) {
      expect(rules).toContain(`("${said.toLowerCase()}", "${written}"`);
    }
  });

  test("chaque repère anglais montré est un déclencheur", () => {
    for (const said of ENGLISH_MARKERS) {
      const lower = said.toLowerCase();
      const isMarker = rules.includes(`("${lower}", `);
      const isLayout = rules.includes(lower.replace(" ", "[ \\t]+"));
      expect(isMarker || isLayout).toBe(true);
    }
  });

  test("chaque commande de mise en page montrée est reconnue", () => {
    for (const command of LAYOUT_COMMANDS) {
      const words = command
        .toLowerCase()
        .replace("à", "(?:à|a)")
        .split(" ")
        .join("[ \\t]+");
      expect(rules).toContain(words);
    }
  });
});
