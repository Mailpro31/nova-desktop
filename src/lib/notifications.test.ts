import { describe, expect, test } from "bun:test";
import { toast } from "sonner";

import "./notifications";

/**
 * Les notifications disparaissaient au bout de 4 s (n° 91) : un lecteur lent
 * n'avait pas le temps de lire « Collage impossible — texte copié… ».
 */
describe("notifications", () => {
  test("an error stays until it is closed", () => {
    toast.error("Collage impossible");
    const last = toast.getHistory().at(-1) as { duration?: number };
    expect(last.duration).toBe(Infinity);
  });

  test("an error keeps a duration it asks for", () => {
    toast.error("Bref", { duration: 3000 });
    const last = toast.getHistory().at(-1) as { duration?: number };
    expect(last.duration).toBe(3000);
  });
});
