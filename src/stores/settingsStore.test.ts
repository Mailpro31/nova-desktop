import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * Ce qu'un reglage modifie reellement.
 *
 * `updateSetting` applique d'abord la valeur en memoire, puis cherche la
 * commande Rust qui la persiste. Quand cette commande manque, la fonction se
 * contente d'un `console.warn` : l'ecran montre la nouvelle valeur, le disque
 * garde l'ancienne, et rien ne distingue les deux cas jusqu'au redemarrage.
 *
 * C'est exactement ce qui est arrive a `onboarding_completed`. La fin du
 * parcours de premiere ouverture l'ecrivait, la console signalait « No handler
 * for setting », et l'application rouvrait sur la configuration initiale au
 * lieu de l'accueil.
 *
 * Ce fichier verrouille donc la persistance, pas l'affichage.
 */

const calls: string[] = [];
let onboardingResult: unknown = { status: "ok", data: null };

const realBindings = await import("@/bindings");

mock.module("@/bindings", () => ({
  ...realBindings,
  commands: {
    ...realBindings.commands,
    completeCampusOnboarding: async () => {
      calls.push("completeCampusOnboarding");
      return onboardingResult;
    },
  },
}));

const { useSettingsStore } = await import("./settingsStore");

const SETTINGS = { onboarding_completed: false } as never;

describe("la fin du parcours de premiere ouverture", () => {
  beforeEach(() => {
    calls.length = 0;
    onboardingResult = { status: "ok", data: null };
    useSettingsStore.setState({ settings: SETTINGS, isUpdating: {} });
  });

  test("atteint le disque, pas seulement l'etat en memoire", async () => {
    await useSettingsStore
      .getState()
      .updateSetting("onboarding_completed", true);

    expect(calls).toEqual(["completeCampusOnboarding"]);
    expect(useSettingsStore.getState().settings?.onboarding_completed).toBe(
      true,
    );
  });

  test("un refus du backend ne laisse pas croire que c'est fait", async () => {
    onboardingResult = { status: "error", error: "disque plein" };

    await useSettingsStore
      .getState()
      .updateSetting("onboarding_completed", true);

    expect(useSettingsStore.getState().settings?.onboarding_completed).toBe(
      false,
    );
  });
});
