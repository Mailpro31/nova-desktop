import { expect, test, type Page } from "@playwright/test";
import { mockTauri } from "./tauriMock";

/**
 * La bulle suit le thème choisi dans Nova, pas seulement celui de Windows.
 *
 * Mesuré sur un poste réel : Nova en clair et Windows en sombre, l'étoile des
 * Styles et l'engrenage des réglages disparaissaient. La bulle, fenêtre à part,
 * ne recevait jamais le thème de Nova, mais passait ses icônes en blanc dès
 * que Windows était sombre — blanc sur fond clair.
 */

type Colors = { card: number[]; gear: number[]; star: number[] };

async function showIdleBubble(page: Page) {
  // L'écoute de `show-overlay` s'enregistre de façon asynchrone : on relance
  // l'événement jusqu'à ce que la carte au repos soit affichée.
  await expect
    .poll(async () => {
      await page.evaluate(() =>
        (
          window as typeof window & {
            __NOVA_TEST_EMIT__?: (event: string, payload: unknown) => boolean;
          }
        ).__NOVA_TEST_EMIT__?.("show-overlay", "idle"),
      );
      return page.locator(".scard.sidle").count();
    })
    .toBe(1);
}

async function bubbleColors(page: Page): Promise<Colors> {
  return page.evaluate(() => {
    const rgb = (value: string) => {
      const numbers = (value.match(/-?[\d.]+/g) ?? []).map(Number);
      return value.startsWith("color(")
        ? numbers.slice(0, 3).map((channel) => channel * 255)
        : numbers.slice(0, 3);
    };
    const style = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`absent : ${selector}`);
      return getComputedStyle(element);
    };
    return {
      card: rgb(style(".scard.sidle").backgroundColor),
      gear: rgb(style(".scard.sidle .sgear:not(.sstar)").color),
      star: rgb(style(".scard.sidle .sstar").color),
    };
  });
}

function luminance([r, g, b]: number[]) {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: number[], b: number[]) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

for (const scenario of [
  {
    name: "Nova clair, Windows sombre",
    theme: "light",
    os: "dark",
    dark: false,
  },
  {
    name: "Nova sombre, Windows clair",
    theme: "dark",
    os: "light",
    dark: true,
  },
  {
    name: "Nova suit Windows, sombre",
    theme: "system",
    os: "dark",
    dark: true,
  },
  {
    name: "Nova suit Windows, clair",
    theme: "system",
    os: "light",
    dark: false,
  },
] as const) {
  test(`bulle lisible et assortie — ${scenario.name}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scenario.os });
    await mockTauri(page, { theme: scenario.theme });
    await page.addInitScript((theme) => {
      localStorage.setItem("handy.theme", theme);
    }, scenario.theme);

    await page.goto("/src/overlay/index.html");
    await showIdleBubble(page);
    const colors = await bubbleColors(page);

    // Les deux icônes restent lisibles sur la carte (seuil WCAG des éléments
    // graphiques : 3:1).
    expect(contrast(colors.gear, colors.card)).toBeGreaterThanOrEqual(3);
    expect(contrast(colors.star, colors.card)).toBeGreaterThanOrEqual(3);
    // Et la carte suit le thème de Nova, pas seulement celui de Windows.
    expect(luminance(colors.card) < 0.2).toBe(scenario.dark);
  });
}
