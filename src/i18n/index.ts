import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { locale } from "@tauri-apps/plugin-os";
import { LANGUAGE_METADATA } from "./languages";
import { commands } from "@/bindings";
import enTranslation from "./locales/en/translation.json";
import frTranslation from "./locales/fr/translation.json";
import {
  getLanguageDirection,
  updateDocumentDirection,
  updateDocumentLanguage,
} from "@/lib/utils/rtl";

// French and English are the startup/fallback languages. Every other locale is
// a separate Vite chunk loaded only when selected, avoiding ~900 KB of locale
// JSON in both the main window and the tiny recording overlay.
const localeModules = import.meta.glob<{ default: Record<string, unknown> }>([
  "./locales/*/translation.json",
  "!./locales/en/translation.json",
  "!./locales/fr/translation.json",
]);
const resources: Record<string, { translation: Record<string, unknown> }> = {
  en: { translation: enTranslation },
  fr: { translation: frTranslation },
};

const localeCodes = [
  "en",
  "fr",
  ...Object.keys(localeModules)
    .map((path) => path.match(/\.\/locales\/(.+)\/translation\.json/)?.[1])
    .filter((code): code is string => Boolean(code)),
];

// Build supported languages list from discovered locales + metadata
export const SUPPORTED_LANGUAGES = localeCodes
  .map((code) => {
    const meta = LANGUAGE_METADATA[code];
    if (!meta) {
      console.warn(`Missing metadata for locale "${code}" in languages.ts`);
      return { code, name: code, nativeName: code, priority: undefined };
    }
    return {
      code,
      name: meta.name,
      nativeName: meta.nativeName,
      priority: meta.priority,
    };
  })
  .sort((a, b) => {
    // Sort by priority first (lower = higher), then alphabetically
    if (a.priority !== undefined && b.priority !== undefined) {
      return a.priority - b.priority;
    }
    if (a.priority !== undefined) return -1;
    if (b.priority !== undefined) return 1;
    return a.name.localeCompare(b.name);
  });

export type SupportedLanguageCode = string;

export const loadLanguage = async (language: string): Promise<void> => {
  if (i18n.hasResourceBundle(language, "translation")) return;
  const path = `./locales/${language}/translation.json`;
  const loader = localeModules[path];
  if (!loader) return;
  const module = await loader();
  i18n.addResourceBundle(language, "translation", module.default, true, true);
};

export const changeAppLanguage = async (language: string): Promise<void> => {
  await loadLanguage(language);
  await i18n.changeLanguage(language);
};

// Check if a language code is supported
const getSupportedLanguage = (
  langCode: string | null | undefined,
): SupportedLanguageCode | null => {
  if (!langCode) return null;
  const normalized = langCode.toLowerCase();
  // Try exact match first
  let supported = SUPPORTED_LANGUAGES.find(
    (lang) => lang.code.toLowerCase() === normalized,
  );
  if (!supported) {
    // Fall back to prefix match (language only, without region)
    const prefix = normalized.split("-")[0];
    supported = SUPPORTED_LANGUAGES.find(
      (lang) => lang.code.toLowerCase() === prefix,
    );
  }
  return supported ? supported.code : null;
};

// Nova est francophone d'abord : français par défaut, repli anglais pour toute
// clé manquante. La langue est ensuite synchronisée depuis les réglages / la
// locale système après l'init.
i18n.use(initReactI18next).init({
  resources,
  lng: "fr",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false, // React already escapes values
  },
  react: {
    useSuspense: false, // Disable suspense for SSR compatibility
  },
});

// Sync language from app settings
export const syncLanguageFromSettings = async () => {
  try {
    const result = await commands.getAppSettings();
    if (result.status === "ok" && result.data.app_language) {
      const supported = getSupportedLanguage(result.data.app_language);
      if (supported && supported !== i18n.language) {
        await changeAppLanguage(supported);
      }
    } else {
      // Fall back to system locale detection if no saved preference
      const systemLocale = await locale();
      const supported = getSupportedLanguage(systemLocale);
      if (supported && supported !== i18n.language) {
        await changeAppLanguage(supported);
      }
    }
  } catch (e) {
    console.warn("Failed to sync language from settings:", e);
  }
};

// Run language sync on init
syncLanguageFromSettings();

// Listen for language changes to update HTML dir and lang attributes
i18n.on("languageChanged", (lng) => {
  const dir = getLanguageDirection(lng);
  updateDocumentDirection(dir);
  updateDocumentLanguage(lng);
});

// Re-export RTL utilities for convenience
export { getLanguageDirection, isRTLLanguage } from "@/lib/utils/rtl";

export default i18n;
