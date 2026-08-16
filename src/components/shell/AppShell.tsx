import React from "react";

import Footer from "../footer";
import { Sidebar, type SidebarSection } from "../Sidebar";

interface AppShellProps {
  activeSection: SidebarSection;
  onSectionChange: (section: SidebarSection) => void;
  /** Bandeau d'alerte système, affiché au-dessus du contenu. */
  banner?: React.ReactNode;
  /** Direction d'écriture, `rtl` pour l'arabe et l'hébreu. */
  dir?: "ltr" | "rtl";
  children: React.ReactNode;
}

/**
 * Structure globale de l'application : barre latérale, zone de contenu,
 * pied de page.
 *
 * Deux invariants tiennent toute la cohérence des écrans :
 *
 * 1. **Une seule colonne de contenu.** Largeur maximale et marges sont fixées
 *    ici, pas dans les écrans. Un écran qui se centrerait lui-même sur la
 *    fenêtre entière dériverait de tous les autres.
 * 2. **Centrage optique après la barre latérale.** `mx-auto` s'applique à
 *    l'intérieur de `<main>`, qui commence après la barre — le contenu est donc
 *    centré dans la zone restante, jamais par rapport à la fenêtre.
 *
 * Les marges sont exprimées en pixels et non en unités `rem` : la base
 * typographique de Nova est à 15 px, un `px-8` Tailwind vaudrait 30 px et
 * casserait la grille de 4 px de la planche de fondation.
 */
export const AppShell: React.FC<AppShellProps> = ({
  activeSection,
  onSectionChange,
  banner,
  dir,
  children,
}) => (
  <div
    dir={dir}
    className="h-screen flex flex-col select-none cursor-default bg-background text-text"
  >
    <div className="flex-1 flex overflow-hidden">
      <Sidebar
        activeSection={activeSection}
        onSectionChange={onSectionChange}
      />

      <main className="flex-1 overflow-y-auto min-w-0">
        <div className="mx-auto w-full max-w-3xl px-[32px] py-[32px]">
          {banner}
          {children}
        </div>
      </main>
    </div>

    <Footer />
  </div>
);

export default AppShell;
