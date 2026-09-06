/**
 * Où va le parcours quand une étape est terminée.
 *
 * Cette décision vivait dans un `setIndex` de `useOnboardingFlow`, et elle
 * portait une régression que rien ne pouvait attraper : à la dernière étape,
 * l'index restait sur place.
 *
 *     if (nextIndex >= steps.length) { finish(); return i; }
 *
 * `finish()` prévenait bien l'application, mais l'étape courante restait
 * `steps[i]` — donc l'écran restait affiché. Sur un poste où la connexion à
 * l'établissement était la dernière étape, cliquer « Commencer à utiliser
 * Nova » ne produisait rien de visible : l'écran se réaffichait à l'identique,
 * et seul un redémarrage de l'application permettait d'en sortir.
 *
 * L'index peut désormais atteindre `count`, une position hors liste qui n'est
 * pas une erreur : c'est ainsi que l'étape courante devient `null` et que
 * l'application prend la main. La fin du parcours est signalée par `finished`,
 * à l'appelant d'en tirer les effets — un calcul ne doit pas écrire ailleurs.
 */
export interface Advance {
  /** Le nouvel index. Vaut `count` quand le parcours est terminé. */
  index: number;
  /** Vrai au passage qui quitte la dernière étape, une seule fois. */
  finished: boolean;
}

export function advanceFrom(index: number, count: number): Advance {
  // Un parcours vide n'a rien à terminer : personne n'a rien parcouru.
  if (count === 0) return { index: 0, finished: false };
  const next = Math.min(index + 1, count);
  return { index: next, finished: next === count && index < count };
}
