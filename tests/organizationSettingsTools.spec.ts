import { expect, test } from "@playwright/test";
import { mockTauri } from "./tauriMock";

/**
 * Les outils que l'organisation sert restent atteignables.
 *
 * Historique : les notes d'ingénieur et le cours AI Essentials ont d'abord été
 * des onglets de Réglages que rien n'affichait (13/09). Depuis, les notes sont
 * devenues « Notes structurées », une catégorie de la barre latérale, et les
 * cours vivent dans Learn, un catalogue unique (14–16/09). Ces tests suivent
 * les outils là où ils sont : dans la barre latérale, plus dans Réglages.
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

const openStructuredNotes = async (page: import("@playwright/test").Page) => {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Structured notes", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Structured notes", level: 1 }),
  ).toBeVisible();
};

const openSettings = async (page: import("@playwright/test").Page) => {
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
};

test.describe("organization tools are reachable", () => {
  test.skip(process.env.VITE_NOVA_MODE !== "campus", "Campus build only");

  test("a school member reaches Learn and structured notes from the sidebar", async ({
    page,
  }) => {
    await mockTauri(page, {
      session,
      config: school,
      onboardingCompleted: true,
    });
    await page.goto("/");

    const navigation = page.getByRole("navigation");
    await navigation
      .getByRole("button", { name: "Learn", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Learn", level: 1 }),
    ).toBeVisible();
    await navigation
      .getByRole("button", { name: "Structured notes", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Structured notes", level: 1 }),
    ).toBeVisible();

    // Et plus dans Réglages : deux emplacements pour un même outil, c'est un
    // de trop.
    await openSettings(page);
    await expect(page.getByRole("tab", { name: "AI Essentials" })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("tab", { name: "Engineering Notes" }),
    ).toHaveCount(0);
  });

  test("engineering notes are structured by the organization server", async ({
    page,
  }) => {
    await mockTauri(page, {
      session,
      config: school,
      onboardingCompleted: true,
    });
    await page.goto("/");
    await openStructuredNotes(page);

    // Une note d'ingénieur est une observation.
    await page.getByRole("tab", { name: "Observation" }).click();
    await page
      .getByPlaceholder("Paste or dictate your raw notes…")
      .fill("thrust 12 N at 20 C, sensor drift unclear");
    await page.getByRole("button", { name: "Structure my notes" }).click();

    await expect(
      page.getByText(
        "Structured observation: thrust 12 N at 20 C, sensor drift unclear",
      ),
    ).toBeVisible();
    const sent = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("nova.test.structuredNotes") ?? "null"),
    );
    expect(sent).toMatchObject({
      noteType: "observation",
      text: "thrust 12 N at 20 C, sensor drift unclear",
    });
  });

  test("the structured notes fields use the full width of the page", async ({
    page,
  }) => {
    // Relevé à la capture : l'écran n'avait jamais été affiché, et ses deux
    // champs restaient à leur largeur par défaut, côte à côte.
    await page.setViewportSize({ width: 1180, height: 760 });
    await mockTauri(page, {
      session,
      config: school,
      onboardingCompleted: true,
    });
    await page.goto("/");
    await openStructuredNotes(page);

    const notes = await page
      .getByPlaceholder("Paste or dictate your raw notes…")
      .boundingBox();
    const instruction = await page
      .getByPlaceholder(/Optional instruction/)
      .boundingBox();
    const tabs = await page.getByRole("tablist").boundingBox();
    expect(notes && instruction && tabs).toBeTruthy();
    // Les deux champs s'empilent et prennent la largeur de la colonne.
    expect(Math.abs(notes!.width - instruction!.width)).toBeLessThan(2);
    expect(instruction!.y).toBeGreaterThan(notes!.y + notes!.height);
    expect(notes!.width).toBeGreaterThanOrEqual(tabs!.width);
  });

  test("in a narrow window every Settings tab stays visible, on several lines", async ({
    page,
  }) => {
    // Les onglets ne tiennent pas sur une ligne dans une fenêtre étroite : la
    // barre défilait horizontalement et coupait le dernier onglet. Il en reste
    // quatre depuis que Learn et les notes ont rejoint la barre latérale ; ils
    // passent à la ligne à 600 px, là où six le faisaient dès 760 px.
    await page.setViewportSize({ width: 600, height: 600 });
    await mockTauri(page, {
      session,
      config: school,
      onboardingCompleted: true,
    });
    await page.goto("/");
    await openSettings(page);

    const tablist = page.getByRole("tablist");
    const tabs = page.getByRole("tab");
    const boxes = async () =>
      Promise.all(
        (await tabs.all()).map(async (tab) => (await tab.boundingBox())!),
      );

    expect(
      await tablist.evaluate(
        (element) => element.scrollWidth - element.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
    const list = (await tablist.boundingBox())!;
    const narrow = await boxes();
    for (const box of narrow) {
      expect(box.x).toBeGreaterThanOrEqual(list.x - 1);
      expect(box.x + box.width).toBeLessThanOrEqual(list.x + list.width + 1);
    }
    expect(narrow[narrow.length - 1].y).toBeGreaterThan(narrow[0].y);

    // Dans une fenêtre large, la barre reste sur une seule ligne.
    await page.setViewportSize({ width: 1180, height: 760 });
    await expect
      .poll(async () => new Set((await boxes()).map((box) => box.y)).size)
      .toBe(1);
  });

  test("a company keeps structured notes, reached from the sidebar", async ({
    page,
  }) => {
    await mockTauri(page, {
      session: { ...session, email: "member@example.test" },
      config: company,
      onboardingCompleted: true,
    });
    await page.goto("/");

    await openStructuredNotes(page);
    await expect(
      page.getByRole("heading", { name: "Structured notes", level: 1 }),
    ).toBeVisible();
    // Le cours AI Essentials n'existe plus : il n'est proposé à personne,
    // entreprise comprise.
    await openSettings(page);
    await expect(page.getByRole("tab", { name: "AI Essentials" })).toHaveCount(
      0,
    );
  });

  test("an organization that closes both keeps Settings as it was", async ({
    page,
  }) => {
    await mockTauri(page, {
      session,
      config: {
        ...school,
        capabilities: {
          ...school.capabilities,
          aiSkills: false,
          engineeringNotes: false,
        },
      },
      onboardingCompleted: true,
    });
    await page.goto("/");
    await openSettings(page);

    await expect(page.getByRole("tab", { name: "General" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "AI Essentials" })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("tab", { name: "Engineering Notes" }),
    ).toHaveCount(0);
  });
});
