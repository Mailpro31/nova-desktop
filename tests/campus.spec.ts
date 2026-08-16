import { expect, test } from "@playwright/test";
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

test.describe("Nova Campus", () => {
  test.skip(process.env.VITE_NOVA_MODE !== "campus", "Campus build only");

  test("IT configuration hides the server field", async ({ page }) => {
    await mockTauri(page, {
      session: null,
      config: campusConfig,
      onboardingCompleted: true,
    });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Join your campus" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(
      page.getByRole("heading", { name: "School email" }),
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
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Campus server").fill("https://campus.example.edu");
    await page.getByRole("textbox", { name: "School email" }).fill("invalid");
    await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
    await page
      .getByRole("textbox", { name: "School email" })
      .fill("student@example.edu");
    await page.getByRole("button", { name: "Continue" }).click();
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
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue with Microsoft" }).click();
    await expect(page.getByText("ABCD-EFGH")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "You're connected to EES" }),
    ).toBeVisible({ timeout: 5000 });
  });

  test("complete code connects and masks the account", async ({ page }) => {
    await mockTauri(page, {
      session: null,
      config: campusConfig,
      onboardingCompleted: true,
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Continue" }).click();
    await page
      .getByRole("textbox", { name: "School email" })
      .fill("student@example.edu");
    await page.getByRole("button", { name: "Continue" }).click();
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
      page.getByRole("heading", { name: /Welcome to EES, Student/ }),
    ).toBeVisible();
  });

  test("first connection can complete one AI Essentials module", async ({
    page,
  }) => {
    await mockTauri(page, {
      session: {
        server_url: "https://campus.example.edu",
        email: "student@example.edu",
      },
      config: campusConfig,
      onboardingCompleted: true,
      firstRunCompleted: false,
      prompts: [{ id: "nova_style_notes", name: "Notes", prompt: "Notes" }],
    });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Start with AI Essentials" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Working with AI" }),
    ).toBeVisible();
    await page.getByRole("radio", { name: /candidate solution/ }).click();
    await expect(page.getByText("Correct", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(
      page.getByRole("heading", { name: "Ask better" }),
    ).toBeVisible();
    const completed = await page.evaluate(() => {
      const value = localStorage.getItem(
        "nova-campus-ai-skills-v1:example-school:student-example.edu",
      );
      return value ? JSON.parse(value).completedModuleIds : [];
    });
    expect(completed).toContain("working-with-ai");
  });

  test("skip AI then recommended setup reaches Nova without friction", async ({
    page,
  }) => {
    await mockTauri(page, {
      session: {
        server_url: "https://campus.example.edu",
        email: "student@example.edu",
      },
      config: campusConfig,
      onboardingCompleted: true,
      firstRunCompleted: false,
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Set up Nova now" }).click();
    await expect(
      page.getByRole("heading", { name: "Set up Nova" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Use recommended setup" }).click();
    await expect(page.getByRole("heading", { name: "Try Nova" })).toBeVisible();
    await page.getByRole("button", { name: "Start dictation" }).click();
    await expect(
      page.getByRole("heading", { name: "That's it." }),
    ).toBeVisible();
    await expect(
      page.getByText("Send Lucas the project update tomorrow morning."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Open Nova" }).click();
    await expect(
      page.getByRole("heading", { name: "Speak. Nova writes." }),
    ).toBeVisible();
  });

  test("skip everything reaches Home immediately", async ({ page }) => {
    await mockTauri(page, {
      session: {
        server_url: "https://campus.example.edu",
        email: "student@example.edu",
      },
      config: campusConfig,
      onboardingCompleted: true,
      firstRunCompleted: false,
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Skip for now" }).click();
    await expect(
      page.getByRole("heading", { name: "Speak. Nova writes." }),
    ).toBeVisible();
  });

  test("unfinished AI module resumes after restart", async ({ page }) => {
    await mockTauri(page, {
      session: {
        server_url: "https://campus.example.edu",
        email: "student@example.edu",
      },
      config: campusConfig,
      onboardingCompleted: true,
      firstRunCompleted: false,
    });
    await page.addInitScript(() => {
      localStorage.setItem(
        "nova-campus-first-run-v1:example-school:student-example.edu",
        JSON.stringify({
          version: 1,
          stage: "ai-skills",
          completed: false,
          startedAt: new Date().toISOString(),
          completedAt: null,
        }),
      );
      localStorage.setItem(
        "nova-campus-ai-skills-v1:example-school:student-example.edu",
        JSON.stringify({
          version: 1,
          trackId: "ai-essentials",
          activeModuleId: "verify-output",
          activeLessonIndex: 0,
          completedModuleIds: ["working-with-ai", "ask-better"],
          startedAt: new Date().toISOString(),
          completedAt: null,
        }),
      );
    });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Verify the output" }),
    ).toBeVisible();
  });

  test("Campus offline does not block Smart Setup", async ({ page }) => {
    await mockTauri(page, {
      session: {
        server_url: "https://campus.example.edu",
        email: "student@example.edu",
      },
      config: campusConfig,
      onboardingCompleted: true,
      firstRunCompleted: false,
      reachable: false,
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Set up Nova now" }).click();
    await expect(page.getByText("Nova Local", { exact: true })).toBeVisible();
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
      page.getByRole("heading", { name: "Speak. Nova writes." }),
    ).toBeVisible();
    await expect(page.getByText("Campus connected")).toBeVisible();

    await page.getByRole("button", { name: "Campus" }).click();
    await expect(
      page.getByRole("heading", { name: "EES · Paris" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Styles" }).click();
    await expect(page.getByRole("heading", { name: "Styles" })).toBeVisible();

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
    await expect(page.getByText("Nova Local active")).toBeVisible();
    await expect(page.getByText("https://campus.example.edu")).toHaveCount(0);
    await page.getByRole("button", { name: "Campus" }).click();
    await expect(
      page.getByText(
        "Campus is temporarily unavailable. Dictation continues locally.",
      ),
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
      page.getByRole("heading", { name: "Speak. Nova writes." }),
    ).toBeVisible();

    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Home" })).toBeFocused();
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
