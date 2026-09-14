import { expect, test, type Page } from "@playwright/test";
import { mockTauri } from "./tauriMock";

/**
 * « Apprendre » est la page des cours.
 *
 * Mesuré sur un poste réel : le cours traduit « Fondamentaux IA » n'existait
 * que dans un onglet de Réglages, pendant que la page « Apprendre » de la barre
 * latérale montrait d'autres leçons, en anglais dans une interface française.
 * Deux programmes, deux endroits, sans lien entre eux.
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

const company = {
  ...school,
  organization_type: "business",
  organization: { id: "example", name: "Example Company", managed: true },
};

/** Un catalogue serveur minimal, en anglais comme celui livré aujourd'hui. */
const englishCatalog = {
  catalog_version: 1,
  locale: "en",
  paths: ["use_ai", "learn_ai", "adapt_ai"].map((pillar, index) => ({
    id: pillar.replace("_", "-"),
    pillar,
    title: `Pillar ${index + 1}`,
    description: "Pillar description",
    icon: null,
    order: index + 1,
    tags: ["general"],
    modules: [
      {
        id: `${pillar}-m1`,
        title: "Module",
        description: "Module description",
        order: 1,
        lessons: [
          {
            id: `${pillar}-lesson`,
            title: index === 0 ? "Ask better questions" : `Lesson ${index + 1}`,
            description: "Say what you want.",
            estimated_minutes: 4,
            difficulty: "beginner",
            order: 1,
            version: 1,
            tags: ["general"],
            blocks: [
              { id: "b1", type: "text", order: 1, content: { body: "Body" } },
            ],
          },
        ],
      },
    ],
  })),
};

const openLearn = async (page: Page, name = "Learn") => {
  await page.getByRole("button", { name, exact: true }).click();
};

test.describe("Learn is where the courses live", () => {
  test.skip(process.env.VITE_NOVA_MODE !== "campus", "Campus build only");

  test("a school member finds AI Essentials in Learn", async ({ page }) => {
    await mockTauri(page, {
      session,
      config: school,
      onboardingCompleted: true,
      learningCatalog: englishCatalog,
    });
    await page.goto("/");
    await openLearn(page);

    await expect(page.getByText("0 of 6 modules completed")).toBeVisible();
    await expect(page.getByText("Ask better questions").first()).toBeVisible();
  });

  test("an open module takes the page, without the server lessons around it", async ({
    page,
  }) => {
    await mockTauri(page, {
      session,
      config: school,
      onboardingCompleted: true,
      learningCatalog: englishCatalog,
    });
    await page.goto("/");
    await openLearn(page);

    await page.getByRole("button", { name: /Working with AI/ }).click();
    await expect(page.getByText("Module 1 of 6")).toBeVisible();
    await expect(page.getByText("Ask better questions")).toHaveCount(0);
  });

  test("a company is not offered the school course in Learn", async ({
    page,
  }) => {
    await mockTauri(page, {
      session: { ...session, email: "member@example.test" },
      config: company,
      onboardingCompleted: true,
      learningCatalog: englishCatalog,
    });
    await page.goto("/");
    await openLearn(page);

    await expect(page.getByText("Ask better questions").first()).toBeVisible();
    await expect(page.getByText("0 of 6 modules completed")).toHaveCount(0);
  });

  test("lessons written in another language say so", async ({ page }) => {
    await mockTauri(page, {
      session,
      config: school,
      onboardingCompleted: true,
      language: "fr",
      learningCatalog: englishCatalog,
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
      learningCatalog: englishCatalog,
    });
    await page.goto("/");
    await openLearn(page);

    await expect(page.getByText("Ask better questions").first()).toBeVisible();
    await expect(
      page.getByText("These lessons are currently available in English only."),
    ).toHaveCount(0);
  });
});
