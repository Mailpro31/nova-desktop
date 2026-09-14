import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

import { accountRoleLabels } from "./accountRoles";

/**
 * La page Organisation affichait « Rôle : student » pour un administrateur de
 * l'organisation.
 *
 * Deux défauts dans une ligne : la valeur brute du serveur (`users.role`, un
 * métier) s'affichait sans traduction, et le rôle d'administration Nova
 * (`membership.security_role`), lui, n'apparaissait nulle part.
 */

describe("rôles affichés sur la page Organisation", () => {
  test("le métier est traduit, jamais affiché tel que le serveur l'écrit", () => {
    expect(accountRoleLabels({ role: "student" })).toEqual({
      memberType: "campus.roles.student",
      securityRole: null,
    });
    expect(accountRoleLabels({ role: "Teacher " }).memberType).toBe(
      "campus.roles.teacher",
    );
  });

  test("un métier inconnu n'est pas affiché plutôt qu'inventé", () => {
    expect(accountRoleLabels({ role: "wizard" }).memberType).toBeNull();
    expect(accountRoleLabels({ role: "" }).memberType).toBeNull();
  });

  test("un administrateur de l'organisation est présenté comme tel", () => {
    expect(
      accountRoleLabels({
        role: "student",
        membership: { security_role: "organization_admin" },
      }),
    ).toEqual({
      memberType: "campus.roles.student",
      securityRole: "campus.account.securityRoles.organization_admin",
    });
    expect(
      accountRoleLabels({
        role: "staff",
        membership: { security_role: "it_admin" },
      }).securityRole,
    ).toBe("campus.account.securityRoles.it_admin");
  });

  test("un simple membre n'a pas de ligne d'administration", () => {
    for (const security_role of ["member", null, undefined, "super_admin"]) {
      expect(
        accountRoleLabels({ role: "student", membership: { security_role } })
          .securityRole,
      ).toBeNull();
    }
  });

  test("chaque libellé possible existe dans les 22 langues", () => {
    const keys = [
      ...["student", "teacher", "staff", "employee", "manager", "partner"].map(
        (role) => accountRoleLabels({ role }).memberType,
      ),
      ...["organization_admin", "it_admin"].map(
        (security_role) =>
          accountRoleLabels({ role: "", membership: { security_role } })
            .securityRole,
      ),
      "campus.account.access",
    ];
    const locales = readdirSync("src/i18n/locales");
    expect(locales).toHaveLength(22);
    for (const locale of locales) {
      const tree = JSON.parse(
        readFileSync(`src/i18n/locales/${locale}/translation.json`, "utf8"),
      );
      const missing = keys.filter((key) => {
        let node: unknown = tree;
        for (const part of String(key).split(".")) {
          node = (node as Record<string, unknown> | undefined)?.[part];
        }
        return typeof node !== "string" || node.trim() === "";
      });
      expect({ locale, missing }).toEqual({ locale, missing: [] });
    }
  });

  test("la page n'affiche plus la valeur brute du serveur", () => {
    const page = readFileSync(
      "src/components/settings/organization/CampusOrganizationSettings.tsx",
      "utf8",
    );
    expect(page).not.toContain("value={profile.role}");
    expect(page).toContain("accountRoleLabels");
  });
});
