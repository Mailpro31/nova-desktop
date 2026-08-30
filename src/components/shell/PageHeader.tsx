import React from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Actions alignées à droite du titre (bouton, sélecteur…). */
  actions?: React.ReactNode;
}

/**
 * En-tête de page unique à toute l'application.
 *
 * Chaque écran passe par ce composant, donc le titre, le sous-titre et les
 * actions occupent exactement la même position d'un écran à l'autre. C'est ce
 * qui donne la stabilité verticale demandée par la planche de fondation :
 * l'œil n'a jamais à retrouver le titre en changeant de destination.
 *
 * Échelle : titre de page 26 px / 600, sous-titre en corps 14 px sur le texte
 * secondaire. Les deux valeurs viennent de la planche.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  actions,
}) => (
  <header className="flex items-start justify-between gap-4 mb-[24px]">
    <div className="min-w-0">
      <h1 className="text-[26px] font-semibold tracking-[-0.015em] text-text leading-tight">
        {title}
      </h1>
      {description && (
        <p className="mt-1 text-sm text-text-secondary leading-relaxed">
          {description}
        </p>
      )}
    </div>
    {actions && (
      <div className="shrink-0 flex items-center gap-2">{actions}</div>
    )}
  </header>
);

export default PageHeader;
