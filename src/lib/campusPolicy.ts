import { z } from "zod";
import type { CampusConfig } from "@/lib/campusSession";
import type { CampusProfile } from "@/lib/campusApi";

export type CampusRole = "student" | "teacher" | "staff" | "partner";
export type CampusAuthMethod = "email_code" | "entra" | "oidc";
export type CampusEducationMode = "normal" | "classroom" | "assessment";

export interface CampusOrganization {
  id: string;
  name: string;
  shortName?: string;
  campusName?: string;
  role?: CampusRole;
  cohort?: string;
  managed: boolean;
  branding?: {
    logoUrl?: string;
    accentColor?: string;
  };
  support?: {
    email?: string;
    website?: string;
  };
}

export interface CampusCapabilities {
  dictation: boolean;
  rewrite: boolean;
  styles: boolean;
  fileTranscription: boolean;
  commands: boolean;
  dictionary: boolean;
  snippets: boolean;
  formattingRules: boolean;
  screenContext: boolean;
  cloudInference: boolean;
  engineeringNotes: boolean;
  aiSkills: boolean;
}

export interface CampusPrivacyPolicy {
  verified: boolean;
  contentRetention: "not_stored" | "institution_policy" | "unknown";
  usageCounters: "counts_only" | "none" | "unknown";
  infrastructure: "campus" | "cloud" | "hybrid" | "unknown";
}

export interface CampusContext {
  organization: CampusOrganization;
  capabilities: CampusCapabilities;
  educationMode: CampusEducationMode;
  authMethods: CampusAuthMethod[];
  privacy: CampusPrivacyPolicy;
}

const roleSchema = z.enum(["student", "teacher", "staff", "partner"]);
const authMethodSchema = z.enum(["email_code", "entra", "oidc"]);
const educationModeSchema = z.enum(["normal", "classroom", "assessment"]);

const organizationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  shortName: z.string().min(1).optional(),
  campusName: z.string().min(1).optional(),
  role: roleSchema.optional(),
  cohort: z.string().optional(),
  managed: z.boolean().default(true),
  branding: z
    .object({
      logoUrl: z.string().url().optional(),
      accentColor: z.string().max(32).optional(),
    })
    .optional(),
  support: z
    .object({
      email: z.string().email().optional(),
      website: z.string().url().optional(),
    })
    .optional(),
});

const capabilitiesSchema = z
  .object({
    dictation: z.boolean().optional(),
    rewrite: z.boolean().optional(),
    styles: z.boolean().optional(),
    fileTranscription: z.boolean().optional(),
    commands: z.boolean().optional(),
    dictionary: z.boolean().optional(),
    snippets: z.boolean().optional(),
    formattingRules: z.boolean().optional(),
    screenContext: z.boolean().optional(),
    cloudInference: z.boolean().optional(),
    engineeringNotes: z.boolean().optional(),
    aiSkills: z.boolean().optional(),
  })
  .strict();

const privacySchema = z
  .object({
    verified: z.boolean().optional(),
    contentRetention: z
      .enum(["not_stored", "institution_policy", "unknown"])
      .optional(),
    usageCounters: z.enum(["counts_only", "none", "unknown"]).optional(),
    infrastructure: z.enum(["campus", "cloud", "hybrid", "unknown"]).optional(),
  })
  .strict();

export const DEFAULT_CAMPUS_ORGANIZATION: CampusOrganization = {
  id: "nova-campus",
  name: "Nova Campus",
  managed: true,
};

const NORMAL_CAPABILITIES: CampusCapabilities = {
  dictation: true,
  rewrite: true,
  styles: true,
  fileTranscription: true,
  commands: false,
  dictionary: false,
  snippets: false,
  formattingRules: false,
  screenContext: false,
  cloudInference: true,
  engineeringNotes: false,
  aiSkills: false,
};

const ASSESSMENT_CAPABILITIES: CampusCapabilities = {
  ...NORMAL_CAPABILITIES,
  rewrite: false,
  styles: false,
  fileTranscription: false,
};

export const DEFAULT_CAMPUS_PRIVACY: CampusPrivacyPolicy = {
  verified: false,
  contentRetention: "unknown",
  usageCounters: "unknown",
  infrastructure: "unknown",
};

function compactConfigValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(compactConfigValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== null && entry !== undefined)
      .map(([key, entry]) => [key, compactConfigValue(entry)]),
  );
}

function parseEducationMode(value: unknown): CampusEducationMode {
  const parsed = educationModeSchema.safeParse(value);
  return parsed.success ? parsed.data : "normal";
}

function parseRole(value: unknown): CampusRole | undefined {
  const parsed = roleSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function resolveCampusContext(
  config: CampusConfig | null,
  profile?: CampusProfile | null,
): CampusContext {
  const educationMode = parseEducationMode(config?.education_mode);
  const parsedOrganization = organizationSchema.safeParse(
    compactConfigValue(config?.organization),
  );
  const organization: CampusOrganization = parsedOrganization.success
    ? parsedOrganization.data
    : DEFAULT_CAMPUS_ORGANIZATION;

  const profileRole = parseRole(profile?.role);
  const capabilities = capabilitiesSchema.safeParse(
    compactConfigValue(config?.capabilities),
  );
  const modeDefaults =
    educationMode === "assessment"
      ? ASSESSMENT_CAPABILITIES
      : NORMAL_CAPABILITIES;
  const privacy = privacySchema.safeParse(compactConfigValue(config?.privacy));
  const authMethods = z.array(authMethodSchema).safeParse(config?.auth_methods);

  return {
    organization: {
      ...organization,
      role: profileRole ?? organization.role,
      cohort: profile?.cohort || organization.cohort,
    },
    capabilities: {
      ...modeDefaults,
      ...(capabilities.success ? capabilities.data : {}),
    },
    educationMode,
    authMethods:
      authMethods.success && authMethods.data.length > 0
        ? authMethods.data
        : ["email_code"],
    privacy: {
      ...DEFAULT_CAMPUS_PRIVACY,
      ...(privacy.success ? privacy.data : {}),
    },
  };
}

export function campusOrganizationLabel(
  organization: CampusOrganization,
): string {
  return [organization.shortName ?? organization.name, organization.campusName]
    .filter(Boolean)
    .join(" · ");
}
