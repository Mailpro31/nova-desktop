import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { commands } from "@/bindings";
import {
  OrganizationApi,
  OrganizationApiError,
  isServerReachable,
  type CampusProfile,
  type OrganizationCatalogSnapshot,
} from "@/lib/organizationApi";
import {
  loadOrganizationConfig,
  loadOrganizationServerConfig,
  loadOrganizationSession,
  type CampusConfig,
  type CampusSession,
} from "@/lib/organizationSession";
import {
  resolveOrganizationConfig,
  type OrganizationConfig,
} from "@/lib/organizationConfig";
import {
  forgetOrganizationType,
  parseServerIdentity,
  rememberOrganizationType,
  type ServerIdentitySnapshot,
} from "@/lib/organization";
import { nextSuspended } from "@/lib/organization/suspension";

export type OrganizationConnectionStatus =
  | "checking"
  | "connected"
  | "local"
  | "suspended"
  | "signed_out";

interface OrganizationStoreState {
  config: CampusConfig | null;
  session: CampusSession | null;
  profile: CampusProfile | null;
  context: OrganizationConfig;
  /**
   * Ce que le serveur a annoncé sur le membre connecté, quand il porte le
   * contrat étendu. `null` avec un serveur plus ancien, hors ligne, ou avant la
   * première réponse — et c'est alors la compatibilité Campus qui s'applique.
   *
   * Ne contient jamais de jeton : la commande Rust ne renvoie ni le jeton de
   * session, ni le sujet externe de l'identité fédérée.
   */
  serverIdentity: ServerIdentitySnapshot | null;
  /**
   * Contenu publié par l'organisation — Styles et AI Skills.
   *
   * Récupéré **ici**, avec le reste du contexte : un fetch par écran finirait
   * par produire des versions différentes selon la page ouverte. `null` tant
   * que rien n'a été reçu, ce qui n'est pas la même chose qu'un catalogue vide.
   */
  organizationCatalog: OrganizationCatalogSnapshot | null;
  /**
   * L'organisation a suspendu ce membre : `/api/me` a répondu 403.
   *
   * Le poste se bloque alors — aucune dictée, pas de repli Personal, rien de
   * supprimé, session gardée — et revient de lui-même dès que `/api/me` répond
   * de nouveau. Hors ligne, l'état reste celui que le serveur a donné en dernier :
   * une coupure réseau ne suspend ni ne rétablit personne.
   */
  suspended: boolean;
  connectionStatus: OrganizationConnectionStatus;
  initialized: boolean;
  refreshing: boolean;
  refresh: () => Promise<void>;
  reset: () => void;
}

const emptyContext = resolveOrganizationConfig(null);

/**
 * Le backend route les dictées et débloque le palier Organization selon cet
 * état : il doit l'apprendre dès que le serveur l'a tranché.
 */
function tellBackendSuspended(suspended: boolean) {
  void commands.setCampusSuspended(suspended).catch(() => {});
}

export const useOrganizationStore = create<OrganizationStoreState>(
  (set, get) => ({
    config: null,
    session: null,
    profile: null,
    context: emptyContext,
    serverIdentity: null,
    organizationCatalog: null,
    suspended: false,
    connectionStatus: "checking",
    initialized: false,
    refreshing: false,
    refresh: async () => {
      if (get().refreshing) return;
      set({ refreshing: true });
      try {
        const [config, session] = await Promise.all([
          loadOrganizationConfig(),
          loadOrganizationSession(),
        ]);
        if (!session) {
          // Déconnecté : le contenu de l'organisation ne doit rien laisser
          // derrière lui, côté interface comme côté Rust. La nature du tenant
          // non plus — un poste ne doit pas continuer à se présenter comme
          // l'organisation qu'il servait pour quelqu'un qui n'y appartient plus.
          void invoke("clear_organization_packages").catch(() => {});
          forgetOrganizationType();
          tellBackendSuspended(false);
          set({
            config,
            session: null,
            profile: null,
            context: resolveOrganizationConfig(config),
            serverIdentity: null,
            organizationCatalog: null,
            suspended: false,
            connectionStatus: "signed_out",
            initialized: true,
          });
          return;
        }

        const reachable = await isServerReachable(session.server_url);
        let effectiveConfig = config;
        let profile: CampusProfile | null = null;
        let meStatus: number | "ok" = "ok";
        let catalog = get().organizationCatalog;
        if (reachable) {
          const api = new OrganizationApi(session.server_url);
          effectiveConfig =
            (await loadOrganizationServerConfig(session.server_url)) ?? config;
          try {
            profile = await api.getMe();
          } catch (caught) {
            profile = null;
            meStatus =
              caught instanceof OrganizationApiError ? caught.status : 0;
          }
          try {
            catalog = await api.refreshOrganizationPackages();
          } catch {
            // Hors d'atteinte ou serveur plus ancien : on garde le dernier
            // catalogue connu plutôt que de retirer un contenu que
            // l'organisation n'a pas dépublié.
          }
        }
        const suspended = nextSuspended(
          get().suspended,
          reachable
            ? { reachable: true, status: meStatus }
            : { reachable: false },
        );
        if (reachable) tellBackendSuspended(suspended);
        // La nature du tenant, dans l'ordre d'autorité : ce que `/api/me` annonce
        // d'abord, ce que la configuration publique déclare ensuite. Une source
        // muette n'efface rien — voir `organizationType.ts`.
        const identity = profile ? parseServerIdentity(profile) : null;
        rememberOrganizationType(effectiveConfig?.organization_type);
        rememberOrganizationType(identity?.organizationType);

        set({
          config: effectiveConfig,
          session,
          profile,
          context: resolveOrganizationConfig(effectiveConfig, profile),
          // Hors ligne, aucune identité serveur : mieux vaut l'absence qu'une
          // réponse périmée présentée comme autoritative.
          serverIdentity: identity,
          organizationCatalog: catalog,
          suspended,
          connectionStatus: suspended
            ? "suspended"
            : reachable
              ? "connected"
              : "local",
          initialized: true,
        });
      } finally {
        set({ refreshing: false });
      }
    },
    reset: () => {
      void invoke("clear_organization_packages").catch(() => {});
      forgetOrganizationType();
      tellBackendSuspended(false);
      set({
        config: null,
        session: null,
        profile: null,
        context: emptyContext,
        serverIdentity: null,
        organizationCatalog: null,
        suspended: false,
        connectionStatus: "signed_out",
        initialized: true,
        refreshing: false,
      });
    },
  }),
);

export function refreshOrganizationConfig(): Promise<void> {
  return useOrganizationStore.getState().refresh();
}
