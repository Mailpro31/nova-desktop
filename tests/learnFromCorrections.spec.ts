import { expect, test } from "@playwright/test";
import { mockTauri } from "./tauriMock";

/**
 * Nova apprend des corrections de l'élève.
 *
 * L'élève corrige une dictée dans l'historique ; ce qu'il a corrigé est ce
 * que le moteur entend mal chez lui. Nova le propose au vocabulaire — qui,
 * côté serveur, guide aussi la transcription suivante. Rien n'est ajouté sans
 * son accord.
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

const HEARD = "je transmets le dossier à l'ipsa";
const CORRECTED = "je transmets le dossier à l'IPSA";

test.describe("learning from corrections", () => {
  test.skip(process.env.VITE_NOVA_MODE !== "campus", "Campus build only");

  test("a corrected term is offered to the vocabulary, and added only on request", async ({
    page,
  }) => {
    await mockTauri(page, {
      session,
      config: school,
      onboardingCompleted: true,
      correctionTerms: [{ expected: "l'IPSA", heard: "l'ipsa" }],
      historyEntries: [
        {
          id: 7,
          file_name: "rec-7.wav",
          timestamp: Math.floor(Date.now() / 1000) - 60,
          saved: false,
          title: "",
          transcription_text: HEARD,
          post_processed_text: null,
          post_process_prompt: null,
          post_process_requested: false,
        },
      ],
    });
    await page.goto("/");
    await page.getByRole("button", { name: "History", exact: true }).click();

    await page.getByText(HEARD).click();
    await page.getByRole("button", { name: "Correct the text" }).click();
    await page.getByRole("textbox", { name: "Corrected text" }).fill(CORRECTED);
    await page.getByRole("button", { name: "Save the correction" }).click();

    const sent = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("nova.test.correction") ?? "null"),
    );
    expect(sent).toEqual({ id: 7, correctedText: CORRECTED });

    // Proposé, pas encore appris.
    await expect(
      page.getByText("“l'IPSA” (Nova heard “l'ipsa”)"),
    ).toBeVisible();
    expect(
      await page.evaluate(() => localStorage.getItem("nova.test.learned")),
    ).toBeNull();

    await page.getByRole("button", { name: "Add to my vocabulary" }).click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          JSON.parse(localStorage.getItem("nova.test.learned") ?? "[]"),
        ),
      )
      .toEqual([{ heard: "l'ipsa", corrected: "l'IPSA" }]);
  });
});
