import { describe, expect, test } from "bun:test";

import { paragraphsFromPdfLines, textParagraphs } from "./reader";

describe("paragraphsFromPdfLines", () => {
  test("rejoint les lignes d'une phrase coupée par la mise en page", () => {
    expect(
      paragraphsFromPdfLines([
        [
          "Le nombre de Reynolds compare",
          "les forces d'inertie aux forces",
          "visqueuses.",
          "Il est sans dimension :",
        ],
      ]),
    ).toEqual([
      "Le nombre de Reynolds compare les forces d'inertie aux forces visqueuses.",
      "Il est sans dimension :",
    ]);
  });

  test("recolle un mot coupé en fin de ligne", () => {
    expect(
      paragraphsFromPdfLines([["La mécani-", "que des fluides."]]),
    ).toEqual(["La mécanique des fluides."]);
  });

  test("écarte les numéros de page et ne mêle pas deux pages", () => {
    expect(
      paragraphsFromPdfLines([
        ["Fin de la page sans point", "  ", "12"],
        ["Début de la suivante."],
      ]),
    ).toEqual(["Fin de la page sans point", "Début de la suivante."]);
  });
});

test("textParagraphs : un paragraphe par ligne non vide", () => {
  expect(textParagraphs("Un.\n\n  Deux.  \r\nTrois.")).toEqual([
    "Un.",
    "Deux.",
    "Trois.",
  ]);
});
