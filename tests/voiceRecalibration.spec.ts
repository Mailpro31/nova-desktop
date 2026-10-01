import { expect, test } from "@playwright/test";
import { mockTauri } from "./tauriMock";

/**
 * Le calibrage de la voix se refait depuis les réglages.
 *
 * Sans cette entrée, il n'avait lieu qu'à la première ouverture : un poste
 * déjà installé n'y avait jamais accès, et un élève qui change de micro ou de
 * salle ne pouvait pas le refaire.
 */

const session = {
  server_url: "https://campus.example.edu",
  email: "student@example.edu",
};

const school = {
  server_url: "https://campus.example.edu",
  organization_type: "education",
  organization: {
    id: "example-school",
    name: "Example Engineering School",
    shortName: "EES",
    managed: true,
  },
  capabilities: { dictation: true, rewrite: true, styles: true },
  auth_methods: ["email_code"],
};

test.describe("voice recalibration", () => {
  test.skip(process.env.VITE_NOVA_MODE !== "campus", "Campus build only");

  test("a member can recalibrate their voice from Settings, and back out", async ({
    page,
  }) => {
    await mockTauri(page, {
      session,
      config: school,
      onboardingCompleted: true,
    });
    await page.goto("/");

    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

    // Le micro vit sous l'onglet Voix : c'est là qu'on cherche sa voix.
    await page.getByRole("tab", { name: "Voice" }).click();
    await page.getByRole("button", { name: "Recalibrate my voice" }).click();
    await expect(
      page.getByRole("heading", { name: "Let Nova learn your voice" }),
    ).toBeVisible();

    // Rien n'est enregistré tant que le calibrage n'est pas mené au bout :
    // l'annuler ramène aux réglages tels qu'ils étaient.
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Recalibrate my voice" }),
    ).toBeVisible();
  });
});
