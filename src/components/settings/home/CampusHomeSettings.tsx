import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  BookOpen,
  FileAudio,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import {
  commands,
  events,
  type HistoryEntry,
  type LLMPrompt,
  type ShortcutBinding,
} from "@/bindings";
import { useSettings } from "@/hooks/useSettings";
import { campusOrganizationLabel } from "@/lib/campusPolicy";
import { formatDateTime } from "@/utils/dateFormat";
import { useCampusStore } from "@/stores/campusStore";
import type { SidebarSection } from "@/components/Sidebar";
import HandyHand from "@/components/icons/HandyHand";
import { Button, Kbd, PageHeader } from "@/components/ui";
import { CampusFileTranscribeModal } from "./CampusFileTranscribeModal";
import { useAiSkillsProgress } from "@/hooks/useAiSkillsProgress";
import { AI_ESSENTIALS_TRACK, educationalHintStorageKey } from "@/lib/aiSkills";

interface CampusHomeSettingsProps {
  onNavigate?: (section: SidebarSection) => void;
}

export const CampusHomeSettings: React.FC<CampusHomeSettingsProps> = ({
  onNavigate,
}) => {
  const { t, i18n } = useTranslation();
  const { getSetting } = useSettings();
  const { organization, capabilities, aiSkillsPolicy } = useCampusStore(
    (state) => state.context,
  );
  const session = useCampusStore((state) => state.session);
  const [recentEntries, setRecentEntries] = useState<HistoryEntry[]>([]);
  const [isFileModalOpen, setIsFileModalOpen] = useState(false);
  const [showVerificationHint, setShowVerificationHint] = useState(false);
  const { progress: aiProgress } = useAiSkillsProgress(
    organization.id,
    session?.email ?? "anonymous",
    aiSkillsPolicy.trackProgress,
  );

  const bindings = getSetting("bindings") ?? {};
  const transcribeBinding = (bindings as Record<string, ShortcutBinding>)[
    "transcribe"
  ]?.current_binding;
  const rewriteBinding = (bindings as Record<string, ShortcutBinding>)[
    "transcribe_with_post_process"
  ]?.current_binding;
  const prompts = (getSetting("post_process_prompts") ?? []) as LLMPrompt[];
  const selectedPromptId =
    getSetting("post_process_selected_prompt_id") ?? "auto";
  const currentStyle = useMemo(
    () =>
      selectedPromptId === "auto"
        ? t("settings.postProcessing.autoStyle.option")
        : (prompts.find((prompt) => prompt.id === selectedPromptId)?.name ??
          t("settings.postProcessing.autoStyle.option")),
    [prompts, selectedPromptId, t],
  );

  const loadRecent = useCallback(async () => {
    try {
      const result = await commands.getHistoryEntries(null, 3);
      if (result.status === "ok") {
        setRecentEntries(result.data.entries.slice(0, 3));
      }
    } catch (error) {
      console.error("Failed to load recent transcriptions:", error);
    }
  }, []);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  useEffect(() => {
    if (!session || !recentEntries.some((entry) => entry.post_processed_text)) {
      setShowVerificationHint(false);
      return;
    }
    const key = educationalHintStorageKey(
      organization.id,
      session.email,
      "verification",
    );
    setShowVerificationHint(window.localStorage.getItem(key) !== "dismissed");
  }, [organization.id, recentEntries, session]);

  useEffect(() => {
    const unlisten = events.historyUpdatePayload.listen((event) => {
      const payload = event.payload;
      if (payload.action === "added") {
        setRecentEntries((entries) => [payload.entry, ...entries].slice(0, 3));
      } else if (payload.action === "updated") {
        setRecentEntries((entries) =>
          entries.map((entry) =>
            entry.id === payload.entry.id ? payload.entry : entry,
          ),
        );
      }
    });
    return () => void unlisten.then((stop) => stop());
  }, []);

  const role = organization.role
    ? t(`campus.roles.${organization.role}`)
    : null;
  const identity = [campusOrganizationLabel(organization), role]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mx-auto w-full max-w-[760px] space-y-8">
      <PageHeader
        eyebrow={identity || t("campus.navigation.campus")}
        title={t("campus.home.title")}
        description={t("campus.home.subtitle", {
          shortcut: transcribeBinding || "F9",
        })}
      />

      <section className="border-y border-hairline py-8 text-center sm:py-10">
        <div className="mx-auto flex max-w-xl flex-col items-center">
          <span
            className="mb-5 flex h-16 w-16 items-center justify-center"
            aria-hidden="true"
          >
            <HandyHand width={58} height={58} />
          </span>
          <h2 className="text-xl font-semibold tracking-[-0.015em] text-text">
            {t("campus.home.primary.title", {
              shortcut: transcribeBinding || "F9",
            })}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-text-secondary">
            {t("campus.home.primary.description")}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <Kbd>{transcribeBinding || "F9"}</Kbd>
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={() => void commands.triggerTranscription("transcribe")}
            >
              {t("campus.home.primary.start")}
            </Button>
          </div>
        </div>
      </section>

      <section aria-labelledby="campus-secondary-actions">
        <h2
          id="campus-secondary-actions"
          className="text-xs font-medium text-text-secondary"
        >
          {t("campus.home.secondary.title")}
        </h2>
        <div className="mt-3 grid overflow-hidden border-y border-hairline sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:divide-hairline">
          {capabilities.rewrite && (
            <button
              type="button"
              onClick={() =>
                void commands.triggerTranscription(
                  "transcribe_with_post_process",
                )
              }
              className="flex min-h-14 w-full items-center gap-3 px-3 py-3 text-start transition-colors duration-150 hover:bg-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-inset motion-reduce:transition-none"
            >
              <Sparkles
                size={18}
                className="text-text-secondary"
                aria-hidden="true"
              />
              <span className="flex-1 text-sm font-medium text-text">
                {t("campus.home.secondary.rewrite")}
              </span>
              <Kbd>{rewriteBinding || "—"}</Kbd>
            </button>
          )}
          {capabilities.fileTranscription && (
            <button
              type="button"
              onClick={() => setIsFileModalOpen(true)}
              className="flex min-h-14 w-full items-center gap-3 px-3 py-3 text-start transition-colors duration-150 hover:bg-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-inset motion-reduce:transition-none"
            >
              <FileAudio
                size={18}
                className="text-text-secondary"
                aria-hidden="true"
              />
              <span className="flex-1 text-sm font-medium text-text">
                {t("campus.files.actionButton")}
              </span>
            </button>
          )}
          {capabilities.styles && (
            <button
              type="button"
              onClick={() => onNavigate?.("postprocessing")}
              className="flex min-h-14 w-full items-center gap-3 px-3 py-3 text-start transition-colors duration-150 hover:bg-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-inset motion-reduce:transition-none"
            >
              <SlidersHorizontal
                size={18}
                className="text-text-secondary"
                aria-hidden="true"
              />
              <span className="flex-1 text-sm font-medium text-text">
                {t("campus.home.secondary.chooseStyle")}
              </span>
              <span className="max-w-28 truncate text-xs text-text-secondary">
                {currentStyle}
              </span>
            </button>
          )}
        </div>
      </section>

      {capabilities.aiSkills && aiSkillsPolicy.enabled && (
        <section
          className="border-y border-hairline py-5"
          aria-labelledby="campus-home-ai-skills"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-inset text-text-secondary">
              <BookOpen size={17} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h2
                id="campus-home-ai-skills"
                className="text-sm font-semibold text-text"
              >
                {t("campus.aiSkills.title")}
              </h2>
              <p className="mt-0.5 text-xs text-text-secondary">
                {aiProgress.startedAt
                  ? t("campus.firstRun.homeAiSkillsProgress", {
                      completed: aiProgress.completedModuleIds.length,
                      total: AI_ESSENTIALS_TRACK.modules.length,
                    })
                  : t("campus.firstRun.homeAiSkillsStart")}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onNavigate?.("aiSkills")}
            >
              {aiProgress.startedAt
                ? t("campus.aiCurriculum.continue")
                : t("campus.aiCurriculum.start")}
              <ArrowRight size={14} className="ml-1" aria-hidden="true" />
            </Button>
          </div>
        </section>
      )}

      {showVerificationHint && session && (
        <aside className="flex items-start gap-3 bg-inset px-4 py-3 [border-radius:var(--nova-radius-card)]">
          <Sparkles
            size={16}
            className="mt-0.5 shrink-0 text-accent"
            aria-hidden="true"
          />
          <p className="flex-1 text-sm leading-relaxed text-text-secondary">
            {t("campus.firstRun.verificationHint")}
          </p>
          <button
            type="button"
            aria-label={t("common.close")}
            onClick={() => {
              window.localStorage.setItem(
                educationalHintStorageKey(
                  organization.id,
                  session.email,
                  "verification",
                ),
                "dismissed",
              );
              setShowVerificationHint(false);
            }}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </aside>
      )}

      <section aria-labelledby="campus-recent-title">
        <div className="flex items-center justify-between">
          <h2
            id="campus-recent-title"
            className="text-base font-semibold text-text"
          >
            {t("campus.home.recentTitle")}
          </h2>
          <button
            type="button"
            onClick={() => onNavigate?.("history")}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-accent transition-colors hover:bg-accent/8 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {t("campus.home.viewHistory")}
            <ArrowRight size={14} aria-hidden="true" />
          </button>
        </div>
        {recentEntries.length === 0 ? (
          <div className="mt-3 border-y border-hairline py-5">
            <p className="text-sm text-text-secondary">
              {t("campus.home.recentEmpty")}
            </p>
          </div>
        ) : (
          <div className="mt-2 divide-y divide-hairline border-y border-hairline">
            {recentEntries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => onNavigate?.("history")}
                className="grid w-full gap-1 px-2 py-3 text-start transition-colors duration-150 hover:bg-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:grid-cols-[9rem_1fr]"
              >
                <span className="text-xs text-text-secondary">
                  {formatDateTime(String(entry.timestamp), i18n.language)}
                </span>
                <span className="line-clamp-1 text-sm text-text">
                  {entry.transcription_text.trim() ||
                    t("settings.history.transcriptionFailed")}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {capabilities.fileTranscription && (
        <CampusFileTranscribeModal
          isOpen={isFileModalOpen}
          onClose={() => setIsFileModalOpen(false)}
        />
      )}
    </div>
  );
};

export default CampusHomeSettings;
