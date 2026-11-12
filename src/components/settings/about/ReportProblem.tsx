import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { platform, version as osVersion } from "@tauri-apps/plugin-os";
import { toast } from "sonner";

import { commands } from "@/bindings";
import { Button } from "@/components/ui/Button";
import { getLastErrorCode } from "@/lib/attentionNotifications";
import { buildSupportReport, DESCRIPTION_MAX } from "@/lib/supportReport";

interface Diagnostics {
  device?: { total_memory_mb?: number };
  checks?: Array<{ id: string; status: string }>;
}

/** « Signaler un problème » : envoie au serveur de l'école un rapport sans dictée. */
export const ReportProblem: React.FC = () => {
  const { t } = useTranslation();
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try {
      const diagnostics = await invoke<Diagnostics>(
        "run_performance_diagnostics",
      ).catch(() => null);
      const report = buildSupportReport({
        appVersion: await getVersion().catch(() => ""),
        platform: platform(),
        osVersion: osVersion(),
        totalMemoryMb: diagnostics?.device?.total_memory_mb ?? null,
        checks: diagnostics?.checks ?? [],
        lastErrorCode: getLastErrorCode(),
        now: new Date(),
        description,
      });
      const result = await commands.sendSupportReport(report);
      if (result.status !== "ok") throw new Error(result.error);
      setDescription("");
      toast.success(t("organization.reportProblem.sent"));
    } catch {
      toast.error(t("organization.reportProblem.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      <label className="flex flex-col gap-1 text-sm text-text">
        {t("organization.reportProblem.descriptionLabel")}
        <textarea
          className="rounded-card border border-hairline bg-surface p-2 text-sm"
          rows={3}
          maxLength={DESCRIPTION_MAX}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      <p className="text-xs text-text-secondary">
        {t("organization.reportProblem.warning")}
      </p>
      <div>
        <Button
          type="button"
          variant="secondary"
          size="md"
          disabled={busy}
          onClick={() => void send()}
        >
          {busy
            ? t("organization.reportProblem.sending")
            : t("organization.reportProblem.send")}
        </Button>
      </div>
    </div>
  );
};
