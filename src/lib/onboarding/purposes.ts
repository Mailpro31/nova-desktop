/**
 * Ce que le premier lancement propose de configurer, selon le métier du membre.
 *
 * ## Le défaut que ce module corrige
 *
 * Le premier lancement branchait sur `teacher`, puis `staff`, et servait sinon
 * les options d'un étudiant : « cours et notes », « projets d'ingénierie »,
 * « programmation ». Le serveur attribue pourtant `employee` par défaut à toute
 * organisation de type `business`, et `employee` comme `manager` sont modélisés
 * partout ailleurs dans le poste. Un salarié de l'administration se voyait donc
 * proposer de configurer Nova pour coder.
 *
 * ## La règle
 *
 * Le regroupement porte sur **ce que la personne écrit**, jamais sur la nature
 * de son organisation. Un agent administratif et un salarié d'entreprise
 * écrivent les mêmes choses — des courriels, des documents — et reçoivent donc
 * les mêmes options. C'est ce qui permet à un seul mode organisation de servir
 * une école et une entreprise sans fourche de comportement.
 *
 * Un métier inconnu retombe sur le jeu le plus large : proposer trop vaut mieux
 * que proposer à côté, et « un peu de tout » y figure toujours.
 */

/** Une option du premier lancement : son libellé, et le Style qu'elle choisit. */
export interface PurposeOption {
  /** Suffixe de clé i18n sous `campus.firstRun.setup.purposes`. */
  readonly id: string;
  /** Style appliqué, ou `auto` pour laisser Nova décider à chaque dictée. */
  readonly promptId: string;
}

/** Ce qu'un enseignant écrit : des supports, des retours, des courriels. */
const TEACHING: readonly PurposeOption[] = Object.freeze([
  { id: "courseNotes", promptId: "nova_style_notes" },
  { id: "feedback", promptId: "default_improve_transcriptions" },
  { id: "emails", promptId: "nova_style_email" },
  { id: "everything", promptId: "auto" },
]);

/**
 * Ce qu'un administratif écrit — agent d'un établissement, salarié ou
 * encadrant d'une entreprise : des courriels et des documents.
 *
 * `manager` partage ce jeu : encadrer une équipe ne change pas ce qu'on rédige,
 * et ce métier ne confère aucun droit d'administration.
 */
const ADMINISTRATIVE: readonly PurposeOption[] = Object.freeze([
  { id: "emails", promptId: "nova_style_email" },
  { id: "documents", promptId: "default_improve_transcriptions" },
  { id: "everything", promptId: "auto" },
]);

/** Ce qu'un étudiant écrit, et le repli d'un métier inconnu. */
const STUDYING: readonly PurposeOption[] = Object.freeze([
  { id: "classes", promptId: "nova_style_notes" },
  { id: "engineering", promptId: "auto" },
  { id: "emails", promptId: "nova_style_email" },
  { id: "coding", promptId: "nova_style_prompt" },
  { id: "everything", promptId: "auto" },
]);

/**
 * Options proposées à ce métier.
 *
 * Accepte aussi bien un `MemberType` annoncé par le serveur qu'un `CampusRole`
 * lu dans la configuration déposée sur le poste : les deux emploient les mêmes
 * noms, et une valeur absente ou inconnue ne doit pas faire disparaître l'écran.
 */
export function purposeOptionsFor(
  role: string | null | undefined,
): readonly PurposeOption[] {
  switch ((role ?? "").trim().toLowerCase()) {
    case "teacher":
      return TEACHING;
    case "staff":
    case "employee":
    case "manager":
      return ADMINISTRATIVE;
    default:
      return STUDYING;
  }
}
