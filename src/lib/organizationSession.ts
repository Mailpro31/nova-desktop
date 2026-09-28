import { commands } from "@/bindings";
import { invoke } from "@tauri-apps/api/core";
import type { OrganizationSession } from "@/bindings";

export type { OrganizationSession };

export async function loadOrganizationSession(): Promise<OrganizationSession | null> {
  const result = await commands.loadOrganizationSession();
  if (result.status === "ok") {
    return result.data;
  }
  console.error("Failed to load campus session:", result.error);
  return null;
}

export async function clearOrganizationSession(): Promise<void> {
  await invoke("logout_organization_session");
}

export async function completeOrganizationOnboarding(): Promise<void> {
  const result = await commands.completeOrganizationOnboarding();
  if (result.status === "error") {
    throw new Error(result.error);
  }
}

export async function loadOrganizationConfig(): Promise<OrganizationConfig | null> {
  const result = await commands.getOrganizationConfig();
  if (result.status === "ok") {
    return result.data;
  }
  console.error("Failed to load campus config:", result.error);
  return null;
}

export async function loadOrganizationServerConfig(
  serverUrl: string,
): Promise<OrganizationConfig | null> {
  try {
    return await invoke<OrganizationConfig>(
      "fetch_organization_server_config",
      {
        serverUrl,
      },
    );
  } catch {
    return null;
  }
}

export interface OrganizationConfig {
  /** Vide quand la DSI déclare une organisation à découvrir plutôt qu'une adresse. */
  server_url?: string;
  /** Identifiant d'organisation, pour le mode découverte. Pas un secret. */
  organization_code?: string | null;
  /** `dedicated` (défaut) ou `discovery`. */
  bootstrap_mode?: string | null;
  /**
   * `education` ou `business`, tel que l'organisation le déclare.
   *
   * C'est l'**amorçage** de la nature du tenant : il permet au poste de savoir
   * quoi présenter avant toute authentification. `/api/me` reste l'autorité une
   * fois le membre connecté — voir `organizationType.ts`. Absent avec un
   * serveur plus ancien, et le repli historique `education` s'applique alors.
   */
  organization_type?: string | null;
  organization?: unknown;
  capabilities?: unknown;
  education_mode?: string | null;
  ai_skills?: unknown;
  auth_methods?: string[] | null;
  privacy?: unknown;
}
