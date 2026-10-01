import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { BUILTIN_STYLE_IDS, STYLE_ORDER } from "./builtinStyles";

/**
 * Un Style intégré se présente comme les autres : à sa place dans la liste,
 * avec une phrase qui dit ce qu'il fait, dans chaque langue.
 *
 * « Notes de cours » avait été ajouté sans l'un ni l'autre : il remontait en
 * tête de liste, avant « Transcription améliorée », sans description.
 */
const LOCALES = join(import.meta.dir, "..", "i18n", "locales");

function description(locale: string, id: string): unknown {
  const translation = JSON.parse(
    readFileSync(join(LOCALES, locale, "translation.json"), "utf-8"),
  );
  return translation?.organization?.styles?.descriptions?.[id];
}

describe("Styles intégrés", () => {
  test("chacun a sa place dans l'ordre d'affichage", () => {
    for (const id of BUILTIN_STYLE_IDS) {
      expect(STYLE_ORDER).toContain(id);
    }
    expect(STYLE_ORDER[0]).toBe("default_improve_transcriptions");
    expect(STYLE_ORDER[1]).toBe("nova_style_everyday");
    expect(BUILTIN_STYLE_IDS).toContain("nova_style_everyday");
  });

  test("chacun dit ce qu'il fait, dans chaque langue", () => {
    for (const locale of readdirSync(LOCALES)) {
      for (const id of BUILTIN_STYLE_IDS) {
        const text = description(locale, id);
        expect({
          locale,
          id,
          ok: typeof text === "string" && text.length > 0,
        }).toEqual({ locale, id, ok: true });
      }
    }
  });
});
