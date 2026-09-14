/**
 * Langue des leçons du serveur, comparée à celle de l'interface.
 *
 * Le catalogue Learn est écrit dans une seule langue (`locale`). Une interface
 * française montrait donc des leçons anglaises sans rien en dire. Seule la
 * langue compte, pas la région : un catalogue `en` n'est pas « étranger » à une
 * interface `en-US`.
 */
export function catalogLanguageDiffers(
  catalogLocale: string,
  uiLanguage: string,
): boolean {
  const catalog = baseLanguage(catalogLocale);
  if (!catalog) return false;
  return catalog !== baseLanguage(uiLanguage);
}

/**
 * Nom de la langue du catalogue, dans la langue de l'interface (« anglais » pour
 * une interface française). Repli sur le code si le navigateur ne sait pas le
 * nommer.
 */
export function languageName(
  catalogLocale: string,
  uiLanguage: string,
): string {
  const code = catalogLocale.trim();
  try {
    return (
      new Intl.DisplayNames([uiLanguage], { type: "language" }).of(code) ?? code
    );
  } catch {
    return code;
  }
}

function baseLanguage(locale: string): string {
  return locale.trim().toLowerCase().split(/[-_]/)[0] ?? "";
}
