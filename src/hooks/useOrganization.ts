import { useEffect, useState } from "react";

import { commands } from "@/bindings";
import { useCampusStatus } from "./useCampusStatus";

export interface Organization {
  /** Nom affiché de l'établissement. */
  name: string;
  /** Forme courte, employée dans « Géré par … ». */
  shortName: string;
  /** `true` quand le nom vient du serveur, `false` s'il est dérivé de l'hôte. */
  authoritative: boolean;
}

/**
 * Identité de l'établissement, pour le bloc bas de la barre latérale.
 *
 * **Aucun nom d'établissement n'est codé en dur** : l'architecture doit servir
 * n'importe quelle université.
 *
 * Source de vérité : `GET /api/me`, qui renvoie le champ `organization` déduit
 * côté serveur du domaine de l'adresse. Tant que la réponse n'est pas arrivée —
 * ou si le serveur est injoignable, ou plus ancien que ce champ — on retombe
 * sur un libellé dérivé de l'hôte, marqué comme non faisant autorité.
 */
export function useOrganization(): Organization | null {
  const { serverName, session } = useCampusStatus();
  const [fromServer, setFromServer] = useState<string | null>(null);

  useEffect(() => {
    if (!session) {
      setFromServer(null);
      return;
    }
    let cancelled = false;
    commands
      .getCampusMe()
      .then((result) => {
        if (cancelled || result.status !== "ok") return;
        const name = result.data.organization?.trim();
        if (name) setFromServer(name);
      })
      .catch(() => {
        // Serveur injoignable : le repli dérivé de l'hôte reste affiché.
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  if (fromServer) {
    return {
      name: fromServer,
      shortName: fromServer,
      authoritative: true,
    };
  }

  if (!serverName) return null;

  return {
    name: serverName,
    shortName: deriveShortName(serverName),
    authoritative: false,
  };
}

/**
 * Libellé court dérivé de l'hôte : `nova.ipsa.fr` → `IPSA`. Heuristique de
 * repli uniquement — on prend l'étiquette de domaine juste avant le suffixe.
 * Si l'hôte n'a pas cette forme, on retombe sur l'hôte complet plutôt que
 * d'inventer un nom.
 */
function deriveShortName(host: string): string {
  const labels = host.split(".").filter(Boolean);
  if (labels.length < 2) return host;
  const label = labels[labels.length - 2];
  return label.length <= 4 ? label.toUpperCase() : capitalize(label);
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
