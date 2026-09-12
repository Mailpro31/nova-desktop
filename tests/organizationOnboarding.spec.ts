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

/**
 * Une seule surface de connexion.
 *
 * Le paquet Organization installé sans `/DEPLOYMENT_ID` ni `/MANAGED_CONFIG`
 * n'a aucune configuration locale à lire. C'est le cas réel d'un premier essai,
 * et il doit rester utilisable : la même interface neutre demande l'adresse du
 * serveur, puis se complète sur place avec ce que ce serveur annonce.
 */
test.describe("single organization sign-in surface", () => {
  const campusIntent = async (page: import("@playwright/test").Page) => {
    // L'intention locale dit « campus » : elle ne doit rien changer à l'écran.
    // La nature d'une organisation appartient au serveur, pas au poste.
    await page.addInitScript(() => {
      localStorage.setItem("nova.organizationKindIntent", "campus");
    });
  };

  test("an unconfigured install asks for its server on the neutral surface", async ({
    page,
  }) => {
    await campusIntent(page);
    await mockTauri(page, {
      config: null,
      serverConfig: null,
      onboardingCompleted: false,
    });
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Connect to your organization" }),
    ).toBeVisible();
    await expect(page.getByLabel("Organization server")).toBeVisible();
    // Pas d'adresse e-mail tant qu'aucun serveur n'a annoncé `email_code`.
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
    // Ni clic intermédiaire, ni retour vers un écran d'accueil inutile.
    await expect(
      page.getByRole("button", { name: "Continue", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Back", exact: true }),
    ).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(
      /Nova Campus|Join your campus|School email|Campus server|institution/i,
    );
  });

  test("a server announcing SSO fills the same surface in place", async ({
    page,
  }) => {
    await campusIntent(page);
    await mockTauri(page, {
      config: null,
      serverConfig: {
        server_url: "https://nova.example.test",
        organization_type: "business",
        organization: { id: "example", name: "Example Company", managed: true },
        auth_methods: ["oidc"],
      },
      onboardingCompleted: false,
      authProviders: {
        microsoft_entra: false,
        google_workspace: false,
        oidc: true,
        configs: [{ id: "corp-sso", type: "oidc", display_name: "Corp SSO" }],
      },
    });
    await page.goto("/");

    const server = page.getByLabel("Organization server");
    await server.fill("https://nova.example.test");

    const signIn = page.getByRole("button", {
      name: "Continue with Corp SSO",
      exact: true,
    });
    await expect(signIn).toBeEnabled();
    // Un serveur qui n'annonce que du SSO ne réclame aucune adresse e-mail.
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
    // Et l'adresse reste corrigeable : aucune seconde page n'a été ouverte.
    await expect(server).toBeVisible();
    await expect(page.getByText("Example Company")).toBeVisible();
  });

  test("a server announcing email_code reveals the email field on the same surface", async ({
    page,
  }) => {
    await campusIntent(page);
    await mockTauri(page, {
      config: null,
      serverConfig: {
        server_url: "https://nova.example.test",
        organization_type: "business",
        organization: { id: "example", name: "Example Company", managed: true },
        auth_methods: ["email_code"],
      },
      onboardingCompleted: false,
    });
    await page.goto("/");

    await expect(page.locator('input[type="email"]')).toHaveCount(0);
    await page
      .getByLabel("Organization server")
      .fill("https://nova.example.test");

    const email = page.getByRole("textbox", { name: "Work email" });
    await expect(email).toBeVisible();
    await expect(page.getByLabel("Organization server")).toBeVisible();
    await email.fill("member@example.test");
    await page.getByRole("button", { name: "Send the code" }).click();
    await expect(
      page.getByRole("heading", { name: "Check your inbox" }),
    ).toBeVisible();
  });

  test("campus wording only appears once the server announces education", async ({
    page,
  }) => {
    await mockTauri(page, {
      config: null,
      serverConfig: {
        server_url: "https://nova.school.test",
        organization_type: "education",
        organization: {
          id: "example-school",
          name: "Example Engineering School",
          shortName: "EES",
          managed: true,
        },
        auth_methods: ["email_code"],
      },
      onboardingCompleted: false,
    });
    await page.goto("/");

    await expect(page.locator("body")).not.toContainText("Join your campus");
    await page
      .getByLabel("Organization server")
      .fill("https://nova.school.test");

    await expect(
      page.getByRole("heading", { name: "Join your campus" }),
    ).toBeVisible();
    await expect(page.getByLabel("Campus server")).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "School email" }),
    ).toBeVisible();
  });

  test("a business server keeps professional wording", async ({ page }) => {
    await campusIntent(page);
    await mockTauri(page, {
      config: null,
      serverConfig: {
        server_url: "https://nova.example.test",
        organization_type: "business",
        organization: { id: "example", name: "Example Company", managed: true },
        auth_methods: ["email_code"],
      },
      onboardingCompleted: false,
    });
    await page.goto("/");
    await page
      .getByLabel("Organization server")
      .fill("https://nova.example.test");

    await expect(
      page.getByRole("heading", { name: "Connect to your organization" }),
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText(
      /Nova Campus|Join your campus|School email|institution/i,
    );
  });

  /**
   * Constaté sur un serveur Nova réel, pas sur une fixture : il répond
   * `campusName: ""` pour une organisation sans site nommé, et le poste
   * affichait alors « Nova Campus » à la place du nom réel.
   */
  test("an organization with empty optional fields keeps its real name", async ({
    page,
  }) => {
    await campusIntent(page);
    await mockTauri(page, {
      config: null,
      serverConfig: {
        server_url: "https://nova.example.test",
        organization_type: "business",
        organization: {
          id: "ipsa",
          name: "IPSA",
          shortName: "IPSA",
          campusName: "",
          managed: true,
        },
        auth_methods: ["email_code"],
      },
      onboardingCompleted: false,
    });
    await page.goto("/");
    await page
      .getByLabel("Organization server")
      .fill("https://nova.example.test");

    await expect(page.getByText("IPSA", { exact: true })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Nova Campus");
  });

  test("a wrong server address stays correctable on the same surface", async ({
    page,
  }) => {
    await campusIntent(page);
    await mockTauri(page, {
      config: null,
      serverConfig: {
        server_url: "https://nova.example.test",
        organization_type: "business",
        organization: { id: "example", name: "Example Company", managed: true },
        auth_methods: ["oidc"],
      },
      onboardingCompleted: false,
      authProviders: {
        microsoft_entra: false,
        google_workspace: false,
        oidc: true,
        configs: [{ id: "corp-sso", type: "oidc", display_name: "Corp SSO" }],
      },
    });
    await page.goto("/");

    const server = page.getByLabel("Organization server");
    await server.fill("https://wrong.example.test");
    await expect(
      page.getByRole("button", { name: "Continue with Corp SSO", exact: true }),
    ).toBeEnabled();

    // Effacer l'adresse retire ce que le serveur avait annoncé : la surface
    // réagit à l'adresse au lieu d'avoir navigué ailleurs.
    await server.fill("");
    await expect(
      page.getByRole("button", { name: "Continue with Corp SSO" }),
    ).toHaveCount(0);
    await expect(server).toBeVisible();

    // Et l'adresse corrigée repart, sans un seul changement d'écran.
    await server.fill("https://nova.example.test");
    await expect(
      page.getByRole("button", { name: "Continue with Corp SSO", exact: true }),
    ).toBeEnabled();
    await expect(server).toHaveValue("https://nova.example.test");
  });
});

/**
 * La dictée locale reste possible quand le serveur ne répond pas.
 *
 * L'édition Organization ne proposait aucun modèle local : son « repli local »
 * n'avait rien pour transcrire. Une fois le membre connecté, Nova prépare donc
 * un modèle en arrière-plan, sans écran et sans rien demander.
 */
test.describe("local dictation stays available without the server", () => {
  const models = [
    {
      id: "english-first",
      name: "English first",
      source: { HuggingFace: {} },
      is_downloaded: false,
      is_recommended: true,
      is_custom: false,
      supported_languages: ["en"],
    },
    {
      id: "multilingual",
      name: "Multilingual",
      source: { HuggingFace: {} },
      is_downloaded: false,
      is_recommended: true,
      is_custom: false,
      supported_languages: ["en", "fr", "de"],
    },
  ];

  const preparedModel = (page: import("@playwright/test").Page) =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem("nova.test.localFallback") ?? "null"),
    );

  test("a signed-in member gets a local model prepared in the background", async ({
    page,
  }) => {
    await mockTauri(page, {
      session: {
        server_url: "https://nova.example.test",
        email: "member@example.test",
      },
      config: organization,
      onboardingCompleted: true,
      language: "fr",
      models,
    });
    await page.goto("/");

    await expect
      .poll(() => preparedModel(page))
      .toEqual({ modelId: "multilingual" });
  });

  test("nothing is downloaded before the member signs in", async ({ page }) => {
    await mockTauri(page, {
      config: null,
      serverConfig: null,
      onboardingCompleted: false,
      models,
    });
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Connect to your organization" }),
    ).toBeVisible();
    await page.waitForTimeout(1500);
    expect(await preparedModel(page)).toBeNull();
  });
});
