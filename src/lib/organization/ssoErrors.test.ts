import { describe, expect, test } from "bun:test";

import en from "@/i18n/locales/en/translation.json";
import { formatSsoError } from "./ssoErrors";
import type { SsoError } from "@/bindings";

/** Résout une clé i18n dans le fichier source, comme le ferait `t`. */
function translate(key: string): string {
  const value = key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[part]
          : undefined,
      en,
    );
  if (typeof value !== "string") {
    throw new Error(`clé de traduction absente : ${key}`);
  }
  return value;
}

const server = (detail: string): SsoError => ({ code: "Server", detail });

describe("Messages d'échec de connexion Microsoft", () => {
  test("une annulation ne dit rien", () => {
    // L'utilisateur vient de fermer la fenêtre : lui afficher une erreur
    // reviendrait à lui reprocher son propre geste.
    expect(formatSsoError({ code: "AuthCancelled" }, translate)).toBeNull();
  });

  test("chaque échec produit une phrase, jamais un code", () => {
    const errors: SsoError[] = [
      { code: "AuthTimeout" },
      { code: "NetworkError" },
      { code: "StateMismatch" },
      { code: "LoopbackUnavailable" },
      { code: "AlreadyInProgress" },
      server("TOKEN_EXCHANGE_FAILED"),
      server("ID_TOKEN_INVALID"),
      server("TENANT_NOT_ALLOWED"),
      server("ACCOUNT_DISABLED"),
      server("IDENTITY_CONFLICT"),
    ];
    for (const error of errors) {
      const message = formatSsoError(error, translate);
      expect(message).toBeTruthy();
      expect(message).toMatch(/[a-z]{4}/);
      // Aucun code technique ne remonte à l'écran.
      expect(message).not.toMatch(/[A-Z]{2,}_[A-Z]{2,}/);
    }
  });

  test("aucun message ne divulgue de détail technique", () => {
    const forbidden = [
      "tenant",
      "client_id",
      "token",
      "PKCE",
      "OAuth",
      "127.0.0.1",
      "nonce",
      "verifier",
    ];
    const everyError: SsoError[] = [
      { code: "AuthTimeout" },
      { code: "NetworkError" },
      { code: "StateMismatch" },
      { code: "LoopbackUnavailable" },
      { code: "AlreadyInProgress" },
      server("TENANT_NOT_ALLOWED"),
      server("ORGANIZATION_MISMATCH"),
      server("MEMBERSHIP_NOT_FOUND"),
      server("ACCOUNT_DISABLED"),
      server("ID_TOKEN_INVALID"),
    ];
    for (const error of everyError) {
      const message = (formatSsoError(error, translate) ?? "").toLowerCase();
      for (const word of forbidden) {
        expect(message).not.toContain(word.toLowerCase());
      }
    }
  });

  test("un refus d'organisation est distingué d'une panne", () => {
    const refusal = formatSsoError(server("TENANT_NOT_ALLOWED"), translate);
    const failure = formatSsoError(server("TOKEN_EXCHANGE_FAILED"), translate);
    expect(refusal).not.toBe(failure);
    // Les trois refus d'appartenance disent la même chose : l'utilisateur n'a
    // pas à distinguer un tenant non déclaré d'une organisation qui ne
    // correspond pas.
    expect(formatSsoError(server("ORGANIZATION_MISMATCH"), translate)).toBe(
      refusal,
    );
    expect(formatSsoError(server("MEMBERSHIP_NOT_FOUND"), translate)).toBe(
      refusal,
    );
  });

  test("un compte suspendu a son propre message", () => {
    const revoked = formatSsoError(server("ACCOUNT_DISABLED"), translate);
    expect(revoked).not.toBe(
      formatSsoError(server("TENANT_NOT_ALLOWED"), translate),
    );
  });

  test("un code inconnu ne fait pas planter l'écran", () => {
    expect(formatSsoError(server("CODE_JAMAIS_VU"), translate)).toBeTruthy();
  });
});
