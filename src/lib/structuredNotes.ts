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
