import type { OrganizationType } from "@/lib/organization/model";
import { wordingKey } from "@/lib/organization/wording";

export type HomeEngineKey = "campus" | "local-fallback" | "local";

/**
 * La clé de traduction de la rangée « Moteur » de l'accueil.
 *
 * Le serveur de l'organisation se nomme selon ce que le serveur a annoncé :
 * « le serveur de votre établissement » pour une école, un libellé neutre
 * sinon. Le moteur local se dit pareil partout.
 *
 * La valeur interne reste `campus`, celle que produit `useSystemReadiness` ;
 * c'est la **clé de traduction** qui avait été renommée sans elle, d'où la clé
 * brute `home.engine.campus` affichée sur l'accueil.
 */
export function homeEngineLabelKey(
  engine: HomeEngineKey,
  organizationType: OrganizationType | null,
): string {
  if (engine === "campus") return wordingKey("engineServer", organizationType);
  return `home.engine.${engine}`;
}
