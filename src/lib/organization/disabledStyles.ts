/**
 * Styles désactivés par l'organisation.
 *
 * Le serveur les nomme dans `style_policy.disabled_style_ids` de `/api/me`.
 * Hors connexion, aucune liste n'est connue : aucun Style n'est présenté comme
 * désactivé, et le poste continue d'appliquer la dernière liste reçue.
 */
export function disabledStyleSet(
  ids: readonly string[] | null | undefined,
): ReadonlySet<string> {
  return new Set(ids ?? []);
}
