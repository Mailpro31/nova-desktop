import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { arch, platform, version as osVersion } from "@tauri-apps/plugin-os";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { FileText } from "lucide-react";
import { toast } from "sonner";

import { commands, type ShortcutBinding } from "@/bindings";
import { Button } from "@/components/ui/Button";
import { useSettings } from "@/hooks/useSettings";
import { useOrganizationContext } from "@/hooks/useOrganizationContext";
import { useOrganizationStatus } from "@/hooks/useOrganizationStatus";
import { currentEdition } from "@/lib/organization";
import {
  buildDiagnosticReport,
  diagnosticFileName,
  formatDiagnosticReport,
  type DiagnosticInput,
} from "@/lib/diagnostics/report";
import { useOrganizationStore } from "@/stores/organizationStore";

/**
 * Le rapport de diagnostic, côté écran.
 *
 * Tout le contenu du rapport est décidé par `buildDiagnosticReport`, une
 * fonction pure et testée. Ce composant ne fait que réunir ce que le poste
 * sait déjà et proposer d'écrire le fichier : aucune donnée n'y est mise en
 * forme, donc aucune ne peut s'y ajouter sans passer par le type d'entrée que
 * les tests verrouillent.
 *
 * Rien n'est envoyé. La personne enregistre un fichier et le transmet
 * elle-même : c'est ce qui rend la remise vérifiable par celui qui la fait.
 */

interface PerformanceReport {
  device?: {
    class?: string;
    total_memory_mb?: number;
    available_memory_mb?: number;
    logical_cpus?: number;
    cpu_name?: string;
    gpu_count?: number;
  };
  latency?: Array<{
    stage: string;
    count: number;
    median_ms: number;
    p95_ms: number;
  }>;
  checks?: Array<{ id: string; status: string; detail: string }>;
}

/** Ce que le moteur ne rend pas toujours : son absence n'empêche pas le reste. */
async function performance(): Promise<PerformanceReport | null> {
  try {
    return await invoke<PerformanceReport>("run_performance_diagnostics");
  } catch {
    return null;
  }
}

async function logDirectory(): Promise<string> {
  try {
    const result = await commands.getLogDirPath();
    return result.status === "ok" ? result.data : "";
  } catch {
    return "";
  }
}

export const DiagnosticReport: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting, audioDevices } = useSettings();
  const context = useOrganizationContext();
  const { connection } = useOrganizationStatus();
  const session = useOrganizationStore((state) => state.session);
  const organization = useOrganizationStore(
    (state) => state.context.organization,
  );
  const [busy, setBusy] = useState(false);

  const collect = async (): Promise<DiagnosticInput> => {
    const [appVersion, report, logs] = await Promise.all([
      getVersion().catch(() => ""),
      performance(),
      logDirectory(),
    ]);
    const bindings = (getSetting("bindings") ?? {}) as Record<
      string,
      ShortcutBinding
    >;
    const device = report?.device;
    return {
      generatedAt: new Date(),
      appVersion,
      edition: currentEdition(),
      platform: platform(),
      osVersion: osVersion(),
      architecture: arch(),
      organization: context.organization
        ? {
            id: context.organization.id ?? "",
            name: context.organization.displayName ?? organization?.name ?? "",
            type: context.organization.type,
            memberEmail: session?.email ?? "",
            connection,
            serverHost: session?.server_url ?? null,
            policyRevision: null,
          }
        : null,
      capabilities: context.capabilities,
      settings: {
        transcriptionModel: getSetting("selected_model") ?? "",
        language: getSetting("selected_language") ?? "",
        shortcut: bindings["transcribe"]?.current_binding ?? "",
        microphone:
          getSetting("selected_microphone") ??
          audioDevices.find((device) => device.is_default)?.name ??
          "",
        accelerator: getSetting("transcribe_accelerator") ?? "",
        rewriteEnabled: getSetting("post_process_enabled") ?? false,
        selectedStyle: getSetting("post_process_selected_prompt_id") ?? "",
      },
      device: device
        ? {
            cpuName: device.cpu_name ?? "",
            logicalCpus: device.logical_cpus ?? 0,
            totalMemoryMb: device.total_memory_mb ?? 0,
            availableMemoryMb: device.available_memory_mb ?? 0,
            gpuCount: device.gpu_count ?? 0,
            deviceClass: device.class ?? "",
          }
        : null,
      latency: (report?.latency ?? []).map((entry) => ({
        stage: entry.stage,
        count: entry.count,
        medianMs: entry.median_ms,
        p95Ms: entry.p95_ms,
      })),
      checks: report?.checks ?? [],
      logDirectory: logs,
    };
  };

  const write = async () => {
    setBusy(true);
    try {
      const input = await collect();
      const path = await save({
        defaultPath: diagnosticFileName(
          input.generatedAt,
          input.organization?.name ?? null,
        ),
      });
      // Annulation : la personne a fermé la fenêtre, il n'y a rien à dire.
      if (!path) return;
      await writeTextFile(
        path,
        formatDiagnosticReport(buildDiagnosticReport(input)),
      );
      toast.success(t("organization.diagnostic.saved"));
    } catch {
      toast.error(t("organization.diagnostic.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-relaxed text-text-secondary">
        {t("organization.diagnostic.description")}
      </p>
      <div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => void write()}
        >
          <FileText size={14} aria-hidden="true" />
          {t("organization.diagnostic.save")}
        </Button>
      </div>
    </div>
  );
};
