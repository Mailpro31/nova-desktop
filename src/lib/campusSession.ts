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
  server_url: string;
  organization?: unknown;
  capabilities?: unknown;
  education_mode?: string | null;
  ai_skills?: unknown;
  auth_methods?: string[] | null;
  privacy?: unknown;
}
