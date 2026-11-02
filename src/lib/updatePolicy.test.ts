import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  shouldNotify,
  UPDATE_CHECK_INTERVAL_MS,
  updatesAllowedByPolicy,
} from "./updatePolicy";

describe("update policy", () => {
  test("only the manual policy stops update checks", () => {
    expect(updatesAllowedByPolicy("manual")).toBe(false);
    expect(updatesAllowedByPolicy("notify")).toBe(true);
    expect(updatesAllowedByPolicy("automatic")).toBe(true);
    expect(updatesAllowedByPolicy(null)).toBe(true);
    expect(updatesAllowedByPolicy(undefined)).toBe(true);
  });

  test("a version is announced once", () => {
    expect(shouldNotify("1.0.71", null)).toBe(true);
    expect(shouldNotify("1.0.71", "1.0.70")).toBe(true);
    expect(shouldNotify("1.0.71", "1.0.71")).toBe(false);
    expect(shouldNotify("", null)).toBe(false);
  });

  test("checks repeat while the app stays in the tray", () => {
    expect(UPDATE_CHECK_INTERVAL_MS).toBe(6 * 60 * 60 * 1000);
    const checker = readFileSync(
      "src/components/update-checker/UpdateChecker.tsx",
      "utf8",
    );
    expect(checker).toContain("setInterval");
    expect(checker).toContain(
      'invoke<{ update_policy?: string | null }>("get_deployment_state")',
    );
    expect(checker).toContain("sendNotification");
  });
});
