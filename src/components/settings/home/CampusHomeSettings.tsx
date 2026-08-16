import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, FileAudio, History, Mic, Sparkles } from "lucide-react";
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
import { CampusFileTranscribeModal } from "./CampusFileTranscribeModal";

interface CampusHomeSettingsProps {
  onNavigate?: (section: SidebarSection) => void;
}

const Shortcut: React.FC<{ value?: string }> = ({ value }) => (
  <kbd className="inline-flex min-h-7 items-center rounded-md border border-hairline bg-white px-2 text-xs font-semibold text-text-secondary shadow-sm">
    {value || "—"}
  </kbd>
);

export const CampusHomeSettings: React.FC<CampusHomeSettingsProps> = ({
  onNavigate,
}) => {
  const { t, i18n } = useTranslation();
  const { getSetting } = useSettings();
  const { organization, capabilities } = useCampusStore(
    (state) => state.context,
  );
  const [recentEntries, setRecentEntries] = useState<HistoryEntry[]>([]);
  const [isFileModalOpen, setIsFileModalOpen] = useState(false);

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
    <div className="mx-auto w-full max-w-3xl space-y-8 py-2">
      <header className="space-y-2 px-1">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
          {identity || t("campus.navigation.campus")}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-text">
          {t("campus.home.title")}
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-text-secondary">
          {t("campus.home.subtitle", { shortcut: transcribeBinding || "F9" })}
        </p>
      </header>

      <section className="rounded-2xl border border-accent/15 bg-accent/[0.045] px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-white">
              <Mic size={21} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-text">
                {t("campus.home.primary.title", {
                  shortcut: transcribeBinding || "F9",
                })}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                {t("campus.home.primary.description")}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
            <Shortcut value={transcribeBinding} />
            <button
              type="button"
              onClick={() => void commands.triggerTranscription("transcribe")}
              className="min-h-11 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              {t("campus.home.primary.start")}
            </button>
          </div>
        </div>
      </section>

      <section aria-labelledby="campus-secondary-actions">
        <h2
          id="campus-secondary-actions"
          className="text-xs font-semibold uppercase tracking-[0.12em] text-text-secondary"
        >
          {t("campus.home.secondary.title")}
        </h2>
        <div className="mt-2 divide-y divide-hairline border-y border-hairline">
          {capabilities.rewrite && (
            <button
              type="button"
              onClick={() =>
                void commands.triggerTranscription(
                  "transcribe_with_post_process",
                )
              }
              className="flex w-full items-center gap-3 px-1 py-3 text-left transition-colors duration-150 hover:bg-mid-gray/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Sparkles
                size={18}
                className="text-text-secondary"
                aria-hidden="true"
              />
              <span className="flex-1 text-sm font-medium text-text">
                {t("campus.home.secondary.rewrite")}
              </span>
              <Shortcut value={rewriteBinding} />
            </button>
          )}
          {capabilities.fileTranscription && (
            <button
              type="button"
              onClick={() => setIsFileModalOpen(true)}
              className="flex w-full items-center gap-3 px-1 py-3 text-left transition-colors duration-150 hover:bg-mid-gray/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <FileAudio
                size={18}
                className="text-text-secondary"
                aria-hidden="true"
              />
              <span className="flex-1 text-sm font-medium text-text">
                {t("campus.files.actionButton")}
              </span>
              <ArrowRight
                size={15}
                className="text-text-secondary"
                aria-hidden="true"
              />
            </button>
          )}
          {capabilities.styles && (
            <button
              type="button"
              onClick={() => onNavigate?.("postprocessing")}
              className="flex w-full items-center gap-3 px-1 py-3 text-left transition-colors duration-150 hover:bg-mid-gray/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Sparkles
                size={18}
                className="text-text-secondary"
                aria-hidden="true"
              />
              <span className="flex-1 text-sm font-medium text-text">
                {t("campus.home.secondary.chooseStyle")}
              </span>
              <span className="max-w-40 truncate text-sm text-text-secondary">
                {currentStyle}
              </span>
              <ArrowRight
                size={15}
                className="text-text-secondary"
                aria-hidden="true"
              />
            </button>
          )}
        </div>
      </section>

      <section aria-labelledby="campus-recent-title">
        <div className="flex items-center justify-between">
          <h2
            id="campus-recent-title"
            className="flex items-center gap-2 text-sm font-semibold text-text"
          >
            <History
              size={16}
              className="text-text-secondary"
              aria-hidden="true"
            />
            {t("campus.home.recentTitle")}
          </h2>
          <button
            type="button"
            onClick={() => onNavigate?.("history")}
            className="min-h-11 rounded-md px-1 text-sm font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {t("campus.home.viewHistory")}
          </button>
        </div>
        {recentEntries.length === 0 ? (
          <p className="mt-3 text-sm text-text-secondary">
            {t("campus.home.recentEmpty")}
          </p>
        ) : (
          <div className="mt-2 divide-y divide-hairline border-y border-hairline">
            {recentEntries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => onNavigate?.("history")}
                className="grid w-full gap-1 px-1 py-3 text-left transition-colors duration-150 hover:bg-mid-gray/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:grid-cols-[9rem_1fr]"
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
