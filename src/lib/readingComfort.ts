/**
 * Les réglages de lecture : ce qui rend le texte de Nova plus facile à lire
 * pour un élève dyslexique.
 *
 * ## Seulement ce qui a fait ses preuves
 *
 * - **L'espacement** des lettres, des mots et des lignes : les élèves
 *   dyslexiques lisent plus vite et font moins d'erreurs sur un texte espacé
 *   (Zorzi et al., PNAS 2012). Le niveau le plus large reprend les valeurs du
 *   critère WCAG 1.4.12.
 * - **La taille du texte.**
 * - **Une police** au choix — sans promesse : aucune police « dys » n'a montré
 *   d'effet sur la lecture (Wery & Diliberto 2017). Verdana est proposée parce
 *   que ses lettres sont larges et bien distinctes, et qu'elle est installée
 *   sur tout poste Windows : rien à télécharger.
 *
 * Les filtres colorés et les règles de lecture n'y sont pas : une revue
 * systématique n'a trouvé aucun effet des premiers (Griffiths et al. 2016).
 *
 * ## Où c'est rangé
 *
 * Dans `localStorage`, comme le thème : c'est une préférence d'affichage de ce
 * poste, appliquée avant le premier rendu pour éviter un saut de mise en page.
 */

export type TextSize = "normal" | "large" | "larger";
export type Spacing = "normal" | "wide" | "wider";
export type ReadingFont = "system" | "readable";

export interface ReadingComfort {
  textSize: TextSize;
  spacing: Spacing;
  font: ReadingFont;
  /** Vitesse de la lecture à voix haute : 1 = normale. */
  speechRate: number;
}

export const DEFAULT_READING_COMFORT: ReadingComfort = {
  textSize: "normal",
  spacing: "normal",
  font: "system",
  speechRate: 1,
};

export const TEXT_SIZES: readonly TextSize[] = ["normal", "large", "larger"];
export const SPACINGS: readonly Spacing[] = ["normal", "wide", "wider"];
export const READING_FONTS: readonly ReadingFont[] = ["system", "readable"];
export const SPEECH_RATES: readonly number[] = [0.75, 1, 1.25];

const MIN_SPEECH_RATE = 0.5;
const MAX_SPEECH_RATE = 1.5;

export const READING_COMFORT_STORAGE_KEY = "nova.readingComfort";
/** Prévient la fenêtre courante : `storage` ne se déclenche que dans les autres. */
export const READING_COMFORT_EVENT = "nova-reading-comfort";

const FONT_SIZE: Record<TextSize, string> = {
  normal: "15px",
  large: "17px",
  larger: "19px",
};

const SPACING: Record<
  Spacing,
  { letter: string; word: string; line: string } | null
> = {
  normal: null,
  wide: { letter: "0.05em", word: "0.08em", line: "1.7" },
  // WCAG 1.4.12 : lettres 0,12 em, mots 0,16 em, lignes au moins 1,5.
  wider: { letter: "0.12em", word: "0.16em", line: "2" },
};

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** Lit des réglages enregistrés, sans jamais faire confiance à leur forme. */
export function parseReadingComfort(raw: unknown): ReadingComfort {
  let stored: unknown = null;
  if (typeof raw === "string") {
    try {
      stored = JSON.parse(raw);
    } catch {
      stored = null;
    }
  }
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return { ...DEFAULT_READING_COMFORT };
  }
  const value = stored as Record<string, unknown>;
  const rate =
    typeof value.speechRate === "number" && Number.isFinite(value.speechRate)
      ? Math.min(MAX_SPEECH_RATE, Math.max(MIN_SPEECH_RATE, value.speechRate))
      : DEFAULT_READING_COMFORT.speechRate;
  return {
    textSize: oneOf(
      value.textSize,
      TEXT_SIZES,
      DEFAULT_READING_COMFORT.textSize,
    ),
    spacing: oneOf(value.spacing, SPACINGS, DEFAULT_READING_COMFORT.spacing),
    font: oneOf(value.font, READING_FONTS, DEFAULT_READING_COMFORT.font),
    speechRate: rate,
  };
}

export interface ReadingComfortStyle {
  fontSize: string;
  letterSpacing: string | null;
  wordSpacing: string | null;
  lineHeight: string | null;
}

/** Ce que les réglages changent : `null` quand rien n'est imposé. */
export function readingComfortStyle(
  comfort: ReadingComfort,
): ReadingComfortStyle {
  const spacing = SPACING[comfort.spacing];
  return {
    fontSize: FONT_SIZE[comfort.textSize],
    letterSpacing: spacing?.letter ?? null,
    wordSpacing: spacing?.word ?? null,
    lineHeight: spacing?.line ?? null,
  };
}

interface StyledRoot {
  dataset: Record<string, string | undefined>;
  style: {
    setProperty(name: string, value: string): void;
    removeProperty(name: string): string;
  };
}

/** Pose les réglages sur la racine : les règles de `App.css` font le reste. */
export function applyReadingComfort(
  comfort: ReadingComfort,
  root: StyledRoot = document.documentElement,
): void {
  const style = readingComfortStyle(comfort);
  root.dataset.readingSpacing = comfort.spacing;
  root.dataset.readingFont = comfort.font;
  root.style.setProperty("--reading-font-size", style.fontSize);
  const optional: Array<[string, string | null]> = [
    ["--reading-letter-spacing", style.letterSpacing],
    ["--reading-word-spacing", style.wordSpacing],
    ["--reading-line-height", style.lineHeight],
  ];
  for (const [name, value] of optional) {
    if (value === null) root.style.removeProperty(name);
    else root.style.setProperty(name, value);
  }
}

export function loadReadingComfort(): ReadingComfort {
  try {
    return parseReadingComfort(
      localStorage.getItem(READING_COMFORT_STORAGE_KEY),
    );
  } catch {
    return { ...DEFAULT_READING_COMFORT };
  }
}

export function saveReadingComfort(comfort: ReadingComfort): void {
  try {
    localStorage.setItem(READING_COMFORT_STORAGE_KEY, JSON.stringify(comfort));
  } catch {
    // Stockage indisponible : le réglage vaut pour cette session seulement.
  }
  applyReadingComfort(comfort);
  window.dispatchEvent(new Event(READING_COMFORT_EVENT));
}

/** À l'ouverture : applique les réglages, et suit ceux des autres fenêtres. */
export function initReadingComfort(): void {
  applyReadingComfort(loadReadingComfort());
  window.addEventListener("storage", (event) => {
    if (event.key === READING_COMFORT_STORAGE_KEY) {
      applyReadingComfort(loadReadingComfort());
    }
  });
}
