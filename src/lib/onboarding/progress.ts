/**
 * État de progression du parcours de première ouverture.
 *
 * Principe : **l'état réel du système est la source de vérité**, pas un
 * journal. Qu'une permission soit accordée, qu'une session campus existe,
 * qu'une dictée ait eu lieu — tout cela se lit directement. On ne stocke donc
 * ici que ce qui n'est déductible de rien : le fait que l'utilisateur ait
 * démarré le parcours, et les étapes facultatives qu'il a choisi d'ignorer.
 *
 * Conséquence utile : une interruption (fermeture, plantage) n'a pas besoin
 * d'être gérée. Au lancement suivant, le parcours est recalculé et les étapes
 * déjà satisfaites disparaissent d'elles-mêmes.
 *
 * Le stockage est `localStorage` et non les réglages Rust : ce sont des
 * préférences d'affichage, pas de la configuration produit, et cela évite
 * d'étendre `AppSettings` pour un besoin purement d'interface.
 */

const KEY = "nova.onboarding.v1";

export type OnboardingStatus = "not_started" | "in_progress" | "completed";

/** Étapes facultatives : celles qui peuvent être ignorées sans casser Nova. */
export type SkippableStep =
  | "writingStyles"
  | "style"
  | "variables"
  | "firstDictation";

interface StoredProgress {
  status: OnboardingStatus;
  skipped: SkippableStep[];
}

const EMPTY: StoredProgress = { status: "not_started", skipped: [] };

export function readProgress(): StoredProgress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<StoredProgress>;
    return {
      status: parsed.status ?? "not_started",
      skipped: Array.isArray(parsed.skipped) ? parsed.skipped : [],
    };
  } catch {
    return EMPTY;
  }
}

function write(next: StoredProgress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Stockage indisponible : le parcours reste fonctionnel, il se
    // recalculera simplement depuis l'état système au prochain lancement.
  }
}

export function setStatus(status: OnboardingStatus): void {
  write({ ...readProgress(), status });
}

export function markSkipped(step: SkippableStep): void {
  const current = readProgress();
  if (current.skipped.includes(step)) return;
  write({ ...current, skipped: [...current.skipped, step] });
}

export function isSkipped(step: SkippableStep): boolean {
  return readProgress().skipped.includes(step);
}

/**
 * Un utilisateur qui se servait déjà de Nova avant l'introduction de ce
 * parcours ne doit jamais le voir. `onboarding_completed` (réglage historique)
 * fait foi : s'il est vrai, on considère le parcours terminé, quel que soit le
 * contenu de `localStorage` — qui peut être vide sur une nouvelle machine ou
 * après un nettoyage du profil.
 */
export function reconcileWithLegacySetting(onboardingCompleted: boolean): void {
  if (onboardingCompleted && readProgress().status !== "completed") {
    setStatus("completed");
  }
}
