import { describe, expect, test } from "bun:test";

import { structuredNotesErrorKey } from "./structuredNotes";

/**
 * Pourquoi la structuration a échoué, dit à l'élève.
 *
 * Vu par Sash le 01/10 : une longue transcription renvoyait « Nova n'a pas pu
 * structurer ces notes. Réessayez dans un instant. », quelle que soit la
 * cause. Réessayer ne sert à rien quand le texte est trop long.
 */
describe("erreur des notes structurées", () => {
  test("un texte trop long pour le modèle", () => {
    expect(
      structuredNotesErrorKey(
        'HTTP 413 Payload Too Large: {"detail":{"code":"AI_PROMPT_TOO_LONG"}}',
      ),
    ).toBe("structuredNotes.errorTooLong");
  });

  test("un serveur qui met trop de temps", () => {
    expect(structuredNotesErrorKey("HTTP 504 Gateway Timeout")).toBe(
      "structuredNotes.errorSlow",
    );
    expect(
      structuredNotesErrorKey(
        "network error: error sending request: operation timed out",
      ),
    ).toBe("structuredNotes.errorSlow");
  });

  test("un serveur occupé", () => {
    expect(structuredNotesErrorKey("HTTP 429 Too Many Requests")).toBe(
      "structuredNotes.errorBusy",
    );
  });

  test("un serveur injoignable", () => {
    expect(
      structuredNotesErrorKey(
        "network error: error sending request: connection refused",
      ),
    ).toBe("structuredNotes.errorOffline");
  });

  test("le reste garde le message général", () => {
    expect(structuredNotesErrorKey("HTTP 502 Bad Gateway")).toBe(
      "structuredNotes.error",
    );
    expect(structuredNotesErrorKey("")).toBe("structuredNotes.error");
  });
});
