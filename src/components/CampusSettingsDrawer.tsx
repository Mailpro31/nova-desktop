import React from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, X } from "lucide-react";
import {
  CAMPUS_SIDEBAR_ORDER,
  SECTIONS_CONFIG,
  SECTION_COLORS,
  getCampusLabelKey,
  type SidebarSection,
} from "./Sidebar";

interface CampusSettingsDrawerProps {
  open: boolean;
  activeSection: SidebarSection;
  onNavigate: (section: SidebarSection) => void;
  onClose: () => void;
}

// Panneau latéral des réglages en mode campus : remplace la sidebar classique.
// Les catégories (Accueil / Styles / Historique / Réglages / Personnalisation)
// sont accessibles depuis une roue ancrée sur l'application ; la sélection
// navigue dans le contenu principal, sans changer d'écran.
export const CampusSettingsDrawer: React.FC<CampusSettingsDrawerProps> = ({
  open,
  activeSection,
  onNavigate,
  onClose,
}) => {
  const { t } = useTranslation();

  return (
    <>
      {/* Voile d'arrière-plan : cliquer ferme le panneau */}
      <div
        className={`fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        role="dialog"
        aria-modal="true"
        className={`fixed top-0 right-0 z-50 flex h-full w-80 max-w-[85vw] flex-col border-l border-hairline bg-background shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <h2 className="text-base font-semibold text-text">
            {t("campus.settings.drawerTitle")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-mid-gray/10 hover:text-text"
            aria-label={t("campus.settings.drawerTitle")}
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {CAMPUS_SIDEBAR_ORDER.map((id) => {
            const config = SECTIONS_CONFIG[id];
            const Icon = config.icon;
            const color = SECTION_COLORS[id];
            const isActive = activeSection === id;

            return (
              <button
                key={id}
                type="button"
                onClick={() => onNavigate(id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-accent/10 text-text"
                    : "text-text-secondary hover:bg-mid-gray/10 hover:text-text"
                }`}
              >
                {id === "home" || !color ? (
                  <Icon width={22} height={22} className="shrink-0" />
                ) : (
                  <span
                    className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px]"
                    style={{ background: color }}
                  >
                    <Icon width={13} height={13} className="text-white" />
                  </span>
                )}
                <span className="flex-1 truncate">
                  {t(getCampusLabelKey(id))}
                </span>
                <ChevronRight
                  size={14}
                  className="shrink-0 text-text-secondary/40"
                />
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
};

export default CampusSettingsDrawer;
