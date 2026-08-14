import React, { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, LogOut, Server, User, Shield, Clock } from "lucide-react";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { Button } from "../../ui/Button";
import { loadCampusSession, clearCampusSession } from "@/lib/campusSession";
import { isServerReachable } from "@/lib/campusApi";
import type { CampusSession } from "@/lib/campusSession";

interface CampusAccountSectionProps {
  inline?: boolean;
}

interface CampusProfile {
  email: string;
  role: string;
  cohort: string;
}

export const CampusAccountSection: React.FC<CampusAccountSectionProps> = ({
  inline = false,
}) => {
  const { t } = useTranslation();
  const [session, setSession] = useState<CampusSession | null>(null);
  const [profile, setProfile] = useState<CampusProfile | null>(null);
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  const load = useCallback(async () => {
    const s = await loadCampusSession();
    setSession(s);
    if (!s) return;

    try {
      const me = await invoke<CampusProfile>("get_campus_me", {
        serverUrl: s.server_url,
        token: s.token,
      });
      setProfile(me);
    } catch {
      setProfile({ email: s.email, role: "", cohort: "" });
    }

    const r = await isServerReachable(s.server_url);
    setReachable(r);
    setLastCheck(new Date());
  }, []);

  useEffect(() => {
    let cancelled = false;
    load().catch(() => {});
    const interval = window.setInterval(() => {
      if (cancelled) return;
      load().catch(() => {});
    }, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [load]);

  const handleRefresh = async () => {
    setLoading(true);
    await load();
    setLoading(false);
  };

  const handleLogout = async () => {
    const confirmed = window.confirm(t("campus.account.logoutConfirmDescription"));
    if (!confirmed) return;
    await clearCampusSession();
    await emit("campus-logout-requested");
  };

  if (!session) return null;

  const serverName = (() => {
    try {
      return new URL(session.server_url).hostname;
    } catch {
      return session.server_url;
    }
  })();

  const displayEmail = profile?.email ?? session.email;
  const displayRole = profile?.role;
  const displayCohort = profile?.cohort;

  const statusBlock = (
    <div className="flex items-center gap-2">
      <span
        className={`w-2 h-2 rounded-full ${
          reachable === null
            ? "bg-mid-gray animate-pulse"
            : reachable
              ? "bg-success"
              : "bg-orange-400"
        }`}
      />
      <span className="text-sm text-text-secondary">
        {reachable === null
          ? t("campus.account.checking")
          : reachable
            ? t("campus.account.connected", { server: serverName })
            : t("campus.account.offline", { server: serverName })}
      </span>
      {lastCheck && (
        <span className="text-xs text-text-secondary/60">
          · {lastCheck.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
        </span>
      )}
    </div>
  );

  const content = (
    <div className={`space-y-4 ${inline ? "" : "px-4 py-3"}`}>
      {statusBlock}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex items-start gap-2.5">
          <Server size={16} className="text-text-secondary mt-0.5" strokeWidth={1.75} />
          <div>
            <p className="text-xs text-text-secondary">{t("campus.account.server")}</p>
            <p className="text-sm font-medium text-text">{serverName}</p>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <User size={16} className="text-text-secondary mt-0.5" strokeWidth={1.75} />
          <div>
            <p className="text-xs text-text-secondary">{t("campus.account.email")}</p>
            <p className="text-sm font-medium text-text">{displayEmail}</p>
          </div>
        </div>

        {displayRole && (
          <div className="flex items-start gap-2.5">
            <Shield size={16} className="text-text-secondary mt-0.5" strokeWidth={1.75} />
            <div>
              <p className="text-xs text-text-secondary">{t("campus.account.role")}</p>
              <p className="text-sm font-medium text-text capitalize">{displayRole}</p>
            </div>
          </div>
        )}

        {displayCohort && (
          <div className="flex items-start gap-2.5">
            <Clock size={16} className="text-text-secondary mt-0.5" strokeWidth={1.75} />
            <div>
              <p className="text-xs text-text-secondary">{t("campus.account.cohort")}</p>
              <p className="text-sm font-medium text-text">{displayCohort}</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          {t("campus.account.refresh")}
        </Button>
        <Button variant="danger-ghost" size="sm" onClick={handleLogout} className="inline-flex items-center gap-1.5">
          <LogOut size={14} />
          {t("campus.account.logout")}
        </Button>
      </div>
    </div>
  );

  if (inline) {
    return content;
  }

  return (
    <SettingsGroup title={t("campus.account.title")}>{content}</SettingsGroup>
  );
};

export default CampusAccountSection;
