import { describe, expect, it } from "bun:test";

import {
  STARTUP_STALL_MS,
  startupScreen,
  type StartupProbes,
} from "./startupGate";

/**
 * Ces tests existent pour une régression précise et déjà survenue : le premier
 * lancement de Nova Lab n'affichait **rien**. Pas un écran d'erreur, pas un
 * indicateur — une fenêtre blanche, indéfiniment, parce que la racine React
 * renvoyait `null` tant que des sondes ne concernant pas le Lab n'avaient pas
 * répondu.
 *
 * Ils vérifient donc deux propriétés, et pas la mise en page :
 *
 * - le Lab s'affiche sans qu'aucune sonde ait répondu ;
 * - aucune combinaison d'entrées ne produit « rien à afficher ».
 */

/** Un poste neuf : rien n'a répondu, rien n'est configuré. */
const coldStart: StartupProbes = {
  isLabBuild: false,
  labEnrolled: false,
  isFirstRun: null,
  editionSettled: false,
  readinessLoaded: false,
  flowInitialized: false,
  elapsedMs: 0,
};

describe("écran de démarrage", () => {
  it("affiche l'écran Lab immédiatement, sans aucune sonde résolue", () => {
    // C'est exactement le PC de démonstration : pas de modèle local, pas de
    // périphérique audio, pas de configuration Campus, pas de réglages lus.
    expect(startupScreen({ ...coldStart, isLabBuild: true })).toBe("lab");
  });

  it("n'attend pas les sondes du client complet dans un build Lab", () => {
    const screen = startupScreen({
      ...coldStart,
      isLabBuild: true,
      isFirstRun: null,
      readinessLoaded: false,
      flowInitialized: false,
      elapsedMs: STARTUP_STALL_MS * 10,
    });
    expect(screen).toBe("lab");
  });

  it("laisse le Lab enrôlé rejoindre le parcours normal", () => {
    const screen = startupScreen({
      ...coldStart,
      isLabBuild: true,
      labEnrolled: true,
      isFirstRun: false,
      editionSettled: true,
      readinessLoaded: true,
      flowInitialized: true,
    });
    expect(screen).toBe("app");
  });

  it("montre une attente visible tant que les sondes n'ont pas répondu", () => {
    expect(startupScreen(coldStart)).toBe("loading");
  });

  it("cesse d'attendre et devient un message au-delà du délai", () => {
    expect(startupScreen({ ...coldStart, elapsedMs: STARTUP_STALL_MS })).toBe(
      "stalled",
    );
    expect(
      startupScreen({
        ...coldStart,
        isFirstRun: true,
        editionSettled: true,
        readinessLoaded: false,
        flowInitialized: false,
        elapsedMs: STARTUP_STALL_MS,
      }),
    ).toBe("stalled");
  });

  it("pose la question de l'édition avant le parcours", () => {
    expect(
      startupScreen({ ...coldStart, isFirstRun: true, editionSettled: false }),
    ).toBe("edition");
  });

  it("ne renvoie jamais « rien à afficher », quelles que soient les sondes", () => {
    const booleans = [false, true];
    const screens = new Set<string>();
    for (const isLabBuild of booleans) {
      for (const labEnrolled of booleans) {
        for (const isFirstRun of [null, false, true]) {
          for (const editionSettled of booleans) {
            for (const readinessLoaded of booleans) {
              for (const flowInitialized of booleans) {
                for (const elapsedMs of [0, STARTUP_STALL_MS]) {
                  const screen = startupScreen({
                    isLabBuild,
                    labEnrolled,
                    isFirstRun,
                    editionSettled,
                    readinessLoaded,
                    flowInitialized,
                    elapsedMs,
                  });
                  expect(screen).toBeTruthy();
                  screens.add(screen);
                }
              }
            }
          }
        }
      }
    }
    // Et les cinq écrans sont atteignables : aucun n'est du code mort.
    expect(screens).toEqual(
      new Set(["lab", "edition", "loading", "stalled", "app"]),
    );
  });
});
