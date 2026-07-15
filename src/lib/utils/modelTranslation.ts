import type { TFunction } from "i18next";
import type { ModelInfo } from "@/bindings";

// Model names/descriptions are already re-labelled with the Nova signature
// scheme at the store level (see `lib/modelBranding.ts`), which is the single
// source of truth and guarantees no real engine name is ever shown. These
// helpers therefore just surface the (branded) fields; they no longer consult
// the upstream `onboarding.models.*` i18n keys, which carried the real names.

/**
 * Get the display name for a model (already Nova-branded upstream).
 */
export function getTranslatedModelName(
  model: ModelInfo,
  _t: TFunction,
): string {
  return model.name;
}

/**
 * Get the display description for a model. Custom (user-provided) models keep a
 * generic localized description; catalog models use their Nova description.
 */
export function getTranslatedModelDescription(
  model: ModelInfo,
  t: TFunction,
): string {
  if (model.is_custom) {
    return t("onboarding.customModelDescription");
  }
  return model.description;
}
