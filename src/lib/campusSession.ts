import { commands } from "@/bindings";
import { invoke } from "@tauri-apps/api/core";
import type { CampusSession } from "@/bindings";

export type { CampusSession };

export async function loadCampusSession(): Promise<CampusSession | null> {
  const result = await commands.loadCampusSession();
  if (result.status === "ok") {
    return result.data;
  }
  console.error("Failed to load campus session:", result.error);
  return null;
}

export async function clearCampusSession(): Promise<void> {
  await invoke("logout_campus_session");
}

export async function completeCampusOnboarding(): Promise<void> {
  const result = await commands.completeCampusOnboarding();
  if (result.status === "error") {
    throw new Error(result.error);
  }
}

export async function loadCampusConfig(): Promise<CampusConfig | null> {
  const result = await commands.getCampusConfig();
  if (result.status === "ok") {
    return result.data;
  }
  console.error("Failed to load campus config:", result.error);
  return null;
}

export async function loadCampusServerConfig(
  serverUrl: string,
): Promise<CampusConfig | null> {
  try {
    return await invoke<CampusConfig>("fetch_campus_server_config", {
      serverUrl,
    });
  } catch {
    return null;
  }
}

export interface CampusConfig {
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
