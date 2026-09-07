import { expect, test } from "@playwright/test";
import { mockTauri } from "./tauriMock";

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

for (const provider of [
  { type: "google_workspace", label: "Google" },
  { type: "oidc", label: "Example SSO" },
  { type: "microsoft_entra", label: "Microsoft" },
]) {
  test(`${provider.type} connects directly without Nova email verification`, async ({
    page,
  }) => {
    await mockTauri(page, {
      config: organization,
      onboardingCompleted: false,
      authProviders: {
        microsoft_entra: provider.type === "microsoft_entra",
        google_workspace: provider.type === "google_workspace",
        oidc: provider.type === "oidc",
        configs: [
          {
            id: "provider-selected",
            type: provider.type,
            display_name: provider.label,
          },
        ],
      },
    });
    await page.goto("/");
    const signIn = page.getByRole("button", {
      name: `Continue with ${provider.label}`,
      exact: true,
    });
    await expect(signIn).toBeEnabled();
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
    await expect(page.locator('input[type="url"]')).toHaveCount(0);
    await signIn.click();
    await expect(
      page.getByRole("heading", {
        name: /You're connected to Example Company/,
      }),
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText(
      /Nova Campus|Campus infrastructure|school|institution/i,
    );
    const recorded = await page.evaluate(() => ({
      sso: JSON.parse(localStorage.getItem("nova.test.sso") ?? "null"),
      emailRequested: localStorage.getItem("nova.test.emailRequested"),
    }));
    expect(recorded.sso.provider).toBe(provider.type);
    expect(recorded.sso.providerConfigId).toBe("provider-selected");
    expect(recorded.emailRequested).toBeNull();
  });
}

test("each configured OIDC identity provider is selectable", async ({
  page,
}) => {
  await mockTauri(page, {
    config: organization,
    onboardingCompleted: false,
    authProviders: {
      microsoft_entra: false,
      google_workspace: false,
      oidc: true,
      configs: [
        { id: "staff-sso", type: "oidc", display_name: "Staff SSO" },
        { id: "partner-sso", type: "oidc", display_name: "Partner SSO" },
      ],
    },
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Continue with Staff SSO" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Continue with Partner SSO" }).click();
  await expect(
    page.getByRole("heading", { name: /You're connected to/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("nova.test.sso")!).providerConfigId,
    ),
  ).toBe("partner-sso");
});

test("a company does not ask for a school account", async ({ page }) => {
  await mockTauri(page, { config: organization, onboardingCompleted: false });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /organization|Example Company/i }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Join your campus");
  await expect(page.locator("body")).not.toContainText("School email");
});

test("a managed installation discovers its organization before sign-in", async ({
  page,
}) => {
  await mockTauri(page, {
    config: null,
    onboardingCompleted: false,
    deployment: {
      managed: true,
      organization_id: "acme",
      control_plane_origin: "https://api.novaspeak.app",
      error: null,
    },
    discovery: {
      organization: "acme",
      display_name: "Acme",
      service_endpoint: "https://nova.acme.example",
      deployment_mode: "dedicated",
      contract_version: 1,
    },
    authProviders: {
      microsoft_entra: false,
      google_workspace: true,
      oidc: false,
      configs: [
        {
          id: "acme-google",
          type: "google_workspace",
          display_name: "Google",
        },
      ],
    },
  });

  await page.goto("/");
  const signIn = page.getByRole("button", {
    name: "Continue with Google",
    exact: true,
  });
  await expect(signIn).toBeEnabled();
  await expect(page.getByText("Acme", { exact: true })).toBeVisible();
  await expect(page.locator('input[type="url"]')).toHaveCount(0);

  await signIn.click();
  const recorded = await page.evaluate(() => ({
    discovery: JSON.parse(
      localStorage.getItem("nova.test.discovery") ?? "null",
    ),
    sso: JSON.parse(localStorage.getItem("nova.test.sso") ?? "null"),
  }));
  expect(recorded.discovery).toEqual({
    discoveryBaseUrl: "https://api.novaspeak.app",
    organization: "acme",
    allowInsecureEndpoint: false,
  });
  expect(recorded.sso.serverUrl).toBe("https://nova.acme.example");
  expect(recorded.sso.organizationCode).toBe("acme");
});

test("the first organization journey reaches dictation before optional training", async ({
  page,
}) => {
  await mockTauri(page, {
    config: organization,
    onboardingCompleted: false,
    authProviders: {
      microsoft_entra: false,
      google_workspace: true,
      oidc: false,
      configs: [
        {
          id: "google",
          type: "google_workspace",
          display_name: "Google",
        },
      ],
    },
  });

  await page.goto("/");
  await page
    .getByRole("button", { name: "Continue with Google", exact: true })
    .click();
  await page.getByRole("button", { name: "Start using Nova" }).click();

  await expect(
    page.getByRole("heading", { name: "Recommended setup" }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText(
    /Nova Campus|Campus connected|school|institution/i,
  );
  await expect(page.locator("body")).not.toContainText(
    "Write at the speed you think",
  );
  await page.getByRole("button", { name: "Use recommended setup" }).click();

  await expect(page.getByRole("heading", { name: "Try Nova" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(
    "Choose your writing style",
  );

  await page.evaluate(async () => {
    await window.__TAURI_INTERNALS__.invoke("trigger_transcription", {
      bindingId: "transcribe",
    });
  });
  await expect(
    page.getByText("Send Lucas the project update tomorrow morning."),
  ).toBeVisible();
});

test("restarting after sign-in resumes before the first dictation", async ({
  page,
}) => {
  await mockTauri(page, {
    session: {
      server_url: "https://nova.example.test",
      email: "member@example.test",
    },
    config: organization,
    onboardingCompleted: false,
    firstRunCompleted: false,
  });

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Recommended setup" }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText(
    "Connect to your organization",
  );
});

test("managed discovery failure stays recoverable without asking for a server", async ({
  page,
}) => {
  await mockTauri(page, {
    config: null,
    onboardingCompleted: false,
    deployment: {
      managed: true,
      organization_id: "acme",
      control_plane_origin: "https://api.novaspeak.app",
      error: null,
    },
    discoveryError: { code: "DiscoveryUnavailable" },
  });

  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText(
    "could not find your organization's server",
  );
  await expect(page.locator('input[type="url"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Try again" })).toBeEnabled();
});

test("an SSO network error keeps the chosen provider available", async ({
  page,
}) => {
  await mockTauri(page, {
    config: organization,
    onboardingCompleted: false,
    authProviders: {
      microsoft_entra: false,
      google_workspace: true,
      oidc: false,
      configs: [
        {
          id: "google",
          type: "google_workspace",
          display_name: "Google",
        },
      ],
    },
    ssoError: { code: "NetworkError" },
  });

  await page.goto("/");
  const signIn = page.getByRole("button", {
    name: "Continue with Google",
    exact: true,
  });
  await signIn.click();
  await expect(page.getByRole("alert")).toContainText(
    "Could not reach the server",
  );
  await expect(signIn).toBeEnabled();
});
