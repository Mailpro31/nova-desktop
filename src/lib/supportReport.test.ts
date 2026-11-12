import { describe, expect, it } from "bun:test";
import { buildSupportReport, DESCRIPTION_MAX } from "./supportReport";

const base = {
  appVersion: "1.0.70",
  platform: "windows",
  osVersion: "11",
  totalMemoryMb: 16000,
  // `detail` est du texte libre du moteur : il ne doit jamais partir.
  checks: [{ id: "model", status: "ok", detail: "texte dicté secret" }],
  lastErrorCode: "errors.pasteFailedTitle",
  now: new Date("2026-11-12T10:00:00Z"),
  description: "  bug  ",
};

describe("buildSupportReport", () => {
  it("garde les codes et jamais le détail libre des vérifications", () => {
    const report = buildSupportReport(base);
    expect(report.engines).toEqual({ model: "ok" });
    expect(JSON.stringify(report)).not.toContain("secret");
    expect(report.os).toBe("windows 11");
    expect(report.reported_at).toBe("2026-11-12T10:00:00.000Z");
  });

  it("limite la description à 500 caractères", () => {
    const report = buildSupportReport({
      ...base,
      description: "x".repeat(900),
    });
    expect(report.description.length).toBe(DESCRIPTION_MAX);
  });
});
