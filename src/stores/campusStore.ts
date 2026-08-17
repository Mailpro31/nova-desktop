import { create } from "zustand";
import {
  CampusApi,
  isServerReachable,
  type CampusProfile,
} from "@/lib/campusApi";
import {
  loadCampusConfig,
  loadCampusServerConfig,
  loadCampusSession,
  type CampusConfig,
  type CampusSession,
} from "@/lib/campusSession";
import { resolveCampusContext, type CampusContext } from "@/lib/campusPolicy";
import {
  parseServerIdentity,
  type ServerIdentitySnapshot,
} from "@/lib/organization";

export type CampusConnectionStatus =
  | "checking"
  | "connected"
  | "local"
  | "signed_out";

interface CampusStoreState {
  config: CampusConfig | null;
  session: CampusSession | null;
  profile: CampusProfile | null;
  context: CampusContext;
  /**
   * Ce que le serveur a annoncé sur le membre connecté, quand il porte le
   * contrat étendu. `null` avec un serveur plus ancien, hors ligne, ou avant la
   * première réponse — et c'est alors la compatibilité Campus qui s'applique.
   *
   * Ne contient jamais de jeton : la commande Rust ne renvoie ni le jeton de
   * session, ni le sujet externe de l'identité fédérée.
   */
  serverIdentity: ServerIdentitySnapshot | null;
  connectionStatus: CampusConnectionStatus;
  initialized: boolean;
  refreshing: boolean;
  refresh: () => Promise<void>;
  reset: () => void;
}

const emptyContext = resolveCampusContext(null);

export const useCampusStore = create<CampusStoreState>((set, get) => ({
  config: null,
  session: null,
  profile: null,
  context: emptyContext,
  serverIdentity: null,
  connectionStatus: "checking",
  initialized: false,
  refreshing: false,
  refresh: async () => {
    if (get().refreshing) return;
    set({ refreshing: true });
    try {
      const [config, session] = await Promise.all([
        loadCampusConfig(),
        loadCampusSession(),
      ]);
      if (!session) {
        set({
          config,
          session: null,
          profile: null,
          context: resolveCampusContext(config),
          serverIdentity: null,
          connectionStatus: "signed_out",
          initialized: true,
        });
        return;
      }

      const reachable = await isServerReachable(session.server_url);
      let effectiveConfig = config;
      let profile: CampusProfile | null = null;
      if (reachable) {
        effectiveConfig =
          (await loadCampusServerConfig(session.server_url)) ?? config;
        try {
          profile = await new CampusApi(session.server_url).getMe();
        } catch {
          profile = null;
        }
      }
      set({
        config: effectiveConfig,
        session,
        profile,
        context: resolveCampusContext(effectiveConfig, profile),
        // Hors ligne, aucune identité serveur : mieux vaut l'absence qu'une
        // réponse périmée présentée comme autoritative.
        serverIdentity: profile ? parseServerIdentity(profile) : null,
        connectionStatus: reachable ? "connected" : "local",
        initialized: true,
      });
    } finally {
      set({ refreshing: false });
    }
  },
  reset: () =>
    set({
      config: null,
      session: null,
      profile: null,
      context: emptyContext,
      serverIdentity: null,
      connectionStatus: "signed_out",
      initialized: true,
      refreshing: false,
    }),
}));

export function refreshCampusContext(): Promise<void> {
  return useCampusStore.getState().refresh();
}
