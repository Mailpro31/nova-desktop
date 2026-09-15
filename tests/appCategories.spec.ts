import { expect, test } from "@playwright/test";
import { mockTauri } from "./tauriMock";

/**
 * La console ferme une catégorie ; la barre latérale la retire.
 *
 * Le serveur nomme les catégories fermées dans `closed_capabilities` de
 * `/api/me`. Le poste ne ferme que ce qui y figure : sans annonce, tout reste.
 */

const session = {
  server_url: "https://campus.example.edu",
  email: "student@example.edu",
};

const school = {
  server_url: "https://campus.example.edu",
  organization_type: "education",
  organization: { id: "example-school", name: "Example School", managed: true },
  capabilities: {
    dictation: true,
    rewrite: true,
    styles: true,
    aiSkills: true,
  },
  auth_methods: ["email_code"],
};

const nav = (page: import("@playwright/test").Page) =>
  page.getByRole("navigation");

test.describe("app categories follow the organization", () => {
  test.skip(process.env.VITE_NOVA_MODE !== "campus", "Campus build only");

  test("closed categories leave the sidebar", async ({ page }) => {
    await mockTauri(page, {
      session,
      config: school,
      onboardingCompleted: true,
      closedCapabilities: ["styles", "prompts", "history", "learning"],
    });
    await page.goto("/");

    await expect(
      nav(page).getByRole("button", { name: "Home", exact: true }),
    ).toBeVisible();
    for (const name of ["Styles", "Prompts", "History", "Learn"]) {
      await expect(
        nav(page).getByRole("button", { name, exact: true }),
      ).toHaveCount(0);
    }
  });

  test("without an announcement every category stays", async ({ page }) => {
    await mockTauri(page, {
      session,
      config: school,
      onboardingCompleted: true,
    });
    await page.goto("/");

    for (const name of ["Styles", "Prompts", "History", "Learn"]) {
      await expect(
        nav(page).getByRole("button", { name, exact: true }),
      ).toBeVisible();
    }
  });
});
