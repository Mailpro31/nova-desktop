import { useEffect, useState } from "react";

import {
  events,
  type DictationErrorKind,
  type DictationState,
} from "@/bindings";

/**
 * Durée d'affichage d'un échec avant retour au repos.
 *
 * L'overlay, lui, garde l'erreur jusqu'à ce que l'utilisateur en prenne acte —
 * c'est sa raison d'être. L'accueil n'est pas cette surface : y laisser une
 * erreur indéfiniment ferait croire que Nova est cassé alors que la dictée
 * suivante fonctionnera.
 */
const ERROR_LINGER_MS = 6000;

export interface DictationStatus {
  state: DictationState;
  error: DictationErrorKind | null;
}

const IDLE: DictationStatus = { state: "idle", error: null };

/**
 * État de dictée en direct, tel que le moteur le diffuse.
 *
 * **Reflet, jamais contrôleur.** Ce hook n'émet rien et ne déclenche rien ; il
 * écoute un événement dont Rust est propriétaire. Reconstruire l'état côté
 * React à partir d'indices — un raccourci pressé, une entrée d'historique
 * apparue — produirait un second état concurrent, faux dès la première erreur.
 *
 * Aucun sondage : l'événement est poussé, et le hook ne coûte rien au repos.
 */
export function useDictationState(): DictationStatus {
  const [status, setStatus] = useState<DictationStatus>(IDLE);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    let timer: number | undefined;

    void events.dictationStateEvent
      .listen((event) => {
        window.clearTimeout(timer);
        const next = {
          state: event.payload.state,
          error: event.payload.error,
        };
        setStatus(next);
        if (next.state === "error") {
          timer = window.setTimeout(() => setStatus(IDLE), ERROR_LINGER_MS);
        }
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      unlisten?.();
    };
  }, []);

  return status;
}
