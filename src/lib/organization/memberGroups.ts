import type { OrganizationMember } from "./model";

/**
 * Les noms des groupes à montrer au membre.
 *
 * Rien quand l'organisation masque l'affichage — le serveur n'en envoie de
 * toute façon aucun. La cohorte historique est écartée : elle a déjà sa ligne,
 * et la répéter la ferait passer pour un second groupe.
 */
export function memberGroupLabels(
  member: OrganizationMember | null | undefined,
): string[] {
  if (!member || !member.groupsVisible) return [];
  return member.groups
    .filter((group) => group.source !== "legacy_cohort")
    .map((group) => group.label);
}
