import {
  currentEdition,
  currentOrganizationType,
} from "@/lib/organization/edition";

export type NovaMode = "campus" | "personal";

export function getNovaMode(): NovaMode {
  return isCampusMode() ? "campus" : "personal";
}

/**
 * Le poste est-il un poste Campus ?
 *
 * Conservé tel quel pour les appelants existants, mais exprimé désormais dans
 * le modèle Organization : « édition organisation, de type éducation ». Ce
 * détour est le seul point de contact entre l'ancien vocabulaire et le
 * nouveau — le jour où un build Organization servira aussi Business, seul le
 * calcul de `currentOrganizationType()` changera, et aucun des appelants de
 * `isCampusMode()` n'aura à être touché pour rester correct.
 *
 * Le code neuf devrait interroger une capacité (`can(ctx, "aiSkills")`) plutôt
 * que l'édition : voir `@/lib/organization`.
 */
export function isCampusMode(): boolean {
  return (
    currentEdition() === "organization" &&
    currentOrganizationType() === "education"
  );
}
