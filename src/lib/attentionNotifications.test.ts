import { describe, expect, mock, test } from "bun:test";

mock.module("@tauri-apps/api/event", () => ({ emit: async () => {} }));
const { toast } = await import("sonner");
const { showAttentionToast } = await import("./attentionNotifications");

const lastDuration = () =>
  (toast.getHistory().at(-1) as { duration?: number }).duration;

describe("attention notifications", () => {
  test("an update notice leaves on its own", () => {
    showAttentionToast("info", "Nova a été mis à jour");
    expect(lastDuration()).toBe(12_000);
  });

  test("an error stays until it is closed", () => {
    showAttentionToast("error", "Collage impossible");
    expect(lastDuration()).toBe(Infinity);
  });
});
