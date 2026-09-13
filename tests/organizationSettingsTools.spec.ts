import { expect, test } from "@playwright/test";
import { mockTauri } from "./tauriMock";

/**
 * Réglages rend accessibles les deux fonctions que l'organisation sert.
 *
 * Les écrans des notes d'ingénieur et du cours AI Essentials existaient, mais
 * rien ne les affichait. Chacun revient comme un onglet de Réglages, présent
 * seulement quand l'organisation l'ouvre.
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

const openSettings = async (page: import("@playwright/test").Page) => {
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
};

test.describe("organization tools are reachable from Settings", () => {
  test.skip(process.env.VITE_NOVA_MODE !== "campus", "Campus build only");

  test("a school member can come back to AI Essentials", async ({ page }) => {
    await mockTauri(page, {
      session,
      config: school,
      onboardingCompleted: true,
    });
    await page.goto("/");
    await openSettings(page);

    await page.getByRole("tab", { name: "AI Essentials" }).click();
    await expect(page.getByText("0 of 6 modules completed")).toBeVisible();

    await page.getByRole("button", { name: /Working with AI/ }).click();
    await expect(page.getByText("Module 1 of 6")).toBeVisible();
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
    await openSettings(page);

    await page.getByRole("tab", { name: "Engineering Notes" }).click();
    await page
      .getByPlaceholder(/Paste or dictate your observations/)
      .fill("thrust 12 N at 20 C, sensor drift unclear");
    await page.getByRole("button", { name: "Structure notes" }).click();

    await expect(page.getByText("Structured note")).toBeVisible();
    await expect(
      page.getByText("Structured: thrust 12 N at 20 C, sensor drift unclear"),
    ).toBeVisible();
    const sent = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("nova.test.engineeringNotes") ?? "null"),
    );
    expect(sent).toEqual({
      instruction: "",
      text: "thrust 12 N at 20 C, sensor drift unclear",
    });
  });

  test("the engineering notes fields use the full width of the tab", async ({
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
    await openSettings(page);
    await page.getByRole("tab", { name: "Engineering Notes" }).click();

    const notes = await page
      .getByPlaceholder(/Paste or dictate your observations/)
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
    // Six onglets ne tiennent pas sur une ligne dans une fenêtre étroite : la
    // barre défilait horizontalement et coupait le dernier onglet.
    await page.setViewportSize({ width: 760, height: 600 });
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

  test("a company keeps engineering notes but is not offered the school course", async ({
    page,
  }) => {
    await mockTauri(page, {
      session: { ...session, email: "member@example.test" },
      config: company,
      onboardingCompleted: true,
    });
    await page.goto("/");
    await openSettings(page);

    await expect(
      page.getByRole("tab", { name: "Engineering Notes" }),
    ).toBeVisible();
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
