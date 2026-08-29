import React, { useEffect, useState } from "react";

import NovaCommandPalette from "./NovaCommandPalette";
import { useCampusStatus } from "../../hooks/useCampusStatus";
import { useSettings } from "../../hooks/useSettings";
import { events, type SelectionCapture } from "@/bindings";
import { isOrganizationMode } from "@/lib/mode";
import {
  clientCommandMessage,
  commandMessage,
  type CommandMessage,
} from "@/lib/commands/errors";

interface PaletteState {
  capture: SelectionCapture | null;
  error?: CommandMessage;
}

/**
 * Point de montage unique de Nova Commands.
 *
 * Écoute la capture émise par le raccourci natif et ouvre la palette — avec la
 * sélection, ou avec l'explication de son absence. Tout est conditionné :
 *
 * * **Campus uniquement** — le moteur de commande est `/api/command`. Il
 *   n'existe aucun équivalent local, et rien ici ne simule une capacité
 *   personnelle qui n'existe pas.
 * * **Hors ligne** — sans serveur joignable, la commande est refusée avant
 *   d'être tentée, en disant pourquoi.
 * * **Réglage expérimental** — le composant ne s'abonne pas tant que le
 *   drapeau est désactivé, ce qui est le cas par défaut. Sans abonnement et
 *   sans raccourci attribué, un étudiant ne peut pas déclencher la palette par
 *   accident.
 */
export const NovaCommandsHost: React.FC = () => {
  const { getSetting } = useSettings();
  const { session, connection } = useCampusStatus();
  const [state, setState] = useState<PaletteState | null>(null);

  const enabled =
    isOrganizationMode() && (getSetting("nova_commands_enabled") ?? false);

  useEffect(() => {
    if (!enabled) return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void events.novaCommandCaptureEvent
      .listen((event) => {
        const { capture, error } = event.payload;
        if (error) {
          setState({ capture: null, error: commandMessage(error) });
          return;
        }
        if (!capture) return;

        // Le serveur est le seul moteur : le dire maintenant évite d'ouvrir une
        // liste d'actions dont aucune ne pourrait aboutir.
        if (!session || connection === "local") {
          setState({
            capture: null,
            error: clientCommandMessage("offline"),
          });
          return;
        }
        setState({ capture });
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [enabled, session, connection]);

  if (!state) return null;

  return (
    <NovaCommandPalette
      capture={state.capture}
      session={session}
      initialError={state.error}
      // Fermer suffit : la capture a déjà restauré le presse-papiers, et rien
      // n'a été écrit dans le document.
      onClose={() => setState(null)}
    />
  );
};

export default NovaCommandsHost;
