import type { OrganizationType } from "./model";

/**
 * Les fonctions servies par l'organisation que Réglages propose.
 *
 * ## Le défaut corrigé
 *
 * Le cours AI Essentials et les notes d'ingénieur avaient chacun un écran, et
 * le serveur les servait (`/api/ai-skills`, `/api/engineering-notes`), mais
 * aucun écran n'était affiché : un membre ne pouvait ni reprendre le cours après
 * le premier lancement, ni trouver les notes que son organisation ouvrait.
 *
 * ## La règle
 *
 * - AI Essentials : capacité `aiSkills` **et** politique AI Skills active,
 *   **et** une école annoncée par le serveur — le cours est écrit pour des
 *   études (« your studies », « course policy ») ; une entreprise, ou un
 *   serveur qui ne s'est pas identifié, ne le reçoit pas ;
 * - notes d'ingénieur : la capacité `engineeringNotes`, que l'organisation soit
 *   une école ou une entreprise — leurs textes ne parlent pas d'établissement.
 */
export interface OrganizationSettingsToolsInput {
  aiSkillsCapability: boolean;
  aiSkillsPolicyEnabled: boolean;
  engineeringNotesCapability: boolean;
  /** Nature annoncée par le serveur, `null` tant qu'il n'a rien dit. */
  organizationType: OrganizationType | null;
}

export interface OrganizationSettingsTools {
  aiEssentials: boolean;
  engineeringNotes: boolean;
}

export function organizationSettingsTools(
  input: OrganizationSettingsToolsInput,
): OrganizationSettingsTools {
  return {
    aiEssentials:
      input.aiSkillsCapability &&
      input.aiSkillsPolicyEnabled &&
      input.organizationType === "education",
    engineeringNotes: input.engineeringNotesCapability,
  };
}
