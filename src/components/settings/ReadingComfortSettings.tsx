import React, { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Volume2 } from "lucide-react";

import { Button } from "../ui/Button";
import { SettingsGroup } from "../ui/SettingsGroup";
import {
  loadReadingComfort,
  READING_COMFORT_EVENT,
  READING_FONTS,
  saveReadingComfort,
  SPACINGS,
  SPEECH_RATES,
  TEXT_SIZES,
  type ReadingComfort,
} from "@/lib/readingComfort";
import { speak } from "@/lib/speech";

/**
 * « Lecture et confort » : taille, espacement, police, et vitesse de la
 * lecture à voix haute.
 *
 * Des boutons radio plutôt que des menus : toutes les options restent sous les
 * yeux, sans liste à ouvrir ni à parcourir — un geste de moins, et rien à
 * relire pour savoir ce qui est choisi.
 */
export const ReadingComfortSettings: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [comfort, setComfort] = useState<ReadingComfort>(loadReadingComfort);

  useEffect(() => {
    const reload = () => setComfort(loadReadingComfort());
    window.addEventListener(READING_COMFORT_EVENT, reload);
    return () => window.removeEventListener(READING_COMFORT_EVENT, reload);
  }, []);

  const update = (change: Partial<ReadingComfort>) => {
    const next = { ...comfort, ...change };
    setComfort(next);
    saveReadingComfort(next);
  };

  return (
    <SettingsGroup title={t("settings.readingComfort.title")}>
      <p className="px-4 pt-3 text-sm text-text-secondary leading-relaxed">
        {t("settings.readingComfort.description")}
      </p>
      <Choice
        title={t("settings.readingComfort.textSize.title")}
        options={TEXT_SIZES.map((value) => ({
          value,
          label: t(`settings.readingComfort.textSize.${value}`),
        }))}
        selected={comfort.textSize}
        onSelect={(textSize) => update({ textSize })}
      />
      <Choice
        title={t("settings.readingComfort.spacing.title")}
        description={t("settings.readingComfort.spacing.description")}
        options={SPACINGS.map((value) => ({
          value,
          label: t(`settings.readingComfort.spacing.${value}`),
        }))}
        selected={comfort.spacing}
        onSelect={(spacing) => update({ spacing })}
      />
      <Choice
        title={t("settings.readingComfort.font.title")}
        description={t("settings.readingComfort.font.description")}
        options={READING_FONTS.map((value) => ({
          value,
          label: t(`settings.readingComfort.font.${value}`),
        }))}
        selected={comfort.font}
        onSelect={(font) => update({ font })}
      />
      <Choice
        title={t("settings.readingComfort.speechRate.title")}
        description={t("settings.readingComfort.speechRate.description")}
        options={SPEECH_RATES.map((value) => ({
          value: String(value),
          label: t(`settings.readingComfort.speechRate.${rateKey(value)}`),
        }))}
        selected={String(comfort.speechRate)}
        onSelect={(rate) => update({ speechRate: Number(rate) })}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            speak(t("settings.readingComfort.speechRate.sample"), {
              uiLanguage: i18n.language,
              rate: comfort.speechRate,
            })
          }
        >
          <Volume2 size={14} aria-hidden="true" />
          {t("settings.readingComfort.speechRate.try")}
        </Button>
      </Choice>
    </SettingsGroup>
  );
};

function rateKey(rate: number): "slow" | "normal" | "fast" {
  if (rate < 1) return "slow";
  if (rate > 1) return "fast";
  return "normal";
}

interface ChoiceProps<T extends string> {
  title: string;
  description?: string;
  options: Array<{ value: T; label: string }>;
  selected: T;
  onSelect: (value: T) => void;
  children?: React.ReactNode;
}

function Choice<T extends string>({
  title,
  description,
  options,
  selected,
  onSelect,
  children,
}: ChoiceProps<T>) {
  const name = useId();
  return (
    <div className="flex flex-col gap-2 px-4 py-3 border-b border-hairline last:border-b-0">
      <div>
        <p className="text-sm font-medium text-text">{title}</p>
        {description && (
          <p className="text-xs text-text-secondary leading-relaxed">
            {description}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="radiogroup"
          aria-label={title}
          className="flex flex-wrap gap-2"
        >
          {options.map((option) => (
            <label
              key={option.value}
              className={`relative cursor-pointer rounded-control border px-3 py-1.5 text-sm transition-colors duration-[120ms] motion-reduce:transition-none has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
                selected === option.value
                  ? "border-accent bg-accent/10 text-accent font-medium"
                  : "border-hairline-strong text-text hover:border-accent/60"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected === option.value}
                onChange={() => onSelect(option.value)}
                // Transparent et étendu à toute l'étiquette : cliquable
                // partout, lu comme un bouton radio par un lecteur d'écran.
                className="absolute inset-0 cursor-pointer opacity-0"
              />
              {option.label}
            </label>
          ))}
        </div>
        {children}
      </div>
    </div>
  );
}

export default ReadingComfortSettings;
