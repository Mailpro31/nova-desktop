import { create } from "zustand";
import {
  CampusApi,
  isServerReachable,
  type CampusProfile,
} from "@/lib/campusApi";
import {
  loadCampusConfig,
  loadCampusSession,
  type CampusConfig,
  type CampusSession,
} from "@/lib/campusSession";
import { resolveCampusContext, type CampusContext } from "@/lib/campusPolicy";

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
          connectionStatus: "signed_out",
          initialized: true,
        });
        return;
      }

      const reachable = await isServerReachable(session.server_url);
      let profile: CampusProfile | null = null;
      if (reachable) {
        try {
          profile = await new CampusApi(session.server_url).getMe();
        } catch {
          profile = null;
        }
      }
      set({
        config,
        session,
        profile,
        context: resolveCampusContext(config, profile),
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
      connectionStatus: "signed_out",
      initialized: true,
      refreshing: false,
    }),
}));

export function refreshCampusContext(): Promise<void> {
  return useCampusStore.getState().refresh();
}
