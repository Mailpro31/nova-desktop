import { describe, expect, test } from "bun:test";
import { snippetWays } from "./OrganizationSnippetsSection";

// Même lecture que le serveur (`snippet_triggers`) et que le poste
// (`writing_aids::snippet_triggers`) : ce que l'écran montre est exactement
// ce que l'élève peut dire.
describe("les façons de dire un snippet", () => {
  test("virgule et barre verticale séparent les façons", () => {
    expect(
      snippetWays("mon numéro étudiant, mon matricule | mon numéro IPSA"),
    ).toEqual(["mon numéro étudiant", "mon matricule", "mon numéro IPSA"]);
  });

  test("une virgule dans une phrase ne la coupe pas", () => {
    expect(snippetWays("Cordialement, Sasha Martin")).toEqual([
      "Cordialement, Sasha Martin",
    ]);
    expect(snippetWays("bonjour, merci | ma signature")).toEqual([
      "bonjour, merci",
      "ma signature",
    ]);
  });

  test("ni doublon, ni façon vide", () => {
    expect(snippetWays(" a b , c d|  A B,, ")).toEqual(["a b", "c d"]);
    expect(snippetWays("mon lien visio")).toEqual(["mon lien visio"]);
  });
});
