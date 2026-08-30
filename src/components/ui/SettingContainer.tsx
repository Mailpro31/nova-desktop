import React, { useEffect, useRef, useState } from "react";
import { CircleHelp } from "lucide-react";
import { Tooltip } from "./Tooltip";

interface SettingContainerProps {
  title: string;
  description: string;
  children: React.ReactNode;
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
  layout?: "horizontal" | "stacked";
  disabled?: boolean;
  tooltipPosition?: "top" | "bottom";
}

export const SettingContainer: React.FC<SettingContainerProps> = ({
  title,
  description,
  children,
  descriptionMode = "tooltip",
  grouped = false,
  layout = "horizontal",
  disabled = false,
  tooltipPosition = "top",
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showTooltip) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (!tooltipRef.current?.contains(event.target as Node)) {
        setShowTooltip(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowTooltip(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showTooltip]);

  const containerClasses = grouped
    ? "px-4 py-3"
    : "border border-hairline bg-surface px-4 py-3 [border-radius:var(--nova-radius-card)]";
  const directionClasses =
    layout === "stacked"
      ? "flex flex-col gap-3"
      : "flex min-h-14 items-center justify-between gap-5";

  return (
    <div className={`${containerClasses} ${directionClasses}`}>
      <div
        className={layout === "horizontal" ? "min-w-0 max-w-[65%]" : "min-w-0"}
      >
        <div className="flex items-center gap-1.5">
          <h3
            className={`text-sm font-medium text-text ${disabled ? "opacity-60" : ""}`}
          >
            {title}
          </h3>
          {descriptionMode === "tooltip" && (
            <div
              ref={tooltipRef}
              className="relative flex"
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              onFocus={() => setShowTooltip(true)}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setShowTooltip(false);
                }
              }}
            >
              <button
                type="button"
                aria-label="More information"
                aria-expanded={showTooltip}
                onClick={() => setShowTooltip((visible) => !visible)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors duration-150 hover:bg-inset hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <CircleHelp size={15} strokeWidth={1.75} aria-hidden="true" />
              </button>
              {showTooltip && (
                <Tooltip targetRef={tooltipRef} position={tooltipPosition}>
                  {description}
                </Tooltip>
              )}
            </div>
          )}
        </div>
        {descriptionMode === "inline" && (
          <p
            className={`mt-1 text-xs leading-relaxed text-text-secondary ${disabled ? "opacity-60" : ""}`}
          >
            {description}
          </p>
        )}
      </div>
      <div
        className={`relative ${layout === "stacked" ? "w-full" : "shrink-0"}`}
      >
        {children}
      </div>
    </div>
  );
};
