import React from "react";
import ResetIcon from "../icons/ResetIcon";

interface ResetButtonProps {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  children?: React.ReactNode;
}

export const ResetButton: React.FC<ResetButtonProps> = React.memo(
  ({ onClick, disabled = false, className = "", ariaLabel, children }) => (
    <button
      type="button"
      aria-label={ariaLabel}
      className={`p-1 rounded-chip border border-transparent transition-colors duration-[120ms] ${
        disabled
          ? "opacity-40 cursor-not-allowed text-text-secondary"
          : "text-text-secondary hover:text-accent hover:bg-accent/10 active:bg-accent/15 hover:cursor-pointer"
      } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children ?? <ResetIcon />}
    </button>
  ),
);
