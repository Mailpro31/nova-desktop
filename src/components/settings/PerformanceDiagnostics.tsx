import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CheckCircle2, CircleAlert, CircleX, Gauge } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSettings } from "../../hooks/useSettings";
import { Button } from "../ui/Button";
import { SettingsGroup } from "../ui/SettingsGroup";
import { ToggleSwitch } from "../ui/ToggleSwitch";

type Status = "ok" | "warning" | "error";

interface PerformanceReport {
  adaptive_enabled: boolean;
  device: {
    class: "low_memory" | "balanced" | "performance";
    total_memory_mb: number;
    available_memory_mb: number;
    logical_cpus: number;
    cpu_name: string;
    cpu_score: number;
    gpu_count: number;
    cpu_only_fallback: boolean;
    recommended_model_unload: string;
    recommended_accelerator: string;
  };
  latency: Array<{
    stage: string;
    count: number;
    median_ms: number;
    p95_ms: number;
    last_ms: number;
  }>;
  checks: Array<{ id: string; status: Status; detail: string }>;
}

const STATUS_ICON = {
  ok: CheckCircle2,
  warning: CircleAlert,
  error: CircleX,
} as const;

const STATUS_COLOR: Record<Status, string> = {
  ok: "text-green-500",
  warning: "text-amber-500",
  error: "text-red-500",
};

export const PerformanceDiagnostics: React.FC = () => {
  const { t } = useTranslation();
  const { settings, refreshSettings } = useSettings();
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [running, setRunning] = useState(false);
  const [adaptive, setAdaptive] = useState(false);

  useEffect(() => {
    const enabled = (
      settings as (typeof settings & { adaptive_performance_enabled?: boolean })
    )?.adaptive_performance_enabled;
    setAdaptive(enabled ?? false);
  }, [settings]);

  const runDiagnostics = async () => {
    setRunning(true);
    try {
      setReport(await invoke<PerformanceReport>("run_performance_diagnostics"));
    } finally {
      setRunning(false);
    }
  };

  const changeAdaptive = async (enabled: boolean) => {
    setAdaptive(enabled);
    setRunning(true);
    try {
      if (enabled) {
        await invoke("apply_adaptive_performance");
      } else {
        await invoke("change_adaptive_performance_setting", { enabled });
      }
      await refreshSettings();
      setReport(await invoke<PerformanceReport>("run_performance_diagnostics"));
    } catch {
      setAdaptive(!enabled);
    } finally {
      setRunning(false);
    }
  };

  return (
    <SettingsGroup
      title={t("performanceOptimizer.title")}
      description={t("performanceOptimizer.description")}
    >
      <ToggleSwitch
        checked={adaptive}
        onChange={changeAdaptive}
        isUpdating={running}
        label={t("performanceOptimizer.autoLabel")}
        description={t("performanceOptimizer.autoDescription")}
        descriptionMode="inline"
        grouped
      />
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Gauge className="w-4 h-4" />
            <span>{t("performanceOptimizer.diagnosticsDescription")}</span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={running}
            onClick={runDiagnostics}
          >
            {running
              ? t("performanceOptimizer.running")
              : t("performanceOptimizer.run")}
          </Button>
        </div>

        {report && (
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Metric
                label={t("performanceOptimizer.profile")}
                value={t(
                  `performanceOptimizer.classes.${report.device.class}`,
                )}
              />
              <Metric
                label={t("performanceOptimizer.memory")}
                value={`${Math.round(report.device.total_memory_mb / 1024)} GB`}
              />
              <Metric
                label={t("performanceOptimizer.cpu")}
                value={`${report.device.logical_cpus}`}
              />
              <Metric
                label={t("performanceOptimizer.acceleration")}
                value={report.device.recommended_accelerator.toUpperCase()}
              />
            </div>

            <div className="grid gap-1">
              {report.checks.map((check) => {
                const Icon = STATUS_ICON[check.status];
                return (
                  <div
                    key={check.id}
                    className="flex items-start gap-2 rounded-md bg-mid-gray/5 px-2.5 py-2"
                  >
                    <Icon
                      className={`w-4 h-4 mt-0.5 shrink-0 ${STATUS_COLOR[check.status]}`}
                    />
                    <span className="text-text-secondary flex-1">{check.detail}</span>
                    {check.id === "microphone" && check.status === "error" && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => invoke("open_microphone_privacy_settings")}
                      >
                        {t("performanceOptimizer.openMicrophone")}
                      </Button>
                    )}
                    {check.id === "accelerator" &&
                      report.device.cpu_only_fallback && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => invoke("clear_transcribe_gpu_blacklist")}
                        >
                          {t("performanceOptimizer.retryGpu")}
                        </Button>
                      )}
                  </div>
                );
              })}
            </div>

            {report.latency.length > 0 && (
              <div>
                <p className="font-medium mb-1.5">
                  {t("performanceOptimizer.latency")}
                </p>
                <div className="grid gap-1">
                  {report.latency.map((entry) => (
                    <div
                      key={entry.stage}
                      className="grid grid-cols-[1fr_auto_auto] gap-3 rounded-md bg-mid-gray/5 px-2.5 py-1.5"
                    >
                      <span>{entry.stage.split("_").join(" ")}</span>
                      <span>{t("performanceOptimizer.median", { value: entry.median_ms })}</span>
                      <span>{t("performanceOptimizer.p95", { value: entry.p95_ms })}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </SettingsGroup>
  );
};

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-lg bg-mid-gray/5 px-3 py-2">
    <div className="text-text-secondary">{label}</div>
    <div className="font-semibold text-sm mt-0.5 truncate">{value}</div>
  </div>
);
