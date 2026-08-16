/**
 * Ce que l'établissement fournit réellement, et où passent les données.
 *
 * Chaque entrée est adossée à un point de terminaison vérifié dans
 * `nova-server/main.py`. Rien n'est déduit d'une intention produit : une
 * capacité absente du serveur n'apparaît pas ici, et une formulation qui
 * dépasserait le comportement réel est un défaut, pas une approximation.
 *
 * ## Chemin des données, tel qu'il est
 *
 * | Donnée | Destination |
 * |---|---|
 * | audio de dictée | serveur de l'établissement → moteur de transcription |
 * | texte à reformuler | serveur de l'établissement → moteur de langage |
 * | texte d'un AI Skill | serveur de l'établissement → moteur de langage |
 * | vocabulaire, raccourcis, règles | serveur de l'établissement (stockés) |
 * | historique et fichiers audio | cet appareil uniquement |
 * | nom d'application au premier plan | cet appareil uniquement |
 *
 * Le serveur compte le **nombre** de transcriptions et de reformulations par
 * jour et par compte (`count_usage`). Il n'enregistre pas leur contenu.
 */

export type DataLocation = "device" | "campus";

export interface CampusCapability {
  id: string;
  titleKey: string;
  descriptionKey: string;
  /** `true` quand la capacité disparaît si le serveur est injoignable. */
  requiresServer: boolean;
}

/**
 * Capacités vérifiées. Absentes volontairement : Styles distribués, AI Skills
 * administrés, politiques d'usage — le serveur n'en distribue aucun.
 */
export const CAMPUS_CAPABILITIES: CampusCapability[] = [
  {
    id: "transcription",
    titleKey: "campus.provides.transcription.title",
    descriptionKey: "campus.provides.transcription.description",
    requiresServer: true,
  },
  {
    id: "rewriting",
    titleKey: "campus.provides.rewriting.title",
    descriptionKey: "campus.provides.rewriting.description",
    requiresServer: true,
  },
  {
    id: "vocabulary",
    titleKey: "campus.provides.vocabulary.title",
    descriptionKey: "campus.provides.vocabulary.description",
    requiresServer: true,
  },
  {
    id: "formatting",
    titleKey: "campus.provides.formatting.title",
    descriptionKey: "campus.provides.formatting.description",
    requiresServer: true,
  },
];

export interface DataRow {
  id: string;
  labelKey: string;
  location: DataLocation;
}

/**
 * Où va quoi. Deux emplacements seulement, parce qu'il n'en existe que deux :
 * l'appareil, et le serveur de l'établissement. Nova Campus n'appelle aucun
 * service tiers depuis le poste — ce que le serveur fait ensuite de son côté
 * (quel moteur il interroge) relève de l'établissement, et l'application
 * n'est pas en position de l'affirmer.
 */
export const DATA_ROWS: DataRow[] = [
  { id: "audio", labelKey: "campus.data.audio", location: "campus" },
  { id: "text", labelKey: "campus.data.text", location: "campus" },
  { id: "vocabulary", labelKey: "campus.data.vocabulary", location: "campus" },
  { id: "history", labelKey: "campus.data.history", location: "device" },
  { id: "recordings", labelKey: "campus.data.recordings", location: "device" },
  { id: "appName", labelKey: "campus.data.appName", location: "device" },
];
