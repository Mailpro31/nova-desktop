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
  placeholder = "Select an option...",
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
        className="grid min-h-10 w-full min-w-[200px] cursor-pointer grid-cols-[1fr_auto] items-center gap-2 border border-hairline bg-inset px-3 py-2 text-start text-sm font-medium text-text transition-colors duration-150 [border-radius:var(--nova-radius-control)] hover:border-accent/50 hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transition-none"
        onClick={handleToggle}
        onKeyDown={handleTriggerKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
      >
        <span className="truncate">{selectedOption?.label || placeholder}</span>
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
      {isOpen && !disabled && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={selectedOption?.label || placeholder}
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-60 overflow-y-auto border border-hairline bg-surface p-1 [border-radius:var(--nova-radius-card)] [box-shadow:var(--nova-shadow-floating)]"
          onKeyDown={handleListKeyDown}
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-text-secondary">
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
                className={`w-full cursor-pointer px-3 py-2 text-start text-sm transition-colors duration-150 [border-radius:var(--nova-radius-control)] hover:bg-inset focus:bg-inset focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none ${
                  selectedValue === option.value
                    ? "bg-accent/12 font-semibold text-text"
                    : "text-text"
                }`}
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
