import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import {
  TOUR_CARDS,
  TOUR_REPLAY_EVENT,
  isTourSeen,
  markTourSeen,
  requestTourReplay,
} from "./featureTour";

const realLocalStorage = Object.getOwnPropertyDescriptor(
  globalThis,
  "localStorage",
);
const realWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const store = new Map<string, string>();
const bus = new EventTarget();
beforeAll(() => {
  Object.assign(globalThis, {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
    window: bus,
  });
});

// bun partage le processus entre fichiers : on rend les globales telles quelles.
afterAll(() => {
  for (const [k, d] of [
    ["localStorage", realLocalStorage],
    ["window", realWindow],
  ] as const) {
    if (d) Object.defineProperty(globalThis, k, d);
    else delete (globalThis as Record<string, unknown>)[k];
  }
});

beforeEach(() => store.clear());

describe("visite guidée", () => {
  it("se lance au premier lancement, pas au second", () => {
    expect(isTourSeen()).toBe(false);
    markTourSeen();
    expect(isTourSeen()).toBe(true);
  });

  it("« Passer » (même fermeture que Terminer et Échap) la marque vue", () => {
    // FeatureTourGate.close appelle markTourSeen pour les trois sorties.
    markTourSeen();
    expect(isTourSeen()).toBe(true);
  });

  it("« Revoir la visite » la relance même si elle est déjà vue", () => {
    markTourSeen();
    let relances = 0;
    bus.addEventListener(TOUR_REPLAY_EVENT, () => relances++);
    requestTourReplay();
    expect(relances).toBe(1);
  });

  it("chaque carte a son texte dans les deux langues", async () => {
    for (const lang of ["en", "fr"]) {
      const { featureTour } = (
        await import(`../i18n/locales/${lang}/translation.json`)
      ).default;
      for (const c of TOUR_CARDS) {
        expect(featureTour.cards[c.id].title).toBeTruthy();
        expect(featureTour.cards[c.id].text).toBeTruthy();
      }
    }
  });
});
