import React from "react";
import { useTranslation } from "react-i18next";
import { emit } from "@tauri-apps/api/event";
import { LogOut, RefreshCw } from "lucide-react";
import { Button } from "../../ui/Button";
import { clearCampusSession } from "@/lib/campusSession";
import { campusOrganizationLabel } from "@/lib/campusPolicy";
import { useCampusStore } from "@/stores/campusStore";
import { ManagedBy } from "@/components/campus/ManagedBy";

interface CampusAccountSectionProps {
  inline?: boolean;
}

export const CampusAccountSection: React.FC<CampusAccountSectionProps> = () => {
  const { t } = useTranslation();
  const session = useCampusStore((state) => state.session);
  const profile = useCampusStore((state) => state.profile);
  const context = useCampusStore((state) => state.context);
  const connectionStatus = useCampusStore((state) => state.connectionStatus);
  const refreshing = useCampusStore((state) => state.refreshing);
  const refresh = useCampusStore((state) => state.refresh);
  const reset = useCampusStore((state) => state.reset);

  if (!session) return null;

  const organization = context.organization;
  const organizationName = organization.shortName ?? organization.name;
  const role = organization.role
    ? t(`campus.roles.${organization.role}`)
    : null;

  const handleLogout = async () => {
    if (!window.confirm(t("campus.account.logoutConfirmDescription"))) return;
    await clearCampusSession();
    reset();
    await emit("campus-logout-requested");
  };

  return (
    <div className="divide-y divide-hairline">
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-text">
            {campusOrganizationLabel(organization)}
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            {profile?.email ?? session.email}
          </p>
          {[role, organization.cohort].filter(Boolean).length > 0 && (
            <p className="mt-1 text-xs text-text-secondary">
              {[role, organization.cohort].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        {organization.managed && (
          <ManagedBy organizationName={organizationName} />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <span
            className={`h-2 w-2 rounded-full ${
              connectionStatus === "connected" ? "bg-success" : "bg-orange-400"
            }`}
            aria-hidden="true"
          />
          {connectionStatus === "connected"
            ? t("campus.status.connected")
            : t("campus.status.local")}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void refresh()}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5"
          >
            <RefreshCw
              size={14}
              className={refreshing ? "animate-spin" : ""}
              aria-hidden="true"
            />
            {t("campus.account.refresh")}
          </Button>
          <Button
            variant="danger-ghost"
            size="sm"
            onClick={() => void handleLogout()}
            className="inline-flex items-center gap-1.5"
          >
            <LogOut size={14} aria-hidden="true" />
            {t("campus.account.logout")}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CampusAccountSection;
