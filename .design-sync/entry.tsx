// Point d'entrée du design system pour /design-sync.
//
// Nova est une application privée (pas de package publié, donc pas de `dist/`
// de librairie) : ce barrel est le contrat explicite de ce qui constitue le
// design system réutilisable — les primitives de `src/components/ui`, les
// composants partagés et les icônes de marque. Il n'implémente rien : il
// réexporte le code réellement embarqué dans l'app.
//
// `NovaProvider` fournit le contexte react-i18next dont plusieurs composants
// dépendent (`useTranslation`). Le module i18n de l'app (`src/i18n/index.ts`)
// n'est pas utilisable ici : il dépend de Tauri (`@tauri-apps/plugin-os`,
// `@/bindings`) et de `import.meta.glob` (Vite). On initialise donc une
// instance minimale avec les deux locales de démarrage de Nova (fr + en).

import React from "react";
import i18n from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";

import enTranslation from "../src/i18n/locales/en/translation.json";
import frTranslation from "../src/i18n/locales/fr/translation.json";

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: {
      en: { translation: enTranslation },
      fr: { translation: frTranslation },
    },
    lng: "fr",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });
}

export const NovaProvider: React.FC<{ children?: React.ReactNode }> = ({
  children,
}) => <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;

/* ── Primitives UI ─────────────────────────────────────────────────────── */
export { Alert } from "../src/components/ui/Alert";
export { AudioPlayer } from "../src/components/ui/AudioPlayer";
export { default as Badge } from "../src/components/ui/Badge";
export { Button } from "../src/components/ui/Button";
export { Dialog } from "../src/components/ui/Dialog";
export { Dropdown } from "../src/components/ui/Dropdown";
export { Input } from "../src/components/ui/Input";
export { PathDisplay } from "../src/components/ui/PathDisplay";
export { ResetButton } from "../src/components/ui/ResetButton";
export { Select } from "../src/components/ui/Select";
export { SettingContainer } from "../src/components/ui/SettingContainer";
export { SettingsGroup } from "../src/components/ui/SettingsGroup";
export { Slider } from "../src/components/ui/Slider";
export { TextDisplay } from "../src/components/ui/TextDisplay";
export { Textarea } from "../src/components/ui/Textarea";
export { ToggleSwitch } from "../src/components/ui/ToggleSwitch";
export { Tooltip } from "../src/components/ui/Tooltip";

/* ── Composants partagés ───────────────────────────────────────────────── */
export { default as ProgressBar } from "../src/components/shared/ProgressBar";

/* ── Icônes de marque ──────────────────────────────────────────────────── */
export { default as CancelIcon } from "../src/components/icons/CancelIcon";
export { default as HandyHand } from "../src/components/icons/HandyHand";
export { default as HandyTextLogo } from "../src/components/icons/HandyTextLogo";
export { default as MicrophoneIcon } from "../src/components/icons/MicrophoneIcon";
export { default as ResetIcon } from "../src/components/icons/ResetIcon";
export { default as TranscriptionIcon } from "../src/components/icons/TranscriptionIcon";
