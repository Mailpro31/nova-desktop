import React, { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { RefreshCcw } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { commands } from "@/bindings";
import { styleColor } from "../../../lib/styleColors";
import {
  BUILTIN_STYLE_IDS,
  styleLockFeature,
} from "../../../lib/builtinStyles";

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
import { CampusStylesSettings } from "./CampusStylesSettings";
import StylesList from "./StylesList";
import { PageHeader } from "../../shell/PageHeader";
import { usePostProcessProviderState } from "../PostProcessingSettingsApi/usePostProcessProviderState";
import { useSettings } from "../../../hooks/useSettings";
import { isCampusMode } from "@/lib/mode";

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

export const PostProcessingSettingsApi = React.memo(
  PostProcessingSettingsApiComponent,
);
PostProcessingSettingsApi.displayName = "PostProcessingSettingsApi";

export const PostProcessingSettings: React.FC = () => {
  const { t } = useTranslation();
  const campusMode = isCampusMode();

  if (campusMode) {
    return <CampusStylesSettings />;
  }

  return (
    // La largeur et les marges viennent de l'app shell — les répéter ici
    // contraignait la colonne deux fois.
    <>
      <PageHeader
        title={t("campus.styles.title")}
        description={t("campus.styles.subtitle")}
      />

      {/* Le choix du Style vient en premier : c'est la question que l'écran
          doit résoudre. La configuration du moteur reste en dessous, inchangée,
          parce qu'elle est nécessaire mais secondaire. */}
      <StylesList />

      <div className="mt-[32px] flex flex-col gap-5 border-t border-hairline pt-[24px]">
        <SettingsGroup title={t("settings.postProcessing.enable.title")}>
          <PostProcessingToggle descriptionMode="tooltip" grouped={true} />
        </SettingsGroup>

        <SettingsGroup title={t("settings.postProcessing.api.title")}>
          <PostProcessingSettingsApi />
        </SettingsGroup>

        <ContextReadingSettings />
      </div>
    </>
  );
};
