/**
 * Ce qu'un build de pull request n'a pas le droit d'avoir.
 *
 * ## Pourquoi ce fichier existe
 *
 * `pr-test-build.yml` compile le code d'une pull request — donc du code que
 * personne n'a encore relu. Il a longtemps fait trois choses ensemble :
 * construire ce code, hériter de tous les secrets du dépôt, et signer le
 * résultat. Les scripts de build de la PR s'exécutaient ainsi dans le même job
 * que la clé privée de l'updater.
 *
 * Le correctif tient en trois lignes de YAML. Ce test existe parce que trois
 * lignes de YAML se remettent en trois secondes, souvent avec une bonne raison
 * — « juste pour vérifier que la signature passe » — et qu'une revue de code
 * ne fait pas le lien entre `sign-binaries: true` et « la clé est remise à
 * l'auteur de la PR ». La règle est donc écrite là où elle échoue toute seule.
 *
 * ## Ce qu'il vérifie, et ce qu'il ne vérifie pas
 *
 * Il lit le YAML comme du texte, par blocs de job. C'est délibéré : ajouter un
 * analyseur YAML ferait entrer une dépendance de plus dans la chaîne
 * d'approvisionnement, précisément ce que ce test protège.
 *
 * Il ne vérifie pas que la CI fonctionne — c'est le rôle de la CI. Il vérifie
 * qu'une configuration dangereuse ne peut pas être commitée sans être vue.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const WORKFLOWS = join(import.meta.dir, "..", ".github", "workflows");

function read(name: string): string {
  return readFileSync(join(WORKFLOWS, name), "utf8");
}

/**
 * Découpe la section `jobs:` en blocs, un par job.
 *
 * Un job commence à `  <nom>:` (deux espaces) et court jusqu'au prochain. On
 * raisonne par bloc plutôt que sur le fichier entier : sans cela, un
 * `sign-binaries: true` légitime dans un job de release ferait échouer le
 * contrôle d'un job de PR situé juste au-dessus.
 */
function jobBlocks(source: string): Map<string, string> {
  const lines = source.split(/\r?\n/);
  const blocks = new Map<string, string>();
  let current: string | null = null;
  let buffer: string[] = [];
  let inJobs = false;

  for (const line of lines) {
    if (/^jobs:\s*$/.test(line)) {
      inJobs = true;
      continue;
    }
    if (!inJobs) continue;
    // Une clé non indentée referme la section `jobs:`.
    if (/^\S/.test(line)) break;

    const header = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (header) {
      if (current) blocks.set(current, buffer.join("\n"));
      current = header[1];
      buffer = [];
      continue;
    }
    if (current) buffer.push(line);
  }
  if (current) blocks.set(current, buffer.join("\n"));
  return blocks;
}

/** Le job construit-il une référence de pull request ? */
function buildsPullRequestRef(block: string): boolean {
  return /^\s*ref:.*refs\/pull\//m.test(block);
}

function workflowFiles(): string[] {
  return readdirSync(WORKFLOWS).filter((name) => /\.ya?ml$/.test(name));
}

describe("pr-test-build.yml — le build d'une PR reste sans privilège", () => {
  const block = jobBlocks(read("pr-test-build.yml")).get("build-test");

  test("le job de build existe et construit bien une référence de PR", () => {
    expect(block).toBeDefined();
    expect(buildsPullRequestRef(block!)).toBe(true);
  });

  test("ne signe aucun binaire", () => {
    expect(block!).toMatch(/^\s*sign-binaries:\s*false\s*$/m);
    expect(block!).not.toMatch(/^\s*sign-binaries:\s*true\s*$/m);
  });

  test("n'hérite d'aucun secret", () => {
    // `secrets: inherit` transmettait clé updater, certificats Apple,
    // credentials Azure et jeton de publication à un job qui exécute le code
    // de la PR.
    expect(block!).not.toMatch(/^\s*secrets:\s*inherit\s*$/m);
  });

  test("ne demande pas d'écriture sur le dépôt", () => {
    expect(block!).toMatch(/^\s*contents:\s*read\s*$/m);
    expect(block!).not.toMatch(/^\s*contents:\s*write\s*$/m);
  });

  test("le job qui commente la PR n'obtient que l'écriture de commentaires", () => {
    const comment = jobBlocks(read("pr-test-build.yml")).get("comment-on-pr");
    expect(comment).toBeDefined();
    expect(comment!).toMatch(/^\s*pull-requests:\s*write\s*$/m);
    expect(comment!).not.toMatch(/^\s*contents:\s*write\s*$/m);
    expect(comment!).not.toMatch(/^\s*secrets:\s*inherit\s*$/m);
  });
});

describe("build.yml — le garde-fou côté détenteur des credentials", () => {
  const source = read("build.yml");
  const blocks = jobBlocks(source);

  test("un job de garde précède la construction", () => {
    expect(blocks.has("supply-chain-guard")).toBe(true);
    // `needs` garantit l'ordre : le refus tombe avant qu'une étape n'ait
    // touché une clé, et non au milieu du build.
    expect(blocks.get("build")!).toMatch(
      /^\s*needs:\s*supply-chain-guard\s*$/m,
    );
  });

  test("la garde refuse la signature d'une référence de pull request", () => {
    const guard = blocks.get("supply-chain-guard")!;
    expect(guard).toMatch(/startsWith\(inputs\.ref,\s*'refs\/pull\/'\)/);
    expect(guard).toMatch(/inputs\.sign-binaries/);
    expect(guard).toMatch(/exit 1/);
  });

  test("la garde refuse aussi la publication depuis une référence de PR", () => {
    const guard = blocks.get("supply-chain-guard")!;
    expect(guard).toMatch(/inputs\.release-id|inputs\.releases-repo/);
  });

  test("la garde ne détient elle-même aucun privilège", () => {
    expect(blocks.get("supply-chain-guard")!).toMatch(
      /^\s*permissions:\s*\{\}\s*$/m,
    );
  });

  test("la clé updater n'est pas écrite sur le disque pour une référence de PR", () => {
    const build = blocks.get("build")!;
    const step = build.slice(build.indexOf("Normaliser la clé"));
    expect(step).toMatch(/if:.*!startsWith\(inputs\.ref,\s*'refs\/pull\/'\)/);
  });
});

describe("l'invariant vaut pour tous les workflows, pas seulement celui du jour", () => {
  test("aucun job ne combine une référence de PR avec la signature ou l'héritage de secrets", () => {
    const offenders: string[] = [];

    for (const file of workflowFiles()) {
      for (const [name, block] of jobBlocks(read(file))) {
        if (!buildsPullRequestRef(block)) continue;
        if (/^\s*sign-binaries:\s*true\s*$/m.test(block)) {
          offenders.push(`${file}:${name} — sign-binaries: true`);
        }
        if (/^\s*secrets:\s*inherit\s*$/m.test(block)) {
          offenders.push(`${file}:${name} — secrets: inherit`);
        }
        if (/^\s*contents:\s*write\s*$/m.test(block)) {
          offenders.push(`${file}:${name} — contents: write`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  test("aucun secret n'est écrit en clair dans un workflow", () => {
    // Un secret ne s'écrit jamais dans le YAML : il se référence. Ce contrôle
    // attrape la valeur collée « en attendant », qui survit ensuite dans
    // l'historique git même une fois retirée du fichier.
    const suspicious =
      /(PRIVATE KEY-----|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/;
    for (const file of workflowFiles()) {
      expect(read(file)).not.toMatch(suspicious);
    }
  });
});
