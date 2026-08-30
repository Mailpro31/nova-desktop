import React from "react";
import { SettingContainer } from "./SettingContainer";

interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  label: string;
  description: string;
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
  showValue?: boolean;
  formatValue?: (value: number) => string;
}

export const Slider: React.FC<SliderProps> = ({
  value,
  onChange,
  min,
  max,
  step = 0.01,
  disabled = false,
  label,
  description,
  descriptionMode = "tooltip",
  grouped = false,
  showValue = true,
  formatValue = (v) => v.toFixed(2),
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(parseFloat(e.target.value));
  };

  return (
    <SettingContainer
      title={label}
      description={description}
      descriptionMode={descriptionMode}
      grouped={grouped}
      layout="horizontal"
      disabled={disabled}
    >
      <div className="w-full">
        <div className="flex h-8 items-center gap-2">
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={handleChange}
            disabled={disabled}
            className="flex-grow h-1.5 rounded-full appearance-none cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              // Piste fine et précise : accent d'action sur la portion
              // parcourue, filet de contrôle sur le reste.
              background: `linear-gradient(to right, var(--color-accent) ${
                ((value - min) / (max - min)) * 100
              }%, var(--color-hairline-strong) ${
                ((value - min) / (max - min)) * 100
              }%)`,
            }}
          />
          {showValue && (
            <output className="w-12 text-end text-xs font-medium tabular-nums text-text-secondary">
              {formatValue(value)}
            </output>
          )}
        </div>
      </div>
    </SettingContainer>
  );
};
