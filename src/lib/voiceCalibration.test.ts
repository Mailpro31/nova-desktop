import { describe, expect, test } from "bun:test";

import {
  CALIBRATION_PHRASES,
  gainInDecibels,
  summarizeCalibration,
  type CalibrationResult,
} from "./voiceCalibration";

/**
 * Ce que Nova retient d'un calibrage. Le point qui compte : une erreur du
 * moteur sur un mot courant ne devient **jamais** une règle de remplacement —
 * « court » réécrit en « cours » partout abîmerait toutes les dictées.
 */

function sample(partial: Partial<CalibrationResult>): CalibrationResult {
  return {
    speech_dbfs: -30,
    noise_dbfs: -60,
    voice_stands_out: true,
    recommended_gain: 1,
    heard: "",
    misheard: [],
    ...partial,
  };
}

describe("Le gain retenu", () => {
  test("est la médiane des phrases lues, pas un extrême", () => {
    const summary = summarizeCalibration(
      [
        sample({ recommended_gain: 2 }),
        sample({ recommended_gain: 8 }),
        sample({ recommended_gain: 3 }),
      ],
      [],
    );
    expect(summary.gain).toBe(3);
  });

  test("reste neutre sans aucune phrase lue", () => {
    const summary = summarizeCalibration([], []);
    expect(summary.gain).toBe(1);
    expect(summary.voiceStandsOut).toBe(false);
  });
});

describe("Le bruit", () => {
  test("une voix noyée sur la plupart des phrases est signalée", () => {
    const summary = summarizeCalibration(
      [
        sample({ voice_stands_out: false }),
        sample({ voice_stands_out: false }),
        sample({ voice_stands_out: true }),
      ],
      [],
    );
    expect(summary.voiceStandsOut).toBe(false);
  });
});

describe("Les corrections proposées", () => {
  const terms = ["Pythagore", "photosynthèse"];

  test("un terme de cours mal entendu est proposé", () => {
    const summary = summarizeCalibration(
      [
        sample({
          misheard: [{ expected: "Pythagore", heard: "pita gore" }],
        }),
      ],
      terms,
    );
    expect(summary.corrections).toEqual([
      { expected: "Pythagore", heard: "pita gore" },
    ]);
  });

  test("une erreur sur un mot courant n'est jamais proposée", () => {
    const summary = summarizeCalibration(
      [sample({ misheard: [{ expected: "cours", heard: "court" }] })],
      terms,
    );
    expect(summary.corrections).toEqual([]);
  });

  test("un petit mot pris dans un terme composé n'est pas proposé", () => {
    // « de » appartient à « dioxyde de carbone », mais une règle « du » → « de »
    // réécrirait des milliers de phrases justes.
    const summary = summarizeCalibration(
      [sample({ misheard: [{ expected: "de", heard: "du" }] })],
      ["dioxyde de carbone"],
    );
    expect(summary.corrections).toEqual([]);
  });

  test("un mot rare pris dans un terme composé est proposé", () => {
    const summary = summarizeCalibration(
      [sample({ misheard: [{ expected: "dioxyde", heard: "dit oxyde" }] })],
      ["dioxyde de carbone"],
    );
    expect(summary.corrections).toHaveLength(1);
  });

  test("la même erreur entendue deux fois n'est proposée qu'une fois", () => {
    const misheard = [{ expected: "photosynthèse", heard: "photo synthèse" }];
    const summary = summarizeCalibration(
      [sample({ misheard }), sample({ misheard })],
      terms,
    );
    expect(summary.corrections).toHaveLength(1);
  });
});

describe("Les phrases lues", () => {
  test("chacune désigne des termes présents dans son texte", () => {
    for (const phrase of CALIBRATION_PHRASES) {
      expect(phrase.terms.length).toBeGreaterThan(0);
      for (const term of phrase.terms) {
        expect(phrase.text.toLowerCase()).toContain(term.toLowerCase());
      }
    }
  });
});

describe("Le gain affiché dans les réglages", () => {
  test("se lit en décibels, arrondis", () => {
    expect(gainInDecibels(1)).toBe(0);
    expect(gainInDecibels(2)).toBe(6);
    expect(gainInDecibels(8)).toBe(18);
  });

  test("un réglage absent ou abîmé se lit comme aucun gain", () => {
    expect(gainInDecibels(undefined)).toBe(0);
    expect(gainInDecibels(Number.NaN)).toBe(0);
    expect(gainInDecibels(0.5)).toBe(0);
  });
});
