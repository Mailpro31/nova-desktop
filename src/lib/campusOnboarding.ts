import type { CampusConfig } from "@/lib/campusSession";

export function isValidCampusEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function normalizeCampusServerUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function isValidCampusServerUrl(url: string): boolean {
  try {
    const parsed = new URL(normalizeCampusServerUrl(url));
    return parsed.protocol === "https:" || parsed.hostname === "localhost";
  } catch {
    return false;
  }
}

export function sanitizeCampusCode(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}

export function maskCampusEmail(email: string): string {
  const [local, domain] = email.trim().split("@");
  if (!local || !domain) return email;
  const visible = local.slice(0, 1);
  const maskedLength = Math.max(4, local.length - 1);
  return `${visible}${"•".repeat(maskedLength)}@${domain}`;
}

export function shouldShowCampusServerInput(
  config: CampusConfig | null,
): boolean {
  return !config?.server_url;
}
