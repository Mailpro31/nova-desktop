/**
 * Ce que l'organisation a publié depuis la dernière fois qu'on a regardé.
 *
 * Le poste ne recevait le contenu de l'organisation **qu'au lancement** :
 * `App.tsx` appelait `refreshCampusContext()` une fois, dans un effet sans
 * dépendances. Un vocabulaire, un Style ou un AI Skill publié pendant que
 * l'application tournait n'arrivait donc jamais — il fallait la redémarrer,
 * sans que rien ne le laisse deviner.
 *
 * On compare des empreintes, pas des contenus. Le serveur calcule déjà une
 * empreinte de tout ce qu'un membre reçoit (`catalog_version`), et le
 * catalogue Learn porte la sienne. Deux chaînes suffisent donc à savoir qu'il
 * s'est passé quelque chose, sans rien télécharger pour le découvrir.
 */

/** Les empreintes observées à un instant donné. `null` = non su. */
export interface CatalogMarkers {
  /** Styles, AI Skills et vocabulaire publiés par l'organisation. */
  packages: string | null;
  /** Le catalogue de leçons servi par le serveur de l'organisation. */
  lessons: string | null;
}

export type OrganizationChange = "packages" | "lessons";

/**
 * Ce qui a changé entre deux observations.
 *
 * Deux règles, et elles disent toutes les deux la même chose : ne rien
 * annoncer qu'on ne sache.
 *
 *  - Sans observation précédente, rien n'est nouveau. La première connexion
 *    apporte tout le contenu de l'organisation d'un coup ; l'annoncer comme
 *    une nouveauté serait un mensonge dès l'installation.
 *  - Une empreinte absente de l'observation courante (serveur injoignable,
 *    plus ancien, ou sonde en échec) ne compte jamais comme un changement.
 *    Sans cette règle, une coupure réseau annoncerait une nouveauté à chaque
 *    reprise.
 */
export function changesBetween(
  seen: CatalogMarkers | null,
  current: CatalogMarkers,
): OrganizationChange[] {
  if (seen === null) return [];
  const changes: OrganizationChange[] = [];
  if (current.packages !== null && current.packages !== seen.packages) {
    changes.push("packages");
  }
  if (current.lessons !== null && current.lessons !== seen.lessons) {
    changes.push("lessons");
  }
  return changes;
}

/**
 * Fusionne ce qu'on vient d'observer avec ce qu'on savait.
 *
 * Une sonde en échec ne doit pas effacer l'empreinte connue : la prochaine
 * observation réussie serait alors comparée à `null` et ne dirait plus rien.
 */
export function mergeMarkers(
  seen: CatalogMarkers | null,
  current: CatalogMarkers,
): CatalogMarkers {
  return {
    packages: current.packages ?? seen?.packages ?? null,
    lessons: current.lessons ?? seen?.lessons ?? null,
  };
}

const KEY = "nova.organization.catalogMarkers.v1";

/**
 * Le stockage est `localStorage`, comme la progression du parcours d'accueil :
 * ce sont des repères d'affichage, pas de la configuration produit. Un profil
 * effacé ne fait perdre qu'une annonce.
 */
export function readSeenMarkers(): CatalogMarkers | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CatalogMarkers>;
    return {
      packages: typeof parsed.packages === "string" ? parsed.packages : null,
      lessons: typeof parsed.lessons === "string" ? parsed.lessons : null,
    };
  } catch {
    return null;
  }
}

export function rememberMarkers(markers: CatalogMarkers): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(markers));
  } catch {
    // Stockage indisponible : on annoncera simplement moins, jamais à tort.
  }
}

export function forgetMarkers(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Sans conséquence : au pire une observation de plus avant d'annoncer.
  }
}
