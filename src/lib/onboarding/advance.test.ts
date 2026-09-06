import { describe, expect, it } from "bun:test";

import { advanceFrom } from "./advance";

/**
 * Ces tests existent pour une panne précise et déjà survenue : sur un poste
 * Lab, l'écran « Vous êtes connecté à … » affichait un bouton « Commencer à
 * utiliser Nova » qui ne faisait rien. Pas d'erreur, pas de message — le même
 * écran, indéfiniment, et seul un redémarrage de l'application en sortait.
 *
 * La cause n'était pas dans le bouton : il appelait bien ce qu'il devait. Elle
 * était dans l'avancement, qui refusait de dépasser la dernière étape et
 * laissait donc l'écran courant à l'affichage.
 */
describe("l'avancement du parcours de première ouverture", () => {
  it("passe d'une étape à la suivante", () => {
    expect(advanceFrom(0, 3)).toEqual({ index: 1, finished: false });
    expect(advanceFrom(1, 3)).toEqual({ index: 2, finished: false });
  });

  it("quitte la dernière étape au lieu d'y rester", () => {
    // Le cœur de la panne : depuis la dernière étape, l'index doit sortir de
    // la liste. Tant qu'il y restait, l'étape courante n'était jamais nulle et
    // l'application ne reprenait jamais la main.
    const apres = advanceFrom(2, 3);
    expect(apres.index).toBe(3);
    expect(apres.finished).toBe(true);
  });

  it("termine aussi un parcours qui n'a qu'une seule étape", () => {
    // C'est exactement le cas rencontré : une session à établir, et rien
    // d'autre. La dernière étape était aussi la première.
    expect(advanceFrom(0, 1)).toEqual({ index: 1, finished: true });
  });

  it("ne signale la fin qu'une fois", () => {
    // Un second appel ne doit pas rejouer la fin du parcours : elle écrit un
    // réglage et prévient l'application.
    expect(advanceFrom(3, 3)).toEqual({ index: 3, finished: false });
  });

  it("n'invente pas une fin pour un parcours vide", () => {
    // Personne n'a rien parcouru : il n'y a rien à terminer, et surtout rien à
    // enregistrer comme accompli.
    expect(advanceFrom(0, 0)).toEqual({ index: 0, finished: false });
  });
});
