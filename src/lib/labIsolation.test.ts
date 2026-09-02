import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * Ce que l'artefact Lab doit rester, vérifié sur les fichiers eux-mêmes.
 *
 * Un test unitaire ne peut pas lancer un installeur Windows. Il peut en
 * revanche tenir les invariants qui, lorsqu'ils cèdent, produisent exactement
 * les deux pannes déjà rencontrées : une fenêtre blanche, et un binaire Lab qui
 * se comporte comme Nova (même nom, même dossier de données, mêmes
 * téléchargements, même canal de mise à jour).
 *
 * Les assertions portent sur du texte source. C'est volontaire : la propriété à
 * protéger est « ce code n'est pas compilé dans le paquet Lab », et elle vit
 * dans des attributs `#[cfg(...)]` qu'aucune exécution du binaire ne révèle.
 */

const read = (path: string) => readFileSync(path, "utf-8");

describe("Nova Lab reste séparé de Nova", () => {
  const lab = JSON.parse(read("src-tauri/tauri.lab.conf.json"));
  const production = JSON.parse(read("src-tauri/tauri.conf.json"));

  it("garde son produit, son binaire et son identifiant", () => {
    expect(lab.productName).toBe("Nova Lab");
    expect(lab.mainBinaryName).toBe("Nova Lab");
    expect(lab.identifier).toBe("app.novaspeak.desktop.lab");
  });

  it("ne remplace jamais Nova", () => {
    expect(lab.productName).not.toBe(production.productName);
    expect(lab.identifier).not.toBe(production.identifier);
    expect(lab.mainBinaryName).not.toBe(production.mainBinaryName);
    // Installation par utilisateur : elle ne peut pas écraser un Nova
    // installé pour toute la machine.
    expect(lab.bundle.windows.nsis.installMode).toBe("currentUser");
  });

  it("écrit ses données dans son propre dossier", () => {
    const allow = lab.app.security.assetProtocol.scope.allow as string[];
    expect(allow.every((entry) => entry.includes(lab.identifier))).toBe(true);
    expect(
      allow.some((entry) => entry.includes(`${production.identifier}/`)),
    ).toBe(false);
  });

  it("est construit avec la feature Rust `lab` et son propre exécutable", () => {
    const workflow = read(".github/workflows/nova-windows.yml");
    expect(workflow).toContain("--config src-tauri/tauri.lab.conf.json");
    expect(workflow).toContain("--features lab");
    expect(workflow).toContain("Nova Lab.exe");
  });
});

describe("Nova Lab ne fait rien de ce qu'il n'a pas à faire", () => {
  const libRs = read("src-tauri/src/lib.rs");

  /** Le bloc `{ ... }` qui suit la première occurrence d'un repère. */
  const gateAbove = (marker: string): string => {
    const at = libRs.indexOf(marker);
    expect(at).toBeGreaterThan(-1);
    // 400 caractères suffisent à couvrir le commentaire et l'attribut qui
    // précèdent immédiatement l'ouverture du bloc.
    return libRs.slice(Math.max(0, at - 400), at);
  };

  it("ne précharge aucun modèle d'IA local", () => {
    expect(gateAbove("local_llm::prewarm_if_selected")).toContain(
      '#[cfg(not(feature = "lab"))]',
    );
  });

  it("ne télécharge aucun modèle d'IA local", () => {
    expect(
      gateAbove("local_llm::provision_default_model_in_background"),
    ).toContain('#[cfg(not(feature = "lab"))]');
  });

  it("ne réclame aucun jeton gratuit", () => {
    expect(gateAbove("license::fetch_and_store_free_token")).toContain(
      '#[cfg(not(feature = "lab"))]',
    );
  });

  it("n'embarque pas le greffon de mise à jour", () => {
    const at = libRs.indexOf("tauri_plugin_updater::Builder::new()");
    expect(at).toBeGreaterThan(-1);
    expect(libRs.slice(Math.max(0, at - 400), at)).toContain(
      '#[cfg(not(feature = "lab"))]',
    );
  });

  it("n'enregistre ses commandes qu'une seule fois", () => {
    // `Builder::commands()` remplace la liste enregistrée, il ne l'étend pas.
    // Un second appel — c'est exactement ce que faisait le build Lab — efface
    // toutes les commandes ordinaires, et l'application répond « Command
    // get_app_settings not found » au premier écran. La preuve réelle est le
    // test Rust `specta_registration` ; cette garde-ci rend la faute visible
    // en quelques millisecondes plutôt qu'après une compilation complète.
    const callSites = libRs
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("//"))
      .filter((line) => line.includes(".commands("));
    expect(callSites).toHaveLength(1);
  });

  it("intitule sa fenêtre « Nova Lab »", () => {
    // Insensible au formatage de `cargo fmt`, qui casse l'expression sur
    // plusieurs lignes selon sa longueur.
    const title = libRs.replace(/\s+/g, " ");
    expect(title).toContain(
      '.title(if cfg!(feature = "lab") { "Nova Lab" } else { "Nova" })',
    );
  });

  it("laisse la feature `lab` désactivée par défaut", () => {
    const cargo = read("src-tauri/Cargo.toml");

    // L'invariant est que `lab` n'entre pas dans la construction par défaut.
    expect(cargo).toContain("default = []");

    // `lab` peut activer des dépendances optionnelles — la mesure du corps
    // transmis en tire deux — mais jamais une autre feature : cela ferait
    // entrer du code dans un paquet de production par un chemin détourné.
    const declaration = cargo.match(/^lab = \[(.*?)\]$/ms);
    expect(declaration).not.toBeNull();
    const activated = (declaration?.[1] ?? "")
      .split(",")
      .map((entry) => entry.trim().replace(/^["']|["']$/g, ""))
      .filter((entry) => entry.length > 0);
    for (const entry of activated) {
      expect(entry.startsWith("dep:")).toBe(true);
    }
  });
});

describe("la racine React ne peut plus rendre une fenêtre blanche", () => {
  it("App.tsx ne renvoie jamais `null`", () => {
    // La fenêtre blanche venait de trois `return null` successifs. Aucune
    // sonde ne doit pouvoir redevenir une absence d'écran.
    const app = read("src/App.tsx");
    expect(app).not.toMatch(/^\s*return null;\s*$/m);
    expect(app).toContain("startupScreen(");
  });

  it("l'arbre React est protégé par un filet d'erreur", () => {
    expect(read("src/main.tsx")).toContain("<AppErrorBoundary>");
  });

  it("un échec de lecture des réglages devient un état lisible", () => {
    // Sans cela, `settings` restait `null` pour toujours et plus aucune sonde
    // ne se déclarait prête.
    expect(read("src/stores/settingsStore.ts")).toContain("settingsError");
  });

  it("le bouton Lab ne dépend d'aucune configuration Campus locale", () => {
    const onboarding = read("src/components/onboarding/CampusOnboarding.tsx");
    const at = onboarding.indexOf('onClick={() => setStep("lab")}');
    expect(at).toBeGreaterThan(-1);
    expect(onboarding.slice(Math.max(0, at - 400), at)).not.toContain(
      "disabled={!configLoaded}",
    );
    // Et la sonde de configuration ne peut plus emporter tout l'écran.
    expect(onboarding).toContain("loadCampusConfig().catch(() => null)");
  });
});
