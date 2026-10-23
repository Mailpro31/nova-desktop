import { toast } from "sonner";

/**
 * Une erreur reste affichée jusqu'à ce que l'élève la ferme (n° 91) : un
 * lecteur lent n'avait pas le temps de la lire en 4 s. Une seule règle pour
 * les 46 appels de `toast.error`, plutôt qu'une option répétée à chacun.
 */
const showError = toast.error;
toast.error = (message, data) =>
  showError(message, { duration: Infinity, closeButton: true, ...data });

/** Les autres messages restent 8 s au lieu de 4. */
export const NOTICE_DURATION_MS = 8000;
