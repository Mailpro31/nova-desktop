/**
 * Découpe un texte en morceaux, en marquant les mots que la relecture du
 * serveur a changés (1.2) : ce sont les mots à vérifier. Comparaison sans
 * casse, sur des mots entiers.
 */
export function splitDoubtful(
  text: string,
  words: string[],
): { text: string; doubtful: boolean }[] {
  const wanted = new Set(words.map((word) => word.toLocaleLowerCase()));
  if (wanted.size === 0) return [{ text, doubtful: false }];
  // Mots (lettres, chiffres, apostrophes et tirets internes) et le reste.
  return (
    text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*|[^\p{L}\p{N}]+/gu) ?? []
  ).map((part) => ({
    text: part,
    doubtful: wanted.has(part.toLocaleLowerCase()),
  }));
}
