import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import HandyHand from "@/components/icons/HandyHand";
import {
  CAMPUS_SIDEBAR_ORDER,
  SECTIONS_CONFIG,
  getCampusLabelKey,
  type SidebarSection,
} from "@/components/Sidebar";
import { useCampusStore } from "@/stores/campusStore";

interface CampusNavigationProps {
  activeSection: SidebarSection;
  onNavigate: (section: SidebarSection) => void;
}

export const CampusNavigation: React.FC<CampusNavigationProps> = ({
  activeSection,
  onNavigate,
}) => {
  const { t } = useTranslation();
  const connectionStatus = useCampusStore((state) => state.connectionStatus);
  const refresh = useCampusStore((state) => state.refresh);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const connected = connectionStatus === "connected";

  return (
    <header className="flex min-h-14 items-center gap-4 border-b border-hairline bg-background px-4">
      <div
        className="flex shrink-0 items-center gap-2"
        aria-label="Nova Campus"
      >
        <HandyHand width={28} height={28} />
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <span className="text-sm font-semibold tracking-tight text-text">
          Nova
        </span>
      </div>

      <nav
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-2"
        aria-label={t("campus.navigation.label")}
      >
        {CAMPUS_SIDEBAR_ORDER.map((section) => {
          const active = activeSection === section;
          return (
            <button
              key={section}
              type="button"
              onClick={() => onNavigate(section)}
              aria-current={active ? "page" : undefined}
              className={`min-h-11 shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                active
                  ? "bg-mid-gray/15 text-text"
                  : "text-text-secondary hover:bg-mid-gray/10 hover:text-text"
              }`}
            >
              {t(getCampusLabelKey(section))}
            </button>
          );
        })}
      </nav>

      <div
        className="hidden shrink-0 items-center gap-2 text-xs font-medium text-text-secondary sm:flex"
        role="status"
        aria-live="polite"
      >
        <span
          className={`h-2 w-2 rounded-full ${
            connectionStatus === "checking"
              ? "animate-pulse bg-mid-gray"
              : connected
                ? "bg-success"
                : "bg-orange-400"
          }`}
          aria-hidden="true"
        />
        <span>
          {connectionStatus === "checking"
            ? t("campus.status.checking")
            : connected
              ? t("campus.status.connected")
              : t("campus.status.local")}
        </span>
      </div>
    </header>
  );
};
