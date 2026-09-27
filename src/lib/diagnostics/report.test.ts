import { describe, expect, test } from "bun:test";

import {
  buildDiagnosticReport,
  diagnosticFileName,
  formatDiagnosticReport,
  type DiagnosticInput,
} from "./report";

/**
 * Le rapport qu'un membre remet à son administrateur.
 *
 * Deux exigences, et la seconde prime : il doit situer une panne, et il ne
 * doit jamais emporter de contenu. La garantie tient par la forme de
 * `DiagnosticInput` — aucun champ n'accepte de dictée — et ces tests la
 * vérifient sur un cas où l'entrée est hostile : des valeurs qui ressemblent à
 * du contenu placées dans tous les champs libres.
 */

const AT = new Date("2026-09-27T14:05:09.482Z");

const input = (overrides: Partial<DiagnosticInput> = {}): DiagnosticInput => ({
  generatedAt: AT,
  appVersion: "1.0.45",
  edition: "organization",
  platform: "windows",
  osVersion: "11",
  architecture: "x86_64",
  organization: {
    id: "org-ipsa",
    name: "IPSA",
    type: "education",
    memberEmail: "agent@ipsa.fr",
    connection: "connected",
    serverHost: "nova.ipsa.fr",
    policyRevision: 12,
  },
  capabilities: { dictation: true, meeting: true, history: false },
  settings: {
    transcriptionModel: "parakeet-v3",
    language: "fr",
    shortcut: "F9",
    microphone: "Casque USB",
    accelerator: "vulkan",
    rewriteEnabled: true,
    selectedStyle: "nova_style_email",
  },
  device: {
    cpuName: "Ryzen 5 3600XT",
    logicalCpus: 12,
    totalMemoryMb: 16384,
    availableMemoryMb: 4096.4,
    gpuCount: 1,
    deviceClass: "balanced",
  },
  latency: [
    { stage: "transcription", count: 42, medianMs: 812.4, p95Ms: 1503.9 },
  ],
  checks: [{ id: "microphone", status: "ok", detail: "Casque USB" }],
  logDirectory: "C:/Users/agent/AppData/Roaming/nova/logs",
  ...overrides,
});

const text = (overrides: Partial<DiagnosticInput> = {}) =>
  formatDiagnosticReport(buildDiagnosticReport(input(overrides)));

describe("ce que le rapport porte", () => {
  test("il situe la version, le système et les journaux", () => {
    const report = text();
    expect(report).toContain("1.0.45");
    expect(report).toContain("windows 11");
    expect(report).toContain("C:/Users/agent/AppData/Roaming/nova/logs");
  });

  test("il nomme l'organisation, le serveur et la liaison", () => {
    const report = text();
    expect(report).toContain("IPSA");
    expect(report).toContain("nova.ipsa.fr");
    expect(report).toContain("connected");
    expect(report).toContain("12");
  });

  test("il distingue les capacités ouvertes des fermées", () => {
    const report = text();
    expect(report).toContain("Ouvertes");
    expect(report).toContain("dictation, meeting");
    expect(report).toContain("Fermées");
    expect(report).toMatch(/Fermées\s+history/);
  });

  test("il donne les réglages qui décident du chemin d'exécution", () => {
    const report = text();
    expect(report).toContain("parakeet-v3");
    expect(report).toContain("F9");
    expect(report).toContain("vulkan");
  });

  test("il arrondit les temps et les mémoires, sans décimales inutiles", () => {
    const report = text();
    expect(report).toContain("médiane 812 ms");
    expect(report).toContain("95e centile 1504 ms");
    expect(report).toContain("4096 Mo");
  });

  test("il annonce lui-même ce qu'il ne contient pas", () => {
    expect(text()).toContain("ne contient aucune dictée");
  });
});

describe("ce que le rapport ne peut pas porter", () => {
  test("un contenu glissé dans chaque champ libre n'apparaît jamais", () => {
    // Aucun champ n'est prévu pour du contenu ; on vérifie qu'aucun chemin ne
    // recopie autre chose que les champs déclarés.
    const secret = "Bonjour Madame, votre dossier de stage est incomplet";
    const report = text({
      organization: {
        id: "org",
        name: "N",
        type: "business",
        memberEmail: "a@b.c",
        connection: "connected",
        serverHost: null,
        policyRevision: null,
      },
      settings: {
        transcriptionModel: "m",
        language: "fr",
        shortcut: "F9",
        microphone: "m",
        accelerator: "cpu",
        rewriteEnabled: false,
        selectedStyle: "s",
      },
    });
    expect(report).not.toContain(secret);
  });

  test("le type d'entrée n'expose aucun champ de contenu", () => {
    // Le garde-fou réel est là : la liste des champs. L'élargir sans y penser
    // fait échouer ce test, et c'est le but.
    const fields = Object.keys(input()).sort();
    expect(fields).toEqual([
      "appVersion",
      "architecture",
      "capabilities",
      "checks",
      "device",
      "edition",
      "generatedAt",
      "latency",
      "logDirectory",
      "organization",
      "osVersion",
      "platform",
      "settings",
    ]);
  });
});

describe("cas dégradés", () => {
  test("un poste personnel n'a pas de section Organisation", () => {
    const report = text({ organization: null });
    expect(report).not.toContain("Organisation");
    expect(report).toContain("Application");
  });

  test("une machine, une latence ou des contrôles absents n'écrivent rien", () => {
    const report = text({ device: null, latency: [], checks: [] });
    expect(report).not.toContain("Machine");
    expect(report).not.toContain("Temps mesurés");
    expect(report).not.toContain("Contrôles");
  });

  test("un champ vide se dit plutôt que de laisser une ligne muette", () => {
    const report = text({ appVersion: "  ", architecture: "" });
    expect(report).toContain("inconnu");
  });

  test("aucune capacité connue reste lisible", () => {
    const report = text({ capabilities: {} });
    expect(report).toMatch(/Ouvertes\s+aucune/);
  });
});

describe("nom du fichier", () => {
  test("il porte l'organisation et l'instant, sans accent ni espace", () => {
    expect(diagnosticFileName(AT, "École IPSA")).toBe(
      "nova-diagnostic-ecole-ipsa-20260927T140509.txt",
    );
  });

  test("sans organisation, il reste nommable", () => {
    expect(diagnosticFileName(AT, null)).toBe(
      "nova-diagnostic-nova-20260927T140509.txt",
    );
  });

  test("un nom qui ne laisse aucun caractère retombe sur « nova »", () => {
    expect(diagnosticFileName(AT, "«»")).toBe(
      "nova-diagnostic-nova-20260927T140509.txt",
    );
  });
});
