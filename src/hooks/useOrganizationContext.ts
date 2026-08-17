import { useMemo } from "react";

import { useCampusStore } from "@/stores/campusStore";
import {
  currentEdition,
  currentOrganizationType,
  resolveOrganizationContext,
  type CapabilityId,
  type OrganizationContext,
} from "@/lib/organization";

/**
 * Contexte d'organisation courant, prêt à consommer par l'interface.
 *
 * Il se dérive de deux sources déjà en place : l'édition déclarée par le build
 * et la politique Campus tenue par `campusStore`. Rien n'est stocké en plus —
 * ajouter un second état d'organisation aurait garanti qu'il diverge du premier.
 *
 * En édition Personal, `campusStore` n'est jamais alimenté (`refresh()` n'est
 * appelé que sur un poste Campus) : le contexte renvoyé est alors purement
 * personnel, sans organisation.
 */
export function useOrganizationContext(): OrganizationContext {
  const campus = useCampusStore((state) => state.context);
  const serverIdentity = useCampusStore((state) => state.serverIdentity);
  const initialized = useCampusStore((state) => state.initialized);
  const edition = currentEdition();
  const organizationType = currentOrganizationType();

  return useMemo(
    () =>
      resolveOrganizationContext({
        edition,
        organizationType,
        // Tant que la première lecture n'a pas eu lieu, on ne présente pas la
        // politique par défaut comme si elle venait de l'établissement.
        campus: edition === "organization" && initialized ? campus : null,
        // Ordre de priorité : identité annoncée par le serveur, puis
        // compatibilité Campus, puis repli d'affichage. Jamais l'inverse.
        server: edition === "organization" ? serverIdentity : null,
      }),
    [edition, organizationType, initialized, campus, serverIdentity],
  );
}

/**
 * Raccourci de lecture d'une capacité, pour les composants qui n'ont besoin
 * que de celle-là.
 */
export function useCapability(capability: CapabilityId): boolean {
  return useOrganizationContext().capabilities[capability] === true;
}
