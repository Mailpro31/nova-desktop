import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import HandyHand from "@/components/icons/HandyHand";
import {
  CAMPUS_SIDEBAR_ORDER,
  SECTIONS_CONFIG,
  getCampusLabelKey,
  type SidebarSection,
} from "@/components/Sidebar";
import { campusOrganizationLabel } from "@/lib/campusPolicy";
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
  const organization = useCampusStore((state) => state.context.organization);
  const refresh = useCampusStore((state) => state.refresh);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const connected = connectionStatus === "connected";
  const organizationName = campusOrganizationLabel(organization);

  return (
    <aside className="nova-translucent z-10 flex w-full shrink-0 flex-col border-b border-hairline bg-sidebar/92 px-3 py-2 backdrop-blur-xl md:h-full md:w-52 md:border-b-0 md:border-e md:px-3 md:py-4">
      <div
        className="flex min-h-11 shrink-0 items-center gap-2.5 px-2 md:mb-6"
        aria-label="Nova Campus"
      >
        <HandyHand width={30} height={30} />
        <span className="min-w-0">
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <span className="block text-sm font-semibold tracking-[-0.015em] text-text">
            Nova
          </span>
          <span className="block truncate text-xs text-text-secondary">
            {t("campus.onboarding.label")}
          </span>
        </span>
      </div>

      <nav
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1 md:flex-col md:items-stretch md:overflow-y-auto md:py-0"
        aria-label={t("campus.navigation.label")}
      >
        {CAMPUS_SIDEBAR_ORDER.map((section) => {
          const active = activeSection === section;
          const Icon = SECTIONS_CONFIG[section].icon;
          return (
            <button
              key={section}
              type="button"
              onClick={() => onNavigate(section)}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-10 shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-start text-sm font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none md:w-full ${
                active
                  ? "bg-inset text-text"
                  : "text-text-secondary hover:bg-mid-gray/10 hover:text-text"
              }`}
            >
              <Icon
                width={18}
                height={18}
                className={active ? "text-text" : "text-text-secondary"}
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <span className="whitespace-nowrap">
                {t(getCampusLabelKey(section))}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="hidden border-t border-hairline px-2 pt-4 md:block">
        <div
          className="flex items-center gap-2 text-xs font-medium text-text-secondary"
          role="status"
          aria-live="polite"
        >
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              connectionStatus === "checking"
                ? "animate-pulse bg-mid-gray motion-reduce:animate-none"
                : connected
                  ? "bg-success"
                  : "bg-warning"
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
        {organization.managed && (
          <p className="mt-2 truncate text-xs text-text-secondary">
            {t("campus.managedBy", { organization: organizationName })}
          </p>
        )}
      </div>
    </aside>
  );
};
