import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * L'entrée « Nova Commands » sur un poste d'organisation.
 *
 * ## Le défaut que ces tests ferment
 *
 * L'entrée était réservée à l'éducation, au motif que le catalogue présenté
 * serait « une piste fournie par l'établissement ». Ce n'en est pas une :
 * l'écran liste `NOVA_COMMAND_SKILLS` et `ASK_NOVA`, le catalogue **intégré à
 * l'application**, le même code pour tout le monde. Une entreprise dont la
 * capacité `commands` est ouverte avait donc les commandes qui fonctionnent et
 * aucun écran pour les documenter — exactement le défaut du mode réunion.
 *
 * ## La règle
 *
 * L'entrée existe pour toute organisation, école comme entreprise, comme les
 * AI Skills exécutables juste à côté. Ce qui la ferme est la capacité
 * `commands`, que l'organisation gouverne — jamais sa nature.
 *
 * Nova Personal ne change pas : les Nova Commands y restent pilotées par leur
 * réglage dédié, et l'entrée n'y est pas une destination.
 */

const ROOT = join(import.meta.dir, "../../..");

function source(relative: string): string {
  return readFileSync(join(ROOT, relative), "utf-8");
}

const SIDEBAR = "components/Sidebar.tsx";
const ORGANIZATION_AI_SKILLS =
  "components/settings/ai-skills/OrganizationAiSkills.tsx";

function sidebarSection(id: string, nextId: string): string {
  const code = source(SIDEBAR);
  return code.slice(code.indexOf(`${id}: {`), code.indexOf(`${nextId}: {`));
}

describe("entrée Nova Commands", () => {
  test("elle existe pour toute organisation, pas pour une nature d'organisation", () => {
    const section = sidebarSection("aiskills", "aiskilltools");
    expect(section).toContain("enabled: () => isOrganizationMode()");
    expect(section).not.toContain("isCampusMode");
    expect(section).not.toContain("isBusinessMode");
  });

  test("elle se ferme sur la capacité que l'organisation gouverne", () => {
    const code = source(SIDEBAR);
    expect(code).toContain('useCapability("commands")');
    expect(code).toContain(
      '(id !== "aiskills" || !organizationMode || commandsOpen)',
    );
  });

  test("elle reste alignée sur les AI Skills exécutables d'à côté", () => {
    // Les deux entrées ouvrent des catalogues de la même famille ; les
    // conditionner différemment est ce qui avait produit l'écart.
    const commands = sidebarSection("aiskills", "aiskilltools");
    const tools = sidebarSection("aiskilltools", "configuration");
    expect(commands).toContain("enabled: () => isOrganizationMode()");
    expect(tools).toContain("enabled: () => isOrganizationMode()");
  });

  test("la barre latérale ne consulte plus la nature de l'organisation", () => {
    const code = source(SIDEBAR);
    expect(code).not.toContain("isCampusMode");
    expect(code).not.toContain("isBusinessMode");
  });
});

describe("mention des actions intégrées", () => {
  test("elle suit la capacité, jamais l'édition", () => {
    const code = source(ORGANIZATION_AI_SKILLS);
    expect(code).not.toContain("isCampusMode");
    expect(code).toContain('useCapability("commands")');
  });

  test("les deux formulations restent servies", () => {
    // Là où l'entrée existe, le dire ; ailleurs, dire qu'il n'y en a pas
    // encore. Seule la question posée change, pas les textes.
    const code = source(ORGANIZATION_AI_SKILLS);
    expect(code).toContain("aiSkillTools.builtinInCommands");
    expect(code).toContain("aiSkillTools.noBuiltin");
  });
});
