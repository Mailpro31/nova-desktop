import { expect, test, type Page } from "@playwright/test";
import { mockTauri } from "./tauriMock";

/**
 * L'écran « Nova does more than transcribe », refait le 01/10 à la demande de
 * Sash.
 *
 * Il montrait les quatre premiers Styles de la liste, dans l'ordre où ils
 * avaient été enregistrés, sans un mot de ce qu'ils faisaient, sur des cartes
 * qui semblaient cliquables et ne l'étaient pas. Il ne disait rien du mode
 * automatique. Désormais : un avant/après sur une vraie reprise, ce que fait
 * le mode automatique, et trois Styles choisis, chacun avec sa description.
 */

test.skip(process.env.VITE_NOVA_MODE !== "campus", "Campus build only");

const campusConfig = {
  server_url: "https://campus.example.edu",
  organization_type: "education",
  organization: {
    id: "example-school",
    name: "Example Engineering School",
    shortName: "EES",
    managed: true,
  },
};

const prompts = [
  {
    id: "default_improve_transcriptions",
    name: "Transcription améliorée",
    prompt: "x",
  },
  { id: "nova_style_everyday", name: "Au quotidien", prompt: "x" },
  { id: "nova_style_course_notes", name: "Notes de cours", prompt: "x" },
  { id: "nova_style_email", name: "E-mail", prompt: "x" },
  { id: "nova_style_messages", name: "Messages", prompt: "x" },
];

async function reachStylesStep(page: Page) {
  await mockTauri(page, {
    session: {
      server_url: "https://campus.example.edu",
      email: "student@example.edu",
    },
    config: campusConfig,
    onboardingCompleted: false,
    firstRunCompleted: false,
    prompts,
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Use recommended setup" }).click();
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await page.getByRole("button", { name: "Skip this step" }).click();
  await expect(
    page.getByRole("heading", { name: "Nova does more than transcribe" }),
  ).toBeVisible();
}

test("the styles step shows a real before/after and what Automatic does", async ({
  page,
}) => {
  await reachStylesStep(page);

  // Un avant/après : la reprise disparaît, seule la version retenue reste.
  await expect(page.getByText("You say", { exact: true })).toBeVisible();
  await expect(
    page.getByText("“uh, meeting on Monday, no wait, Tuesday at the library”"),
  ).toBeVisible();
  await expect(page.getByText("Nova writes", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Meeting on Tuesday at the library."),
  ).toBeVisible();

  // Le mode automatique, dit simplement.
  await expect(page.getByText(/Nova picks the style for you/)).toBeVisible();
});

test("the styles step presents three chosen styles, each with what it does", async ({
  page,
}) => {
  await reachStylesStep(page);

  const styles = page.getByRole("list", { name: "Writing styles" });
  await expect(styles.getByRole("listitem")).toHaveCount(3);
  for (const name of ["Au quotidien", "Notes de cours", "E-mail"]) {
    await expect(styles.getByText(name, { exact: true })).toBeVisible();
  }
  await expect(
    styles.getByText(/Clean up everything you write day to day/),
  ).toBeVisible();
  // Rien de cliquable qui ne fasse rien.
  await expect(styles.getByRole("button")).toHaveCount(0);
  // Les autres Styles restent dans les Réglages, pas sur cet écran.
  await expect(styles.getByText("Transcription améliorée")).toHaveCount(0);
  await expect(styles.getByText("Messages")).toHaveCount(0);
});
