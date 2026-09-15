import type { OrganizationType } from "./model";

/**
 * Les fonctions servies par l'organisation que Réglages propose.
 *
 * ## Le défaut corrigé
 *
 * Le cours AI Essentials avait un écran, et le serveur le servait
 * (`/api/ai-skills`), mais rien ne l'affichait : un membre ne pouvait pas
 * reprendre le cours après le premier lancement. Les notes d'ingénieur sont
 * devenues la catégorie « Notes structurées » de la barre latérale.
 *
 * ## La règle
 *
 * - AI Essentials : capacité `aiSkills` **et** politique AI Skills active,
 *   **et** une école annoncée par le serveur — le cours est écrit pour des
 *   études (« your studies », « course policy ») ; une entreprise, ou un
 *   serveur qui ne s'est pas identifié, ne le reçoit pas.
 */
export interface OrganizationSettingsToolsInput {
  aiSkillsCapability: boolean;
  aiSkillsPolicyEnabled: boolean;
  /** Nature annoncée par le serveur, `null` tant qu'il n'a rien dit. */
  organizationType: OrganizationType | null;
}

export interface OrganizationSettingsTools {
  aiEssentials: boolean;
}

export function organizationSettingsTools(
  input: OrganizationSettingsToolsInput,
): OrganizationSettingsTools {
  return {
    aiEssentials:
      input.aiSkillsCapability &&
      input.aiSkillsPolicyEnabled &&
      input.organizationType === "education",
  };
}
