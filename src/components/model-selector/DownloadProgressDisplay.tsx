import React from "react";
import { useTranslation } from "react-i18next";
import type { ModelInfo } from "@/bindings";
import { getTranslatedModelName } from "@/lib/utils/modelTranslation";

interface DownloadProgress {
  model_id: string;
  downloaded: number;
  total: number;
  percentage: number;
}

interface DownloadStats {
  startTime: number;
  lastUpdate: number;
  totalDownloaded: number;
  speed: number;
}

interface DownloadProgressDisplayProps {
  downloadProgress: Record<string, DownloadProgress>;
  downloadStats: Record<string, DownloadStats>;
  models: ModelInfo[];
  className?: string;
}

const BYTE_UNITS = ["byte", "kilobyte", "megabyte", "gigabyte"] as const;

const formatBytes = (bytes: number, locale: string): string => {
  const safeBytes = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;

  const unitIndex = Math.min(
    safeBytes > 0 ? Math.floor(Math.log(safeBytes) / Math.log(1024)) : 0,
    BYTE_UNITS.length - 1,
  );
  const value = safeBytes / 1024 ** unitIndex;

  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: BYTE_UNITS[unitIndex],
    unitDisplay: "short",
    maximumFractionDigits: unitIndex === 0 ? 0 : 1,
  }).format(value);
};

const DownloadProgressDisplay: React.FC<DownloadProgressDisplayProps> = ({
  downloadProgress,
  downloadStats,
  models,
  className = "",
}) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? "en";
  const progressValues = Object.values(downloadProgress);
  if (progressValues.length === 0) {
    return null;
  }

  return (
    <div
      className={`flex min-w-64 flex-col gap-3 rounded-[9px] border border-mid-gray/20 bg-background/60 p-3 ${className}`}
      role="status"
      aria-live="polite"
    >
      {progressValues.map((progress) => {
        const stats = downloadStats[progress.model_id];
        const model = models.find((item) => item.id === progress.model_id);
        const percentage = Math.max(
          0,
          Math.min(
            100,
            Math.round(
              Number.isFinite(progress.percentage) ? progress.percentage : 0,
            ),
          ),
        );
        const label = model
          ? getTranslatedModelName(model, t)
          : t("modelSelector.downloading", { percentage });

        return (
          <div className="flex flex-col gap-1.5" key={progress.model_id}>
            <div className="flex items-center justify-between gap-4 text-xs">
              <span className="truncate font-medium text-text">{label}</span>
              <span className="shrink-0 tabular-nums text-text/70">
                {percentage}%
              </span>
            </div>
            <progress
              value={percentage}
              max={100}
              aria-label={label}
              className="h-1.5 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-mid-gray/20 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-[#0A84FF]"
            />
            <div className="flex items-center justify-between gap-4 text-[11px] tabular-nums text-text/60">
              <span>
                {formatBytes(progress.downloaded, locale)} /{" "}
                {formatBytes(progress.total, locale)}
              </span>
              {stats?.speed !== undefined && stats.speed > 0 && (
                <span className="shrink-0">
                  {t("modelSelector.downloadSpeed", {
                    speed: stats.speed.toFixed(1),
                  })}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default DownloadProgressDisplay;
