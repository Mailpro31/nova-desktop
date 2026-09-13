import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import { commands } from "@/bindings";
import { isOrganizationMode } from "@/lib/mode";
import { useCampusStore } from "@/stores/campusStore";

/** Émis par le backend quand il refuse une dictée faute de connexion. */
const SIGN_IN_REQUIRED_EVENT = "campus-sign-in-required";

interface DeploymentPolicy {
  /** `false` quand la stratégie machine porte `PersonalFallback = 0`. */
  personal_fallback_allowed?: boolean;
}

/**
 * La connexion à l'organisation s'impose-t-elle à ce poste ?
 *
 * Par défaut, un poste Organization dont la session a été révoquée ou a
 * expiré continue en Personal. La DSI peut l'interdire par la stratégie
 * machine (`HKLM\SOFTWARE\Policies\Nova`, `PersonalFallback = 0`) : la connexion
 * redevient alors obligatoire — au lancement comme en cours de session.
 *
 * Sans réponse du backend, le repli reste autorisé, comme sans stratégie.
 * Le backend refuse de son côté toute dictée dans ce cas : un écran seul ne
 * suffirait pas, les raccourcis globaux restant actifs.
 */
export function useOrganizationSignInRequired(): boolean {
  const [fallbackAllowed, setFallbackAllowed] = useState(true);
  const signedOut = useCampusStore(
    (state) => state.connectionStatus === "signed_out",
  );

  useEffect(() => {
    if (!isOrganizationMode()) return;
    let active = true;

    invoke<DeploymentPolicy>("get_deployment_state")
      .then((state) => {
        if (active)
          setFallbackAllowed(state.personal_fallback_allowed !== false);
      })
      .catch(() => {});

    // Une dictée refusée depuis la barre des tâches : la fenêtre revient là
    // où la connexion attend, plutôt que de laisser un raccourci sans effet.
    const unlisten = listen(SIGN_IN_REQUIRED_EVENT, () => {
      void commands.showMainWindowCommand();
    });

    return () => {
      active = false;
      void unlisten.then((fn) => fn());
    };
  }, []);

  return isOrganizationMode() && !fallbackAllowed && signedOut;
}
