import { expect, test } from "@playwright/test";
import { mockTauri } from "./tauriMock";

/**
 * Le membre voit dans quels groupes il est, dans Réglages → Organisation.
 *
 * Seulement ce que le serveur envoie : quand l'organisation masque
 * l'affichage, aucun groupe n'apparaît, pas même la cohorte.
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
  auth_methods: ["oidc"],
};

const groups = [
  { id: "g1", label: "Aero 2", source: "scim", external_group_id: null },
  {
    id: "g2",
    label: "Robotics club",
    source: "manual",
    external_group_id: null,
  },
];

async function openOrganization(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: /Example Engineering School/ })
    .click();
}

test.describe("a member sees their groups", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("nova.editionChoice", "organization");
      localStorage.setItem("nova.organizationKindIntent", "school");
    });
  });

  test("the organization page lists the member's groups", async ({ page }) => {
    await mockTauri(page, {
      session,
      config: school,
      onboardingCompleted: true,
      membership: { security_role: "member", groups_visible: true, groups },
    });
    await openOrganization(page);
    await expect(page.getByText("Your groups")).toBeVisible();
    await expect(page.getByText("Aero 2, Robotics club")).toBeVisible();
  });

  test("nothing shows when the organization hides groups", async ({ page }) => {
    await mockTauri(page, {
      session,
      config: school,
      onboardingCompleted: true,
      membership: {
        security_role: "member",
        groups_visible: false,
        groups: [],
      },
    });
    await openOrganization(page);
    await expect(page.getByText("Signed in as")).toBeVisible();
    await expect(page.getByText("Your groups")).toHaveCount(0);
    await expect(page.getByText("Cohort")).toHaveCount(0);
  });
});
