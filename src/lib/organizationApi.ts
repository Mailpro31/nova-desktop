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

export class OrganizationApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "OrganizationApiError";
  }
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function parseCommandError(err: unknown): OrganizationApiError {
  if (err instanceof OrganizationApiError) return err;

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

  return new OrganizationApiError(message, status);
}

/**
 * Message d'erreur affichable pour une action campus.
 * Retourne `null` quand la session a été révoquée (401) : le backend émet
 * déjà l'événement `campus-session-invalid` et le frontend navigue vers
 * l'onboarding avec son propre toast, donc aucune erreur locale à afficher.
 */
export function campusErrorText(err: unknown, fallback: string): string | null {
  if (err instanceof OrganizationApiError) {
    if (err.status === 401) return null;
    return err.message || fallback;
  }
  return fallback;
}

/** Un Style publié par l'organisation. `id` porte le préfixe `org_style_`. */
export interface OrganizationStyleEntry {
  id: string;
  name: string;
  instruction: string;
}

/** Un AI Skill publié par l'organisation — déclaratif, jamais exécutable. */
export interface OrganizationSkillEntry {
  id: string;
  title: string;
  summary: string;
  practice: string;
  duration_minutes: number;
  steps: string[];
}

export interface OrganizationCatalogSnapshot {
  catalog_version: string;
  styles: OrganizationStyleEntry[];
  skills: OrganizationSkillEntry[];
}

export class OrganizationApi {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  async health(): Promise<HealthResponse> {
    const reachable = await invoke<boolean>(
      "check_organization_server_reachability",
      {
        serverUrl: this.baseUrl,
      },
    );
    if (!reachable) {
      throw new OrganizationApiError("Server unreachable", 0);
    }
    return { status: "ok", domains: [] };
  }

  async requestAuth(
    email: string,
    machine: string,
  ): Promise<AuthRequestResponse> {
    try {
      return await invoke<AuthRequestResponse>("request_organization_auth", {
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
      return await invoke<AuthVerifyResponse>("verify_organization_auth", {
        serverUrl: this.baseUrl,
        email,
        code,
        machine,
      });
    } catch (err) {
      throw parseCommandError(err);
    }
  }

  async startMicrosoftAuth(
    machine: string,
  ): Promise<OrganizationEntraStartResponse> {
    try {
      return await invoke<OrganizationEntraStartResponse>(
        "start_organization_entra_auth",
        {
          serverUrl: this.baseUrl,
          machine,
        },
      );
    } catch (err) {
      throw parseCommandError(err);
    }
  }

  async pollMicrosoftAuth(
    flowId: string,
  ): Promise<OrganizationEntraPollResponse> {
    try {
      return await invoke<OrganizationEntraPollResponse>(
        "poll_organization_entra_auth",
        {
          serverUrl: this.baseUrl,
          flowId,
        },
      );
    } catch (err) {
      throw parseCommandError(err);
    }
  }

  async getMe(): Promise<OrganizationProfile> {
    try {
      return await invoke<OrganizationProfile>("get_organization_me");
    } catch (err) {
      throw parseCommandError(err);
    }
  }

  async getVocabulary(): Promise<OrganizationVocabularyResponse> {
    try {
      return await invoke<OrganizationVocabularyResponse>(
        "get_organization_vocabulary",
      );
    } catch (err) {
      throw parseCommandError(err);
    }
  }

  async addDictionaryEntry(
    term: string,
    replacement: string,
  ): Promise<OrganizationIdResponse> {
    try {
      return await invoke<OrganizationIdResponse>(
        "add_organization_dictionary_entry",
        {
          term,
          replacement,
        },
      );
    } catch (err) {
      throw parseCommandError(err);
    }
  }

  async deleteDictionaryEntry(entryId: number): Promise<void> {
    try {
      await invoke("delete_organization_dictionary_entry", {
        entryId,
      });
    } catch (err) {
      throw parseCommandError(err);
    }
  }

  async learnDictionary(
    heard: string,
    corrected: string,
  ): Promise<OrganizationLearnResponse> {
    try {
      return await invoke<OrganizationLearnResponse>(
        "learn_organization_dictionary",
        {
          heard,
          corrected,
        },
      );
    } catch (err) {
      throw parseCommandError(err);
    }
  }

  async exportDictionary(): Promise<string> {
    try {
      return await invoke<string>("export_organization_dictionary");
    } catch (err) {
      throw parseCommandError(err);
    }
  }

  async importDictionary(
    csvContent: string,
  ): Promise<OrganizationImportResponse> {
    try {
      return await invoke<OrganizationImportResponse>(
        "import_organization_dictionary",
        {
          csvContent,
        },
      );
    } catch (err) {
      throw parseCommandError(err);
    }
  }

  async analyzeDocument(
    textContent: string,
    filename?: string,
  ): Promise<OrganizationAnalyzeResponse> {
    try {
      return await invoke<OrganizationAnalyzeResponse>(
        "analyze_organization_document",
        {
          textContent,
          filename,
        },
      );
    } catch (err) {
      throw parseCommandError(err);
    }
  }

  async addSnippet(
    trigger: string,
    content: string,
  ): Promise<OrganizationIdResponse> {
    try {
      return await invoke<OrganizationIdResponse>("add_organization_snippet", {
        trigger,
        content,
      });
    } catch (err) {
      throw parseCommandError(err);
    }
  }

  async deleteSnippet(snippetId: number): Promise<void> {
    try {
      await invoke("delete_organization_snippet", {
        snippetId,
      });
    } catch (err) {
      throw parseCommandError(err);
    }
  }

  async getFormattingRules(): Promise<OrganizationFormattingRulesResponse> {
    try {
      return await invoke<OrganizationFormattingRulesResponse>(
        "get_organization_formatting_rules",
      );
    } catch (err) {
      throw parseCommandError(err);
    }
  }

  async addFormattingRule(rule: string): Promise<OrganizationIdResponse> {
    try {
      return await invoke<OrganizationIdResponse>(
        "add_organization_formatting_rule",
        {
          rule,
        },
      );
    } catch (err) {
      throw parseCommandError(err);
    }
  }

  async deleteFormattingRule(ruleId: number): Promise<void> {
    try {
      await invoke("delete_organization_formatting_rule", {
        ruleId,
      });
    } catch (err) {
      throw parseCommandError(err);
    }
  }

  async executeCommand(
    instruction: string,
    text: string,
  ): Promise<OrganizationCommandResponse> {
    try {
      return await invoke<OrganizationCommandResponse>(
        "execute_organization_command",
        {
          instruction,
          text,
        },
      );
    } catch (err) {
      throw parseCommandError(err);
    }
  }

  /**
   * Charge le contenu publié par l'organisation.
   *
   * Le catalogue reçu remplace le précédent côté Rust — c'est ce qui rend le
   * changement de version, et le retour arrière, immédiats sans redémarrage.
   */
  async refreshOrganizationPackages(): Promise<OrganizationCatalogSnapshot> {
    try {
      return await invoke<OrganizationCatalogSnapshot>(
        "refresh_organization_packages",
      );
    } catch (err) {
      throw parseCommandError(err);
    }
  }

  /**
   * Exécute un AI Skill publié par l'organisation.
   *
   * On envoie un **identifiant**, jamais l'instruction : c'est le serveur qui
   * la retrouve dans le package actif.
   */
  async runSkill(
    skillId: string,
    text: string,
  ): Promise<OrganizationCommandResponse> {
    try {
      return await invoke<OrganizationCommandResponse>(
        "run_organization_skill",
        {
          skillId,
          text,
        },
      );
    } catch (err) {
      throw parseCommandError(err);
    }
  }

  async getAiSkills(): Promise<OrganizationAiSkillsResponse> {
    try {
      return await invoke<OrganizationAiSkillsResponse>(
        "get_organization_ai_skills",
      );
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
      return await invoke<string>("transcribe_organization_audio_file", {
        fileBytes: bytes,
        filename,
      });
    } catch (err) {
      throw parseCommandError(err);
    }
  }
}

export interface OrganizationSharedDictEntry {
  id: number;
  term: string;
  replacement: string;
}

export interface OrganizationPersonalDictEntry {
  id: number;
  term: string;
  replacement: string;
  source: string;
}

export interface OrganizationSnippetEntry {
  id: number;
  trigger: string;
  content: string;
}

export interface OrganizationVocabularyResponse {
  shared: OrganizationSharedDictEntry[];
  personal: OrganizationPersonalDictEntry[];
  snippets: OrganizationSnippetEntry[];
}

export interface OrganizationIdResponse {
  id: number;
}

export interface OrganizationLearnResponse {
  learned: boolean;
}

export interface OrganizationImportResponse {
  imported: number;
}

export interface OrganizationAnalyzeResponse {
  terms_added: number;
}

export interface OrganizationRuleEntry {
  id: number;
  rule: string;
}

export interface OrganizationFormattingRulesResponse {
  shared: OrganizationRuleEntry[];
  personal: OrganizationRuleEntry[];
}

export interface OrganizationCommandResponse {
  text: string;
}

export interface OrganizationEntraStartResponse {
  flow_id: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string | null;
  expires_in: number;
  interval: number;
  message: string;
}

export interface OrganizationEntraPollResponse {
  status: "pending" | "complete" | "expired" | string;
  email?: string | null;
  retry_after?: number | null;
}

export interface OrganizationAiSkill {
  id: string;
  title: string;
  summary: string;
  practice: string;
  duration_minutes: number;
}

export interface OrganizationAiSkillsResponse {
  skills: OrganizationAiSkill[];
}

/**
 * Profil renvoyé par `GET /api/me`.
 *
 * Les trois premiers champs sont le contrat historique, toujours présents. Le
 * reste n'est lu que par `parseServerIdentity` (`@/lib/organization`), qui sait
 * qu'un serveur d'établissement plus ancien que le poste ne les envoie pas.
 * Le type reste large ici : la validation se fait à un seul endroit, pas à
 * chaque site d'appel.
 */
export interface OrganizationProfile {
  email: string;
  role: string;
  cohort: string;
  /** Nom d'affichage de l'établissement. Reste une chaîne — voir bindings. */
  organization?: string;
  contract_version?: number | null;
  user_id?: string | null;
  organization_id?: string | null;
  organization_type?: string | null;
  membership?: unknown;
  identity?: unknown;
  capabilities?: string[] | null;
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
      "check_organization_server_reachability",
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
