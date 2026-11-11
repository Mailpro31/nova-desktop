import { afterAll, describe, expect, test } from "bun:test";
import { toast } from "sonner";

import { showAttentionToast } from "./attentionNotifications";

const lastDuration = () =>
  (toast.getHistory().at(-1) as { duration?: number }).duration;

// `emit` (pastille de la bulle) passe par Tauri, absent hors de l'application.
const hadWindow = "window" in globalThis;
if (!hadWindow)
  Object.assign(globalThis, {
    window: { __TAURI_INTERNALS__: { invoke: async () => {} } },
  });
afterAll(() => {
  if (!hadWindow) delete (globalThis as { window?: unknown }).window;
});

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
