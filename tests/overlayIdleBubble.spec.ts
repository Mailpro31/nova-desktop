import { expect, test, type Page } from "@playwright/test";
import { mockTauri } from "./tauriMock";

/**
 * La bulle au repos ne bloque pas l'élève.
 *
 * Toujours affichée au-dessus de toutes les fenêtres, la pilule (réglages,
 * orbe, Styles) masquait le bas des applications : le champ de saisie d'une
 * messagerie, le bouton « Passer » de l'accueil de Nova. Au repos, elle n'est
 * plus qu'une fine poignée ; elle se déplie au survol, et se replie quand la
 * souris s'en va.
 */

async function showIdle(page: Page) {
  await expect
    .poll(async () => {
      await page.evaluate(() =>
        (
          window as typeof window & {
            __NOVA_TEST_EMIT__?: (event: string, payload: unknown) => boolean;
          }
        ).__NOVA_TEST_EMIT__?.("show-overlay", "idle"),
      );
      return page.locator(".shandle").count();
    })
    .toBe(1);
}

test("au repos, une poignée qui se déplie au survol et se replie ensuite", async ({
  page,
}) => {
  await mockTauri(page, {});
  await page.goto("/src/overlay/index.html");
  await showIdle(page);

  // Repliée : ni engrenage, ni étoile à l'écran.
  await expect(page.locator(".scard.sidle")).toHaveCount(0);

  // Survolée : la pilule complète, avec ses deux boutons.
  await page.locator(".ov-stage").hover();
  await expect(page.locator(".scard.sidle .sgear")).toHaveCount(2);

  // La souris s'en va : la bulle redevient une poignée.
  // La fenêtre de la bulle ne fait que sa taille : la souris qui en sort
  // quitte la page. React le lit comme un `mouseout` sans cible d'arrivée.
  await page
    .locator(".ov-stage")
    .dispatchEvent("mouseout", { relatedTarget: null, bubbles: true });
  await expect(page.locator(".shandle")).toHaveCount(1, { timeout: 3000 });
  await expect(page.locator(".scard.sidle")).toHaveCount(0);
});
