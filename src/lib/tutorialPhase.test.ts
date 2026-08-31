import { describe, expect, it } from "bun:test";

import {
  isTutorialLoading,
  tutorialPhase,
  type TutorialSignals,
} from "./tutorialPhase";

/**
 * Régression : la carte « Essayez Nova » restait bloquée sur
 * « Application du Style… ».
 *
 * Sur le poste Lab, le serveur a répondu HTTP 400, le repli local n'avait aucun
 * modèle, et `actions.rs` a enregistré une entrée d'historique à **texte vide**
 * (« save entry with empty text so user can retry »). L'écran l'a prise pour une
 * dictée en attente de reformulation et a fait tourner sa roue indéfiniment,
 * pendant que deux notifications annonçaient l'échec.
 *
 * Ces tests tiennent une propriété, pas une mise en page : **rien ne peut
 * laisser l'interface en chargement**.
 */

const nothingYet: TutorialSignals = {
  rawText: null,
  polishedText: null,
  failed: false,
  polishTimedOut: false,
};

describe("carte du tutoriel", () => {
  it("attend la dictée tant que rien n'est arrivé", () => {
    expect(tutorialPhase(nothingYet)).toBe("waiting");
  });

  it("montre la reformulation en cours, et c'est le seul chargement", () => {
    const phase = tutorialPhase({ ...nothingYet, rawText: "Bonjour" });
    expect(phase).toBe("polishing");
    expect(isTutorialLoading(phase)).toBe(true);
  });

  it("traite une entrée à texte vide comme un échec, jamais comme une attente", () => {
    // C'est l'entrée que `actions.rs` enregistre après une dictée ratée.
    for (const empty of ["", "   ", "\n"]) {
      const phase = tutorialPhase({ ...nothingYet, rawText: empty });
      expect(phase).toBe("failed");
      expect(isTutorialLoading(phase)).toBe(false);
    }
  });

  it("sort du chargement dès qu'un échec est signalé", () => {
    const phase = tutorialPhase({
      ...nothingYet,
      rawText: "Bonjour",
      failed: true,
    });
    expect(phase).toBe("failed");
    expect(isTutorialLoading(phase)).toBe(false);
  });

  it("cesse d'attendre la reformulation au-delà du délai", () => {
    const phase = tutorialPhase({
      ...nothingYet,
      rawText: "Bonjour",
      polishTimedOut: true,
    });
    // Le texte brut reste montré : la dictée a réussi, seule la reformulation
    // n'est pas venue.
    expect(phase).toBe("captured");
    expect(isTutorialLoading(phase)).toBe(false);
  });

  it("montre le succès même si une erreur est survenue ensuite", () => {
    const phase = tutorialPhase({
      rawText: "Bonjour",
      polishedText: "Bonjour !",
      failed: true,
      polishTimedOut: true,
    });
    expect(phase).toBe("polished");
    expect(isTutorialLoading(phase)).toBe(false);
  });

  it("ne reste jamais en chargement quand un signal de sortie est présent", () => {
    // L'invariant, sur toutes les combinaisons : dès qu'un échec, un texte vide
    // ou un délai dépassé est là, l'interface est de nouveau utilisable.
    const texts = [null, "", "   ", "Bonjour"];
    const polished = [null, "", "Bonjour !"];
    const flags = [false, true];
    let loadingSeen = 0;

    for (const rawText of texts) {
      for (const polishedText of polished) {
        for (const failed of flags) {
          for (const polishTimedOut of flags) {
            const signals = { rawText, polishedText, failed, polishTimedOut };
            const phase = tutorialPhase(signals);
            expect(phase).toBeTruthy();

            if (isTutorialLoading(phase)) {
              loadingSeen += 1;
              // Un chargement n'est légitime que sans aucun signal de sortie.
              expect(failed).toBe(false);
              expect(polishTimedOut).toBe(false);
              expect(rawText !== null && rawText.trim() !== "").toBe(true);
            }
          }
        }
      }
    }

    // Et l'état de chargement reste atteignable : ce n'est pas du code mort.
    expect(loadingSeen).toBeGreaterThan(0);
  });
});
