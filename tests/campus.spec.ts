import { expect, test } from "@playwright/test";
import { mockTauri } from "./tauriMock";

const campusConfig = {
  server_url: "https://campus.example.edu",
  // La nature de l'organisation vient du serveur, jamais du poste : sans elle,
  // l'interface reste neutre et ne parle ni de campus ni d'établissement.
  organization_type: "education",
  organization: {
    id: "example-school",
    name: "Example Engineering School",
    shortName: "EES",
    campusName: "Paris",
    managed: true,
  },
  capabilities: {
    dictation: true,
    rewrite: true,
    styles: true,
    fileTranscription: true,
    aiSkills: true,
    personalization: true,
    engineeringNotes: true,
  },
  auth_methods: ["email_code"],
  ai_skills: { enabled: true, required: false, trackProgress: true },
  privacy: {
    verified: true,
    contentRetention: "not_stored",
    usageCounters: "counts_only",
    infrastructure: "campus",
  },
};

test.describe("Nova Campus", () => {
  test.skip(process.env.VITE_NOVA_MODE !== "campus", "Campus build only");

  test("IT configuration hides the server field", async ({ page }) => {
    await mockTauri(page, {
      session: null,
      config: campusConfig,
      onboardingCompleted: false,
    });
    await page.goto("/");
    // Une seule surface : le titre Campus, le champ e-mail et aucun champ
    // serveur, sans clic intermédiaire pour y arriver.
    await expect(
      page.getByRole("heading", { name: "Join your campus" }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "School email" }),
    ).toBeVisible();
    await expect(page.getByLabel("Campus server")).toHaveCount(0);
  });

  test("manual setup validates email and handles an incorrect code", async ({
    page,
  }) => {
    await mockTauri(page, {
      session: null,
      config: null,
      onboardingCompleted: true,
    });
    await page.goto("/");
    // Aucune configuration locale : l'adresse est demandée sur cette surface,
    // et le vocabulaire reste neutre tant que ce serveur n'annonce rien.
    await page
      .getByLabel("Organization server")
      .fill("https://campus.example.edu");
    const emailField = page.getByRole("textbox", {
      name: "Organization email",
    });
    await emailField.fill("invalid");
    await expect(
      page.getByRole("button", { name: "Send the code" }),
    ).toBeDisabled();
    await emailField.fill("student@example.edu");
    await page.getByRole("button", { name: "Send the code" }).click();
    await expect(
      page.getByRole("heading", { name: "Check your inbox" }),
    ).toBeVisible();
    for (let position = 1; position <= 6; position += 1) {
      await page.getByLabel(`Code digit ${position}`).fill("0");
    }
    await expect(page.getByRole("alert")).toContainText("incorrect");
  });

  test("Microsoft Entra completes the desktop device-code flow", async ({
    page,
  }) => {
    await mockTauri(page, {
      session: null,
      config: { ...campusConfig, auth_methods: ["email_code", "entra"] },
      onboardingCompleted: true,
    });
    await page.goto("/");
    const microsoft = page.getByRole("button", {
      name: "Continue with Microsoft",
    });
    await expect(microsoft).toBeEnabled();
    await microsoft.click();
    await expect(page.getByText("ABCD-EFGH")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "You're connected to EES" }),
    ).toBeVisible({ timeout: 5000 });
  });

  test("complete code connects and masks the account", async ({ page }) => {
    await mockTauri(page, {
      session: null,
      config: campusConfig,
      onboardingCompleted: false,
    });
    await page.goto("/");
    await page
      .getByRole("textbox", { name: "School email" })
      .fill("student@example.edu");
    await page.getByRole("button", { name: "Send the code" }).click();
    for (let position = 1; position <= 6; position += 1) {
      await page.getByLabel(`Code digit ${position}`).fill(String(position));
    }
    await expect(
      page.getByRole("heading", { name: "You're connected to EES" }),
    ).toBeVisible();
    await expect(page.getByText("s••••••@example.edu")).toBeVisible();
    await expect(page.getByText("https://campus.example.edu")).toHaveCount(0);
    await page.getByRole("button", { name: "Start using Nova" }).click();
    await expect(
      page.getByRole("heading", { name: "Recommended setup" }),
    ).toBeVisible();
  });

  test("a connected account resumes at setup without another login", async ({
    page,
  }) => {
    await mockTauri(page, {
      session: {
        server_url: "https://campus.example.edu",
        email: "student@example.edu",
      },
      config: campusConfig,
      onboardingCompleted: false,
      firstRunCompleted: false,
      prompts: [{ id: "nova_style_notes", name: "Notes", prompt: "Notes" }],
    });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Recommended setup" }),
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText("School email");
    await expect(page.locator("body")).not.toContainText("AI Essentials");
  });

  test("recommended setup reaches a real first dictation before styles", async ({
    page,
  }) => {
    await mockTauri(page, {
      session: {
        server_url: "https://campus.example.edu",
        email: "student@example.edu",
      },
      config: campusConfig,
      onboardingCompleted: false,
      firstRunCompleted: false,
    });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Recommended setup" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Use recommended setup" }).click();
    await expect(page.getByRole("heading", { name: "Try Nova" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(
      "Nova does more than transcribe",
    );
    await page.evaluate(async () => {
      await window.__TAURI_INTERNALS__.invoke("trigger_transcription", {
        bindingId: "transcribe",
      });
    });
    await expect(
      page.getByText("Send Lucas the project update tomorrow morning."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Finish setup" }).click();
    await expect(
      page.getByRole("heading", { name: "Nova does more than transcribe" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Skip" }).click();
    await expect(
      page.getByRole("heading", { name: "Nova is ready." }),
    ).toBeVisible();
  });

  test("the optional first dictation can be skipped without blocking setup", async ({
    page,
  }) => {
    await mockTauri(page, {
      session: {
        server_url: "https://campus.example.edu",
        email: "student@example.edu",
      },
      config: campusConfig,
      onboardingCompleted: false,
      firstRunCompleted: false,
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Use recommended setup" }).click();
    await page.getByRole("button", { name: "Skip this step" }).click();
    await expect(
      page.getByRole("heading", { name: "Nova does more than transcribe" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Skip" }).click();
    await expect(
      page.getByRole("heading", { name: "Nova is ready." }),
    ).toBeVisible();
  });

  test("restart after authentication never returns to the login screen", async ({
    page,
  }) => {
    await mockTauri(page, {
      session: {
        server_url: "https://campus.example.edu",
        email: "student@example.edu",
      },
      config: campusConfig,
      onboardingCompleted: false,
      firstRunCompleted: false,
    });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Recommended setup" }),
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Join your campus");
  });

  test("Campus offline does not block Smart Setup", async ({ page }) => {
    await mockTauri(page, {
      session: {
        server_url: "https://campus.example.edu",
        email: "student@example.edu",
      },
      config: campusConfig,
      onboardingCompleted: false,
      firstRunCompleted: false,
      reachable: false,
    });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Recommended setup" }),
    ).toBeVisible();
    await expect(
      page.getByText("Nova Local active", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Use recommended setup" }),
    ).toBeEnabled();
  });

  test("stable navigation reaches Home, Campus, Styles, History and Settings", async ({
    page,
  }) => {
    await mockTauri(page, {
      session: {
        server_url: "https://campus.example.edu",
        email: "student@example.edu",
      },
      config: campusConfig,
      onboardingCompleted: true,
    });
    await page.setViewportSize({ width: 820, height: 600 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Nova is ready." }),
    ).toBeVisible();
    await expect(page.getByText("Your institution's server")).toBeVisible();

    await page
      .getByRole("button", {
        name: /Example Engineering School.*Managed by Example Engineering School/,
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "Example Engineering School" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Styles" }).click();
    await expect(
      page.getByRole("heading", { name: "Writing Styles" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "History" }).click();
    await expect(page.getByRole("heading", { name: "History" })).toBeVisible();

    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
  });

  test("offline Campus presents Nova Local without technical details on Home", async ({
    page,
  }) => {
    await mockTauri(page, {
      session: {
        server_url: "https://campus.example.edu",
        email: "student@example.edu",
      },
      config: campusConfig,
      onboardingCompleted: true,
      reachable: false,
    });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Nova Local is active" }),
    ).toBeVisible();
    await expect(page.getByText("https://campus.example.edu")).toHaveCount(0);
    await page
      .getByRole("button", {
        name: /Example Engineering School.*Nova Local active/,
      })
      .click();
    await expect(
      page.getByText("Currently paused", { exact: false }),
    ).toBeVisible();
  });

  test("keyboard navigation and modal focus stay predictable", async ({
    page,
  }) => {
    await mockTauri(page, {
      session: {
        server_url: "https://campus.example.edu",
        email: "student@example.edu",
      },
      config: campusConfig,
      onboardingCompleted: true,
    });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Nova is ready." }),
    ).toBeVisible();

    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Home" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Learn" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "AI Skills" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { name: "AI Skills" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Home" }).click();
    const fileButton = page.getByRole("button", { name: "Transcribe a file" });
    await fileButton.focus();
    await page.keyboard.press("Enter");

    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("button", { name: "Close" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Close" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(fileButton).toBeFocused();
  });

  for (const { language, direction } of [
    { language: "fr", direction: "ltr" },
    { language: "de", direction: "ltr" },
    { language: "ar", direction: "rtl" },
    { language: "he", direction: "rtl" },
  ]) {
    test(`${language} stays readable in a narrow window`, async ({ page }) => {
      await mockTauri(page, {
        session: {
          server_url: "https://campus.example.edu",
          email: "student@example.edu",
        },
        config: campusConfig,
        onboardingCompleted: true,
        language,
      });
      await page.setViewportSize({ width: 390, height: 760 });
      await page.goto("/");

      await expect(page.getByRole("heading").first()).toBeVisible();
      await expect(page.locator("#root > div[dir]")).toHaveAttribute(
        "dir",
        direction,
      );
      const hasHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      expect(hasHorizontalOverflow).toBe(false);
    });
  }
});
