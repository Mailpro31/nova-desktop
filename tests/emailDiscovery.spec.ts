import { expect, test } from "@playwright/test";
import { mockTauri } from "./tauriMock";

/**
 * Se connecter avec sa seule adresse e-mail.
 *
 * L'écran demande une adresse, pas une URL : personne ne connaît l'adresse
 * HTTPS de son école. L'adresse du serveur reste saisissable, mais derrière
 * les options avancées.
 */

const organization = {
  server_url: "https://nova.example.edu",
  organization_type: "education",
  organization: {
    id: "example-school",
    name: "Example Engineering School",
    shortName: "EES",
    managed: true,
  },
  auth_methods: ["oidc"],
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("nova.editionChoice", "organization");
    localStorage.setItem("nova.organizationKindIntent", "school");
  });
});

test("the first question is an email address, not a server URL", async ({
  page,
}) => {
  await mockTauri(page, { onboardingCompleted: false });
  await page.goto("/");

  await expect(page.getByLabel(/organization email/i)).toBeVisible();
  // L'adresse du serveur n'est plus la question posée en premier.
  await expect(page.getByLabel(/server/i)).toHaveCount(0);
});

test("an email address finds the organization and moves on", async ({
  page,
}) => {
  // Aucun serveur enregistre : c'est le cas d'un poste que la DSI n'a pas
  // prepare, celui qui justifie la decouverte.
  await mockTauri(page, {
    onboardingCompleted: false,
    emailDiscovery: {
      domain: "example.edu",
      organization_name: "Example Engineering School",
      service_endpoint: "https://nova.example.edu",
    },
  });
  await page.goto("/");

  await page.getByLabel(/organization email/i).fill("student@example.edu");
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  // La question de l'adresse est passee : le parcours continue sur le serveur
  // trouve, sans jamais l'avoir demande.
  await expect(page.getByLabel(/organization email/i)).toHaveCount(0);
  await expect(
    page.getByText(/does not publish a Nova address yet/i),
  ).toHaveCount(0);
});

test("a domain that publishes nothing says what to do next", async ({
  page,
}) => {
  await mockTauri(page, { onboardingCompleted: false });
  await page.goto("/");

  await page.getByLabel(/organization email/i).fill("student@example.edu");
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  await expect(
    page.getByText(/does not publish a Nova address yet/i),
  ).toBeVisible();
});

test("the server address stays available under advanced options", async ({
  page,
}) => {
  await mockTauri(page, { onboardingCompleted: false });
  await page.goto("/");

  await page.getByRole("button", { name: /advanced options/i }).click();
  await expect(page.getByLabel(/server/i)).toBeVisible();
});
