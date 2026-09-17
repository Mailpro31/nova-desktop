import { describe, expect, test } from "bun:test";

import { parseServerIdentity } from "./identity";
import { memberGroupLabels } from "./memberGroups";

/**
 * Les groupes que le membre voit sur son poste.
 *
 * Le serveur décide : il n'envoie aucun nom quand l'organisation masque
 * l'affichage, et le dit par `groups_visible`. Le poste ne montre que ce qu'il
 * a reçu, et jamais la cohorte historique en double — elle a déjà sa ligne.
 */

const me = (membership: Record<string, unknown>) => ({
  email: "etudiant@exemple.fr",
  role: "student",
  cohort: "",
  contract_version: 2,
  membership: { security_role: "member", ...membership },
});

describe("Groupes du membre", () => {
  test("un serveur plus ancien, sans `groups_visible`, reste visible", () => {
    const snapshot = parseServerIdentity(me({ groups: [] }));
    expect(snapshot.member?.groupsVisible).toBe(true);
  });

  test("l'organisation peut masquer l'affichage", () => {
    const snapshot = parseServerIdentity(me({ groups: [], groups_visible: false }));
    expect(snapshot.member?.groupsVisible).toBe(false);
    expect(memberGroupLabels(snapshot.member)).toEqual([]);
  });

  test("les groupes reçus sont montrés, sans la cohorte historique", () => {
    const snapshot = parseServerIdentity(
      me({
        groups_visible: true,
        groups: [
          { id: "AERO2", label: "AERO2", source: "legacy_cohort", external_group_id: null },
          { id: "g1", label: "Aero 2", source: "scim", external_group_id: null },
          { id: "g2", label: "Club robotique", source: "manual", external_group_id: null },
        ],
      }),
    );
    expect(memberGroupLabels(snapshot.member)).toEqual(["Aero 2", "Club robotique"]);
  });

  test("sans membre, aucun groupe", () => {
    expect(memberGroupLabels(null)).toEqual([]);
  });
});
