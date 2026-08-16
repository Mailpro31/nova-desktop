import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

interface CommandPaletteSurfaceProps {
  label: string;
  onClose: () => void;
  /**
   * Clavier de la palette.
   *
   * Le gestionnaire vit **ici**, sur l'élément qui détient réellement le
   * focus. Placé sur un enfant, il ne recevrait jamais rien : les événements
   * remontent depuis l'élément focalisé, ils ne descendent pas vers lui.
   */
  onKeyDown?: (event: React.KeyboardEvent) => void;
  children: React.ReactNode;
}

/**
 * Surface de la palette Nova Commands.
 *
 * Volontairement **pas** le composant `Dialog` du produit : celui-ci est une
 * boîte de dialogue centrée, avec en-tête, titre et bouton de fermeture — la
 * grammaire d'une décision. Une palette est autre chose : une liste d'actions
 * qu'on parcourt au clavier, ancrée haut, sans chrome. Réutiliser `Dialog`
 * aurait imposé son piège de tabulation, incompatible avec la navigation par
 * flèches, et son en-tête, qui doublerait la première ligne de la liste.
 *
 * Ancrage haut plutôt que centrage : la hauteur du contenu varie beaucoup
 * (quatre actions, puis un résultat long). Centré, le panneau se déplacerait
 * sous le curseur entre l'ouverture et l'aperçu. Ancré, il grandit vers le bas.
 *
 * **Position fixe dans la fenêtre Nova**, jamais calée sur la sélection : rien
 * ne permet aujourd'hui de connaître de façon fiable la position d'une
 * sélection dans une application tierce, et une heuristique fragile serait pire
 * qu'un emplacement stable.
 */
export const CommandPaletteSurface: React.FC<CommandPaletteSurfaceProps> = ({
  label,
  onClose,
  onKeyDown,
  children,
}) => {
  const labelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    // Le panneau prend le focus, pas un champ : à l'ouverture, les flèches et
    // Entrée doivent piloter la liste sans détour.
    const frame = requestAnimationFrame(() => panelRef.current?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      restoreFocusRef.current?.focus();
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pb-8 pt-[10vh]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="flex w-full max-w-[460px] flex-col overflow-hidden rounded-panel border border-hairline bg-surface shadow-overlay outline-none max-h-[min(560px,calc(100dvh-14vh))]"
      >
        <span id={labelId} className="sr-only">
          {label}
        </span>
        {children}
      </div>
    </div>,
    document.body,
  );
};

export default CommandPaletteSurface;
