import { expect, test } from "@playwright/test";
import { mockTauri } from "./tauriMock";

/**
 * L'écran de choix d'édition apparaît une fois, à la première ouverture, et
 * jamais devant quelqu'un qui utilisait déjà Nova.
 *
 * Ces tests affirment ce qui **doit être à l'écran**, pas seulement ce qui n'y
 * est pas. La distinction n'est pas théorique : `personal.spec.ts` ne vérifie
 * que des absences, et il est passé au vert alors que l'écran de choix
 * s'affichait à tort devant un utilisateur installé. Un test qui ne cherche que
 * des absences passe sur n'importe quel écran, y compris le mauvais.
 */

const CHOOSER = "How will you use Nova?";

test("quelqu'un qui utilisait déjà Nova ne se voit jamais poser la question", async ({
  page,
}) => {
  test.skip(process.env.VITE_NOVA_MODE === "campus", "Personal build only");
  await mockTauri(page, { onboardingCompleted: true });
  await page.goto("/");

  // L'application, pas un écran de parcours.
  await expect(page.getByText(CHOOSER)).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(CHOOSER);
});

test("la question est posée à la première ouverture, puis retenue", async ({
  page,
}) => {
  test.skip(process.env.VITE_NOVA_MODE === "campus", "Personal build only");
  await mockTauri(page, { onboardingCompleted: false });
  await page.goto("/");

  await expect(page.getByText(CHOOSER)).toBeVisible();
  await expect(page.getByText("Personal", { exact: true })).toBeVisible();
  await expect(page.getByText("Organization", { exact: true })).toBeVisible();

  // Choisir « Personnel » quitte l'écran et ne demande aucune connexion.
  await page.getByText("Personal", { exact: true }).click();
  await expect(page.getByText(CHOOSER)).toHaveCount(0);

  // Et la réponse est retenue : un rechargement ne repose pas la question.
  await page.reload();
  await expect(page.getByText(CHOOSER)).toHaveCount(0);
});

test("le sous-choix Campus / Entreprise est atteignable et réversible", async ({
  page,
}) => {
  test.skip(process.env.VITE_NOVA_MODE === "campus", "Personal build only");
  await mockTauri(page, { onboardingCompleted: false });
  await page.goto("/");

  await page.getByText("Organization", { exact: true }).click();
  await expect(page.getByText("What kind of organization?")).toBeVisible();
  await expect(
    page.getByText("School or university", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Company", { exact: true })).toBeVisible();

  // On peut revenir : choisir « Organisation » ne doit pas être un aller simple
  // avant d'avoir vu ce que le second écran demande.
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByText(CHOOSER)).toBeVisible();
});

test("choisir Personnel ne contacte aucun serveur d'organisation", async ({
  page,
}) => {
  test.skip(process.env.VITE_NOVA_MODE === "campus", "Personal build only");
  await mockTauri(page, { onboardingCompleted: false });

  // Toute commande qui atteindrait un serveur d'organisation est enregistrée.
  // Lire une configuration locale ou une session en trousseau n'en fait pas
  // partie : ces chemins ne sortent pas de la machine.
  await page.addInitScript(() => {
    (window as unknown as { __novaReached: string[] }).__novaReached = [];
    const reaching = [
      "fetch_campus_server_config",
      "check_campus_server_reachability",
      "request_campus_auth",
      "verify_campus_auth",
      "start_campus_entra_auth",
      "poll_campus_entra_auth",
      "sign_in_with_organization",
      "organization_auth_providers",
      "discover_organization",
      "get_campus_me",
    ];
    const install = () => {
      const internals = (
        window as unknown as {
          __TAURI_INTERNALS__?: {
            invoke?: (command: string, args?: unknown) => Promise<unknown>;
          };
        }
      ).__TAURI_INTERNALS__;
      if (!internals?.invoke) return false;
      const original = internals.invoke.bind(internals);
      internals.invoke = (command: string, args?: unknown) => {
        if (reaching.includes(command)) {
          (window as unknown as { __novaReached: string[] }).__novaReached.push(
            command,
          );
        }
        return original(command, args);
      };
      return true;
    };
    if (!install()) {
      const timer = setInterval(() => {
        if (install()) clearInterval(timer);
      }, 5);
    }
  });

  await page.goto("/");
  await page.getByText("Personal", { exact: true }).click();
  await expect(page.getByText(CHOOSER)).toHaveCount(0);
  await page.waitForTimeout(1000);

  const reached = await page.evaluate(
    () => (window as unknown as { __novaReached: string[] }).__novaReached,
  );
  expect(reached).toEqual([]);
});
