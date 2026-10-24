import type { LucideIcon } from "lucide-react";
import {
  BookA,
  Feather,
  GraduationCap,
  Languages,
  ListCollapse,
  MessageCircleQuestion,
  SpellCheck,
} from "lucide-react";

import {
  looksFrench,
  NOVA_COMMAND_SKILLS,
  targetLanguageName,
} from "@/lib/commands/catalog";
import type { NovaActionId } from "./suggest";

/**
 * La langue vers laquelle traduire : celle de Nova, sauf pour un texte déjà
 * dans cette langue (un cours en français se traduit en anglais).
 */
export function translationTarget(uiLanguage: string, text: string): string {
  const ui = uiLanguage.split("-")[0];
  return ui === "fr" && looksFrench(text) ? "en" : ui;
}

export interface NovaAction {
  icon: LucideIcon;
  labelKey: string;
  /** Le résultat réécrit la sélection : « Remplacer » a un sens. */
  rewrites: boolean;
  instruction: (uiLanguage: string, text: string) => string;
}

const skill = (id: string) => NOVA_COMMAND_SKILLS.find((s) => s.id === id)!;
const fromSkill = (id: string) => (uiLanguage: string, text: string) =>
  skill(id).instruction(targetLanguageName(uiLanguage), text);

/**
 * Les actions que Nova fait lui-même, par le serveur de l'école : la réponse
 * s'affiche dans la bulle. Les quatre premières reprennent les consignes
 * mesurées des Nova Commands ; les trois autres sont propres à la bulle.
 */
export const NOVA_ACTION_DEFS: Record<NovaActionId, NovaAction> = {
  explain: {
    icon: MessageCircleQuestion,
    labelKey: "bubble.action.explain",
    rewrites: false,
    instruction: fromSkill("explain"),
  },
  summarize: {
    icon: ListCollapse,
    labelKey: "bubble.action.summarize",
    rewrites: false,
    instruction: fromSkill("summarize"),
  },
  simplify: {
    icon: Feather,
    labelKey: "bubble.action.simplify",
    rewrites: true,
    instruction: () =>
      "Rewrite the following text in easy-to-read language: short sentences, everyday words, one idea per sentence. Keep every fact, number and name. Answer in the same language as the text. Return only the rewritten text.",
  },
  words: {
    icon: BookA,
    labelKey: "bubble.action.words",
    rewrites: false,
    instruction: () =>
      "List the difficult or technical words of the following text, at most 8, one per line, each followed by a colon and a short, simple definition. Answer in the same language as the text. Return only the list.",
  },
  improve: {
    icon: SpellCheck,
    labelKey: "bubble.action.improve",
    rewrites: true,
    instruction: fromSkill("improve"),
  },
  translate: {
    icon: Languages,
    labelKey: "bubble.action.translate",
    rewrites: true,
    instruction: (uiLanguage, text) =>
      skill("translate").instruction(
        targetLanguageName(translationTarget(uiLanguage, text)),
        text,
      ),
  },
  quiz: {
    icon: GraduationCap,
    labelKey: "bubble.action.quiz",
    rewrites: false,
    instruction: () =>
      "Write 3 short questions that check whether a student understood the following text. After each question, give its answer on the next line. Answer in the same language as the text. Return only the questions and answers.",
  },
};
