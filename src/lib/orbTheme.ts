// Personnalisation de l'orbe « bille de verre » de Nova.
//
// L'orbe est l'identité de la marque : on ne change QUE sa teinte, jamais sa
// forme ni son reflet. Chaque thème définit les 5 arrêts du dégradé radial
// (du cœur lumineux au bord) plus la couleur du halo (glow). Les valeurs sont
// posées comme variables CSS sur la racine du document ; les SVG de l'orbe et
// l'overlay lisent ces variables avec repli sur le bleu Nova par défaut.
//
// 100 % frontend : le choix est mémorisé dans localStorage (partagé entre les
// fenêtres de même origine — dock et overlay), sans aucun aller-retour backend.
// La personnalisation est réservée à Nova Ultra ; le gating est appliqué par
// l'écran de réglages (le module lui-même reste neutre).

export type OrbTheme = {
  id: string;
  label: string;
  /** 5 arrêts du dégradé, du centre (0 %) au bord (100 %). */
  stops: [string, string, string, string, string];
  /** Couleur du halo, en composantes « r, g, b ». */
  glow: string;
};

// Le premier thème est le défaut historique de Nova (bleu nuit).
export const ORB_THEMES: OrbTheme[] = [
  {
    id: "nova",
    label: "Nova (bleu)",
    stops: ["#FFFFFF", "#DFE7FA", "#AEBEEC", "#93A6E0", "#7E92D6"],
    glow: "126, 146, 214",
  },
  {
    id: "aurora",
    label: "Aurore",
    stops: ["#FFFFFF", "#EBE4FB", "#CBB9F2", "#B59CEB", "#A186E3"],
    glow: "161, 134, 227",
  },
  {
    id: "sunset",
    label: "Couchant",
    stops: ["#FFFFFF", "#FCE3E8", "#F6BBC6", "#F19DAE", "#E88098"],
    glow: "232, 128, 152",
  },
  {
    id: "mint",
    label: "Menthe",
    stops: ["#FFFFFF", "#DEF5EC", "#AEE6D2", "#8CD9BE", "#6FCBAB"],
    glow: "111, 203, 171",
  },
  {
    id: "gold",
    label: "Or",
    stops: ["#FFFFFF", "#FBEFD8", "#F2D9A6", "#EBC97F", "#E3BA5C"],
    glow: "227, 186, 92",
  },
  {
    id: "graphite",
    label: "Graphite",
    stops: ["#FFFFFF", "#E6E7EB", "#C2C5CD", "#A8ABB5", "#8E929E"],
    glow: "142, 146, 158",
  },
];

export const DEFAULT_ORB_ID = "nova";
const STORAGE_KEY = "nova_orb_theme";

export function getOrbTheme(id: string): OrbTheme {
  return ORB_THEMES.find((t) => t.id === id) ?? ORB_THEMES[0];
}

export function getOrbThemeId(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_ORB_ID;
  } catch {
    return DEFAULT_ORB_ID;
  }
}

/** Pose les variables CSS de l'orbe sur la racine du document. */
export function applyOrbTheme(id: string): void {
  const theme = getOrbTheme(id);
  const root = document.documentElement;
  theme.stops.forEach((color, i) => {
    root.style.setProperty(`--orb-s${i}`, color);
  });
  root.style.setProperty("--orb-glow", theme.glow);
}

/**
 * Enregistre et applique un thème. `localStorage` déclenche un événement
 * `storage` dans les AUTRES fenêtres de même origine (l'overlay se met donc à
 * jour) ; on applique aussi localement puisque l'événement ne se déclenche pas
 * dans la fenêtre qui écrit.
 */
export function setOrbThemeId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // localStorage indisponible : on applique quand même pour la session.
  }
  applyOrbTheme(id);
}

/**
 * À appeler une fois au démarrage de chaque fenêtre : applique le thème stocké
 * et se réabonne aux changements venus des autres fenêtres.
 */
export function initOrbTheme(): void {
  applyOrbTheme(getOrbThemeId());
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) {
      applyOrbTheme(e.newValue || DEFAULT_ORB_ID);
    }
  });
}
