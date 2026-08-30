import { expect, test } from "@playwright/test";
import { mockTauri } from "./tauriMock";

test("Personal mode does not expose Campus navigation", async ({ page }) => {
  test.skip(process.env.VITE_NOVA_MODE === "campus", "Personal build only");
  await mockTauri(page, { onboardingCompleted: true });
  await page.goto("/");

  await expect(page.getByRole("button", { name: "Campus" })).toHaveCount(0);
  await expect(page.getByText("Campus connected")).toHaveCount(0);
  await expect(page.getByText("Nova Local active")).toHaveCount(0);
});
