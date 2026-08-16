/**
 * Jalons d'usage — des faits, pas des points.
 *
 * Aucun XP, aucune série, aucun badge. Un jalon enregistre qu'une capacité a
 * réellement abouti au moins une fois ; il servira à la case correspondante de
 * la liste d'activation de l'accueil, et à rien d'autre.
 *
 * Stockage `localStorage`, comme la progression du parcours d'accueil : c'est
 * de l'état d'interface, pas de la configuration produit, et cela évite
 * d'étendre `AppSettings` — d'autant que la couche Rust est gelée jusqu'à la
 * validation Windows de Nova Commands.
 */

const KEY = "nova.milestones.v1";

export type Milestone = "first_ai_skill_used";

function read(): Milestone[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Milestone[]) : [];
  } catch {
    return [];
  }
}

/**
 * Enregistre un jalon.
 *
 * **À n'appeler qu'après un succès complet.** Pour `first_ai_skill_used`, cela
 * veut dire : commande envoyée *et* réponse exploitable reçue. Ouvrir la page,
 * choisir un Skill ou ouvrir la palette ne sont pas des accomplissements —
 * cocher une case pour un clic serait un mensonge poli.
 */
export function markMilestone(milestone: Milestone): void {
  const current = read();
  if (current.includes(milestone)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify([...current, milestone]));
  } catch {
    // Stockage indisponible : le jalon sera simplement réenregistré plus tard.
  }
}

export function hasMilestone(milestone: Milestone): boolean {
  return read().includes(milestone);
}
