import { describe, expect, test } from "bun:test";
import type { ModelInfo } from "@/bindings";
import { chooseLocalFallbackModel, fallbackLanguage } from "./localFallback";

/**
 * Le modèle local qu'une organisation prépare pour les moments où son serveur
 * ne répond pas. Le catalogue arrive déjà dans l'ordre éditorial : le choix ne
 * réordonne rien, il écarte seulement ce qui ne sait pas dicter dans la langue
 * du membre.
 */
const model = (overrides: Partial<ModelInfo> & { id: string }): ModelInfo => ({
  name: overrides.id,
  description: "",
  filename: `${overrides.id}.gguf`,
  source: { HuggingFace: {} } as unknown as ModelInfo["source"],
  size_mb: 500,
  is_downloaded: false,
  is_downloading: false,
  partial_size: 0,
  is_directory: false,
  engine_type: "TranscribeCpp" as unknown as ModelInfo["engine_type"],
  accuracy_score: 80,
  speed_score: 80,
  supports_translation: false,
  is_recommended: false,
  supported_languages: ["en"],
  supports_language_selection: true,
  is_custom: false,
  supports_streaming: false,
  supports_language_detection: false,
  ...overrides,
});

const englishFirst = model({
  id: "english-first",
  is_recommended: true,
  supported_languages: ["en"],
});
const multilingual = model({
  id: "multilingual",
  is_recommended: true,
  supported_languages: ["en", "fr", "de", "es"],
});
const broadest = model({
  id: "broadest",
  is_recommended: true,
  supported_languages: ["en", "fr", "de", "es", "he", "ja"],
});
const catalog = [englishFirst, multilingual, broadest];

describe("chooseLocalFallbackModel", () => {
  test("un membre francophone reçoit le premier modèle recommandé qui parle français", () => {
    expect(chooseLocalFallbackModel(catalog, "fr")?.id).toBe("multilingual");
  });

  test("un membre anglophone reçoit le premier modèle recommandé", () => {
    expect(chooseLocalFallbackModel(catalog, "en")?.id).toBe("english-first");
  });

  test("un code régional compte pour sa langue", () => {
    expect(chooseLocalFallbackModel(catalog, "fr-FR")?.id).toBe("multilingual");
  });

  test("sans langue imposée, l'ordre éditorial décide", () => {
    expect(chooseLocalFallbackModel(catalog, "auto")?.id).toBe("english-first");
    expect(chooseLocalFallbackModel(catalog, "")?.id).toBe("english-first");
  });

  test("un modèle déjà présent qui parle la langue évite tout téléchargement", () => {
    const installed = model({
      id: "installed",
      is_downloaded: true,
      is_recommended: false,
      supported_languages: ["fr"],
    });
    expect(chooseLocalFallbackModel([...catalog, installed], "fr")?.id).toBe(
      "installed",
    );
  });

  test("un modèle présent dans une autre langue ne suffit pas", () => {
    const installed = model({
      id: "installed-english",
      is_downloaded: true,
      supported_languages: ["en"],
    });
    expect(chooseLocalFallbackModel([installed, ...catalog], "fr")?.id).toBe(
      "multilingual",
    );
  });

  test("ni modèle hérité, ni modèle personnalisé", () => {
    const legacy = model({
      id: "legacy",
      is_recommended: true,
      supported_languages: ["fr"],
      source: { Url: {} } as unknown as ModelInfo["source"],
    });
    const custom = model({
      id: "custom",
      is_recommended: true,
      is_custom: true,
      supported_languages: ["fr"],
    });
    expect(
      chooseLocalFallbackModel([legacy, custom, ...catalog], "fr")?.id,
    ).toBe("multilingual");
  });

  test("aucun recommandé ne parle la langue : celui qui en couvre le plus", () => {
    expect(chooseLocalFallbackModel(catalog, "ko")?.id).toBe("broadest");
  });

  test("rien de recommandé, rien à préparer", () => {
    expect(
      chooseLocalFallbackModel([model({ id: "unranked" })], "fr"),
    ).toBeNull();
    expect(chooseLocalFallbackModel([], "fr")).toBeNull();
  });
});

describe("la langue « automatique »", () => {
  /**
   * Mesuré le 29/09 : langue de dictée sur « auto », un modèle anglais hérité
   * installé, serveur injoignable — « mon IBAN » devenait « mon Nilbani ».
   * « auto » n'impose aucune langue au moteur, mais le repli, lui, doit parler
   * celle de l'élève : c'est la langue de l'interface qui tranche.
   */
  test("c'est la langue de l'interface qui choisit le modèle de repli", () => {
    const installedEnglish = model({
      id: "installed-english",
      is_downloaded: true,
      supported_languages: ["en"],
    });
    expect(
      chooseLocalFallbackModel([installedEnglish, multilingual], "auto", "fr")
        ?.id,
    ).toBe("multilingual");
  });

  test("et la langue voulue est rendue au poste pour qu'il vérifie le modèle en place", () => {
    expect(fallbackLanguage("auto", "fr-FR")).toBe("fr");
    expect(fallbackLanguage("de", "fr")).toBe("de");
    expect(fallbackLanguage("auto", "auto")).toBeNull();
  });
});
