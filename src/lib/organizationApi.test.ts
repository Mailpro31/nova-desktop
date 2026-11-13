import { describe, expect, test } from "bun:test";

import { parseCommandError } from "./organizationApi";

/**
 * Le Rust écrit `HTTP {StatusCode}: …`, et `StatusCode` s'affiche avec sa
 * raison : « HTTP 403 Forbidden: … ». Lu comme statut 0, un membre suspendu
 * ne l'était jamais pour l'interface, et un code faux passait pour une panne.
 */
describe("parseCommandError", () => {
  test("reads the status behind the reason phrase", () => {
    const error = parseCommandError(
      "HTTP 403 Forbidden: Compte suspendu — contactez votre administrateur",
    );
    expect(error.status).toBe(403);
    expect(error.message).toBe(
      "Compte suspendu — contactez votre administrateur",
    );
  });

  test("reads a status without detail", () => {
    expect(parseCommandError("HTTP 404 Not Found").status).toBe(404);
  });

  test("still reads the short form", () => {
    expect(parseCommandError("HTTP 400: Code incorrect").status).toBe(400);
  });

  test("a network error has no status", () => {
    expect(parseCommandError("network error: refused").status).toBe(0);
  });
});
