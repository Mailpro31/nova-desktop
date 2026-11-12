import type { CapabilityId } from "@/lib/organization";
import type { SidebarSection } from "@/components/Sidebar";

/** Capacité d'organisation qui porte chaque section ; absente = toujours ouverte. */
const SECTION_CAPABILITY: Partial<Record<SidebarSection, CapabilityId>> = {
  learn: "learning",
  meeting: "meeting",
  notes: "engineeringNotes",
  postprocessing: "writingStyles",
  prompts: "prompts",
  history: "history",
  aiskills: "commands",
  aiskilltools: "aiSkills",
};

export function sectionOpen(
  id: SidebarSection,
  capabilities: Partial<Record<CapabilityId, boolean>>,
): boolean {
  const capability = SECTION_CAPABILITY[id];
  return !capability || capabilities[capability] === true;
}
