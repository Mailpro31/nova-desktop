import React from "react";

import { formatKeyPart } from "@/lib/utils/keyboard";

interface KeyboardShortcutProps {
  /** Raccourci tel que stocké dans les réglages, par ex. `Ctrl+Space`. */
  binding: string;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Représentation d'un raccourci clavier.
 *
 * Une touche par élément `<kbd>`, séparées par un `+` léger : la forme d'un
 * clavier, pas une chaîne de caractères. Le rendu est identique partout, ce qui
 * évite les trois variantes qui coexistaient auparavant dans le produit.
 *
 * Les touches sont nommées comme sur le clavier, dans la langue de l'interface :
 * « ctrl_right » enregistré s'affiche « Ctrl droit ».
 */
export const KeyboardShortcut: React.FC<KeyboardShortcutProps> = ({
  binding,
  size = "md",
  className = "",
}) => {
  const keys = splitBinding(binding);
  if (keys.length === 0) return null;

  const keyClasses =
    size === "sm"
      ? "h-[20px] min-w-[20px] px-1.5 text-[11px]"
      : "h-[26px] min-w-[26px] px-2 text-[13px]";

  return (
    <span
      className={`inline-flex items-center gap-1 ${className}`}
      // Lu « Ctrl plus Espace » plutôt que comme une suite de touches isolées.
      aria-label={keys.join(" + ")}
    >
      {keys.map((key, index) => (
        <React.Fragment key={`${key}-${index}`}>
          {index > 0 && (
            <span aria-hidden="true" className="text-xs text-text-secondary">
              +
            </span>
          )}
          <kbd
            aria-hidden="true"
            className={`inline-flex items-center justify-center rounded-chip border border-hairline-strong bg-surface font-medium text-text ${keyClasses}`}
          >
            {key}
          </kbd>
        </React.Fragment>
      ))}
    </span>
  );
};

/**
 * Les raccourcis sont stockés avec des séparateurs variables selon la
 * plateforme et l'implémentation clavier (`Ctrl+Space`, `ctrl space`). On
 * accepte les deux plutôt que d'imposer une forme au stockage, qui n'est pas
 * l'affaire de ce composant.
 */
function splitBinding(binding: string): string[] {
  return binding
    .split(/[+\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map(formatKeyPart);
}

export default KeyboardShortcut;
