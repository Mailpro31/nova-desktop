import type { SupportReport } from "@/bindings";

export const DESCRIPTION_MAX = 500;

export interface SupportReportInput {
  appVersion: string;
  platform: string;
  osVersion: string;
  totalMemoryMb: number | null;
  checks: ReadonlyArray<{ id: string; status: string }>;
  lastErrorCode: string;
  now: Date;
  description: string;
}

/**
 * Le rapport « Signaler un problème ». Liste fermée : version, système,
 * mémoire, état des moteurs (identifiant et statut, pas le détail libre),
 * dernier code d'erreur, date, description facultative. Aucun texte dicté,
 * aucun historique, aucune adresse e-mail n'entre dans ce type.
 */
export const buildSupportReport = (
  input: SupportReportInput,
): SupportReport => ({
  app_version: input.appVersion,
  os: `${input.platform} ${input.osVersion}`.trim(),
  memory_mb: input.totalMemoryMb,
  engines: Object.fromEntries(input.checks.map((c) => [c.id, c.status])),
  last_error: input.lastErrorCode,
  reported_at: input.now.toISOString(),
  description: input.description.trim().slice(0, DESCRIPTION_MAX),
});
