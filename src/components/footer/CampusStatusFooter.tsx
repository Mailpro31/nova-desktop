import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { loadCampusSession } from "@/lib/campusSession";
import { isServerReachable } from "@/lib/campusApi";
import type { CampusSession } from "@/lib/campusSession";

export const CampusStatusFooter: React.FC = () => {
  const { t } = useTranslation();
  const [session, setSession] = useState<CampusSession | null>(null);
  const [reachable, setReachable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadCampusSession().then((s) => {
      if (cancelled) return;
      setSession(s);
      if (s) {
        isServerReachable(s.server_url).then((r) => {
          if (!cancelled) setReachable(r);
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!session) return null;

  const serverName = (() => {
    try {
      return new URL(session.server_url).hostname;
    } catch {
      return session.server_url;
    }
  })();

  const connected = reachable === true;

  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-block w-2 h-2 rounded-full ${
          connected ? "bg-green-500" : "bg-orange-500"
        }`}
      />
      <span className={connected ? "text-green-500" : "text-orange-500"}>
        {connected
          ? t("campus.footer.connected", { server: serverName })
          : t("campus.footer.offline")}
      </span>
    </div>
  );
};
