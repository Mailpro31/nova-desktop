import { expect, test, type Page } from "@playwright/test";
import { mockTauri } from "./tauriMock";

/**
 * Lire ses notes confortablement, et se les faire lire.
 *
 * Deux aides dont l'effet est établi pour un élève dyslexique : l'espacement
 * du texte, et la lecture à voix haute. L'une se règle une fois et vaut pour
 * toute l'application ; l'autre se déclenche sur chaque dictée de l'historique.
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
  capabilities: { dictation: true, rewrite: true, styles: true, history: true },
  auth_methods: ["email_code"],
};

const NOTE = "Chapitre 3 : la photosynthèse produit du dioxygène.";

/** La synthèse vocale du navigateur, remplacée par un témoin. */
async function recordSpeech(page: Page) {
  await page.addInitScript(() => {
    const spoken: string[] = [];
    Object.defineProperty(window, "__spoken", { value: spoken });
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        speak: (utterance: SpeechSynthesisUtterance) =>
          spoken.push(utterance.text),
        cancel: () => undefined,
        getVoices: () => [
          { lang: "fr-FR", name: "Hortense", localService: true },
        ],
        speaking: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
    });
  });
}

test.describe("reading comfort", () => {
  test.skip(process.env.VITE_NOVA_MODE !== "campus", "Campus build only");

  test("wider spacing applies to the whole app and survives a restart", async ({
    page,
  }) => {
    await mockTauri(page, {
      session,
      config: school,
      onboardingCompleted: true,
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Settings", exact: true }).click();

    await page
      .getByRole("radiogroup", { name: "Letter and line spacing" })
      .getByRole("radio", { name: "Widest" })
      .click();

    const spacing = () =>
      page.getByRole("heading", { name: "Settings" }).evaluate((element) => {
        const style = getComputedStyle(element);
        return parseFloat(style.letterSpacing) / parseFloat(style.fontSize);
      });
    // 0,12 em : la valeur du critère WCAG 1.4.12.
    await expect.poll(spacing).toBeGreaterThan(0.11);

    await page.reload();
    await expect.poll(spacing).toBeGreaterThan(0.11);
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(
      page
        .getByRole("radiogroup", { name: "Letter and line spacing" })
        .getByRole("radio", { name: "Widest" }),
    ).toBeChecked();
  });

  test("a dictation can be read aloud from the history", async ({ page }) => {
    await recordSpeech(page);
    await mockTauri(page, {
      session,
      config: school,
      onboardingCompleted: true,
      historyEntries: [
        {
          id: 1,
          file_name: "rec-1.wav",
          timestamp: Math.floor(Date.now() / 1000) - 60,
          saved: false,
          title: "",
          transcription_text: NOTE,
          post_processed_text: null,
          post_process_prompt: null,
          post_process_requested: false,
        },
      ],
    });
    await page.goto("/");
    await page.getByRole("button", { name: "History", exact: true }).click();

    await page.getByRole("button", { name: "Read aloud" }).click();

    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { __spoken: string[] }).__spoken,
        ),
      )
      .toEqual([NOTE]);
  });
});
