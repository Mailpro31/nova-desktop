import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * Un changement fait dans la console arrive en moins d'une minute.
 *
 * Le hook ne se monte pas hors de l'application ; ces tests vérifient qu'il
 * est branché comme il faut : une sonde légère fréquente, un rechargement
 * limité à ce qui a bougé, et le rythme d'avant face à un serveur qui ne
 * connaît pas encore la sonde. La décision elle-même est testée dans
 * `lib/organization/updates.test.ts`.
 */

const hook = readFileSync("src/hooks/useOrganizationUpdates.ts", "utf8");

describe("mises à jour de l'organisation", () => {
  test("la sonde légère passe toutes les trente secondes", () => {
    expect(hook).toContain("const CHANGES_INTERVAL_MS = 30 * 1000;");
    expect(hook).toContain("commands.fetchOrganizationChanges()");
  });

  test("seul ce qui a bougé est rechargé", () => {
    expect(hook).toContain("whatToReload(");
    // La policy porte les capacités et la durée maximale de dictée : `/api/me`
    // est relu pour les appliquer.
    expect(hook).toContain("commands.getCampusMe()");
    expect(hook).toContain("useLearningStore.getState().loadCatalog()");
  });

  test("un serveur sans sonde garde le rythme d'avant", () => {
    expect(hook).toContain("const INTERVAL_MS = 5 * 60 * 1000;");
  });

  test("la commande existe côté Rust et est enregistrée", () => {
    expect(read("src-tauri/src/commands/campus.rs")).toContain(
      "pub async fn fetch_organization_changes",
    );
    expect(read("src-tauri/src/commands/campus.rs")).toContain(
      '"{}/api/organization/changes"',
    );
    expect(read("src-tauri/src/lib.rs")).toContain(
      "commands::campus::fetch_organization_changes",
    );
  });
});

function read(path: string): string {
  return readFileSync(path, "utf8");
}
