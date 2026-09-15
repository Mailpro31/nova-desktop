import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { parseServerIdentity, resolveOrganizationContext } from "./index";

/**
 * Les catégories du Nova Core qu'une organisation ferme.
 *
 * Apprendre, Styles, Prompts et Historique appartiennent au Core : une liste
 * `capabilities` incomplète ne doit jamais les éteindre. Le serveur les nomme
 * donc explicitement dans `closed_capabilities`, et le poste ne ferme que ce
 * qui y figure. Avant ce contrat, même `learning_enabled` ne masquait pas
 * Apprendre sur les postes.
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
  capabilities: ["dictation", "aiSkills"],
  ...extra,
});

const context = (raw: Record<string, unknown>) =>
  resolveOrganizationContext({
    edition: "organization",
    organizationType: "education",
    campus: null,
    server: parseServerIdentity(raw),
  });

describe("catégories fermées par l'organisation", () => {
  test("une catégorie annoncée fermée se ferme", () => {
    const { capabilities } = context(
      me({ closed_capabilities: ["learning", "styles", "prompts", "history"] }),
    );
    expect(capabilities.learning).toBe(false);
    expect(capabilities.writingStyles).toBe(false);
    expect(capabilities.prompts).toBe(false);
    expect(capabilities.history).toBe(false);
    // La dictée n'est jamais concernée.
    expect(capabilities.dictation).toBe(true);
  });

  test("sans annonce, rien ne se ferme — même absent de `capabilities`", () => {
    const { capabilities } = context(me());
    expect(capabilities.learning).toBe(true);
    expect(capabilities.writingStyles).toBe(true);
    expect(capabilities.prompts).toBe(true);
    expect(capabilities.history).toBe(true);
  });

  test("un nom inconnu n'éteint rien", () => {
    const { capabilities } = context(
      me({ closed_capabilities: ["dictation", "tout"] }),
    );
    expect(capabilities.dictation).toBe(true);
    expect(capabilities.history).toBe(true);
  });

  test("Nova Personal garde toutes ses catégories", () => {
    const personal = resolveOrganizationContext({
      edition: "personal",
      server: parseServerIdentity(me({ closed_capabilities: ["history"] })),
    });
    expect(personal.capabilities.history).toBe(true);
    expect(personal.capabilities.prompts).toBe(true);
  });
});

describe("lecture de /api/me", () => {
  test("les catégories fermées sont lues telles quelles", () => {
    expect(
      parseServerIdentity(me({ closed_capabilities: ["history"] }))
        .closedCapabilities,
    ).toEqual(["history"]);
    expect(parseServerIdentity(me()).closedCapabilities).toEqual([]);
  });

  test("les rôles d'administration du serveur ne font pas rejeter la réponse", () => {
    // Un rôle inconnu du poste faisait rejeter tout le contrat v2 : un éditeur
    // de contenu perdait les capacités que son organisation annonce.
    for (const role of ["read_only", "content_editor"]) {
      const snapshot = parseServerIdentity(
        me({
          membership: {
            member_type: "staff",
            security_role: role,
            status: "active",
          },
        }),
      );
      expect(snapshot.contractVersion).toBe(2);
      expect(snapshot.member?.securityRole).toBe(role);
    }
  });
});

describe("navigation", () => {
  const sidebar = readFileSync("src/components/Sidebar.tsx", "utf8");

  test("Styles, Prompts et Historique suivent leur capacité", () => {
    expect(sidebar).toContain('useCapability("writingStyles")');
    expect(sidebar).toContain('useCapability("prompts")');
    expect(sidebar).toContain('useCapability("history")');
  });

  test("le poste lit la liste que le serveur envoie", () => {
    const rust = readFileSync("src-tauri/src/commands/campus.rs", "utf8");
    expect(rust).toContain("pub closed_capabilities: Option<Vec<String>>");
  });
});
