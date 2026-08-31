/**
 * Ce que le build Lab sait de lui-même, sans rien demander à personne.
 *
 * L'artefact Lab est une démonstration : il sert à rejoindre un serveur de test
 * sur le réseau local, et rien d'autre. Il n'a pas de modèle local, pas de
 * palier de licence, pas de canal de mise à jour — voir la feature Rust `lab`.
 *
 * Tout ce qui est ici est **synchrone**. C'est la propriété qui compte : la
 * décision « faut-il montrer l'écran Lab ? » est prise à la première frame,
 * avant la moindre sonde. Un poste neuf sans micro, sans modèle et sans
 * configuration doit voir son écran immédiatement, pas une fenêtre blanche en
 * attendant des réponses qui ne le concernent pas.
 */

/**
 * Le paquet installé est-il l'artefact Lab ?
 *
 * Décidé à la compilation (`VITE_NOVA_LAB=1`, posé par la CI en même temps que
 * la feature Rust `lab`). Faux partout ailleurs, donc aucune surface Lab
 * n'existe dans un paquet Nova ordinaire.
 */
export const IS_LAB_BUILD = import.meta.env?.VITE_NOVA_LAB === "1";

const ENROLLED_KEY = "nova.lab.enrolled";
const SERVER_KEY = "nova.lab.serverUrl";

/**
 * Ce poste a-t-il déjà rejoint un serveur de test ?
 *
 * Un simple marqueur d'affichage : il dit s'il faut reproposer l'écran
 * d'invitation au démarrage. Il ne contient aucun secret et n'accorde aucun
 * accès — le jeton du périphérique et le certificat épinglé restent côté Rust,
 * en mémoire, et ne survivent pas à la fermeture (voir `lab_enrollment.rs`).
 */
export function labEnrollmentDone(): boolean {
  try {
    return localStorage.getItem(ENROLLED_KEY) === "1";
  } catch {
    // Stockage indisponible : reproposer l'invitation est bénin, se croire
    // enrôlé ne l'est pas.
    return false;
  }
}

/** Retient qu'une invitation a été acceptée. */
export function markLabEnrolled(): void {
  try {
    localStorage.setItem(ENROLLED_KEY, "1");
  } catch {
    // ignore
  }
}

/** Oublie l'enrôlement — utilisé pour repartir d'un poste vierge. */
export function forgetLabEnrollment(): void {
  try {
    localStorage.removeItem(ENROLLED_KEY);
    localStorage.removeItem(SERVER_KEY);
  } catch {
    // ignore
  }
}

/**
 * Adresse du serveur de test rejoint, `null` si aucune.
 *
 * Le code d'invitation la porte déjà : une fois l'invitation acceptée, le poste
 * n'a plus rien à demander à une configuration Campus locale, qui n'existe pas
 * sur un PC de démonstration. Ce n'est pas un secret — l'accès tient au
 * certificat épinglé et au jeton du périphérique, tous deux côté Rust.
 */
export function labServer(): string | null {
  try {
    return localStorage.getItem(SERVER_KEY);
  } catch {
    return null;
  }
}

/** Retient l'adresse annoncée par le serveur à l'enrôlement. */
export function rememberLabServer(url: string): void {
  try {
    localStorage.setItem(SERVER_KEY, url);
  } catch {
    // ignore
  }
}
