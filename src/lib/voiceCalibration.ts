import type { CalibrationResult, MisheardWord } from "@/bindings";

export type { CalibrationResult };

/**
 * Une phrase à lire, et les termes de cours qu'elle permet d'apprendre.
 *
 * ## Pourquoi des termes désignés
 *
 * Seul un écart sur l'un de ces termes devient une correction proposée. Une
 * erreur du moteur sur un mot courant — « court » pour « cours » — changerait,
 * érigée en règle, toutes les dictées suivantes où l'élève dit vraiment
 * « court ». Les termes rares, eux, n'ont qu'une bonne orthographe.
 *
 * ## Pourquoi ces phrases
 *
 * Elles couvrent les matières d'un élève — géométrie, biologie, analyse,
 * histoire, chimie, grammaire — et une échéance avec des nombres, le cas où
 * une erreur coûte le plus. Ce sont des données de dictée en français, pas des
 * libellés d'interface : elles ne passent donc pas par les traductions.
 */
export interface CalibrationPhrase {
  text: string;
  terms: string[];
}

export const CALIBRATION_PHRASES: CalibrationPhrase[] = [
  {
    text: "Le théorème de Pythagore relie les trois côtés d'un triangle rectangle.",
    terms: ["Pythagore", "triangle rectangle"],
  },
  {
    text: "La photosynthèse transforme le dioxyde de carbone en glucose et en dioxygène.",
    terms: ["photosynthèse", "dioxyde de carbone", "glucose", "dioxygène"],
  },
  {
    text: "La dérivée d'une fonction mesure sa vitesse de variation.",
    terms: ["dérivée"],
  },
  {
    text: "La Révolution française commence avec la prise de la Bastille.",
    terms: ["Révolution française", "Bastille"],
  },
  {
    text: "La molécule d'eau contient deux atomes d'hydrogène et un atome d'oxygène.",
    terms: ["molécule", "hydrogène", "oxygène"],
  },
  {
    text: "L'hypoténuse est le côté opposé à l'angle droit.",
    terms: ["hypoténuse"],
  },
  {
    text: "Le subjonctif s'emploie après une expression de volonté ou de doute.",
    terms: ["subjonctif"],
  },
  {
    text: "Pour le partiel du douze mars, il faut réviser les chapitres trois et quatre.",
    terms: ["partiel"],
  },
];

/** Tous les termes que le calibrage peut apprendre. */
export function calibrationTerms(): string[] {
  return CALIBRATION_PHRASES.flatMap((phrase) => phrase.terms);
}

export interface CalibrationSummary {
  /** Gain à appliquer : la médiane des phrases lues. */
  gain: number;
  /** La voix ressort-elle du bruit sur la plupart des phrases ? */
  voiceStandsOut: boolean;
  /** Corrections à proposer — jamais appliquées sans accord. */
  corrections: MisheardWord[];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Longueur minimale d'un mot pour qu'un morceau de terme composé soit appris :
 * « dioxyde » oui, « de » jamais.
 */
const MIN_RARE_WORD_LENGTH = 5;

/**
 * L'écart porte-t-il sur un terme de cours ?
 *
 * Oui s'il contient un terme entier. Oui aussi s'il n'est qu'un morceau d'un
 * terme composé — le moteur a pu ne rater que « dioxyde » dans « dioxyde de
 * carbone » — mais seulement si ce morceau contient un mot rare : une règle
 * « du » → « de » réécrirait des milliers de phrases justes.
 */
function mentionsTerm(expected: string, terms: string[]): boolean {
  const text = expected.toLocaleLowerCase("fr");
  const words = text.split(/\s+/).filter(Boolean);
  return terms.some((term) => {
    const wanted = term.toLocaleLowerCase("fr");
    if (text.includes(wanted)) return true;
    const termWords = wanted.split(/\s+/);
    return (
      words.every((word) => termWords.includes(word)) &&
      words.some((word) => word.length >= MIN_RARE_WORD_LENGTH)
    );
  });
}

/**
 * Ce que Nova retient d'un calibrage.
 *
 * La **médiane** des gains, pas le plus fort : une phrase lue trop bas ou trop
 * près du micro ne doit pas régler toutes les dictées à venir.
 */
export function summarizeCalibration(
  results: CalibrationResult[],
  terms: string[],
): CalibrationSummary {
  if (results.length === 0) {
    return { gain: 1, voiceStandsOut: false, corrections: [] };
  }

  const standing = results.filter((r) => r.voice_stands_out).length;
  const seen = new Set<string>();
  const corrections: MisheardWord[] = [];
  for (const result of results) {
    for (const word of result.misheard) {
      if (!mentionsTerm(word.expected, terms)) continue;
      const key = `${word.heard.toLocaleLowerCase("fr")}→${word.expected}`;
      if (seen.has(key)) continue;
      seen.add(key);
      corrections.push(word);
    }
  }

  return {
    gain:
      Math.round(median(results.map((r) => r.recommended_gain)) * 100) / 100,
    voiceStandsOut: standing * 2 > results.length,
    corrections,
  };
}
