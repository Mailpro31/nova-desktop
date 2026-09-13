import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import type { OrganizationType } from "@/lib/organization/model";
import {
  announcedTypeFrom,
  wordingKey,
  type WordingId,
} from "@/lib/organization/wording";
import { useCampusStore } from "@/stores/campusStore";

type CampusState = ReturnType<typeof useCampusStore.getState>;

/** Nature annoncée : `/api/me` d'abord, `/api/config` ensuite, sinon rien. */
function announcedType(state: CampusState): OrganizationType | null {
  return announcedTypeFrom(
    state.serverIdentity?.organizationType,
    state.config?.organization_type,
  );
}

/**
 * Clé de vocabulaire, lue hors de React.
 *
 * Pour un écouteur d'événement qui doit choisir ses mots au moment où il
 * parle — par exemple quand une session vient d'expirer, avant que le contexte
 * de l'organisation ne soit effacé.
 */
export function currentOrganizationWordingKey(id: WordingId): string {
  return wordingKey(id, announcedType(useCampusStore.getState()));
}

/**
 * Traduit un texte avec le vocabulaire de l'organisation courante.
 *
 * Une école, annoncée comme telle par son serveur, garde « Campus » et
 * « établissement » ; toute autre organisation — ou une organisation dont on
 * ne sait encore rien — lit un vocabulaire neutre.
 */
export function useOrganizationWording(): (id: WordingId) => string {
  const { t } = useTranslation();
  const organizationType = useCampusStore(announcedType);
  return useCallback(
    (id: WordingId) => t(wordingKey(id, organizationType)),
    [t, organizationType],
  );
}
