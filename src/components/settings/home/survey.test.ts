import { describe, expect, test } from "bun:test";

import { monthOf, surveyDue } from "./survey";

describe("le mini-sondage du pilote", () => {
  const november = new Date("2026-11-05T12:00:00Z");

  test("il revient une fois par mois", () => {
    expect(surveyDue(null, november)).toBe(true);
    expect(surveyDue("2026-10", november)).toBe(true);
    expect(surveyDue(monthOf(november), november)).toBe(false);
  });
});
