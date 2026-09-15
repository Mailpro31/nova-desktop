import { expect, test } from "@playwright/test";
import { mockTauri } from "./tauriMock";

/**
 * « Notes structurées » : une catégorie de la barre latérale, après Prompts.
 *
 * Mesuré sur Nova 1.0.38 : l'outil s'appelait « Notes d'ingénierie », vivait
 * dans un onglet de Réglages et ne montrait aucun exemple. Il se trouve
 * désormais dans la barre latérale, propose un type de note et garde un
 * exemple avant/après sous les yeux.
 */

const session = {
  server_url: "https://campus.example.edu",
  email: "student@example.edu",
};

const school = (engineeringNotes: boolean) => ({
  server_url: "https://campus.example.edu",
  organization_type: "education",
  organization: {
    id: "example-school",
    name: "Example Engineering School",
    shortName: "EES",
    managed: true,
  },
  capabilities: {
    dictation: true,
    rewrite: true,
    styles: true,
    engineeringNotes,
  },
  auth_methods: ["email_code"],
});

test.describe("Structured notes", () => {
  test.skip(process.env.VITE_NOVA_MODE !== "campus", "Campus build only");

  test("sits after Prompts and structures notes by type", async ({ page }) => {
    await mockTauri(page, {
      session,
      config: school(true),
      onboardingCompleted: true,
    });
    await page.goto("/");

    const navigation = page.getByRole("navigation");
    const labels = await navigation.getByRole("button").allInnerTexts();
    const prompts = labels.findIndex((label) => label.trim() === "Prompts");
    expect(labels[prompts + 1]?.trim()).toBe("Structured notes");

    await navigation
      .getByRole("button", { name: "Structured notes", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Structured notes", level: 1 }),
    ).toBeVisible();

    // L'exemple est là avant même d'avoir écrit quoi que ce soit.
    await expect(page.getByText("Example", { exact: true })).toBeVisible();

    await page.getByRole("tab", { name: "Meeting" }).click();
    await expect(page.getByText("Decisions").first()).toBeVisible();

    await page
      .getByPlaceholder("Paste or dictate your raw notes…")
      .fill("launch moved to march 12");
    await page.getByRole("button", { name: "Structure my notes" }).click();

    await expect(
      page.getByText("Structured meeting: launch moved to march 12"),
    ).toBeVisible();
    const sent = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("nova.test.structuredNotes") ?? "null"),
    );
    expect(sent).toMatchObject({
      noteType: "meeting",
      text: "launch moved to march 12",
    });
  });

  test("disappears when the organization closes it", async ({ page }) => {
    await mockTauri(page, {
      session,
      config: school(false),
      onboardingCompleted: true,
    });
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Structured notes", exact: true }),
    ).toHaveCount(0);
  });

  test("is no longer a Settings tab", async ({ page }) => {
    await mockTauri(page, {
      session,
      config: school(true),
      onboardingCompleted: true,
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("tab", { name: /engineering/i })).toHaveCount(
      0,
    );
  });
});
