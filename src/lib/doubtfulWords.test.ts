import { describe, expect, test } from "bun:test";

import { splitDoubtful } from "./doubtfulWords";

describe("splitDoubtful", () => {
  test("marks only the whole words the reading changed", () => {
    const parts = splitDoubtful("Le nombre de Mach, et Machine.", ["mach"]);
    expect(
      parts.filter((part) => part.doubtful).map((part) => part.text),
    ).toEqual(["Mach"]);
    expect(parts.map((part) => part.text).join("")).toBe(
      "Le nombre de Mach, et Machine.",
    );
  });

  test("keeps the text whole when nothing is doubtful", () => {
    expect(splitDoubtful("Bonjour.", [])).toEqual([
      { text: "Bonjour.", doubtful: false },
    ]);
  });

  test("keeps elided and hyphenated words together", () => {
    const parts = splitDoubtful("l'aile porte-avions", ["porte-avions"]);
    expect(parts.find((part) => part.doubtful)?.text).toBe("porte-avions");
  });
});
