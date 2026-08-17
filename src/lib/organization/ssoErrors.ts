import type { SsoError } from "@/bindings";

/**
 * Traduction des échecs de connexion Organization en message affichable.
 *
 * Deux principes :
 *
 * 1. **l'utilisateur reçoit une phrase, pas un code.** « TENANT_NOT_ALLOWED »
 *    ne lui apprend rien et ressemble à une panne ; « ce compte Microsoft ne
 *    fait pas partie de votre établissement » lui dit quoi faire ;
 * 2. **aucun détail technique n'apparaît.** Ni tenant, ni identifiant
 *    d'application, ni jeton, ni adresse de serveur. Le code de raison reste
 *    dans les journaux, où il sert au diagnostic.
 *
 * Une annulation ne produit aucun message : l'utilisateur vient de fermer la
 * fenêtre, il sait pourquoi il n'est pas connecté. Lui afficher une erreur
 * reviendrait à lui reprocher son propre geste.
 */

/** Codes renvoyés par le serveur de l'établissement, tels quels. */
const NOT_IN_ORGANIZATION = new Set([
  "TENANT_NOT_ALLOWED",
  "ORGANIZATION_MISMATCH",
  "MEMBERSHIP_NOT_FOUND",
]);

const ACCESS_REVOKED = new Set(["ACCOUNT_DISABLED"]);

export type TranslateFn = (key: string) => string;

/**
 * Message à afficher, ou `null` quand il ne faut rien dire.
 */
export function formatSsoError(error: SsoError, t: TranslateFn): string | null {
  switch (error.code) {
    case "AuthCancelled":
      return null;
    case "AuthTimeout":
      return t("campus.microsoft.expired");
    case "NetworkError":
      return t("campus.onboarding.errors.network");
    case "AlreadyInProgress":
    case "StateMismatch":
    case "LoopbackUnavailable":
      return t("campus.microsoft.failed");
    case "Server": {
      if (NOT_IN_ORGANIZATION.has(error.detail)) {
        return t("campus.microsoft.notInOrganization");
      }
      if (ACCESS_REVOKED.has(error.detail)) {
        return t("campus.microsoft.accessRevoked");
      }
      return t("campus.microsoft.failed");
    }
    default:
      return t("campus.microsoft.failed");
  }
}
