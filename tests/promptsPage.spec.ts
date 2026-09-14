import { expect, test } from "@playwright/test";
import { mockTauri } from "./tauriMock";

/**
 * « Prompts » réunit les prompts que Nova a écrits à partir des dictées.
 *
 * Le Style « Prompt IA » transforme une dictée en prompt structuré. Ces prompts
 * n'existaient que dans l'historique, mélangés à toutes les autres dictées :
 * pour en réutiliser un, il fallait le chercher parmi des messages et des
 * e-mails.
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

const styles = [
  {
    id: "nova_style_prompt",
    name: "AI prompt",
    prompt: "PROMPT STYLE INSTRUCTION",
  },
  { id: "nova_style_email", name: "E-mail", prompt: "EMAIL STYLE INSTRUCTION" },
];

const dictation = (
  id: number,
  text: string,
  stored: string | null,
): Record<string, unknown> => ({
  id,
  file_name: `rec-${id}.wav`,
  timestamp: Math.floor(Date.now() / 1000) - id * 60,
  saved: false,
  title: "",
  transcription_text: text,
  post_processed_text: stored ? text : null,
  post_process_prompt: stored,
  post_process_requested: stored !== null,
});

const open = async (
  page: import("@playwright/test").Page,
  historyEntries: Array<Record<string, unknown>>,
) => {
  await mockTauri(page, {
    session,
    config: school,
    onboardingCompleted: true,
    prompts: styles,
    historyEntries,
  });
  await page.goto("/");
};

test.describe("the Prompts page", () => {
  test.skip(process.env.VITE_NOVA_MODE !== "campus", "Campus build only");

  test("lists the prompts Nova wrote, and nothing else", async ({ page }) => {
    await open(page, [
      dictation(
        1,
        "Objective: plan the product launch",
        "PROMPT STYLE INSTRUCTION",
      ),
      dictation(
        2,
        "Hello Stephanie, see you tomorrow",
        "EMAIL STYLE INSTRUCTION",
      ),
      dictation(3, "Buy bread", null),
    ]);
    await page.getByRole("button", { name: "Prompts", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Prompts" })).toBeVisible();
    await expect(
      page.getByText("Objective: plan the product launch"),
    ).toBeVisible();
    await expect(
      page.getByText("Hello Stephanie, see you tomorrow"),
    ).toHaveCount(0);
    await expect(page.getByText("Buy bread")).toHaveCount(0);
  });

  test("says how to get prompts when there are none yet", async ({ page }) => {
    await open(page, [
      dictation(2, "Hello Stephanie", "EMAIL STYLE INSTRUCTION"),
    ]);
    await page.getByRole("button", { name: "Prompts", exact: true }).click();

    await expect(
      page.getByText(
        "Dictate with the prompt Style and your prompts will appear here.",
      ),
    ).toBeVisible();
  });

  test("History still lists every dictation", async ({ page }) => {
    await open(page, [
      dictation(
        1,
        "Objective: plan the product launch",
        "PROMPT STYLE INSTRUCTION",
      ),
      dictation(
        2,
        "Hello Stephanie, see you tomorrow",
        "EMAIL STYLE INSTRUCTION",
      ),
    ]);
    await page.getByRole("button", { name: "History", exact: true }).click();

    await expect(
      page.getByText("Objective: plan the product launch"),
    ).toBeVisible();
    await expect(
      page.getByText("Hello Stephanie, see you tomorrow"),
    ).toBeVisible();
  });
});
