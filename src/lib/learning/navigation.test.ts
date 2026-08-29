import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * L'entrée Learn dans la navigation.
 *
 * On teste la **décision** plutôt que le rendu, comme ailleurs dans ce dépôt :
 * ce qui compte n'est pas qu'un bouton s'affiche, mais que la question posée
 * pour l'afficher soit « cette capacité est-elle ouverte ? » et non « quelle
 * édition est installée ? ».
 *
 * Une entrée conditionnée à l'édition redeviendrait invisible pour Personal et
 * pour Business, sans que personne ne l'ait décidé — et c'est exactement le
 * défaut que Learn Core est censé éviter.
 */

const ROOT = join(import.meta.dir, "../..");

function source(relative: string): string {
  return readFileSync(join(ROOT, relative), "utf-8");
}

const SIDEBAR = "components/Sidebar.tsx";

describe("navigation Learn", () => {
  test("Learn est une destination déclarée", () => {
    const code = source(SIDEBAR);
    expect(code).toContain("learn: {");
    expect(code).toContain('labelKey: "sidebar.learn"');
    expect(code).toContain("component: LearnSettings");
  });

  test("elle figure dans la navigation principale d'une organisation", () => {
    // Déclarer une section ne suffit pas : la barre suit une liste explicite,
    // et c'est cet oubli qui avait fait disparaître AI Skills en Phase 31B.
    const code = source(SIDEBAR);
    const primary = code.slice(code.indexOf("const CAMPUS_PRIMARY"));
    expect(primary.slice(0, 220)).toContain('"learn"');
  });

  test("sa visibilité vient de la capacité, jamais de l'édition", () => {
    const code = source(SIDEBAR);
    expect(code).toContain('useCapability("learning")');

    // La section elle-même ne doit pas se conditionner à l'édition.
    const section = code.slice(
      code.indexOf("learn: {"),
      code.indexOf("aiskills: {"),
    );
    expect(section).not.toContain("isCampusMode");
  });

  test("le filtre s'applique aux deux barres, pas seulement à l'une", () => {
    // Une seule des deux filtrées laisserait Learn visible dans l'autre après
    // qu'une organisation l'a fermé.
    const code = source(SIDEBAR);
    expect(code).toContain("CAMPUS_PRIMARY.filter(visible)");
    expect(code).toContain("visible(id as SidebarSection)");
  });

  test("aucune entrée ne porte deux fois le même libellé", () => {
    const code = source(SIDEBAR);
    const labels = [...code.matchAll(/labelKey: "([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(labels.length).toBe(new Set(labels).size);
  });
});

describe("écrans Learn", () => {
  test("l'accueil n'appelle jamais un moteur d'inférence", () => {
    // Ouvrir Learn doit être instantané et gratuit. Seul un bloc qui l'exige
    // explicitement déclenche une inférence.
    const home = source("components/settings/learn/LearnSettings.tsx");
    expect(home).not.toContain("requestLearningFeedback");
    expect(home).not.toContain("runExercise");
  });

  test("le poste n'envoie jamais d'instruction pédagogique", () => {
    // Il envoie un identifiant d'exercice et un texte. L'instruction vit sur le
    // serveur : c'est ce qui empêche de faire exécuter n'importe quoi au
    // moteur en se réclamant d'un exercice.
    const renderer = source("components/settings/learn/BlockRenderer.tsx");
    expect(renderer).toContain("runExercise(block.id, exerciseId, answer)");
    expect(renderer).not.toContain("system_prompt");

    const store = source("../src/stores/learningStore.ts");
    expect(store).toContain("requestLearningFeedback(exerciseId, text)");
  });

  test("un type de bloc inconnu se signale au lieu de disparaître", () => {
    const renderer = source("components/settings/learn/BlockRenderer.tsx");
    expect(renderer).toContain("isKnownBlockType");
    expect(renderer).toContain("learn.block.unsupported");
  });

  test("la complétion n'est pas décidée par le poste", () => {
    // Le corps envoyé ne porte que les blocs traités : `status` n'y figure pas.
    const store = source("../src/stores/learningStore.ts");
    expect(store).toContain("updateLearningProgress(");
    expect(store).not.toMatch(/status:\s*"completed"/);
  });

  test("un échec de synchronisation ne détruit pas la progression locale", () => {
    const store = source("../src/stores/learningStore.ts");
    expect(store).toContain("progressOutOfSync");
    // La progression avance localement avant l'appel, et le `catch` ne la
    // remet pas à zéro.
    expect(store).toContain("localAdvance(");
  });
});
