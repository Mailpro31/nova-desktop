/**
 * Le mini-sondage du pilote (2.4, nova-server) : une note de 1 à 5, au plus
 * une fois par mois. Le poste ne retient que le mois de la dernière réponse
 * ou du dernier « plus tard » ; le serveur ne garde qu'une moyenne.
 */

const KEY = "nova.pilotSurvey.month";

export const monthOf = (date: Date) => date.toISOString().slice(0, 7);

/** Vrai si rien n'a été répondu ni repoussé ce mois-ci. */
export function surveyDue(lastMonth: string | null, now: Date): boolean {
  return lastMonth !== monthOf(now);
}

export function readSurveyMonth(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function rememberSurveyMonth(now: Date) {
  try {
    localStorage.setItem(KEY, monthOf(now));
  } catch {
    // Sans stockage, le sondage revient : rien de perdu.
  }
}
