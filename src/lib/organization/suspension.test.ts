import { describe, expect, test } from "bun:test";
import { nextSuspended } from "./suspension";

/**
 * Un poste d'organisation est suspendu quand le serveur le dit, et seulement
 * quand il le dit. `/api/me` fait autorité : un 403 y signifie « compte
 * suspendu ». Tout ce qui n'est pas une réponse du serveur — hors ligne, panne,
 * erreur réseau — ne prouve ni la suspension ni le rétablissement : l'état
 * précédent reste.
 */
describe("nextSuspended", () => {
  test("un 403 sur /api/me suspend l'accès", () => {
    expect(nextSuspended(false, { reachable: true, status: 403 })).toBe(true);
  });

  test("une réponse normale rétablit l'accès", () => {
    expect(nextSuspended(true, { reachable: true, status: "ok" })).toBe(false);
  });

  test("hors ligne, rien ne change", () => {
    expect(nextSuspended(true, { reachable: false })).toBe(true);
    expect(nextSuspended(false, { reachable: false })).toBe(false);
  });

  test("une panne du serveur ou une erreur réseau ne tranche rien", () => {
    expect(nextSuspended(true, { reachable: true, status: 500 })).toBe(true);
    expect(nextSuspended(false, { reachable: true, status: 500 })).toBe(false);
    expect(nextSuspended(true, { reachable: true, status: 0 })).toBe(true);
  });

  test("une session expirée (401) n'est pas une suspension", () => {
    expect(nextSuspended(false, { reachable: true, status: 401 })).toBe(false);
  });
});
