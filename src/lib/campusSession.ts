import { commands } from "@/bindings";
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

export async function saveCampusSession(session: CampusSession): Promise<void> {
  const result = await commands.saveCampusSession(session);
  if (result.status === "error") {
    throw new Error(result.error);
  }
}

export async function clearCampusSession(): Promise<void> {
  const result = await commands.clearCampusSession();
  if (result.status === "error") {
    throw new Error(result.error);
  }
}

export async function completeCampusOnboarding(): Promise<void> {
  const result = await commands.completeCampusOnboarding();
  if (result.status === "error") {
    throw new Error(result.error);
  }
}

export async function loadCampusConfig(): Promise<{
  server_url: string;
} | null> {
  const result = await commands.getCampusConfig();
  if (result.status === "ok") {
    return result.data;
  }
  console.error("Failed to load campus config:", result.error);
  return null;
}
