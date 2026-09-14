import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

/**
 * « Nova Commands » et « AI Skills » désignent deux écrans différents, et
 * chacun porte son propre nom.
 *
 * Mesuré sur un poste réel : l'entrée « Nova Commands » ouvrait un écran titré
 * « AI Skills » (Expliquer, Résumer, Améliorer, Traduire, Demander à Nova),
 * pendant que l'entrée « AI Skills » ouvrait un autre écran, lui aussi titré
 * « AI Skills », qui disait « Aucune AI Skill intégrée ». Deux écrans, un seul
 * nom : impossible de savoir où sont les actions intégrées.
 */

const LOCALES_DIR = "src/i18n/locales";
const LOCALES = readdirSync(LOCALES_DIR);

type Tree = { [key: string]: string | Tree };

function value(locale: string, path: string): string | undefined {
  const tree = JSON.parse(
    readFileSync(`${LOCALES_DIR}/${locale}/translation.json`, "utf8"),
  ) as Tree;
  let node: string | Tree | undefined = tree;
  for (const part of path.split(".")) {
    node = typeof node === "object" ? node[part] : undefined;
  }
  return typeof node === "string" ? node : undefined;
}

const source = (path: string) => readFileSync(path, "utf8");

/** Textes de l'écran Nova Commands, qui ne doivent plus parler d'AI Skill. */
const NOVA_COMMANDS_COPY = [
  "aiSkills.previewHint",
  "aiSkills.how.choose",
  "aiSkills.privacyOffline",
];

describe("Nova Commands et AI Skills ont chacun leur nom", () => {
  test("les 22 langues sont présentes", () => {
    expect(LOCALES).toHaveLength(22);
  });

  test("l'écran ouvert par « Nova Commands » s'appelle Nova Commands", () => {
    const page = source(
      "src/components/settings/ai-skills/AiSkillsSettings.tsx",
    );
    expect(page).toContain('title={t("novaCommands.title")}');
    expect(page).not.toContain('title={t("aiSkills.title")}');
  });

  for (const locale of LOCALES) {
    test(`${locale} : l'écran Nova Commands ne parle plus d'AI Skill`, () => {
      const leaks = NOVA_COMMANDS_COPY.filter((key) =>
        (value(locale, key) ?? "").includes("AI Skill"),
      );
      expect(leaks).toEqual([]);
    });

    test(`${locale} : l'écran AI Skills indique où sont les actions intégrées`, () => {
      expect(value(locale, "aiSkillTools.builtinInCommands")).toContain(
        "Nova Commands",
      );
    });
  }

  test("l'écran AI Skills renvoie vers Nova Commands quand cette entrée existe", () => {
    const page = source(
      "src/components/settings/ai-skills/OrganizationAiSkills.tsx",
    );
    expect(page).toContain("aiSkillTools.builtinInCommands");
  });
});
