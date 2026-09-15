import { expect, test, type Page } from "@playwright/test";
import { mockTauri } from "./tauriMock";

/**
 * « Apprendre » est la page des cours, et il n'y en a plus qu'un.
 *
 * Mesuré sur un poste réel : le cours traduit « Fondamentaux IA » vivait à
 * côté des leçons servies par le serveur, deux programmes sans lien qui
 * traitaient plusieurs sujets deux fois. Ses modules sont devenus des leçons du
 * catalogue, rangées en quatre parcours thématiques ; la page ne montre plus
 * que ce catalogue.
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
  capabilities: {
    dictation: true,
    rewrite: true,
    styles: true,
    aiSkills: true,
    engineeringNotes: true,
  },
  auth_methods: ["email_code"],
  ai_skills: { enabled: true, required: false, trackProgress: true },
};

const lesson = (id: string, title: string, order: number) => ({
  id,
  title,
  description: "Lesson description",
  estimated_minutes: 4,
  difficulty: "beginner",
  order,
  version: 1,
  tags: ["general"],
  blocks: [{ id: "b1", type: "text", order: 1, content: { body: "Body" } }],
});

/**
 * La forme du catalogue livré : quatre parcours, dont deux sur le même pilier.
 * Trier sur le pilier les aurait mélangés.
 */
const catalog = {
  catalog_version: 2,
  locale: "en",
  paths: [
    [
      "getting-started",
      "learn_ai",
      "Getting started",
      ["What an LLM actually does", "Context and tokens"],
    ],
    ["asking-well", "use_ai", "Asking well", ["Ask better questions"]],
    [
      "verify-and-protect",
      "learn_ai",
      "Verify and protect",
      ["Why AI can hallucinate"],
    ],
    [
      "adapt-to-your-field",
      "adapt_ai",
      "Adapt to your field",
      ["Adapt AI to your domain"],
    ],
  ].map(([id, pillar, title, lessons], index) => ({
    id,
    pillar,
    title,
    description: "Path description",
    icon: null,
    order: index + 1,
    tags: ["general"],
    modules: [
      {
        id: `${id}-foundations`,
        title: "Module",
        description: "Module description",
        order: 1,
        lessons: (lessons as string[]).map((name, position) =>
          lesson(`${id}-${position + 1}`, name, position + 1),
        ),
      },
    ],
  })),
};

const openLearn = async (page: Page, name = "Learn") => {
  await page.getByRole("button", { name, exact: true }).click();
};

test.describe("Learn is where the courses live", () => {
  test.skip(process.env.VITE_NOVA_MODE !== "campus", "Campus build only");

  test("the four paths appear in the catalogue order", async ({ page }) => {
    await mockTauri(page, {
      session,
      config: school,
      onboardingCompleted: true,
      learningCatalog: catalog,
    });
    await page.goto("/");
    await openLearn(page);

    const bars = page.getByRole("progressbar");
    await expect(bars).toHaveCount(4);
    for (const [index, title] of [
      "Getting started",
      "Asking well",
      "Verify and protect",
      "Adapt to your field",
    ].entries()) {
      await expect(bars.nth(index)).toHaveAccessibleName(title);
    }
  });

  test("each path shows its own progress", async ({ page }) => {
    await mockTauri(page, {
      session,
      config: school,
      onboardingCompleted: true,
      learningCatalog: catalog,
      learningProgress: {
        catalog_version: 2,
        lessons: [
          {
            lesson_id: "getting-started-1",
            status: "completed",
            lesson_version: 1,
            completed_blocks: ["b1"],
            last_block_id: "b1",
            started_at: 1,
            updated_at: 2,
            completed_at: 2,
          },
        ],
      },
    });
    await page.goto("/");
    await openLearn(page);

    const started = page.getByRole("progressbar", { name: "Getting started" });
    await expect(started).toHaveAttribute("aria-valuenow", "1");
    await expect(started).toHaveAttribute("aria-valuemax", "2");
    const asking = page.getByRole("progressbar", { name: "Asking well" });
    await expect(asking).toHaveAttribute("aria-valuenow", "0");
    await expect(asking).toHaveAttribute("aria-valuemax", "1");
    await expect(page.getByText("1 of 5 lessons completed")).toBeVisible();
  });

  test("the former AI Essentials course is not a second course anymore", async ({
    page,
  }) => {
    await mockTauri(page, {
      session,
      config: school,
      onboardingCompleted: true,
      learningCatalog: catalog,
    });
    await page.goto("/");
    await openLearn(page);

    await expect(page.getByText("Ask better questions").first()).toBeVisible();
    await expect(page.getByText("0 of 6 modules completed")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Working with AI/ }),
    ).toHaveCount(0);
  });

  test("lessons written in another language say so", async ({ page }) => {
    await mockTauri(page, {
      session,
      config: school,
      onboardingCompleted: true,
      language: "fr",
      learningCatalog: catalog,
    });
    await page.goto("/");
    await openLearn(page, "Apprendre");

    await expect(
      page.getByText(
        "Ces leçons sont pour l'instant disponibles en anglais uniquement.",
      ),
    ).toBeVisible();
  });

  test("lessons in the interface language carry no notice", async ({
    page,
  }) => {
    await mockTauri(page, {
      session,
      config: school,
      onboardingCompleted: true,
      learningCatalog: catalog,
    });
    await page.goto("/");
    await openLearn(page);

    await expect(page.getByText("Ask better questions").first()).toBeVisible();
    await expect(
      page.getByText("These lessons are currently available in English only."),
    ).toHaveCount(0);
  });
});
