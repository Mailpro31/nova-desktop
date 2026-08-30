import type { Page } from "@playwright/test";

interface MockOptions {
  session?: { server_url: string; email: string } | null;
  config?: Record<string, unknown> | null;
  onboardingCompleted?: boolean;
  reachable?: boolean;
  language?: string;
  theme?: "light" | "dark" | "system";
  prompts?: Array<{ id: string; name: string; prompt: string }>;
  firstRunCompleted?: boolean;
}

export async function mockTauri(page: Page, options: MockOptions = {}) {
  await page.addInitScript((settings) => {
    const callbacks = new Map<number, (...args: unknown[]) => void>();
    const eventCallbacks = new Map<string, number>();
    let nextCallbackId = 1;
    let currentSession = settings.session ?? null;
    const appSettings = {
      app_language: settings.language ?? "en",
      theme: settings.theme ?? "system",
      onboarding_completed: settings.onboardingCompleted ?? true,
      debug_mode: false,
      push_to_talk: false,
      audio_feedback_enabled: false,
      bindings: {
        transcribe: { current_binding: "F9" },
        cancel: { current_binding: "Escape" },
        transcribe_with_post_process: { current_binding: "Ctrl+F9" },
      },
      post_process_prompts: settings.prompts ?? [],
      post_process_selected_prompt_id: "auto",
      selected_language: "auto",
      post_process_enabled: true,
    };
    if (currentSession && settings.firstRunCompleted !== false) {
      const organization = settings.config?.organization as
        | { id?: string }
        | undefined;
      const organizationId = organization?.id ?? "nova-campus";
      const safe = (value: string) =>
        value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
      localStorage.setItem(
        `nova-campus-first-run-v1:${safe(organizationId)}:${safe(currentSession.email)}`,
        JSON.stringify({
          version: 1,
          stage: "complete",
          completed: true,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        }),
      );
    }

    const invoke = async (
      command: string,
      args: Record<string, unknown> = {},
    ) => {
      switch (command) {
        case "get_app_settings":
        case "get_default_settings":
          return appSettings;
        case "load_campus_session":
          return currentSession;
        case "clear_campus_session":
          currentSession = null;
          return null;
        case "get_campus_config":
          return settings.config ?? null;
        case "fetch_campus_server_config":
          return settings.config ?? null;
        case "check_campus_server_reachability":
          return settings.reachable ?? true;
        case "request_campus_auth":
          return { sent: true };
        case "verify_campus_auth":
          if (args.code === "000000") throw "HTTP 400: Code incorrect";
          currentSession = {
            server_url: String(args.serverUrl),
            email: String(args.email),
          };
          return currentSession;
        case "start_campus_entra_auth":
          return {
            flow_id: "microsoft-flow",
            user_code: "ABCD-EFGH",
            verification_uri: "https://microsoft.com/devicelogin",
            verification_uri_complete:
              "https://microsoft.com/devicelogin?otc=ABCD-EFGH",
            expires_in: 900,
            interval: 1,
            message: "Sign in",
          };
        case "poll_campus_entra_auth":
          currentSession = {
            server_url: String(args.serverUrl),
            email: "student@example.edu",
          };
          return {
            status: "complete",
            email: currentSession.email,
            retry_after: null,
          };
        case "get_campus_me":
          return {
            email: currentSession?.email ?? "student@example.edu",
            role: "student",
            cohort: "AERO 2",
          };
        case "get_history_entries":
          return { entries: [], total: 0 };
        case "get_available_microphones":
          return [
            { index: "default", name: "System microphone", is_default: true },
          ];
        case "get_audio_devices":
        case "get_output_devices":
        case "get_lexicon_suggestions":
        case "get_available_models":
          return [];
        case "get_windows_microphone_permission_status":
          return { supported: false, overall_access: "allowed" };
        case "is_transcribe_cpu_only_mode":
        case "is_portable":
          return false;
        case "plugin:app|version":
          return "1.0.36";
        case "plugin:os|hostname":
          return "campus-workstation";
        case "plugin:event|listen":
          eventCallbacks.set(String(args.event), Number(args.handler));
          return 1;
        case "plugin:event|unlisten":
        case "change_selected_language_setting":
        case "change_post_process_enabled_setting":
        case "set_post_process_selected_prompt":
          return null;
        case "trigger_transcription": {
          const callbackId = eventCallbacks.get("history-update-payload");
          if (callbackId) {
            window.setTimeout(() => {
              callbacks.get(callbackId)?.({
                event: "history-update-payload",
                id: 1,
                payload: {
                  action: "added",
                  entry: {
                    id: 1,
                    file_name: "first-dictation.wav",
                    timestamp: Date.now(),
                    saved: true,
                    title: "First dictation",
                    transcription_text:
                      "Send Lucas the project update tomorrow morning.",
                    post_processed_text: null,
                    post_process_prompt: null,
                    post_process_requested: false,
                  },
                },
              });
            }, 50);
          }
          return null;
        }
        case "initialize_enigo":
        case "initialize_shortcuts":
        case "complete_campus_onboarding":
        case "set_campus_mode":
          return null;
        default:
          return null;
      }
    };

    const browserWindow = window as typeof window & {
      __TAURI_INTERNALS__?: Record<string, unknown>;
      __TAURI_OS_PLUGIN_INTERNALS__?: Record<string, unknown>;
    };
    browserWindow.__TAURI_INTERNALS__ = {
      invoke,
      transformCallback(callback: (...args: unknown[]) => void, once = false) {
        const id = nextCallbackId++;
        callbacks.set(id, (...args: unknown[]) => {
          callback(...args);
          if (once) callbacks.delete(id);
        });
        return id;
      },
      unregisterCallback(id: number) {
        callbacks.delete(id);
      },
      runCallback(id: number, data: unknown) {
        callbacks.get(id)?.(data);
      },
      metadata: {
        currentWindow: { label: "main" },
        currentWebview: { label: "main", windowLabel: "main" },
      },
      convertFileSrc(path: string) {
        return path;
      },
    };
    browserWindow.__TAURI_OS_PLUGIN_INTERNALS__ = {
      platform: "linux",
      os_type: "linux",
      family: "unix",
      arch: "x86_64",
      version: "test",
      eol: "\n",
      exe_extension: "",
    };
  }, options);
}
