import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { purposeOptionsFor } from "./purposes";

/**
 * Le premier lancement d'un salarié.
 *
 * Le branchement portait sur `teacher` puis `staff`, et servait sinon les
 * options d'un étudiant. Comme le serveur attribue `employee` par défaut à une
 * organisation `business`, un salarié de l'administration se voyait proposer
 * « projets d'ingénierie » et « programmation » pour configurer Nova.
 *
 * Ces tests fixent la règle : le regroupement porte sur ce que la personne
 * écrit, jamais sur la nature de son organisation.
 */

const ids = (role: string | null | undefined) =>
  purposeOptionsFor(role).map((option) => option.id);

describe("options du premier lancement", () => {
  test("un salarié reçoit les options administratives", () => {
    expect(ids("employee")).toEqual(["emails", "documents", "everything"]);
  });

  test("un encadrant reçoit les mêmes : il rédige les mêmes choses", () => {
    expect(ids("manager")).toEqual(ids("employee"));
  });

  test("un agent d'établissement reçoit les mêmes qu'un salarié", () => {
    // C'est le point de l'unification : le jeu d'options suit le métier, pas
    // la nature de l'organisation.
    expect(ids("staff")).toEqual(ids("employee"));
  });

  test("aucun salarié ne se voit proposer de coder ou de suivre des cours", () => {
    for (const role of ["employee", "manager", "staff"]) {
      expect(ids(role)).not.toContain("coding");
      expect(ids(role)).not.toContain("classes");
      expect(ids(role)).not.toContain("engineering");
    }
  });

  test("un enseignant garde ses supports et ses retours", () => {
    expect(ids("teacher")).toEqual([
      "courseNotes",
      "feedback",
      "emails",
      "everything",
    ]);
  });

  test("un étudiant garde son jeu complet", () => {
    expect(ids("student")).toEqual([
      "classes",
      "engineering",
      "emails",
      "coding",
      "everything",
    ]);
  });

  test("un métier inconnu, absent ou vide retombe sur le jeu le plus large", () => {
    for (const role of [null, undefined, "", "   ", "other", "partner"]) {
      expect(ids(role)).toEqual(ids("student"));
    }
  });

  test("la casse et les espaces ne changent rien", () => {
    expect(ids("  Employee ")).toEqual(ids("employee"));
  });

  test("chaque option choisit un Style, et « un peu de tout » est partout", () => {
    for (const role of ["teacher", "staff", "employee", "manager", "student"]) {
      const options = purposeOptionsFor(role);
      expect(options.every((option) => option.promptId.length > 0)).toBe(true);
      expect(options.map((option) => option.id)).toContain("everything");
    }
  });
});

describe("le premier lancement emploie cette table", () => {
  const FIRST_RUN = join(
    import.meta.dir,
    "../../components/onboarding/CampusFirstRun.tsx",
  );

  test("il n'écrit plus le branchement à la main", () => {
    const code = readFileSync(FIRST_RUN, "utf-8");
    expect(code).toContain("purposeOptionsFor");
    // Le branchement en cascade sur le métier a disparu de l'écran.
    expect(code).not.toContain('role === "teacher"');
    expect(code).not.toContain('role === "staff"');
  });

  test("il lit le métier annoncé par le serveur en premier", () => {
    // `member.memberType` vient de `/api/me`, qui fait autorité ;
    // `organization.role` vient de la configuration déposée sur le poste et ne
    // sert que de repli.
    const code = readFileSync(FIRST_RUN, "utf-8");
    expect(code).toContain("member?.memberType");
    expect(code).toContain("useOrganizationContext");
  });
});
