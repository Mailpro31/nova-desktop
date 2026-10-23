import { expect, test } from "@playwright/test";
import { mockTauri } from "./tauriMock";

/**
 * « Analyser un document » propose ses termes ; l'élève décoche ceux qu'il
 * écarte, et seuls les termes cochés vont au dictionnaire (n° 8 quinquies,
 * 69). Avant, tout partait sans relecture.
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
    dictionary: true,
  },
  auth_methods: ["email_code"],
};

test("only the ticked terms of a document reach the dictionary", async ({
  page,
}) => {
  await mockTauri(page, {
    session,
    config: school,
    onboardingCompleted: true,
    documentTerms: ["NACA", "Reynolds"],
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("tab", { name: "Dictionary" }).click();

  await page.getByRole("button", { name: "Analyze document" }).click();
  await page
    .getByPlaceholder(/Paste document text/)
    .fill("Le profil NACA et le nombre de Reynolds");
  await page.getByRole("button", { name: "Start analysis" }).click();

  await expect(page.getByRole("checkbox", { name: "NACA" })).toBeChecked();
  await page.getByRole("checkbox", { name: "Reynolds" }).uncheck();
  await page.getByRole("button", { name: "Add the ticked terms (1)" }).click();

  const added = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("nova.test.dictionary") ?? "[]"),
  );
  expect(added).toEqual([{ term: "NACA", replacement: "NACA" }]);
});
