import React, { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export interface DropdownOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface DropdownProps {
  options: DropdownOption[];
  className?: string;
  selectedValue: string | null;
  onSelect: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  onRefresh?: () => void;
}

export const Dropdown: React.FC<DropdownProps> = ({
  options,
  selectedValue,
  onSelect,
  className = "",
  placeholder,
  disabled = false,
  onRefresh,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const selectedIndex = options.findIndex(
      (option) => option.value === selectedValue && !option.disabled,
    );
    const firstEnabledIndex = options.findIndex((option) => !option.disabled);
    const focusIndex = selectedIndex >= 0 ? selectedIndex : firstEnabledIndex;
    const animationFrame = requestAnimationFrame(() => {
      optionRefs.current[focusIndex]?.focus();
    });

    return () => cancelAnimationFrame(animationFrame);
  }, [isOpen, options, selectedValue]);

  const selectedOption = options.find(
    (option) => option.value === selectedValue,
  );

  const handleSelect = (value: string) => {
    onSelect(value);
    setIsOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const openMenu = () => {
    if (disabled || isOpen) return;
    onRefresh?.();
    setIsOpen(true);
  };

  const handleToggle = () => {
    if (disabled) return;
    if (isOpen) {
      setIsOpen(false);
    } else {
      openMenu();
    }
  };

  const handleTriggerKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openMenu();
    }
  };

  const handleListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
      return;
    }

    if (event.key === "Tab") {
      setIsOpen(false);
      return;
    }

    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      return;
    }

    event.preventDefault();
    const enabledIndexes = options
      .map((option, index) => (!option.disabled ? index : -1))
      .filter((index) => index >= 0);
    if (enabledIndexes.length === 0) return;

    const currentIndex = optionRefs.current.findIndex(
      (element) => element === document.activeElement,
    );
    const currentEnabledIndex = enabledIndexes.indexOf(currentIndex);
    let nextIndex: number;

    if (event.key === "Home") {
      nextIndex = enabledIndexes[0];
    } else if (event.key === "End") {
      nextIndex = enabledIndexes[enabledIndexes.length - 1];
    } else if (event.key === "ArrowUp") {
      const previous =
        currentEnabledIndex <= 0
          ? enabledIndexes.length - 1
          : currentEnabledIndex - 1;
      nextIndex = enabledIndexes[previous];
    } else {
      const next =
        currentEnabledIndex < 0 ||
        currentEnabledIndex === enabledIndexes.length - 1
          ? 0
          : currentEnabledIndex + 1;
      nextIndex = enabledIndexes[next];
    }

    optionRefs.current[nextIndex]?.focus();
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`h-[var(--control-h)] px-3 text-sm text-text bg-inset border border-hairline-strong rounded-control min-w-[200px] w-full text-start grid grid-cols-[1fr_auto] gap-2 items-center transition-colors duration-[120ms] motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          disabled
            ? "opacity-40 cursor-not-allowed"
            : "cursor-pointer hover:border-accent/60"
        }`}
        onClick={handleToggle}
        onKeyDown={handleTriggerKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
      >
        <span className="truncate">
          {selectedOption?.label || placeholder || t("common.selectOption")}
        </span>
        <svg
          className={`h-4 w-4 transition-transform duration-150 motion-reduce:transition-none ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {/* Menu flottant : élévation 2, rayon de carte, filet de séparation. */}
      {isOpen && !disabled && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={selectedOption?.label || placeholder}
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-60 overflow-y-auto border border-hairline bg-surface p-1 rounded-card shadow-floating"
          onKeyDown={handleListKeyDown}
        >
          {options.length === 0 ? (
            <div className="px-2 py-1.5 text-sm text-text-secondary">
              {t("common.noOptionsFound")}
            </div>
          ) : (
            options.map((option, index) => (
              <button
                key={option.value}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                type="button"
                role="option"
                aria-selected={selectedValue === option.value}
                tabIndex={-1}
                className={`w-full cursor-pointer px-2 py-1.5 text-sm text-start rounded-chip transition-colors duration-[120ms] motion-reduce:transition-none hover:bg-accent/10 focus:bg-accent/10 focus:outline-none ${
                  selectedValue === option.value
                    ? "bg-accent/12 text-accent font-medium"
                    : "text-text"
                } ${option.disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                onClick={() => handleSelect(option.value)}
                disabled={option.disabled}
              >
                <span className="whitespace-normal break-words">
                  {option.label}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};
