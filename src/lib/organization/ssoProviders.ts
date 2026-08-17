import type { Edition } from "./model";

/**
 * Quels fournisseurs de connexion Organization proposer à l'écran.
 *
 * La règle tient en une phrase : **le poste n'invente rien**. Il affiche ce que
 * le serveur annonce, et rien d'autre. Un bouton qui mènerait à une erreur de
 * configuration est pire que pas de bouton du tout — l'utilisateur ne peut rien
 * en faire et croit à une panne de Nova.
 */

/** Fournisseurs modernes, tels que le serveur les annonce. */
export interface AnnouncedProviders {
  microsoft_entra: boolean;
  google_workspace: boolean;
  oidc?: boolean;
  /**
   * Libellé du bouton OIDC, choisi par l'organisation. **Affichage
   * uniquement** — il n'entre dans aucune décision de sécurité.
   */
  oidc_display_name?: string | null;
}

export type SignInOption =
  | "microsoft_entra"
  | "google_workspace"
  | "oidc"
  | "legacy_email_code";

/**
 * Libellé du bouton OIDC.
 *
 * Le serveur en fournit toujours un ; ce repli ne sert qu'au cas où il
 * l'omettrait. « Continue with OIDC » ne dirait rien à un utilisateur — le nom
 * du fournisseur, ou celui de l'établissement, oui.
 */
export const DEFAULT_OIDC_LABEL = "Company SSO";

export function oidcLabel(providers: AnnouncedProviders): string {
  return providers.oidc_display_name?.trim() || DEFAULT_OIDC_LABEL;
}

export interface SignInOptionsInput {
  edition: Edition;
  /** Fournisseurs annoncés par `/api/auth/providers`. */
  providers: AnnouncedProviders;
  /**
   * `auth_methods` de la configuration d'établissement. Un serveur antérieur au
   * SSO moderne n'annonce rien d'autre, et c'est par là que le Device Code
   * hérité reste atteignable.
   */
  authMethods?: readonly string[];
}

/**
 * Options de connexion à présenter, dans l'ordre d'affichage.
 *
 * En édition Personal, la liste est vide : aucune notion d'organisation n'y
 * existe, donc aucun bouton d'organisation ne doit y apparaître — pas même
 * désactivé.
 *
 * Le code par adresse reste toujours proposé en édition Organization : c'est le
 * chemin de repli quand un annuaire est indisponible, et le seul que tout
 * serveur sait servir.
 */
export function organizationSignInOptions(
  input: SignInOptionsInput,
): SignInOption[] {
  if (input.edition !== "organization") return [];

  const options: SignInOption[] = [];
  // Microsoft reste proposé si le serveur l'annonce, ou si la configuration
  // d'établissement déclare `entra` — c'est le cas d'un serveur qui ne connaît
  // que le Device Code hérité.
  if (input.providers.microsoft_entra || input.authMethods?.includes("entra")) {
    options.push("microsoft_entra");
  }
  // Google n'a pas d'équivalent hérité : il n'apparaît que s'il est réellement
  // configuré, mapping de domaine compris.
  if (input.providers.google_workspace) {
    options.push("google_workspace");
  }
  // Idem pour l'OIDC générique : sans émetteur déclaré, aucun bouton.
  if (input.providers.oidc) {
    options.push("oidc");
  }
  options.push("legacy_email_code");
  return options;
}
