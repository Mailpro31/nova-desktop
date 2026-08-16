import React, { useId, useRef, useState } from "react";

import { Tooltip } from "../../ui/Tooltip";

interface PreviewBadgeProps {
  label: string;
  hint: string;
}

/**
 * Signal d'état « en cours de test », posé à côté du titre de page.
 *
 * Traitement délibérément discret : une pastille neutre et une explication au
 * survol. Un bandeau d'avertissement serait disproportionné — la fonctionnalité
 * est incomplète, pas risquée — et répété sur chaque écran il deviendrait
 * invisible.
 *
 * L'explication est atteignable au clavier autant qu'à la souris : la pastille
 * est focalisable et décrite par le texte de l'infobulle, faute de quoi
 * l'information n'existerait que pour ceux qui utilisent un pointeur.
 */
export const PreviewBadge: React.FC<PreviewBadgeProps> = ({ label, hint }) => {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const hintId = useId();

  return (
    <span
      ref={anchorRef}
      tabIndex={0}
      aria-describedby={hintId}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      className="inline-flex h-[22px] cursor-help items-center rounded-chip border border-hairline-strong px-2 text-[11px] font-medium text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {label}
      {/* Toujours dans le DOM : une infobulle qui n'existe qu'au survol n'est
          jamais lue par une technologie d'assistance. */}
      <span id={hintId} className="sr-only">
        {hint}
      </span>
      {open && (
        <Tooltip targetRef={anchorRef} position="bottom">
          {hint}
        </Tooltip>
      )}
    </span>
  );
};

export default PreviewBadge;
