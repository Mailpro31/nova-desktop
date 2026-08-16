import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  Check,
  CircleAlert,
  GraduationCap,
  Mic,
  Settings2,
  Sparkles,
} from "lucide-react";
import {
  commands,
  events,
  type HistoryUpdatePayload,
  type LLMPrompt,
  type ShortcutBinding,
} from "@/bindings";
import { AiSkillModulePlayer } from "@/components/campus/AiSkillModulePlayer";
import HandyTextLogo from "@/components/icons/HandyTextLogo";
import { Button, Kbd } from "@/components/ui";
import { useAiSkillsProgress } from "@/hooks/useAiSkillsProgress";
import { useSettings } from "@/hooks/useSettings";
import {
  AI_ESSENTIALS_TRACK,
  firstRunStorageKey,
  loadCampusFirstRun,
  saveCampusFirstRun,
  type CampusFirstRunStage,
} from "@/lib/aiSkills";
import { campusOrganizationLabel } from "@/lib/campusPolicy";
import {
  getLanguageLabel,
  SELECTABLE_LANGUAGES,
} from "@/lib/constants/languages";
import { useCampusStore } from "@/stores/campusStore";

interface CampusFirstRunProps {
  onComplete: () => void;
}

function studentName(email: string): string {
  const local = email.split("@")[0]?.split(/[._-]/)[0] ?? "";
  return local ? `${local[0].toUpperCase()}${local.slice(1)}` : "";
}

const FirstRunShell: React.FC<{
  children: React.ReactNode;
  label?: string;
  centered?: boolean;
}> = ({ children, label, centered = true }) => (
  <main
    data-campus-first-run
    className="flex h-screen w-screen flex-col items-center overflow-y-auto px-5 py-7 sm:px-8 sm:py-9"
  >
    <div className="flex w-full max-w-[680px] items-center justify-between gap-4">
      <HandyTextLogo width={132} />
      {label && (
        <span className="text-xs font-medium text-text-secondary">{label}</span>
      )}
    </div>
    <div
      className={`flex w-full max-w-[680px] flex-1 flex-col py-8 ${
        centered ? "justify-center" : ""
      }`}
    >
      {children}
    </div>
  </main>
);

export const CampusFirstRun: React.FC<CampusFirstRunProps> = ({
  onComplete,
}) => {
  const { t } = useTranslation();
  const session = useCampusStore((state) => state.session);
  const context = useCampusStore((state) => state.context);
  const connectionStatus = useCampusStore((state) => state.connectionStatus);
  const { getSetting, updateSetting, audioDevices, refreshAudioDevices } =
    useSettings();
  const organizationLabel = campusOrganizationLabel(context.organization);
  const aiSkillsEnabled =
    context.capabilities.aiSkills && context.aiSkillsPolicy.enabled;
  const aiSkillsRequired = aiSkillsEnabled && context.aiSkillsPolicy.required;
  const storageKey = useMemo(
    () =>
      firstRunStorageKey(
        context.organization.id,
        session?.email ?? "anonymous",
      ),
    [context.organization.id, session?.email],
  );
  const [stage, setStage] = useState<CampusFirstRunStage>(
    () => loadCampusFirstRun(storageKey).stage,
  );
  const [customizing, setCustomizing] = useState(false);
  const [purpose, setPurpose] = useState("everything");
  const [writing, setWriting] = useState("auto");
  const [language, setLanguage] = useState(
    () => getSetting("selected_language") ?? "auto",
  );
  const [tryResult, setTryResult] = useState("");
  const [tryStarted, setTryStarted] = useState(false);
  const { progress, startModule, completeModule } = useAiSkillsProgress(
    context.organization.id,
    session?.email ?? "anonymous",
    context.aiSkillsPolicy.trackProgress,
  );

  useEffect(() => {
    const persisted = loadCampusFirstRun(storageKey);
    setStage(persisted.completed ? "complete" : persisted.stage);
  }, [storageKey]);

  useEffect(() => {
    if (stage === "complete") onComplete();
  }, [onComplete, stage]);

  useEffect(() => {
    document
      .querySelector<HTMLElement>("[data-campus-first-run]")
      ?.scrollTo({ top: 0 });
  }, [stage]);

  useEffect(() => {
    void refreshAudioDevices();
  }, [refreshAudioDevices]);

  useEffect(() => {
    if (stage !== "try-nova") return;
    const unlisten = events.historyUpdatePayload.listen((event) => {
      const payload: HistoryUpdatePayload = event.payload;
      if (payload.action === "added" || payload.action === "updated") {
        const value =
          payload.entry.post_processed_text || payload.entry.transcription_text;
        if (value.trim()) setTryResult(value.trim());
      }
    });
    return () => void unlisten.then((stop) => stop());
  }, [stage]);

  const moveTo = (nextStage: CampusFirstRunStage) => {
    const current = loadCampusFirstRun(storageKey);
    saveCampusFirstRun(storageKey, {
      ...current,
      stage: nextStage,
      completed: nextStage === "complete",
      completedAt:
        nextStage === "complete"
          ? (current.completedAt ?? new Date().toISOString())
          : null,
    });
    setStage(nextStage);
  };

  const finish = () => {
    moveTo("complete");
    onComplete();
  };

  const prompts = (getSetting("post_process_prompts") ?? []) as LLMPrompt[];
  const availablePromptIds = new Set(prompts.map((prompt) => prompt.id));
  const rolePurposeOptions =
    context.organization.role === "teacher"
      ? [
          { id: "courseNotes", promptId: "nova_style_notes" },
          { id: "feedback", promptId: "default_improve_transcriptions" },
          { id: "emails", promptId: "nova_style_email" },
          { id: "everything", promptId: "auto" },
        ]
      : context.organization.role === "staff"
        ? [
            { id: "emails", promptId: "nova_style_email" },
            { id: "documents", promptId: "default_improve_transcriptions" },
            { id: "everything", promptId: "auto" },
          ]
        : [
            { id: "classes", promptId: "nova_style_notes" },
            { id: "engineering", promptId: "auto" },
            { id: "emails", promptId: "nova_style_email" },
            { id: "coding", promptId: "nova_style_prompt" },
            { id: "everything", promptId: "auto" },
          ];
  const purposeOptions = rolePurposeOptions.filter(
    (option) =>
      option.promptId === "auto" || availablePromptIds.has(option.promptId),
  );
  const writingOptions = [
    { id: "keep", promptId: "nova_style_voice_to_text" },
    { id: "clean", promptId: "default_improve_transcriptions" },
    { id: "professional", promptId: "nova_style_email" },
    { id: "auto", promptId: "auto" },
  ].filter(
    (option) =>
      option.promptId === "auto" || availablePromptIds.has(option.promptId),
  );

  const applySetup = async () => {
    const purposePrompt = purposeOptions.find(
      (option) => option.id === purpose,
    )?.promptId;
    const writingPrompt = writingOptions.find(
      (option) => option.id === writing,
    )?.promptId;
    const selectedPrompt =
      writing !== "auto" ? writingPrompt : (purposePrompt ?? "auto");
    await Promise.all([
      updateSetting("selected_language", language),
      updateSetting(
        "post_process_selected_prompt_id",
        selectedPrompt ?? "auto",
      ),
      updateSetting(
        "post_process_enabled",
        context.capabilities.rewrite &&
          selectedPrompt !== "nova_style_voice_to_text",
      ),
    ]).catch(() => undefined);
    moveTo("try-nova");
  };

  if (stage === "complete") {
    return null;
  }

  if (stage === "welcome") {
    const name = studentName(session?.email ?? "");
    return (
      <FirstRunShell label={organizationLabel}>
        <div className="mx-auto w-full max-w-[560px] text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-text-secondary">
            {t("campus.onboarding.label")}
          </p>
          <h1 className="mt-3 text-[2rem] font-semibold leading-tight tracking-[-0.03em] text-text">
            {t("campus.firstRun.welcome.title", {
              organization:
                context.organization.shortName ?? context.organization.name,
              name,
            })}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-text-secondary">
            {t("campus.firstRun.welcome.description")}
          </p>
          {aiSkillsRequired && (
            <p className="mx-auto mt-3 max-w-md text-xs font-medium text-text-secondary">
              {t("campus.firstRun.requiredByInstitution", {
                organization:
                  context.organization.shortName ?? context.organization.name,
              })}
            </p>
          )}

          <div className="mt-8 space-y-3 text-start">
            {aiSkillsEnabled && (
              <button
                type="button"
                onClick={() => {
                  const next =
                    AI_ESSENTIALS_TRACK.modules.find(
                      (item) => !progress.completedModuleIds.includes(item.id),
                    ) ?? AI_ESSENTIALS_TRACK.modules[0];
                  startModule(next.id);
                  moveTo("ai-skills");
                }}
                className="group flex w-full items-center gap-4 border border-accent/45 bg-accent/6 p-4 [border-radius:var(--nova-radius-card)] transition-colors duration-150 hover:bg-accent/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-accent">
                  <GraduationCap size={19} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-text">
                    {t("campus.firstRun.welcome.aiEssentials")}
                  </span>
                  <span className="mt-0.5 block text-xs text-text-secondary">
                    {t("campus.firstRun.welcome.recommended")}
                  </span>
                </span>
                <ArrowRight
                  size={17}
                  className="text-accent"
                  aria-hidden="true"
                />
              </button>
            )}
            {!aiSkillsRequired && (
              <button
                type="button"
                onClick={() => moveTo("setup")}
                className="flex w-full items-center gap-4 border border-hairline bg-surface p-4 [border-radius:var(--nova-radius-card)] transition-colors duration-150 hover:bg-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-inset text-text-secondary">
                  <Settings2 size={18} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 text-sm font-semibold text-text">
                  {t("campus.firstRun.welcome.setupNow")}
                </span>
                <ArrowRight
                  size={17}
                  className="text-text-secondary"
                  aria-hidden="true"
                />
              </button>
            )}
          </div>

          {!aiSkillsRequired && (
            <Button
              type="button"
              variant="ghost"
              size="md"
              className="mt-5"
              onClick={finish}
            >
              {t("campus.firstRun.skipForNow")}
            </Button>
          )}
        </div>
      </FirstRunShell>
    );
  }

  if (stage === "ai-skills") {
    const activeId =
      progress.activeModuleId ??
      AI_ESSENTIALS_TRACK.modules.find(
        (item) => !progress.completedModuleIds.includes(item.id),
      )?.id ??
      AI_ESSENTIALS_TRACK.modules[0].id;
    const activeModule =
      AI_ESSENTIALS_TRACK.modules.find((item) => item.id === activeId) ??
      AI_ESSENTIALS_TRACK.modules[0];
    const index = AI_ESSENTIALS_TRACK.modules.findIndex(
      (item) => item.id === activeModule.id,
    );
    return (
      <FirstRunShell label={organizationLabel} centered={false}>
        <AiSkillModulePlayer
          module={activeModule}
          moduleNumber={index + 1}
          moduleCount={AI_ESSENTIALS_TRACK.modules.length}
          onContinueLater={aiSkillsRequired ? undefined : () => moveTo("setup")}
          onUseNova={aiSkillsRequired ? undefined : finish}
          onComplete={() => {
            completeModule(activeModule.id);
            const next = AI_ESSENTIALS_TRACK.modules.find(
              (item) =>
                item.id !== activeModule.id &&
                !progress.completedModuleIds.includes(item.id),
            );
            if (next) startModule(next.id);
            else moveTo("setup");
          }}
        />
      </FirstRunShell>
    );
  }

  if (stage === "setup") {
    const bindings = getSetting("bindings") ?? {};
    const shortcut =
      (bindings as Record<string, ShortcutBinding>)["transcribe"]
        ?.current_binding || "F9";
    const selectedMicrophone =
      audioDevices.find((device) => device.is_default)?.name ??
      audioDevices[0]?.name ??
      t("campus.firstRun.setup.noMicrophone");
    const detectedLanguage =
      getLanguageLabel(getSetting("selected_language") ?? "auto") ??
      t("campus.firstRun.setup.autoDetect");
    const processing =
      connectionStatus === "connected"
        ? organizationLabel
        : t("campus.page.processing.localTitle");
    const setupRows = [
      {
        label: t("campus.firstRun.setup.microphone"),
        value: selectedMicrophone,
        ready: audioDevices.length > 0,
      },
      {
        label: t("campus.firstRun.setup.language"),
        value: detectedLanguage,
        ready: true,
      },
      {
        label: t("campus.firstRun.setup.shortcut"),
        value: shortcut,
        ready: true,
      },
      {
        label: t("campus.firstRun.setup.style"),
        value: t("settings.postProcessing.autoStyle.option"),
        ready: true,
      },
      {
        label: t("campus.firstRun.setup.processing"),
        value: processing,
        ready: true,
      },
    ];
    return (
      <FirstRunShell label={organizationLabel}>
        <div className="mx-auto w-full max-w-[600px]">
          <header className="text-center">
            <h1 className="text-[1.8rem] font-semibold tracking-[-0.025em] text-text">
              {t("campus.firstRun.setup.title")}
            </h1>
            <p className="mt-2 text-sm text-text-secondary">
              {t("campus.firstRun.setup.description")}
            </p>
          </header>

          <dl className="mt-7 divide-y divide-hairline border-y border-hairline">
            {setupRows.map((row) => (
              <div
                key={row.label}
                className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr_auto] sm:items-center sm:gap-3"
              >
                <dt className="text-sm text-text-secondary">{row.label}</dt>
                <dd className="truncate text-sm font-medium text-text">
                  {row.value}
                </dd>
                <span
                  className={`flex items-center gap-1.5 text-xs font-medium ${row.ready ? "text-success" : "text-warning"}`}
                >
                  {row.ready ? (
                    <Check size={14} aria-hidden="true" />
                  ) : (
                    <CircleAlert size={14} aria-hidden="true" />
                  )}
                  {row.ready
                    ? t("campus.firstRun.setup.ready")
                    : t("campus.firstRun.setup.checkRequired")}
                </span>
              </div>
            ))}
          </dl>

          {customizing && (
            <div className="mt-6 space-y-6 border-y border-hairline py-5">
              <ChoiceGroup
                title={t("campus.firstRun.setup.purposeQuestion")}
                value={purpose}
                options={purposeOptions.map((option) => ({
                  id: option.id,
                  label: t(`campus.firstRun.setup.purposes.${option.id}`),
                }))}
                onChange={setPurpose}
              />
              <ChoiceGroup
                title={t("campus.firstRun.setup.writingQuestion")}
                value={writing}
                options={writingOptions.map((option) => ({
                  id: option.id,
                  label: t(`campus.firstRun.setup.writing.${option.id}`),
                }))}
                onChange={setWriting}
              />
              <label className="block space-y-2 text-sm font-semibold text-text">
                {t("campus.firstRun.setup.languageQuestion")}
                <select
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                  className="min-h-11 w-full border border-hairline bg-surface px-3 text-sm font-normal text-text [border-radius:var(--nova-radius-control)] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {SELECTABLE_LANGUAGES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <Button type="button" variant="ghost" size="md" onClick={finish}>
              {t("campus.firstRun.skipForNow")}
            </Button>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => setCustomizing((value) => !value)}
              >
                {customizing
                  ? t("campus.firstRun.setup.useRecommendations")
                  : t("campus.firstRun.setup.customize")}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={() => void applySetup()}
              >
                {t("campus.firstRun.setup.useRecommended")}
              </Button>
            </div>
          </div>
        </div>
      </FirstRunShell>
    );
  }

  const bindings = getSetting("bindings") ?? {};
  const shortcut =
    (bindings as Record<string, ShortcutBinding>)["transcribe"]
      ?.current_binding || "F9";
  return (
    <FirstRunShell label={organizationLabel}>
      <div className="mx-auto w-full max-w-[560px] text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-accent">
          {tryResult ? (
            <Check size={26} aria-hidden="true" />
          ) : (
            <Mic size={24} aria-hidden="true" />
          )}
        </span>
        <h1 className="mt-5 text-[1.8rem] font-semibold tracking-[-0.025em] text-text">
          {tryResult
            ? t("campus.firstRun.try.successTitle")
            : t("campus.firstRun.try.title")}
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-text-secondary">
          {tryResult
            ? t("campus.firstRun.try.successDescription")
            : t("campus.firstRun.try.description")}
        </p>

        {!tryResult && (
          <div className="mt-7 space-y-4 border-y border-hairline py-6">
            <Kbd className="px-3 text-sm text-accent">{shortcut}</Kbd>
            <p className="text-sm font-medium text-text">
              {t("campus.firstRun.try.sample")}
            </p>
            <Button
              type="button"
              variant="primary"
              size="md"
              disabled={tryStarted}
              onClick={() => {
                setTryStarted(true);
                void commands
                  .triggerTranscription("transcribe")
                  .finally(() => setTryStarted(false));
              }}
            >
              {tryStarted
                ? t("campus.firstRun.try.listening")
                : t("campus.firstRun.try.start")}
            </Button>
          </div>
        )}

        {tryResult && (
          <div className="mt-7 border border-hairline bg-inset p-4 text-start [border-radius:var(--nova-radius-card)]">
            <p className="text-sm leading-relaxed text-text">{tryResult}</p>
          </div>
        )}

        <div className="mt-6 flex items-center justify-center gap-3">
          {!tryResult && (
            <Button type="button" variant="ghost" size="md" onClick={finish}>
              {t("campus.firstRun.continueLater")}
            </Button>
          )}
          <Button
            type="button"
            variant={tryResult ? "primary" : "secondary"}
            size="md"
            onClick={finish}
          >
            {tryResult
              ? t("campus.firstRun.try.openNova")
              : t("campus.firstRun.useNovaNow")}
          </Button>
        </div>
      </div>
    </FirstRunShell>
  );
};

const ChoiceGroup: React.FC<{
  title: string;
  value: string;
  options: Array<{ id: string; label: string }>;
  onChange: (value: string) => void;
}> = ({ title, value, options, onChange }) => (
  <fieldset>
    <legend className="text-sm font-semibold text-text">{title}</legend>
    <div className="mt-2 flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          onClick={() => onChange(option.id)}
          className={`min-h-10 border px-3 py-2 text-sm [border-radius:var(--nova-radius-control)] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            value === option.id
              ? "border-accent bg-accent/8 text-text"
              : "border-hairline bg-surface text-text-secondary"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  </fieldset>
);

export default CampusFirstRun;
