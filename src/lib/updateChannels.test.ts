import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * Les deux éditions ne partagent pas leur canal de mise à jour.
 *
 * Nova Personal et Nova Organization sont deux applications, avec deux
 * rythmes de livraison. L'endpoint updater vivait pourtant dans
 * `tauri.conf.json` seul, et `tauri.campus.conf.json` ne le surchargeait pas :
 * un poste d'organisation interrogeait donc le dépôt public de l'édition
 * grand public, et se serait mis à jour avec ses versions.
 *
 * Rien ne l'aurait signalé. Un build campus se compile sans erreur avec le
 * mauvais endpoint, et la dérive n'apparaît qu'au moment où quelqu'un publie
 * pour Personal — c'est-à-dire trop tard. D'où ce fichier.
 */

const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));

const BASE = read("src-tauri/tauri.conf.json");
const CAMPUS = read("src-tauri/tauri.campus.conf.json");

const endpoints = (config: {
  plugins?: { updater?: { endpoints?: string[] } };
}) => config.plugins?.updater?.endpoints ?? [];

describe("les canaux de mise à jour des deux éditions", () => {
  test("Personal en déclare au moins un", () => {
    expect(endpoints(BASE).length).toBeGreaterThan(0);
  });

  test("Organization surcharge celui qu'elle hérite", () => {
    expect(endpoints(CAMPUS).length).toBeGreaterThan(0);
  });

  test("aucun dépôt n'est servi aux deux", () => {
    const shared = endpoints(CAMPUS).filter((url) =>
      endpoints(BASE).includes(url),
    );
    expect(shared).toEqual([]);
  });

  /**
   * La clé publique, elle, doit rester unique et vivre dans la configuration
   * de base : elle authentifie l'éditeur, pas le canal. La dupliquer dans la
   * surcharge campus créerait deux endroits à modifier le jour d'une rotation,
   * et un seul serait mis à jour.
   */
  test("la clé de signature n'est déclarée qu'une fois", () => {
    expect(BASE.plugins?.updater?.pubkey).toBeTruthy();
    expect(CAMPUS.plugins?.updater?.pubkey).toBeUndefined();
  });
});
