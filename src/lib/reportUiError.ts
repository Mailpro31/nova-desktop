import { commands } from "@/bindings";

/**
 * Rapporte une erreur de l'interface comme un plantage (5.2). Le poste nettoie
 * le message et respecte le choix de l'école ; un échec d'envoi est ignoré,
 * pour ne jamais créer une nouvelle erreur en rapportant la précédente.
 */
export function reportUiError(error: unknown) {
  // shortcut: sans la pile, l'endroit exact manque ; l'ajouter avec les cartes de sources.
  const name = error instanceof Error ? error.name : "Error";
  const message = error instanceof Error ? error.message : String(error);
  commands.reportUiError(name, message).catch(() => {});
}
