/**
 * Notes structurées — des notes brutes rangées selon leur nature.
 *
 * Le type de note ne dit pas au modèle *comment* écrire : la structure de
 * chaque type est rédigée côté serveur (édition Organization) ou dans Nova
 * (édition Personal). Le poste ne transmet que le type choisi.
 */

export const NOTE_TYPES = [
  "meeting",
  "lecture",
  "observation",
  "ideas",
  "free",
] as const;

export type NoteType = (typeof NOTE_TYPES)[number];

export type StructuredNotesEngine = "organization" | "personal" | "unavailable";

export interface StructuredNotesEngineInput {
  organizationMode: boolean;
  signedIn: boolean;
  capabilityOpen: boolean;
}

/**
 * Qui structure les notes.
 *
 * Une organisation garde la main : sans session ou avec la fonction fermée,
 * rien ne part — pas même vers le moteur local, qui contournerait sa décision.
 * Nova Personal passe par le moteur de réécriture choisi dans Styles.
 */
export function structuredNotesEngine(
  input: StructuredNotesEngineInput,
): StructuredNotesEngine {
  if (!input.organizationMode) return "personal";
  return input.signedIn && input.capabilityOpen
    ? "organization"
    : "unavailable";
}

/**
 * Le message à montrer quand la structuration échoue, d'après l'erreur reçue.
 *
 * Un texte trop long ne passera pas en réessayant : l'élève doit le savoir.
 * Le délai est testé avant le réseau, parce qu'un délai dépassé arrive aussi
 * comme une erreur réseau (« operation timed out »).
 */
export function structuredNotesErrorKey(message: string): string {
  if (/HTTP 413|AI_PROMPT_TOO_LONG/.test(message)) {
    return "structuredNotes.errorTooLong";
  }
  if (/HTTP 504|timed out|timeout/i.test(message)) {
    return "structuredNotes.errorSlow";
  }
  if (/HTTP 429/.test(message)) return "structuredNotes.errorBusy";
  if (/network error/i.test(message)) return "structuredNotes.errorOffline";
  return "structuredNotes.error";
}
