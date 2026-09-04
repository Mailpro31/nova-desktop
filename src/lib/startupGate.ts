/**
 * Que montrer pendant que Nova démarre.
 *
 * ## Le défaut que ce module corrige
 *
 * `App.tsx` décidait cela avec trois `return null` successifs : tant qu'une
 * sonde n'avait pas répondu — réglages, permissions, modèles, parcours — la
 * racine React ne rendait rien. Or « rien » n'est pas un état d'attente : une
 * fenêtre WebView vide est **blanche**, indiscernable d'un plantage, et si la
 * sonde ne répond jamais elle le reste indéfiniment. C'est exactement ce qui
 * est arrivé au premier lancement de Nova Lab.
 *
 * Le remède tient en deux règles, et elles sont ici plutôt que dans le rendu
 * pour être vérifiables sans monter React :
 *
 * 1. **Aucune branche ne renvoie « rien ».** L'attente est un écran, l'échec
 *    est un écran.
 * 2. **L'attente est bornée.** Passé `STARTUP_STALL_MS`, on n'attend plus : on
 *    dit à l'utilisateur ce qui bloque et ce qu'il peut faire.
 *
 * ## Pourquoi le Lab passe devant
 *
 * L'artefact Lab n'a besoin d'aucune de ces sondes : pas de modèle local à
 * inventorier, pas de périphérique audio à énumérer, pas de configuration
 * d'établissement à lire. Le code d'invitation porte lui-même l'adresse et
 * l'empreinte du serveur. Faire attendre son écran derrière des réponses qui
 * ne le concernent pas, c'est fabriquer la fenêtre blanche sur le poste neuf
 * où la démonstration doit précisément fonctionner.
 */

/** Au-delà de ce délai, l'attente devient un message. */
export const STARTUP_STALL_MS = 8_000;

export type StartupScreen =
  /** Écran d'invitation Lab : immédiat, sans aucune sonde. */
  | "lab"
  /** Choix personnel / organisation, pour un paquet qui ne déclare rien. */
  | "edition"
  /** Sondes en cours, dans les temps. */
  | "loading"
  /** Sondes silencieuses trop longtemps : message compréhensible. */
  | "stalled"
  /** Tout est connu : le parcours ou l'application prennent la main. */
  | "app";

export interface StartupProbes {
  /** Paquet Lab (`VITE_NOVA_LAB=1`). */
  isLabBuild: boolean;
  /** Une invitation Lab a déjà été acceptée sur ce poste. */
  labEnrolled: boolean;
  /** `null` tant qu'on ignore s'il s'agit d'une première ouverture. */
  isFirstRun: boolean | null;
  /** Le paquet déclare son édition, ou l'utilisateur a répondu. */
  editionSettled: boolean;
  /** Toutes les sondes système ont répondu. */
  readinessLoaded: boolean;
  /** La liste des étapes du parcours est arrêtée. */
  flowInitialized: boolean;
  /** Millisecondes écoulées depuis le montage de la racine. */
  elapsedMs: number;
}

function waiting(elapsedMs: number): StartupScreen {
  return elapsedMs >= STARTUP_STALL_MS ? "stalled" : "loading";
}

/**
 * L'écran à rendre, pour un état de démarrage donné.
 *
 * Fonction totale : il n'existe aucune combinaison d'entrées pour laquelle
 * elle ne désigne pas un écran. C'est la garantie que la fenêtre blanche ne
 * peut pas revenir par une branche oubliée.
 */
export function startupScreen(probes: StartupProbes): StartupScreen {
  if (probes.isLabBuild && !probes.labEnrolled) return "lab";
  if (probes.isFirstRun === null) return waiting(probes.elapsedMs);
  if (probes.isFirstRun && !probes.editionSettled) return "edition";
  if (!probes.readinessLoaded || !probes.flowInitialized) {
    return waiting(probes.elapsedMs);
  }
  return "app";
}
