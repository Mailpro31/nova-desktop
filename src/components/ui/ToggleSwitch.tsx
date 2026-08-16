import React from "react";
import { SettingContainer } from "./SettingContainer";

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  isUpdating?: boolean;
  label: string;
  description: string;
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
  tooltipPosition?: "top" | "bottom";
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  isUpdating = false,
  label,
  description,
  descriptionMode = "tooltip",
  grouped = false,
  tooltipPosition = "top",
}) => {
  return (
    <SettingContainer
      title={label}
      description={description}
      descriptionMode={descriptionMode}
      grouped={grouped}
      disabled={disabled}
      tooltipPosition={tooltipPosition}
    >
      <label
        className={`flex items-center ${disabled || isUpdating ? "cursor-not-allowed" : "cursor-pointer"}`}
      >
        <input
          type="checkbox"
          value=""
          className="sr-only peer"
          checked={checked}
          disabled={disabled || isUpdating}
          onChange={(e) => onChange(e.target.checked)}
        />
        {/* Planche de fondation : piste 44×26, pastille 20 px, course 18 px.
            Dimensions en px et non en unités rem — la base typographique à
            15 px décalerait un `w-11 h-6` de 3 px. */}
        <div className="relative w-[44px] h-[26px] rounded-full bg-mid-gray/25 peer transition-colors duration-[120ms] motion-reduce:transition-none peer-checked:bg-accent peer-disabled:opacity-40 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent after:content-[''] after:absolute after:top-[3px] after:start-[3px] after:h-[20px] after:w-[20px] after:rounded-full after:bg-white after:shadow-raised after:transition-transform after:duration-[180ms] motion-reduce:after:transition-none peer-checked:after:translate-x-[18px] rtl:peer-checked:after:-translate-x-[18px]"></div>
      </label>
      {isUpdating && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
    </SettingContainer>
  );
};
