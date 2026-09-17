import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

import { parseServerIdentity } from "./index";
import { disabledStyleSet } from "./disabledStyles";

/**
 * Catégories et Styles désactivés par l'organisation.
 *
 * Chaque catégorie de la barre latérale, sauf Accueil et Réglages, se ferme
 * depuis la console. Nova Commands et AI Skills restaient affichés alors que
 * le serveur refusait déjà de les exécuter.
 *
 * Un Style peut aussi être désactivé seul. Le serveur le nomme dans
 * `style_policy.disabled_style_ids` de `/api/me`. Le poste le montre alors
 * barré d'un bandeau rouge, ne permet plus de le choisir, et ne l'applique
 * plus : un Style déjà choisi retombe sur un Style encore autorisé.
 */

const me = (extra: Record<string, unknown> = {}) => ({
  contract_version: 2,
  user_id: "u1",
  organization_id: "org-1",
  organization_type: "education",
  membership: {
    member_type: "student",
    security_role: "member",
    status: "active",
  },
  capabilities: ["dictation", "aiSkills", "commands"],
  ...extra,
});

/** Le code, commentaires retirés : un mot dans un commentaire ne prouve rien. */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

describe("Styles désactivés annoncés par /api/me", () => {
  test("la liste est lue telle quelle", () => {
    const identity = parseServerIdentity(
      me({
        style_policy: {
          disabled_style_ids: ["nova_style_prompt", "nova_style_todo"],
        },
      }),
    );
    expect(identity.disabledStyleIds).toEqual([
      "nova_style_prompt",
      "nova_style_todo",
    ]);
  });

  test("un serveur plus ancien ne désactive rien", () => {
    expect(parseServerIdentity(me()).disabledStyleIds).toEqual([]);
  });

  test("un bloc illisible ne désactive rien et ne fait pas rejeter la réponse", () => {
    const identity = parseServerIdentity(me({ style_policy: "oops" }));
    expect(identity.disabledStyleIds).toEqual([]);
    expect(identity.userId).toBe("u1");
  });

  test("hors connexion, aucun Style n'est présenté comme désactivé", () => {
    expect(disabledStyleSet(null).size).toBe(0);
    expect(disabledStyleSet(["nova_style_prompt"]).has("nova_style_prompt")).toBe(
      true,
    );
  });
});

describe("La page Styles", () => {
  const styles = code("src/components/settings/post-processing/StylesList.tsx");

  test("un Style désactivé porte le bandeau de l'organisation", () => {
    expect(styles).toContain('t("styles.disabledByOrganization")');
    expect(styles).toContain("serverIdentity?.disabledStyleIds");
  });

  test("un Style désactivé ne se choisit pas", () => {
    expect(styles).toContain("disabledByOrganization ? undefined : onSelect");
  });
});

describe("La barre latérale", () => {
  const sidebar = code("src/components/Sidebar.tsx");

  test("Nova Commands suit la capacité des commandes", () => {
    expect(sidebar).toContain('useCapability("commands")');
    expect(sidebar).toContain('id !== "aiskills"');
  });

  test("AI Skills suit la capacité des AI Skills", () => {
    expect(sidebar).toContain('useCapability("aiSkills")');
    expect(sidebar).toContain('id !== "aiskilltools"');
  });
});

describe("Traductions", () => {
  const locales = readdirSync("src/i18n/locales");

  test("chaque langue explique qu'un Style est désactivé", () => {
    expect(locales).toHaveLength(22);
    for (const locale of locales) {
      const { styles } = JSON.parse(
        readFileSync(`src/i18n/locales/${locale}/translation.json`, "utf8"),
      ) as { styles: Record<string, unknown> };
      for (const key of [
        "disabledByOrganization",
        "disabledByOrganizationHint",
      ]) {
        const value = styles[key];
        expect(typeof value === "string" && value.trim() !== "").toBe(true);
      }
    }
  });
});
