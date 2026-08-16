import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mockTauri } from "./tauriMock";

const campusConfig = {
  server_url: "https://campus.example.edu",
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

const connectedSession = {
  server_url: "https://campus.example.edu",
  email: "student@example.edu",
};

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, animations: "disabled" });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

test.describe("Nova Campus visual reference", () => {
  test.skip(process.env.VITE_NOVA_MODE !== "campus", "Campus build only");
  test.use({
    viewport: { width: 1180, height: 760 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });

  test("captures the critical light and dark screens", async ({
    page,
  }, testInfo) => {
    await mockTauri(page, {
      session: connectedSession,
      config: campusConfig,
      onboardingCompleted: true,
      theme: "light",
    });
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Speak. Nova writes." }),
    ).toBeVisible();
    await capture(page, testInfo, "campus-home-light");

    await page.getByRole("button", { name: "Styles" }).click();
    await expect(page.getByRole("heading", { name: "Styles" })).toBeVisible();
    await capture(page, testInfo, "campus-styles-light");

    await page.getByRole("button", { name: "Campus" }).click();
    await expect(
      page.getByRole("heading", { name: "EES · Paris" }),
    ).toBeVisible();
    await capture(page, testInfo, "campus-organization-light");

    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await capture(page, testInfo, "campus-settings-light");

    await page.getByRole("button", { name: "Home" }).click();
    await page.evaluate(() => {
      document.documentElement.dataset.theme = "dark";
    });
    await capture(page, testInfo, "campus-home-dark");
  });

  test("captures Welcome, AI Essentials and Smart Setup", async ({
    page,
  }, testInfo) => {
    await mockTauri(page, {
      session: connectedSession,
      config: campusConfig,
      onboardingCompleted: true,
      firstRunCompleted: false,
      theme: "light",
      prompts: [
        { id: "nova_style_notes", name: "Notes", prompt: "Notes" },
        { id: "nova_style_email", name: "Email", prompt: "Email" },
        {
          id: "nova_style_prompt",
          name: "AI prompt",
          prompt: "Prompt",
        },
        {
          id: "default_improve_transcriptions",
          name: "Clean up",
          prompt: "Clean",
        },
      ],
    });
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: /Welcome to EES, Student/ }),
    ).toBeVisible();
    await capture(page, testInfo, "campus-welcome-light");

    await page
      .getByRole("button", { name: "Start with AI Essentials" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Working with AI" }),
    ).toBeVisible();
    await capture(page, testInfo, "campus-ai-module-light");

    await page.getByRole("button", { name: "Continue later" }).click();
    await expect(
      page.getByRole("heading", { name: "Set up Nova" }),
    ).toBeVisible();
    await capture(page, testInfo, "campus-smart-setup-light");

    await page.getByRole("button", { name: "Use recommended setup" }).click();
    await expect(page.getByRole("heading", { name: "Try Nova" })).toBeVisible();
    await capture(page, testInfo, "campus-first-dictation-light");
    await page.getByRole("button", { name: "Start dictation" }).click();
    await expect(
      page.getByRole("heading", { name: "That's it." }),
    ).toBeVisible();
    await capture(page, testInfo, "campus-first-success-light");
  });
});
