// Nova model branding — the premium "signature collection" layer.
//
// Product rule (Nova): the real engine names (Whisper, Parakeet, Qwen, Voxtral,
// Cohere, Granite, Moonshine, …) must NEVER be shown to the user. Each model is
// re-labelled with a Nova name built from a *category* + a *rank number* (Apple
// style: "M3 Pro"), plus a short one-line description of what it is good at and
// which languages it covers. The speed/accuracy bars are kept as-is elsewhere.
//
// This is a pure presentation layer: it rewrites `name` + `description` only, and
// is applied at the single chokepoint where the catalog reaches the UI (the model
// store), so cards, search and the delete dialog all speak Nova. Custom
// (user-provided) models keep their own name. The mapping is derived from each
// model's traits, so it scales automatically when the catalog grows — no
// per-model table to maintain, and no real name can leak through.

import type { ModelInfo } from "@/bindings";

type Lang = "fr" | "en";

// A category the model belongs to. One is assigned per model by `pickSeries`,
// in priority order, so every model lands in exactly one series.
type Series =
  | "specialist" // single non-English language → "Nova · <Langue>"
  | "direct" // live / streaming
  | "eclair" // instant, tiny
  | "monde" // broad multilingual
  | "precision" // maximum accuracy
  | "clair"; // balanced general workhorse

// French language names for single-language specialists. English kept for the
// EN copy. Codes come from `supported_languages` (already base-canonicalised).
const LANGUAGE_NAMES: Record<string, { fr: string; en: string }> = {
  ru: { fr: "le russe", en: "Russian" },
  vi: { fr: "le vietnamien", en: "Vietnamese" },
  uk: { fr: "l'ukrainien", en: "Ukrainian" },
  ko: { fr: "le coréen", en: "Korean" },
  zh: { fr: "le chinois", en: "Chinese" },
  ar: { fr: "l'arabe", en: "Arabic" },
  ja: { fr: "le japonais", en: "Japanese" },
};

// Short, capitalised specialist label used inside the Nova name (e.g. "Russe").
const LANGUAGE_LABELS: Record<string, { fr: string; en: string }> = {
  ru: { fr: "Russe", en: "Russian" },
  vi: { fr: "Vietnamien", en: "Vietnamese" },
  uk: { fr: "Ukrainien", en: "Ukrainian" },
  ko: { fr: "Coréen", en: "Korean" },
  zh: { fr: "Chinois", en: "Chinese" },
  ar: { fr: "Arabe", en: "Arabic" },
  ja: { fr: "Japonais", en: "Japanese" },
};

const SERIES_LABELS: Record<Exclude<Series, "specialist">, string> = {
  direct: "Direct",
  eclair: "Éclair",
  monde: "Monde",
  precision: "Précision",
  clair: "Clair",
};

// The one non-English specialist language of a model, if any. A model counts as
// a specialist only when it targets a single language that isn't English —
// that's what makes "Nova · Japonais" meaningful. English-only and multi-language
// models flow to the trait-based series instead.
const specialistLang = (m: ModelInfo): string | null => {
  const langs = m.supported_languages ?? [];
  if (langs.length === 1 && langs[0] !== "en" && LANGUAGE_LABELS[langs[0]]) {
    return langs[0];
  }
  return null;
};

// Assign exactly one series, in priority order.
const pickSeries = (m: ModelInfo): Series => {
  if (specialistLang(m)) return "specialist";
  if (m.supports_streaming) return "direct";
  if (m.speed_score >= 0.95) return "eclair";
  if ((m.supported_languages?.length ?? 0) >= 8) return "monde";
  if (m.accuracy_score >= 0.9) return "precision";
  return "clair";
};

// A language hint appended to some descriptions — Nova's audience cares about
// French, so we surface it explicitly when present.
const langHint = (m: ModelInfo, lang: Lang): string => {
  const langs = m.supported_languages ?? [];
  const onlyEnglish = langs.length === 1 && langs[0] === "en";
  const hasFrench = langs.includes("fr");
  if (onlyEnglish) {
    return lang === "fr" ? " Optimisé pour l'anglais." : " Tuned for English.";
  }
  if (hasFrench) {
    return lang === "fr"
      ? " Multilingue, français inclus."
      : " Multilingual, French included.";
  }
  return "";
};

const describe = (m: ModelInfo, series: Series, lang: Lang): string => {
  if (series === "specialist") {
    const code = specialistLang(m)!;
    const name = LANGUAGE_NAMES[code][lang];
    return lang === "fr"
      ? `Spécialisé pour ${name}.`
      : `Specialized for ${name}.`;
  }
  const count = m.supported_languages?.length ?? 0;
  switch (series) {
    case "direct":
      return (
        (lang === "fr"
          ? "Transcription en direct, au fil de la parole."
          : "Live transcription, as you speak.") + langHint(m, lang)
      );
    case "eclair":
      return (
        (lang === "fr"
          ? "Instantané et léger, sur n'importe quelle machine."
          : "Instant and light, on any machine.") + langHint(m, lang)
      );
    case "monde":
      return lang === "fr"
        ? `Large couverture multilingue — ${count} langues.` +
            (m.supported_languages?.includes("fr") ? " Français inclus." : "")
        : `Broad multilingual coverage — ${count} languages.` +
            (m.supported_languages?.includes("fr") ? " French included." : "");
    case "precision":
      return (
        (lang === "fr"
          ? "Précision maximale, pour un texte au plus juste."
          : "Maximum accuracy, for the most faithful text.") + langHint(m, lang)
      );
    case "clair":
      return (
        (lang === "fr"
          ? "Bon équilibre vitesse et précision au quotidien."
          : "A solid balance of speed and accuracy for everyday use.") +
        langHint(m, lang)
      );
  }
};

// Rank comparator inside a series: best first (accuracy, then speed), with id as
// a stable tie-break so numbering never flickers between loads.
const byQuality = (a: ModelInfo, b: ModelInfo): number =>
  b.accuracy_score - a.accuracy_score ||
  b.speed_score - a.speed_score ||
  a.id.localeCompare(b.id);

/**
 * Rewrite `name` + `description` of every catalog model into the Nova signature
 * scheme. Custom models are returned untouched. Pure — returns a new array,
 * does not mutate the inputs.
 */
export const applyNovaBranding = (
  models: ModelInfo[],
  lang: Lang = "fr",
): ModelInfo[] => {
  // Group the brandable models by series (specialists further by language) so we
  // can number each group independently.
  const groupKey = (m: ModelInfo, s: Series): string =>
    s === "specialist" ? `specialist:${specialistLang(m)}` : s;

  const groups = new Map<string, ModelInfo[]>();
  for (const m of models) {
    if (m.is_custom) continue;
    const s = pickSeries(m);
    const key = groupKey(m, s);
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(m);
  }
  for (const list of groups.values()) list.sort(byQuality);

  // Build id → { name, description } from the ranked groups.
  const branded = new Map<string, { name: string; description: string }>();
  for (const [key, list] of groups.entries()) {
    const isSpecialist = key.startsWith("specialist:");
    list.forEach((m, i) => {
      const s = pickSeries(m);
      const rank = i + 1;
      let name: string;
      if (isSpecialist) {
        const code = specialistLang(m)!;
        const label = LANGUAGE_LABELS[code][lang];
        // Only number a language when it has more than one variant.
        name = list.length > 1 ? `Nova · ${label} ${rank}` : `Nova · ${label}`;
      } else {
        name = `Nova ${SERIES_LABELS[s as Exclude<Series, "specialist">]} ${rank}`;
      }
      branded.set(m.id, { name, description: describe(m, s, lang) });
    });
  }

  return models.map((m) => {
    const b = branded.get(m.id);
    return b ? { ...m, name: b.name, description: b.description } : m;
  });
};
