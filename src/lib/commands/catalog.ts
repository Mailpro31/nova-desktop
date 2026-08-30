import type { LucideIcon } from "lucide-react";
import {
  Languages,
  ListCollapse,
  MessageCircleQuestion,
  Sparkles,
  WandSparkles,
} from "lucide-react";

/**
 * Catalogue des AI Skills — les actions que Nova exécute sur du contenu
 * sélectionné.
 *
 * # Un Skill n'est pas un Style
 *
 * * **Style** : la manière dont Nova reformule une dictée. L'utilisateur en
 *   choisit un, puis parle.
 * * **Skill** : une action explicite déclenchée sur un texte déjà écrit,
 *   n'importe où dans le système.
 *
 * Les deux ont longtemps été confondus dans ce produit — les Styles étaient
 * projetés en « Skills » faute de moteur d'action. Ce moteur existe désormais
 * (`nova_commands.rs` + `/api/command`) ; la projection a été supprimée.
 *
 * # Source unique
 *
 * Nom, description, icône et comportement vivent ici, et nulle part ailleurs.
 * La page AI Skills et la palette lisent toutes deux ce module : une action
 * ajoutée y apparaît des deux côtés sans toucher à un seul composant.
 */

/** Mode de restitution. Pendant la phase expérimentale, tout passe par l'aperçu. */
export type CommandOutputMode = "preview";

/**
 * Provenance d'un Skill.
 *
 * Seul `builtin` existe aujourd'hui. `campus` (distribué par l'établissement)
 * et `personal` (créé par l'utilisateur) sont prévus par le type mais ne sont
 * ni produits ni affichés : le serveur ne distribue aucun Skill, et aucun
 * éditeur n'existe.
 */
export type CommandSource = "builtin" | "campus" | "personal";

/**
 * Disponibilité réelle. `experimental` tant que la couche native n'a pas été
 * validée sur applications Windows ; `unavailable` servira aux Skills dont un
 * prérequis manque (droit, palier, capacité serveur).
 */
export type CommandAvailability = "available" | "experimental" | "unavailable";

/**
 * Regroupement d'affichage. Une seule catégorie existe : en inventer d'autres
 * pour cinq entrées produirait des sections d'un élément.
 */
export type CommandCategory = "essentials";

/**
 * Ce qui suffit à *présenter* un Skill. `ASK_NOVA` s'y conforme sans être
 * exécutable d'un clic : la page et la palette peuvent donc l'afficher avec la
 * même ligne que les autres, sans conversion de type.
 */
export interface NovaCommandSkillInfo {
  id: string;
  nameKey: string;
  descriptionKey: string;
  icon: LucideIcon;
  category: CommandCategory;
  source: CommandSource;
  availability: CommandAvailability;
  /** Toutes le requièrent aujourd'hui ; le champ existe pour ne pas le supposer. */
  requiresSelection: boolean;
  outputMode: CommandOutputMode;
  /**
   * L'aperçu montre-t-il l'original à côté du résultat ?
   *
   * Utile quand le résultat est une réécriture du même texte — on compare.
   * Inutile quand c'est un texte nouveau : une explication ne se compare pas à
   * ce qui l'a provoquée, et la colonne d'origine ne ferait qu'encombrer.
   */
  showsOriginal: boolean;
}

/** Un Skill exécutable : il porte en plus la consigne envoyée au serveur. */
export interface NovaCommandSkill extends NovaCommandSkillInfo {
  /**
   * Paramétrée par la langue d'interface pour la seule action qui en dépend
   * réellement — la traduction.
   */
  instruction: (targetLanguage: string) => string;
}

const COMMON = {
  category: "essentials",
  source: "builtin",
  availability: "experimental",
  requiresSelection: true,
  outputMode: "preview",
} as const;

export const NOVA_COMMAND_SKILLS: NovaCommandSkill[] = [
  {
    ...COMMON,
    id: "explain",
    nameKey: "novaCommands.skill.explain.name",
    descriptionKey: "novaCommands.skill.explain.description",
    icon: MessageCircleQuestion,
    showsOriginal: false,
    instruction: () =>
      "Explain the following text clearly and concisely. Answer in the same language as the text. Return only the explanation.",
  },
  {
    ...COMMON,
    id: "summarize",
    nameKey: "novaCommands.skill.summarize.name",
    descriptionKey: "novaCommands.skill.summarize.description",
    icon: ListCollapse,
    showsOriginal: false,
    instruction: () =>
      "Summarize the following text. Answer in the same language as the text. Return only the summary.",
  },
  {
    ...COMMON,
    id: "improve",
    nameKey: "novaCommands.skill.improve.name",
    descriptionKey: "novaCommands.skill.improve.description",
    icon: WandSparkles,
    showsOriginal: true,
    instruction: () =>
      "Improve the wording, grammar and clarity of the following text. Keep the same language, the same meaning and a similar length. Return only the improved text.",
  },
  {
    ...COMMON,
    id: "translate",
    nameKey: "novaCommands.skill.translate.name",
    descriptionKey: "novaCommands.skill.translate.description",
    icon: Languages,
    showsOriginal: true,
    instruction: (targetLanguage) =>
      `Translate the following text into ${targetLanguage}. Return only the translation.`,
  },
];

export const ASK_NOVA_ID = "ask";

/**
 * Instruction libre.
 *
 * Décrite comme un Skill pour que la page et la palette la présentent avec la
 * même grammaire, mais elle est **délibérément hors de `NOVA_COMMAND_SKILLS`** :
 * sa consigne vient de l'utilisateur, elle ne peut pas être exécutée par un
 * simple clic, et elle vient toujours après les actions prédéfinies.
 *
 * Ce n'est pas un agent conversationnel : une consigne, un texte, un résultat.
 */
export const ASK_NOVA = {
  ...COMMON,
  id: ASK_NOVA_ID,
  nameKey: "novaCommands.skill.ask.name",
  descriptionKey: "novaCommands.skill.ask.description",
  icon: Sparkles,
  showsOriginal: false,
} satisfies NovaCommandSkillInfo;

/**
 * Nom de langue en anglais, tel qu'attendu dans la consigne de traduction.
 * Repli sur l'anglais si la locale est inconnue, plutôt qu'un code brut que le
 * modèle interpréterait mal.
 */
export function targetLanguageName(locale: string): string {
  const base = locale.split("-")[0];
  return LANGUAGE_NAMES[base] ?? "English";
}

const LANGUAGE_NAMES: Record<string, string> = {
  ar: "Arabic",
  bg: "Bulgarian",
  cs: "Czech",
  de: "German",
  en: "English",
  es: "Spanish",
  fr: "French",
  he: "Hebrew",
  it: "Italian",
  ja: "Japanese",
  ko: "Korean",
  ne: "Nepali",
  nl: "Dutch",
  pl: "Polish",
  pt: "Portuguese",
  ru: "Russian",
  sv: "Swedish",
  tr: "Turkish",
  uk: "Ukrainian",
  vi: "Vietnamese",
  zh: "Chinese",
};
