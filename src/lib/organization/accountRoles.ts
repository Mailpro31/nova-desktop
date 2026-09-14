/**
 * Libellés des rôles d'un membre, pour la page Organisation.
 *
 * Deux informations distinctes, qui ne se remplacent pas :
 * - le **métier** (`users.role` : étudiant, enseignant…), qui ne confère aucun
 *   droit ;
 * - le **rôle de sécurité** Nova (`membership.security_role`), décidé par le
 *   serveur, qui dit qui administre l'organisation.
 *
 * On renvoie des clés de traduction, jamais la valeur du serveur : une valeur
 * inconnue n'est pas affichée plutôt qu'affichée brute.
 */

const MEMBER_TYPES = [
  "student",
  "teacher",
  "staff",
  "employee",
  "manager",
  "partner",
] as const;

/** Seuls les rôles qui administrent ont une ligne : un membre n'en a pas. */
const ADMIN_SECURITY_ROLES = ["organization_admin", "it_admin"] as const;

export interface AccountRoleLabels {
  memberType: string | null;
  securityRole: string | null;
}

export interface AccountRolesSource {
  role?: string | null;
  membership?: { security_role?: string | null } | null;
}

export function accountRoleLabels(me: AccountRolesSource): AccountRoleLabels {
  const role = me.role?.trim().toLowerCase() ?? "";
  const securityRole = me.membership?.security_role?.trim().toLowerCase() ?? "";
  return {
    memberType: (MEMBER_TYPES as readonly string[]).includes(role)
      ? `campus.roles.${role}`
      : null,
    securityRole: (ADMIN_SECURITY_ROLES as readonly string[]).includes(
      securityRole,
    )
      ? `campus.account.securityRoles.${securityRole}`
      : null,
  };
}
