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
  },
  auth_methods: ["email_code"],
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
    await expect(page.getByRole("button", { name: "Styles" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Styles" })).toBeVisible();

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
