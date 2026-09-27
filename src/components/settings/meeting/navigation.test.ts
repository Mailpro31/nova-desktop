import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  parseServerIdentity,
  resolveOrganizationContext,
} from "@/lib/organization";

/**
 * Le mode réunion sur un poste d'organisation.
 *
 * ## Le défaut que ces tests ferment
 *
 * La barre latérale gérée suit une liste explicite de destinations, et le mode
 * réunion n'y figurait pas. Côté Rust la fonction est pourtant débloquée pour
 * toute organisation — `organization_unlocks()` rend `true` avant tout contrôle
 * de palier — si bien qu'aucun écran ne menait à un moteur qui fonctionne.
 *
 * L'entrée portait en plus un drapeau `campusVisible: false` que personne ne
 * lisait : quinze sections le déclaraient, aucun code ne l'interrogeait. Un
 * champ mort qui se lit comme une décision est pire que pas de champ du tout.
 *
 * ## La règle
 *
 * Comme pour Learn, la question posée est « cette capacité est-elle ouverte ? »
 * et jamais « quelle édition est installée ? ». Le mode réunion est donc une
 * capacité du Core, ouverte par défaut, que le serveur peut fermer en la
 * nommant dans `closed_capabilities` — le même contrat que Styles, Prompts et
 * Historique, sans qu'aucune version du poste ait à changer pour cela.
 */

const ROOT = join(import.meta.dir, "../../..");

function source(relative: string): string {
  return readFileSync(join(ROOT, relative), "utf-8");
}

const SIDEBAR = "components/Sidebar.tsx";
const RESOLVE = "lib/organization/resolve.ts";

const me = (extra: Record<string, unknown> = {}) => ({
  contract_version: 2,
  user_id: "u1",
  organization_id: "org-1",
  organization_type: "business",
  membership: {
    member_type: "employee",
    security_role: "member",
    status: "active",
  },
  capabilities: ["dictation"],
  ...extra,
});

const context = (raw: Record<string, unknown>) =>
  resolveOrganizationContext({
    edition: "organization",
    organizationType: "business",
    campus: null,
    server: parseServerIdentity(raw),
  });

describe("navigation du mode réunion", () => {
  test("c'est une destination déclarée", () => {
    const code = source(SIDEBAR);
    expect(code).toContain("meeting: {");
    expect(code).toContain('labelKey: "sidebar.meeting"');
    expect(code).toContain("component: MeetingSettings");
  });

  test("elle figure dans la navigation principale d'une organisation", () => {
    // Déclarer une section ne suffit pas : la barre suit une liste explicite.
    // C'est cet oubli qui avait fait disparaître AI Skills en Phase 31B, et
    // c'est le même oubli qui rendait le mode réunion inatteignable.
    const code = source(SIDEBAR);
    const primary = code.slice(code.indexOf("const ORGANIZATION_PRIMARY"));
    expect(primary.slice(0, 260)).toContain('"meeting"');
  });

  test("sa visibilité vient de la capacité, jamais de l'édition", () => {
    const code = source(SIDEBAR);
    expect(code).toContain('useCapability("meeting")');

    const section = code.slice(
      code.indexOf("meeting: {"),
      code.indexOf("personalization: {"),
    );
    expect(section).not.toContain("isCampusMode");
    expect(section).not.toContain("isBusinessMode");
  });

  test("aucun drapeau mort ne prétend décider de la visibilité", () => {
    // `campusVisible` était déclaré sur les quinze sections et lu par personne.
    expect(source(SIDEBAR)).not.toContain("campusVisible");
  });

  test("le serveur peut fermer la capacité en la nommant", () => {
    expect(source(RESOLVE)).toContain('meeting: "meeting"');
  });
});

describe("capacité du mode réunion", () => {
  test("ouverte par défaut, sans annonce du serveur", () => {
    // Une liste `capabilities` incomplète ne doit pas éteindre une catégorie du
    // Core : seule une fermeture nommée compte.
    expect(context(me()).capabilities.meeting).toBe(true);
  });

  test("fermée quand l'organisation l'annonce fermée", () => {
    const { capabilities } = context(me({ closed_capabilities: ["meeting"] }));
    expect(capabilities.meeting).toBe(false);
    // Fermer la réunion ne touche rien d'autre.
    expect(capabilities.dictation).toBe(true);
    expect(capabilities.history).toBe(true);
  });

  test("Nova Personal la garde, quoi qu'un serveur annonce", () => {
    const personal = resolveOrganizationContext({
      edition: "personal",
      server: parseServerIdentity(me({ closed_capabilities: ["meeting"] })),
    });
    expect(personal.capabilities.meeting).toBe(true);
  });
});
