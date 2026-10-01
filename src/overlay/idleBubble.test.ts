import { describe, expect, test } from "bun:test";

import {
  IDLE_HANDLE_HEIGHT,
  IDLE_PILL_HEIGHT,
  idleWindowHeight,
} from "./idleBubble";

/**
 * La bulle au repos ne doit pas bloquer l'élève.
 *
 * Toujours affichée au-dessus de toutes les fenêtres, la pilule (réglages,
 * orbe, Styles) masquait le bas des applications : le champ de saisie d'une
 * messagerie, le bouton « Passer » de l'accueil. Au repos, elle n'est plus
 * qu'une fine poignée ; elle ne se déplie qu'au survol, ou quand elle a
 * quelque chose à montrer.
 */
describe("bulle au repos", () => {
  const rest = {
    expanded: false,
    menuOpen: false,
    menuHeight: 0,
    suggestionHeight: 0,
  };

  test("au repos, la fenêtre n'est qu'une fine poignée", () => {
    expect(idleWindowHeight(rest)).toBe(IDLE_HANDLE_HEIGHT);
    expect(IDLE_HANDLE_HEIGHT).toBeLessThanOrEqual(16);
  });

  test("au survol, elle se déplie en pilule", () => {
    expect(idleWindowHeight({ ...rest, expanded: true })).toBe(
      IDLE_PILL_HEIGHT,
    );
  });

  test("le menu des Styles ouvert garde toute sa hauteur", () => {
    expect(
      idleWindowHeight({
        ...rest,
        expanded: true,
        menuOpen: true,
        menuHeight: 230,
      }),
    ).toBe(230);
    // Même si la souris a quitté la bulle : on ne referme pas un menu ouvert.
    expect(idleWindowHeight({ ...rest, menuOpen: true, menuHeight: 230 })).toBe(
      230,
    );
  });

  test("une suggestion de Style reste visible sans survol", () => {
    expect(idleWindowHeight({ ...rest, suggestionHeight: 150 })).toBe(150);
  });
});
