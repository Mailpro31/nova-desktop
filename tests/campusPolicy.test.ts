import { describe, expect, test } from "bun:test";
import {
  campusOrganizationLabel,
  resolveCampusContext,
} from "../src/lib/campusPolicy";
import {
  isValidCampusEmail,
  isValidCampusServerUrl,
  maskCampusEmail,
  sanitizeCampusCode,
  shouldShowCampusServerInput,
} from "../src/lib/campusOnboarding";
import { AI_ESSENTIALS_TRACK } from "../src/lib/aiSkills";

describe("Campus policy", () => {
  test("uses production-safe capability defaults", () => {
    const context = resolveCampusContext(null);

    expect(context.capabilities.dictation).toBe(true);
    expect(context.capabilities.rewrite).toBe(true);
    expect(context.capabilities.fileTranscription).toBe(true);
    expect(context.capabilities.commands).toBe(false);
    expect(context.capabilities.dictionary).toBe(false);
    expect(context.capabilities.snippets).toBe(false);
    expect(context.capabilities.formattingRules).toBe(false);
    expect(context.capabilities.engineeringNotes).toBe(false);
    expect(context.capabilities.aiSkills).toBe(false);
    expect(context.capabilities.personalization).toBe(true);
    expect(context.aiSkillsPolicy.required).toBe(false);
  });

  test("starts Assessment mode conservatively", () => {
    const context = resolveCampusContext({
      server_url: "https://campus.example.edu",
      education_mode: "assessment",
    });

    expect(context.educationMode).toBe("assessment");
    expect(context.capabilities.dictation).toBe(true);
    expect(context.capabilities.rewrite).toBe(false);
    expect(context.capabilities.styles).toBe(false);
    expect(context.capabilities.fileTranscription).toBe(false);
  });

  test("merges institution identity with the authenticated profile", () => {
    const context = resolveCampusContext(
      {
        server_url: "https://campus.example.edu",
        organization: {
          id: "example-school",
          name: "Example Engineering School",
          shortName: "EES",
          campusName: "Paris",
          managed: true,
        },
        capabilities: { dictionary: true },
        auth_methods: ["email_code", "entra"],
      },
      { email: "student@example.edu", role: "student", cohort: "AERO 2" },
    );

    expect(campusOrganizationLabel(context.organization)).toBe("EES · Paris");
    expect(context.organization.role).toBe("student");
    expect(context.organization.cohort).toBe("AERO 2");
    expect(context.capabilities.dictionary).toBe(true);
    expect(context.authMethods).toEqual(["email_code", "entra"]);
  });

  test("does not present an unverified privacy claim", () => {
    const context = resolveCampusContext({
      server_url: "https://campus.example.edu",
      privacy: { contentRetention: "not_stored" },
    });

    expect(context.privacy.verified).toBe(false);
  });

  test("accepts institution AI Skills policy without making it mandatory by default", () => {
    const context = resolveCampusContext({
      server_url: "https://campus.example.edu",
      capabilities: { aiSkills: true },
      ai_skills: { enabled: true, required: false, trackProgress: true },
    });

    expect(context.aiSkillsPolicy).toEqual({
      enabled: true,
      required: false,
      trackProgress: true,
    });
  });
});

describe("AI Skills architecture", () => {
  test("ships a short extensible engineering foundation track", () => {
    expect(AI_ESSENTIALS_TRACK.level).toBe("foundation");
    expect(AI_ESSENTIALS_TRACK.modules).toHaveLength(6);
    for (const module of AI_ESSENTIALS_TRACK.modules) {
      expect(module.durationMinutes).toBeGreaterThanOrEqual(2);
      expect(module.durationMinutes).toBeLessThanOrEqual(5);
      expect(module.lessons[0].question.options).toHaveLength(3);
    }
  });
});

describe("Campus onboarding inputs", () => {
  test("hides the server field when IT configuration is present", () => {
    expect(
      shouldShowCampusServerInput({
        server_url: "https://campus.example.edu",
      }),
    ).toBe(false);
    expect(shouldShowCampusServerInput(null)).toBe(true);
  });

  test("validates school email and secure server addresses", () => {
    expect(isValidCampusEmail("student@example.edu")).toBe(true);
    expect(isValidCampusEmail("not-an-email")).toBe(false);
    expect(isValidCampusServerUrl("https://campus.example.edu")).toBe(true);
    expect(isValidCampusServerUrl("http://campus.example.edu")).toBe(false);
    expect(isValidCampusServerUrl("http://localhost:8080")).toBe(true);
  });

  test("accepts a complete pasted code and masks the account", () => {
    expect(sanitizeCampusCode("12 34-56")).toBe("123456");
    expect(sanitizeCampusCode("123456789")).toBe("123456");
    expect(maskCampusEmail("student@eleves.example.edu")).toBe(
      "s••••••@eleves.example.edu",
    );
  });
});
