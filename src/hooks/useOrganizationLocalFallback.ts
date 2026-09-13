import { useEffect, useRef } from "react";

import { commands } from "@/bindings";
import { isOrganizationMode } from "@/lib/mode";
import { chooseLocalFallbackModel } from "@/lib/organization/localFallback";

interface Options {
  /** Une session Organization existe sur ce poste. */
  signedIn: boolean;
  /** Langue de dictée du membre, `null` tant que les réglages ne sont pas lus. */
  language: string | null;
}

/**
 * Prépare, une fois par lancement, le modèle qui permet de dicter sans serveur.
 *
 * Rien n'est montré : ni écran, ni progression, ni notification. Le membre
 * dicte par son organisation pendant que le modèle arrive ; il ne découvre son
 * existence que le jour où le serveur ne répond plus. Un échec n'est pas
 * signalé non plus — le prochain lancement reprend le téléchargement là où il
 * s'est arrêté.
 */
export function useOrganizationLocalFallback({ signedIn, language }: Options) {
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !signedIn || language === null) return;
    if (!isOrganizationMode()) return;
    started.current = true;

    void (async () => {
      const available = await commands.getAvailableModels();
      if (available.status !== "ok") return;
      const model = chooseLocalFallbackModel(available.data, language);
      if (!model) return;
      const prepared = await commands.prepareLocalFallbackModel(model.id);
      if (prepared.status === "error") {
        console.warn("Local fallback model not prepared:", prepared.error);
      }
    })().catch((error) => {
      console.warn("Local fallback model not prepared:", error);
    });
  }, [signedIn, language]);
}
