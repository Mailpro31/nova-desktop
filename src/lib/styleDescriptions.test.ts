import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Un Style dit ce qu'il fait vraiment.
 *
 * « Voix → texte » annonçait une « transcription brute, sans aucun
 * traitement », alors que sa consigne corrige la ponctuation, les majuscules
 * et l'orthographe. Un élève qui le choisissait pour garder son texte tel
 * quel était trompé.
 */
const LOCALES = join(import.meta.dir, "..", "i18n", "locales");

function voiceToText(locale: string): string {
  const translation = JSON.parse(
    readFileSync(join(LOCALES, locale, "translation.json"), "utf-8"),
  );
  return translation.organization.styles.descriptions.nova_style_voice_to_text;
}

describe("« Voix → texte »", () => {
  test("ne se dit pas brut : il corrige", () => {
    expect(voiceToText("en")).not.toMatch(/raw|without any/i);
    expect(voiceToText("fr")).not.toMatch(/brute|sans aucun/i);
    expect(voiceToText("fr")).toMatch(/ponctuation/);
  });
});
