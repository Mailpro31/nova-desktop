import type { EmailDiscoveryError } from "@/bindings";

/**
 * Ce qu'un refus de découverte dit à la personne qui le lit.
 *
 * Chaque motif a sa phrase : « ça n'a pas marché » n'aide personne à décider
 * s'il faut réessayer, appeler la DSI, ou saisir l'adresse à la main. La clé de
 * traduction vient du code Rust, jamais d'un message construit ici.
 */
export function emailDiscoveryErrorKey(
  error: EmailDiscoveryError | null,
): string {
  const code = error?.code ?? "";
  const screaming = code.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
  const known = [
    "EMAIL_INVALID",
    "DNS_UNAVAILABLE",
    "RECORD_NOT_FOUND",
    "ENDPOINT_INVALID",
    "ENDPOINT_OUTSIDE_DOMAIN",
    "SERVER_UNREACHABLE",
    "DOMAIN_NOT_SERVED",
  ];
  // Un code inconnu — poste plus ancien que son serveur, ou l'inverse — reçoit
  // le message le plus général plutôt qu'une clé de traduction manquante.
  const resolved = known.includes(screaming) ? screaming : "DNS_UNAVAILABLE";
  return `campus.onboarding.email.discoveryErrors.${resolved}`;
}

/** Une adresse complète, seule condition pour tenter la découverte. */
export function looksLikeEmail(value: string): boolean {
  const trimmed = value.trim();
  const at = trimmed.indexOf("@");
  if (at <= 0 || trimmed.indexOf("@", at + 1) !== -1) return false;
  const domain = trimmed.slice(at + 1);
  return (
    domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".")
  );
}
