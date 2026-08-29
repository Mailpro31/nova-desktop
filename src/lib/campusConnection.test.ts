import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * La surface qui permet de relier un compte à son organisation.
 *
 * Née d'un défaut **préexistant** découvert par la recette de la Phase 31B, et
 * distinct du travail sur les Packages : la connexion Organization n'existait
 * que dans le parcours de premier lancement. Une fois celui-ci terminé sans
 * avoir lié de compte, il n'y avait plus aucun chemin — l'entrée
 * « établissement » de la barre latérale est conditionnée à l'existence d'une
 * organisation, donc cachée précisément quand on cherche à en créer une.
 *
 * On teste la **décision** plutôt que le rendu, comme ailleurs dans ce dépôt.
 */

const CONNECTION = readFileSync(
  "src/components/settings/campus/CampusConnection.tsx",
  "utf8",
);
const CONFIGURATION = readFileSync(
  "src/components/settings/configuration/ConfigurationSettings.tsx",
  "utf8",
);
const SIDEBAR = readFileSync("src/components/Sidebar.tsx", "utf8");
const APP = readFileSync("src/App.tsx", "utf8");
const ONBOARDING = readFileSync(
  "src/components/onboarding/CampusOnboarding.tsx",
  "utf8",
);
const CAMPUS_STATUS = readFileSync("src/hooks/useCampusStatus.ts", "utf8");

/** Le code, commentaires retirés : un mot dans un commentaire ne prouve rien. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

describe("Reachable without replaying onboarding", () => {
  test("the surface lives in Settings, which is always accessible", () => {
    // Réglages est rendu inconditionnellement dans la barre Campus ; y placer
    // la connexion garantit qu'elle est atteignable avant toute organisation.
    expect(code(CONFIGURATION)).toContain("<CampusConnection />");
  });

  test("it is not gated on an existing organization", () => {
    // La faute d'origine : conditionner l'accès à ce qu'on cherche à créer.
    const rendered = code(CONFIGURATION);
    expect(rendered).not.toContain("organization && <CampusConnection");
    expect(rendered).not.toContain("{organization && <CampusConnection />}");
  });

  test("nothing touches the onboarding flag", () => {
    // Rejouer le premier lancement aurait été un contournement, pas un
    // correctif : l'utilisateur repasserait par le modèle et les permissions.
    for (const source of [CONNECTION, CONFIGURATION]) {
      expect(source).not.toContain("onboarding_completed");
      expect(source).not.toContain("settings_store");
    }
  });
});

describe("One flow, not two", () => {
  test("connecting mounts the existing onboarding component", () => {
    // Un second chemin d'authentification aurait été la faute la plus coûteuse
    // à réparer plus tard, et la plus facile à commettre ici.
    expect(code(CONNECTION)).toContain("<CampusOnboarding");
    expect(code(CONNECTION)).toContain(
      'import CampusOnboarding from "@/components/onboarding/CampusOnboarding"',
    );
  });

  test("it implements no discovery, SSO or step-up of its own", () => {
    const source = code(CONNECTION);
    for (const forbidden of [
      "discovery",
      "step-up",
      "stepUp",
      "code_challenge",
      "authorize",
      "server_url",
      "serverUrl",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  test("no server address is ever asked for", () => {
    // L'identifiant d'organisation suffit ; la découverte fait le reste.
    expect(code(CONNECTION)).not.toContain("input");
  });

  test("Settings supplies its UX context to the shared flow", () => {
    expect(code(CONNECTION)).toContain('flowContext="settings"');
  });

  test("authentication refreshes every visible Campus projection before exiting", () => {
    const source = code(ONBOARDING);
    expect(source.replace(/\s+/g, " ")).toContain(
      "await Promise.all([refreshCampusContext(), refreshCampusStatus()]);",
    );
    expect(source).toContain("await refreshConnectedCampusState();");
    expect(source).toContain("useCampusStatus()");
    expect(code(CAMPUS_STATUS).replace(/\s+/g, " ")).toContain(
      "refresh: () => Promise<void>",
    );
    expect(source).toContain('flowContext === "settings"');
    expect(source).toContain("onComplete()");
    expect(source).toContain('setStep("ready")');
  });

  test("Settings never owns or renders the onboarding completion screen", () => {
    const source = code(CONNECTION);
    expect(source).not.toContain("campus.onboarding.ready");
    expect(source).not.toContain('setStep("ready")');
  });
});

describe("Already linked", () => {
  test("an existing Organization session refreshes its context at startup", () => {
    const source = code(APP);
    expect(source).toContain(
      'import { refreshCampusContext } from "./stores/campusStore"',
    );
    // `isOrganizationMode()` et non `isCampusMode()` : l'amorçage du contexte
    // vaut pour toute organisation, entreprise comprise.
    expect(source.replace(/\s+/g, " ")).toContain(
      "if (!isOrganizationMode()) return; void refreshCampusContext();",
    );
  });

  test("the organization is shown instead of a second connect action", () => {
    const source = code(CONNECTION);
    expect(source).toContain("const linked = Boolean(session)");
    // L'action de connexion vit dans la branche non liée.
    expect(source).toContain('t("campusConnection.connect")');
  });

  test("the connection status is stated, not guessed", async () => {
    const { default: fr } = await import("../i18n/locales/en/translation.json");
    const connection = (fr as Record<string, Record<string, string>>)
      .campusConnection;
    expect(connection.connected).toBeTruthy();
    expect(connection.local.toLowerCase()).toContain("offline");
    expect(connection.signedOut).toBeTruthy();
  });

  test("reconnecting after a sign-out needs no onboarding replay", () => {
    // `linked` suit la session : elle disparaît à la déconnexion, et l'action
    // de connexion revient d'elle-même.
    expect(code(CONNECTION)).toContain("useCampusStatus()");
    expect(code(CONNECTION)).toContain("setConnecting(true)");
  });
});

describe("Personal is untouched", () => {
  test("the surface is only rendered in the Campus tab", () => {
    const source = code(CONFIGURATION);
    const campusTab = source.slice(source.indexOf("const CampusGeneralTab"));
    expect(campusTab).toContain("<CampusConnection />");
    // La branche personnelle rend `GeneralSettings`, qui ne la connaît pas.
    expect(source).toContain(
      "campusMode ? <CampusGeneralTab /> : <GeneralSettings />",
    );
  });
});

describe("Organization navigation", () => {
  const primaryList = () =>
    code(SIDEBAR)
      .slice(code(SIDEBAR).indexOf("const ORGANIZATION_PRIMARY"))
      .slice(0, 200);

  test("AI Skills is listed among the Organization destinations", () => {
    // Déclarer une section ne suffit pas : la barre gérée suit une liste
    // explicite, et c'est ce qui l'avait fait disparaître en recette.
    expect(primaryList()).toContain('"aiskilltools"');
  });

  test("the learning screen keeps its own entry, renamed", () => {
    expect(primaryList()).toContain('"aiskills"');
    expect(code(SIDEBAR)).toContain('labelKey: "sidebar.learn"');
  });

  test("executable AI Skills belong to every organization", () => {
    // Le catalogue vient des Organization Packages : une entreprise les publie
    // exactement comme un établissement.
    const source = code(SIDEBAR).replace(/\s+/g, " ");
    expect(source).toContain(
      "component: OrganizationAiSkills, enabled: () => isOrganizationMode(),",
    );
  });

  test("the learning track stays education-only", () => {
    // Une entreprise n'a pas de programme pédagogique : cette entrée reste la
    // seule destination de la barre à interroger `isCampusMode()`.
    const source = code(SIDEBAR).replace(/\s+/g, " ");
    expect(source).toContain(
      "component: AiSkillsSettings, enabled: () => isCampusMode(),",
    );
    expect(source.match(/isCampusMode\(\)/g)).toHaveLength(1);
  });

  test("each destination is filtered by its own enabled predicate", () => {
    // Sans ce filtre, « Learn » apparaîtrait dans une entreprise : l'ordre est
    // fixe, la visibilité ne l'est pas.
    expect(code(SIDEBAR).replace(/\s+/g, " ")).toContain(
      "ORGANIZATION_PRIMARY.filter((id) => SECTIONS_CONFIG[id].enabled(settings),",
    );
  });
});
