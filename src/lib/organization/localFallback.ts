import type { ModelInfo } from "@/bindings";

/**
 * Le modèle local d'une organisation, pour les moments où son serveur ne
 * répond pas.
 *
 * L'édition Organization ne proposait aucun modèle : la dictée partait au
 * serveur, et son « repli local » n'avait rien pour transcrire. Ce choix ne
 * réinvente pas de classement : le catalogue arrive déjà dans l'ordre
 * éditorial que présente l'accueil Personal. Il écarte seulement ce qui ne
 * sait pas dicter dans la langue du membre, et préfère ce qui est déjà sur le
 * disque à un nouveau téléchargement.
 */

/** Un modèle hérité se télécharge par URL directe, hors du catalogue actuel. */
const isLegacySource = (model: ModelInfo): boolean =>
  typeof model.source === "object" && "Url" in model.source;

/** `fr-FR` compte pour `fr` ; `auto` ou rien n'impose aucune langue. */
function wantedLanguage(language: string): string | null {
  const base = language.trim().toLowerCase().split(/[-_]/)[0];
  return base && base !== "auto" ? base : null;
}

export function chooseLocalFallbackModel(
  models: ModelInfo[],
  language: string,
): ModelInfo | null {
  const wanted = wantedLanguage(language);
  const speaks = (model: ModelInfo) =>
    wanted === null || model.supported_languages.includes(wanted);
  const eligible = models.filter(
    (model) => !model.is_custom && !isLegacySource(model),
  );

  const installed = eligible.find(
    (model) => model.is_downloaded && speaks(model),
  );
  if (installed) return installed;

  const recommended = eligible.filter((model) => model.is_recommended);
  const fitting = recommended.find(speaks);
  if (fitting) return fitting;

  // Aucun recommandé ne parle la langue : celui qui en couvre le plus reste le
  // meilleur pari, plutôt que de laisser le poste sans aucune dictée locale.
  return recommended.reduce<ModelInfo | null>(
    (best, model) =>
      !best ||
      model.supported_languages.length > best.supported_languages.length
        ? model
        : best,
    null,
  );
}
