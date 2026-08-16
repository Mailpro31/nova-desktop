import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

export const HealthResponseSchema = z.object({
  status: z.string(),
  domains: z.array(z.string()),
});

export const AuthRequestResponseSchema = z.object({
  sent: z.boolean(),
});

export const AuthVerifyResponseSchema = z.object({
  server_url: z.string(),
  email: z.string(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type AuthRequestResponse = z.infer<typeof AuthRequestResponseSchema>;
export type AuthVerifyResponse = z.infer<typeof AuthVerifyResponseSchema>;

export class CampusApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "CampusApiError";
  }
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function parseCommandError(err: unknown): CampusApiError {
  if (err instanceof CampusApiError) return err;

  let message = "Unknown error";
  let status = 0;

  if (err instanceof Error) {
    message = err.message;
  } else if (typeof err === "string") {
    message = err;
  } else if (err && typeof err === "object") {
    // Tauri invoke peut renvoyer un objet { message: string } ou similaire.
    const maybeMessage = (err as Record<string, unknown>).message;
    if (typeof maybeMessage === "string") {
      message = maybeMessage;
    } else {
      try {
        message = JSON.stringify(err);
      } catch {
        message = "Erreur inconnue du serveur";
      }
    }
  }

  // Les commandes Rust renvoient les erreurs HTTP sous la forme "HTTP N: ...".
  const httpMatch = message.match(/^HTTP\s+(\d+):\s*(.*)$/);
  if (httpMatch) {
    status = parseInt(httpMatch[1], 10);
    message = httpMatch[2] || message;
  }

  return new CampusApiError(message, status);
}

/**
 * Message d'erreur affichable pour une action campus.
 * Retourne `null` quand la session a été révoquée (401) : le backend émet
 * déjà l'événement `campus-session-invalid` et le frontend navigue vers
 * l'onboarding avec son propre toast, donc aucune erreur locale à afficher.
 */
export function campusErrorText(err: unknown, fallback: string): string | null {
  if (err instanceof CampusApiError) {
    if (err.status === 401) return null;
    return err.message || fallback;
  }
  return fallback;
}

export class CampusApi {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  async health(): Promise<HealthResponse> {
    const reachable = await invoke<boolean>(
      "check_campus_server_reachability",
      {
        serverUrl: this.baseUrl,
      },
    );
    if (!reachable) {
      throw new CampusApiError("Server unreachable", 0);
    }
    return { status: "ok", domains: [] };
  }

  async requestAuth(
    email: string,
    machine: string,
  ): Promise<AuthRequestResponse> {
    try {
      return await invoke<AuthRequestResponse>("request_campus_auth", {
        serverUrl: this.baseUrl,
        email,
        machine,
      });
    } catch (err) {
      throw parseCommandError(err);
    }
  }

  async verifyAuth(
    email: string,
    code: string,
    machine: string,
  ): Promise<AuthVerifyResponse> {
    try {
      return await invoke<AuthVerifyResponse>("verify_campus_auth", {
        serverUrl: this.baseUrl,
        email,
        code,
        machine,
      });
    } catch (err) {
      throw parseCommandError(err);
    }
  }

  async getMe(): Promise<CampusProfile> {
    try {
      return await invoke<CampusProfile>("get_campus_me");
    } catch (err) {
      throw parseCommandError(err);
    }
  }

  async getVocabulary(): Promise<CampusVocabularyResponse> {
    try {
      return await invoke<CampusVocabularyResponse>("get_campus_vocabulary");
    } catch (err) {
      throw parseCommandError(err);
    }
  }

  async addDictionaryEntry(
    term: string,
    replacement: string,
  ): Promise<CampusIdResponse> {
    try {
      return await invoke<CampusIdResponse>("add_campus_dictionary_entry", {
        term,
        replacement,
      });
    } catch (err) {
      throw parseCommandError(err);
    }
  }

  async deleteDictionaryEntry(entryId: number): Promise<void> {
    try {
      await invoke("delete_campus_dictionary_entry", {
        entryId,
      });
    } catch (err) {
      throw parseCommandError(err);
    }
  }

  async learnDictionary(
    heard: string,
    corrected: string,
  ): Promise<CampusLearnResponse> {
    try {
      return await invoke<CampusLearnResponse>("learn_campus_dictionary", {
        heard,
        corrected,
      });
    } catch (err) {
      throw parseCommandError(err);
    }
  }

  async exportDictionary(): Promise<string> {
    try {
      return await invoke<string>("export_campus_dictionary");
    } catch (err) {
      throw parseCommandError(err);
    }
  }

  async importDictionary(csvContent: string): Promise<CampusImportResponse> {
    try {
      return await invoke<CampusImportResponse>("import_campus_dictionary", {
        csvContent,
      });
    } catch (err) {
      throw parseCommandError(err);
    }
  }

  async analyzeDocument(
    textContent: string,
    filename?: string,
  ): Promise<CampusAnalyzeResponse> {
    try {
      return await invoke<CampusAnalyzeResponse>("analyze_campus_document", {
        textContent,
        filename,
      });
    } catch (err) {
      throw parseCommandError(err);
    }
  }

  async addSnippet(
    trigger: string,
    content: string,
  ): Promise<CampusIdResponse> {
    try {
      return await invoke<CampusIdResponse>("add_campus_snippet", {
        trigger,
        content,
      });
    } catch (err) {
      throw parseCommandError(err);
    }
  }

  async deleteSnippet(snippetId: number): Promise<void> {
    try {
      await invoke("delete_campus_snippet", {
        snippetId,
      });
    } catch (err) {
      throw parseCommandError(err);
    }
  }

  async getFormattingRules(): Promise<CampusFormattingRulesResponse> {
    try {
      return await invoke<CampusFormattingRulesResponse>(
        "get_campus_formatting_rules",
      );
    } catch (err) {
      throw parseCommandError(err);
    }
  }

  async addFormattingRule(rule: string): Promise<CampusIdResponse> {
    try {
      return await invoke<CampusIdResponse>("add_campus_formatting_rule", {
        rule,
      });
    } catch (err) {
      throw parseCommandError(err);
    }
  }

  async deleteFormattingRule(ruleId: number): Promise<void> {
    try {
      await invoke("delete_campus_formatting_rule", {
        ruleId,
      });
    } catch (err) {
      throw parseCommandError(err);
    }
  }

  async executeCommand(
    instruction: string,
    text: string,
  ): Promise<CampusCommandResponse> {
    try {
      return await invoke<CampusCommandResponse>("execute_campus_command", {
        instruction,
        text,
      });
    } catch (err) {
      throw parseCommandError(err);
    }
  }

  async transcribeAudioFile(
    fileBytes: number[] | Uint8Array,
    filename: string,
  ): Promise<string> {
    try {
      const bytes = Array.from(fileBytes);
      return await invoke<string>("transcribe_campus_audio_file", {
        fileBytes: bytes,
        filename,
      });
    } catch (err) {
      throw parseCommandError(err);
    }
  }
}

export interface CampusSharedDictEntry {
  id: number;
  term: string;
  replacement: string;
}

export interface CampusPersonalDictEntry {
  id: number;
  term: string;
  replacement: string;
  source: string;
}

export interface CampusSnippetEntry {
  id: number;
  trigger: string;
  content: string;
}

export interface CampusVocabularyResponse {
  shared: CampusSharedDictEntry[];
  personal: CampusPersonalDictEntry[];
  snippets: CampusSnippetEntry[];
}

export interface CampusIdResponse {
  id: number;
}

export interface CampusLearnResponse {
  learned: boolean;
}

export interface CampusImportResponse {
  imported: number;
}

export interface CampusAnalyzeResponse {
  terms_added: number;
}

export interface CampusRuleEntry {
  id: number;
  rule: string;
}

export interface CampusFormattingRulesResponse {
  shared: CampusRuleEntry[];
  personal: CampusRuleEntry[];
}

export interface CampusCommandResponse {
  text: string;
}

export interface CampusProfile {
  email: string;
  role: string;
  cohort: string;
}

interface ReachabilityCache {
  value: boolean;
  timestamp: number;
}

const REACHABILITY_CACHE_TTL_MS = 30_000;

const reachabilityCache = new Map<string, ReachabilityCache>();

export async function isServerReachable(baseUrl: string): Promise<boolean> {
  const normalized = normalizeBaseUrl(baseUrl);
  const cached = reachabilityCache.get(normalized);
  if (cached && Date.now() - cached.timestamp < REACHABILITY_CACHE_TTL_MS) {
    return cached.value;
  }

  try {
    const reachable = await invoke<boolean>(
      "check_campus_server_reachability",
      {
        serverUrl: normalized,
      },
    );
    reachabilityCache.set(normalized, {
      value: reachable,
      timestamp: Date.now(),
    });
    return reachable;
  } catch {
    reachabilityCache.set(normalized, { value: false, timestamp: Date.now() });
    return false;
  }
}

export function invalidateServerReachabilityCache(baseUrl: string): void {
  reachabilityCache.delete(normalizeBaseUrl(baseUrl));
}
