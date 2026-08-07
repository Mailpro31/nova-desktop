import React, { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { RefreshCcw } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { commands } from "@/bindings";
import { styleColor } from "../../../lib/styleColors";
import { BUILTIN_STYLE_IDS } from "../../../lib/builtinStyles";

import { Alert } from "../../ui/Alert";
import {
  Dropdown,
  SettingContainer,
  SettingsGroup,
  Textarea,
} from "@/components/ui";
import { Button } from "../../ui/Button";
import { ResetButton } from "../../ui/ResetButton";
import { Input } from "../../ui/Input";
import { Dialog } from "../../ui/Dialog";

import { PostProcessingToggle } from "../PostProcessingToggle";
import { ProviderSelect } from "../PostProcessingSettingsApi/ProviderSelect";
import { BaseUrlField } from "../PostProcessingSettingsApi/BaseUrlField";
import { ApiKeyField } from "../PostProcessingSettingsApi/ApiKeyField";
import { ModelSelect } from "../PostProcessingSettingsApi/ModelSelect";
import { PowerProfileSelector } from "../PostProcessingSettingsApi/PowerProfileSelector";
import { TierBadge } from "../license/TierBadge";
import { AutoStyleSettings } from "./AutoStyleSettings";
import { ContextReadingSettings } from "./ContextReadingSettings";
import { usePostProcessProviderState } from "../PostProcessingSettingsApi/usePostProcessProviderState";
import { useSettings } from "../../../hooks/useSettings";

const PostProcessingSettingsApiComponent: React.FC = () => {
  const { t } = useTranslation();
  const state = usePostProcessProviderState();
  const { settings, refreshSettings } = useSettings();

  return (
    <>
      <SettingContainer
        title={t("settings.postProcessing.api.provider.title")}
        description={t("settings.postProcessing.api.provider.description")}
        descriptionMode="tooltip"
        layout="horizontal"
        grouped={true}
      >
        <div className="flex items-center gap-2">
          <ProviderSelect
            options={state.providerOptions}
            value={state.selectedProviderId}
            onChange={state.handleProviderSelect}
          />
        </div>
      </SettingContainer>

      {state.isLocalLlm && (
        <PowerProfileSelector
          currentModel={settings?.post_process_models?.nova_local}
          onApplied={refreshSettings}
        />
      )}

      {state.isAppleProvider ? (
        state.appleIntelligenceUnavailable ? (
          <Alert variant="error" contained>
            {t("settings.postProcessing.api.appleIntelligence.unavailable")}
          </Alert>
        ) : null
      ) : state.isNovaTurbo || state.isLocalLlm ? null : (
        <>
          {state.isCustomProvider && (
            <SettingContainer
              title={t("settings.postProcessing.api.baseUrl.title")}
              description={t("settings.postProcessing.api.baseUrl.description")}
              descriptionMode="tooltip"
              layout="horizontal"
              grouped={true}
            >
              <div className="flex items-center gap-2">
                <BaseUrlField
                  value={state.baseUrl}
                  onBlur={state.handleBaseUrlChange}
                  placeholder={t(
                    "settings.postProcessing.api.baseUrl.placeholder",
                  )}
                  disabled={state.isBaseUrlUpdating}
                  className="min-w-[380px]"
                />
              </div>
            </SettingContainer>
          )}

          <SettingContainer
            title={t("settings.postProcessing.api.apiKey.title")}
            description={t("settings.postProcessing.api.apiKey.description")}
            descriptionMode="tooltip"
            layout="horizontal"
            grouped={true}
          >
            <div className="flex items-center gap-2">
              <ApiKeyField
                value={state.apiKey}
                onBlur={state.handleApiKeyChange}
                placeholder={t(
                  "settings.postProcessing.api.apiKey.placeholder",
                )}
                disabled={state.isApiKeyUpdating}
                className="min-w-[320px]"
              />
            </div>
          </SettingContainer>
        </>
      )}

      {!state.isAppleProvider && !state.isNovaTurbo && !state.isLocalLlm && (
        <SettingContainer
          title={t("settings.postProcessing.api.model.title")}
          description={
            state.isCustomProvider
              ? t("settings.postProcessing.api.model.descriptionCustom")
              : t("settings.postProcessing.api.model.descriptionDefault")
          }
          descriptionMode="tooltip"
          layout="stacked"
          grouped={true}
        >
          <div className="flex items-center gap-2">
            <ModelSelect
              value={state.model}
              options={state.modelOptions}
              disabled={state.isModelUpdating}
              isLoading={state.isFetchingModels}
              placeholder={
                state.modelOptions.length > 0
                  ? t(
                      "settings.postProcessing.api.model.placeholderWithOptions",
                    )
                  : t("settings.postProcessing.api.model.placeholderNoOptions")
              }
              onSelect={state.handleModelSelect}
              onCreate={state.handleModelCreate}
              onBlur={() => {}}
              className="flex-1 min-w-[380px]"
            />
            <ResetButton
              onClick={state.handleRefreshModels}
              disabled={state.isFetchingModels}
              ariaLabel={t("settings.postProcessing.api.model.refreshModels")}
              className="flex h-10 w-10 items-center justify-center"
            >
              <RefreshCcw
                className={`h-4 w-4 ${state.isFetchingModels ? "animate-spin" : ""}`}
              />
            </ResetButton>
          </div>
        </SettingContainer>
      )}

      <Dialog
        open={state.turboConfirmOpen}
        onOpenChange={(open) => {
          if (!open) state.cancelTurbo();
        }}
        title={t("settings.postProcessing.api.turbo.confirmTitle")}
        closeLabel={t("settings.postProcessing.api.turbo.cancel")}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={state.cancelTurbo}>
              {t("settings.postProcessing.api.turbo.cancel")}
            </Button>
            <Button variant="primary" size="md" onClick={state.confirmTurbo}>
              {t("settings.postProcessing.api.turbo.confirmEnable")}
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-secondary">
          {t("settings.postProcessing.api.turbo.confirmDescription")}
        </p>
      </Dialog>
    </>
  );
};

const PostProcessingSettingsPromptsComponent: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting, updateSetting, refreshSettings } = useSettings();
  // null = pas d'édition ; "new" = création ; sinon id du Style en édition
  const [editing, setEditing] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftText, setDraftText] = useState("");
  // Créer / modifier / supprimer des Styles est réservé à Nova Ultra.
  const [canEditStyles, setCanEditStyles] = useState(true);

  useEffect(() => {
    invoke<{ features: Record<string, boolean> }>("get_license_status")
      .then((s) => setCanEditStyles(s.features?.custom_styles ?? true))
      .catch(() => setCanEditStyles(true));
  }, []);

  const prompts = getSetting("post_process_prompts") || [];
  const selectedPromptId = getSetting("post_process_selected_prompt_id") || "";
  const isBuiltin = (id: string) => BUILTIN_STYLE_IDS.includes(id);

  const startEdit = (id: string) => {
    const p = prompts.find((prompt) => prompt.id === id);
    if (!p) return;
    setEditing(id);
    setDraftName(p.name);
    setDraftText(p.prompt);
  };

  const startCreate = () => {
    setEditing("new");
    setDraftName("");
    setDraftText("");
  };

  const startDuplicate = (id: string) => {
    const p = prompts.find((prompt) => prompt.id === id);
    if (!p) return;
    setEditing("new");
    setDraftName(
      `${p.name} (${t("settings.postProcessing.prompts.copySuffix")})`,
    );
    setDraftText(p.prompt);
  };

  const cancelEdit = () => setEditing(null);

  const handleSelect = (id: string) => {
    updateSetting("post_process_selected_prompt_id", id);
  };

  const handleSave = async () => {
    if (!draftName.trim() || !draftText.trim()) return;
    try {
      if (editing === "new") {
        const result = await commands.addPostProcessPrompt(
          draftName.trim(),
          draftText.trim(),
        );
        if (result.status === "ok") {
          await refreshSettings();
          updateSetting("post_process_selected_prompt_id", result.data.id);
        }
      } else if (editing) {
        await commands.updatePostProcessPrompt(
          editing,
          draftName.trim(),
          draftText.trim(),
        );
        await refreshSettings();
      }
      setEditing(null);
    } catch (error) {
      console.error("Failed to save prompt:", error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await commands.deletePostProcessPrompt(id);
      await refreshSettings();
      if (editing === id) setEditing(null);
    } catch (error) {
      console.error("Failed to delete prompt:", error);
    }
  };

  // Carte d'un Style : pastille couleur + nom + badge + coche sur l'actif.
  const StyleCard: React.FC<{
    id: string;
    name: string;
    kind: "auto" | "builtin" | "custom";
  }> = ({ id, name, kind }) => {
    const active = selectedPromptId === id;
    const badge =
      kind === "auto"
        ? t("settings.postProcessing.prompts.badgeAuto")
        : kind === "builtin"
          ? t("settings.postProcessing.prompts.badgeBuiltin")
          : t("settings.postProcessing.prompts.badgeCustom");
    return (
      <div
        role="button"
        tabIndex={0}
        aria-pressed={active}
        onClick={() => handleSelect(id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") handleSelect(id);
        }}
        className={`flex items-center gap-3 rounded-[9px] border px-3 py-2.5 cursor-pointer transition-colors ${
          active
            ? "border-accent bg-accent/10"
            : "border-mid-gray/20 hover:bg-mid-gray/10"
        }`}
      >
        <span
          className="w-3 h-3 rounded-full shrink-0"
          style={{ background: styleColor(id) }}
          aria-hidden="true"
        />
        <span className="flex-1 min-w-0 text-sm font-medium truncate">
          {name}
        </span>
        <span className="text-[9px] font-bold tracking-wider uppercase rounded-full px-1.5 py-px border text-text-secondary border-mid-gray/40 whitespace-nowrap">
          {badge}
        </span>
        {canEditStyles && kind !== "auto" && (
          <span className="flex items-center gap-1">
            {kind === "builtin" ? (
              <button
                type="button"
                className="text-xs text-accent hover:underline px-1"
                onClick={(e) => {
                  e.stopPropagation();
                  startDuplicate(id);
                }}
              >
                {t("settings.postProcessing.prompts.duplicate")}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="text-xs text-accent hover:underline px-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    startEdit(id);
                  }}
                >
                  {t("settings.postProcessing.prompts.edit")}
                </button>
                <button
                  type="button"
                  className="text-xs text-danger hover:underline px-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDelete(id);
                  }}
                >
                  {t("settings.postProcessing.prompts.deletePrompt")}
                </button>
              </>
            )}
          </span>
        )}
        {active && (
          <svg
            viewBox="0 0 24 24"
            width="15"
            height="15"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-accent shrink-0"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        )}
      </div>
    );
  };

  return (
    <SettingContainer
      title={t("settings.postProcessing.prompts.selectedPrompt.title")}
      description={t(
        "settings.postProcessing.prompts.selectedPrompt.description",
      )}
      descriptionMode="tooltip"
      layout="stacked"
      grouped={true}
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <TierBadge feature="all_styles" />
          <TierBadge feature="custom_styles" />
        </div>

        <div className="flex flex-col gap-2">
          <StyleCard
            id="auto"
            name={t("settings.postProcessing.autoStyle.option")}
            kind="auto"
          />
          {prompts.map((p) => (
            <StyleCard
              key={p.id}
              id={p.id}
              name={p.name}
              kind={isBuiltin(p.id) ? "builtin" : "custom"}
            />
          ))}
        </div>

        {canEditStyles ? (
          editing === null && (
            <div>
              <Button onClick={startCreate} variant="primary" size="md">
                {t("settings.postProcessing.prompts.createNew")}
              </Button>
            </div>
          )
        ) : (
          <p className="text-xs text-text-secondary pt-1">
            {t("settings.postProcessing.prompts.ultraOnly")}
          </p>
        )}

        {editing !== null && (
          <div className="space-y-3 rounded-[9px] border border-mid-gray/20 p-3">
            <div className="space-y-2 flex flex-col">
              <label className="text-sm font-semibold">
                {t("settings.postProcessing.prompts.promptLabel")}
              </label>
              <Input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder={t(
                  "settings.postProcessing.prompts.promptLabelPlaceholder",
                )}
                variant="compact"
              />
            </div>

            <div className="space-y-2 flex flex-col">
              <label className="text-sm font-semibold">
                {t("settings.postProcessing.prompts.promptInstructions")}
              </label>
              <Textarea
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                placeholder={t(
                  "settings.postProcessing.prompts.promptInstructionsPlaceholder",
                )}
              />
              <p className="text-xs text-mid-gray/70">
                <Trans
                  i18nKey="settings.postProcessing.prompts.promptTip"
                  components={{ code: <code /> }}
                />
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleSave}
                variant="primary"
                size="md"
                disabled={!draftName.trim() || !draftText.trim()}
              >
                {editing === "new"
                  ? t("settings.postProcessing.prompts.createPrompt")
                  : t("settings.postProcessing.prompts.updatePrompt")}
              </Button>
              <Button onClick={cancelEdit} variant="secondary" size="md">
                {t("settings.postProcessing.prompts.cancel")}
              </Button>
            </div>
          </div>
        )}

        {selectedPromptId === "auto" && editing === null && (
          <AutoStyleSettings
            prompts={prompts.map((p) => ({ id: p.id, name: p.name }))}
          />
        )}
      </div>
    </SettingContainer>
  );
};

export const PostProcessingSettingsApi = React.memo(
  PostProcessingSettingsApiComponent,
);
PostProcessingSettingsApi.displayName = "PostProcessingSettingsApi";

export const PostProcessingSettingsPrompts = React.memo(
  PostProcessingSettingsPromptsComponent,
);
PostProcessingSettingsPrompts.displayName = "PostProcessingSettingsPrompts";

export const PostProcessingSettings: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <p className="px-1 -mb-1 text-sm text-text-secondary">
        {t("settings.postProcessing.subtitle")}
      </p>

      <SettingsGroup title={t("settings.postProcessing.enable.title")}>
        <PostProcessingToggle descriptionMode="tooltip" grouped={true} />
      </SettingsGroup>

      <SettingsGroup title={t("settings.postProcessing.api.title")}>
        <PostProcessingSettingsApi />
      </SettingsGroup>

      <SettingsGroup title={t("settings.postProcessing.prompts.title")}>
        <PostProcessingSettingsPrompts />
      </SettingsGroup>

      <ContextReadingSettings />
    </div>
  );
};
