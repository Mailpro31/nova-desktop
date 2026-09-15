import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

/**
 * Durée maximale d'une dictée, fixée par l'organisation.
 *
 * Le chemin traverse trois couches qui ne se testent pas ensemble : `/api/me`
 * annonce la limite, le moteur Rust surveille l'enregistrement et l'arrête,
 * l'overlay affiche le décompte. Ces tests vérifient que les trois parlent du
 * même événement et que chaque maillon est branché ; la logique de délai est
 * testée dans `dictation_limit.rs`.
 */

const read = (path: string) => readFileSync(path, "utf8");

describe("durée maximale d'une dictée", () => {
  test("le moteur et l'overlay partagent le même événement", () => {
    expect(read("src-tauri/src/dictation_limit.rs")).toContain(
      '"dictation-limit-warning"',
    );
    expect(read("src/overlay/RecordingOverlay.tsx")).toContain(
      '"dictation-limit-warning"',
    );
  });

  test("chaque enregistrement est surveillé, et la surveillance s'arrête avec lui", () => {
    const actions = read("src-tauri/src/actions.rs");
    expect(actions).toContain("crate::dictation_limit::watch_recording(app)");
    expect(actions).toContain("crate::dictation_limit::end_session()");
  });

  test("la limite vient de /api/me et disparaît à la déconnexion", () => {
    const campus = read("src-tauri/src/commands/campus.rs");
    expect(campus).toContain("pub limits: Option<CampusLimits>");
    expect(campus).toContain("crate::dictation_limit::set_limit(None)");
    expect(campus).toContain("limits.max_dictation_seconds");
  });

  test("l'arrêt passe par le coordinateur, comme la touche", () => {
    // Arrêter l'enregistreur directement contournerait la transcription :
    // la personne perdrait sa dictée au lieu de la voir collée.
    expect(read("src-tauri/src/dictation_limit.rs")).toContain(
      "coordinator.finish_current()",
    );
  });

  test("l'avertissement est traduit dans toutes les langues", () => {
    for (const locale of readdirSync("src/i18n/locales")) {
      const overlay = JSON.parse(
        read(`src/i18n/locales/${locale}/translation.json`),
      ).overlay;
      expect(overlay.dictationLimitWarning).toContain("{{seconds}}");
    }
  });
});
