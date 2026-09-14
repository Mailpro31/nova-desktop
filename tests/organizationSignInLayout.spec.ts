import { expect, test } from "@playwright/test";
import { mockTauri } from "./tauriMock";

/**
 * L'écran de connexion Organization tient dans la largeur qui lui est donnée.
 *
 * Mesuré dans Nova 1.0.37 : ouvert depuis les réglages, à côté de la barre
 * latérale, l'écran « Rejoignez votre Campus » prenait la largeur de toute la
 * fenêtre, et une barre de défilement horizontale apparaissait en bas.
 */

const organization = {
  server_url: "https://nova.example.test",
  organization_type: "business",
  organization: { id: "example", name: "Example Company", managed: true },
  auth_methods: ["oidc"],
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("nova.editionChoice", "organization");
    localStorage.setItem("nova.organizationKindIntent", "business");
  });
});

/** Plus grand débordement horizontal parmi les conteneurs qui défilent. */
async function horizontalOverflow(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const heading = Array.from(document.querySelectorAll("h1")).find((node) =>
      /Connect to your organization/.test(node.textContent ?? ""),
    );
    if (!heading) return { found: false, overflow: -1 };
    let worst = 0;
    const root = document.scrollingElement ?? document.documentElement;
    worst = Math.max(worst, root.scrollWidth - root.clientWidth);
    for (let node = heading.parentElement; node; node = node.parentElement) {
      const overflowX = getComputedStyle(node).overflowX;
      if (overflowX === "auto" || overflowX === "scroll") {
        worst = Math.max(worst, node.scrollWidth - node.clientWidth);
      }
    }
    return { found: true, overflow: worst };
  });
}

test("the organization sign-in opened from settings does not scroll sideways", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 700 });
  await mockTauri(page, {
    session: null,
    config: organization,
    onboardingCompleted: true,
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Connect organization" }).click();
  await expect(
    page.getByRole("heading", { name: "Connect to your organization" }),
  ).toBeVisible();

  const measured = await horizontalOverflow(page);
  expect(measured.found).toBe(true);
  expect(measured.overflow).toBeLessThanOrEqual(1);
});
