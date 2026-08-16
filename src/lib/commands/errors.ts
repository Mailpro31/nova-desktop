import type { CommandError } from "@/bindings";

/**
 * Message d'erreur affichable : un titre court qui nomme la situation, une
 * phrase qui dit quoi faire.
 *
 * Aucun jargon technique n'en sort. Les variantes `Clipboard` et `Input`
 * portent un détail système — volontairement ignoré : il ne dit rien
 * d'actionnable, et pourrait contenir un chemin de fichier.
 */
export interface CommandMessage {
  titleKey: string;
  bodyKey: string;
}

/**
 * Erreurs produites côté interface, sans équivalent Rust.
 *
 * `offline` précède toute tentative — le moteur de commande est le serveur de
 * l'établissement, et rien de local ne le remplace. `emptyResult` couvre une
 * réponse serveur vide, qui n'est pas un aperçu.
 */
export type ClientCommandError = "offline" | "failed" | "emptyResult";

const CLIENT_MESSAGES: Record<ClientCommandError, CommandMessage> = {
  offline: {
    titleKey: "novaCommands.error.offlineTitle",
    bodyKey: "novaCommands.error.offline",
  },
  failed: {
    titleKey: "novaCommands.error.failedTitle",
    bodyKey: "novaCommands.error.failed",
  },
  emptyResult: {
    titleKey: "novaCommands.error.emptyResultTitle",
    bodyKey: "novaCommands.error.emptyResult",
  },
};

export function clientCommandMessage(
  error: ClientCommandError,
): CommandMessage {
  return CLIENT_MESSAGES[error];
}

/**
 * Message pour une erreur du moteur natif.
 *
 * Le `switch` est exhaustif : ajouter une variante côté Rust cassera la
 * compilation ici plutôt que de tomber dans un message générique.
 */
export function commandMessage(error: CommandError): CommandMessage {
  switch (error.kind) {
    case "Busy":
      return {
        titleKey: "novaCommands.error.busyTitle",
        bodyKey: "novaCommands.error.busy",
      };
    case "NonTextClipboard":
      return {
        titleKey: "novaCommands.error.nonTextClipboardTitle",
        bodyKey: "novaCommands.error.nonTextClipboard",
      };
    case "NoSelection":
      return {
        titleKey: "novaCommands.error.noSelectionTitle",
        bodyKey: "novaCommands.error.noSelection",
      };
    case "Unsupported":
      return {
        titleKey: "novaCommands.error.unsupportedTitle",
        bodyKey: "novaCommands.error.unsupported",
      };
    case "TargetChanged":
      return {
        titleKey: "novaCommands.error.targetChangedTitle",
        bodyKey: "novaCommands.error.targetChanged",
      };
    case "Clipboard":
    case "Input":
      return CLIENT_MESSAGES.failed;
  }
}

/**
 * Une erreur de remplacement laisse-t-elle le texte de l'utilisateur intact ?
 *
 * Toutes le font aujourd'hui — le moteur refuse avant d'écrire — sauf une
 * panne de frappe, qui survient après. La distinction est explicite pour que
 * l'aperçu propose « Copier » en repli plutôt que de laisser croire à une
 * modification partielle.
 */
export function leavesDocumentUntouched(error: CommandError): boolean {
  switch (error.kind) {
    case "Busy":
    case "NonTextClipboard":
    case "NoSelection":
    case "Unsupported":
    case "TargetChanged":
    case "Clipboard":
      return true;
    case "Input":
      return false;
  }
}
