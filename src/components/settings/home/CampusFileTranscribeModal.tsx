import React, { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  FileAudio,
  UploadCloud,
  X,
  RefreshCw,
  Copy,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Button } from "../../ui/Button";
import { loadCampusSession } from "@/lib/campusSession";
import { CampusApi, campusErrorText } from "@/lib/campusApi";

interface CampusFileTranscribeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CampusFileTranscribeModal: React.FC<
  CampusFileTranscribeModalProps
> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [resultText, setResultText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const transcribingRef = useRef(transcribing);

  transcribingRef.current = transcribing;

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusFrame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !transcribingRef.current) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => !element.hasAttribute("disabled"));
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      setFile(droppedFile);
      setResultText(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setResultText(null);
    }
  };

  const handleTranscribe = async () => {
    if (!file) return;

    const session = await loadCampusSession();
    if (!session) {
      toast.error(t("campus.sessionExpired"));
      return;
    }

    setTranscribing(true);
    setResultText(null);

    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const api = new CampusApi(session.server_url);
      const text = await api.transcribeAudioFile(bytes, file.name);

      setResultText(text);

      // Copy to clipboard
      await writeText(text).catch(() => {});

      toast.success(t("campus.files.copiedToClipboard"));
    } catch (err) {
      console.error("File transcription failed:", err);
      const message = campusErrorText(err, t("campus.files.error"));
      if (message) toast.error(message);
    } finally {
      setTranscribing(false);
    }
  };

  const handleCopyAgain = async () => {
    if (!resultText) return;
    await writeText(resultText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success(t("history.copied"));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !transcribing) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="campus-file-transcription-title"
        aria-describedby="campus-file-transcription-description"
        className="w-full max-w-lg space-y-5 rounded-xl border border-hairline bg-white p-6 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-accent/10 text-accent">
              <FileAudio size={20} />
            </span>
            <div>
              <h3
                id="campus-file-transcription-title"
                className="text-base font-semibold text-text"
              >
                {t("campus.files.title")}
              </h3>
              <p
                id="campus-file-transcription-description"
                className="text-xs text-text-secondary"
              >
                {t("campus.files.description")}
              </p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            disabled={transcribing}
            aria-label={t("common.close")}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-mid-gray/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Dropzone */}
        {!resultText && (
          <>
            <input
              id="campus-audio-file"
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".wav,.mp3,.m4a,.ogg,audio/*"
              className="sr-only"
            />
            <label
              htmlFor="campus-audio-file"
              tabIndex={0}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleFileDrop}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none ${
                isDragOver
                  ? "scale-[1.01] border-accent bg-accent/5"
                  : "border-hairline hover:border-text-secondary/40 hover:bg-mid-gray/5"
              }`}
            >
              <UploadCloud
                size={36}
                aria-hidden="true"
                className={`mb-2 ${isDragOver ? "text-accent" : "text-text-secondary"}`}
              />
              <p className="text-sm font-medium text-text">
                {file ? file.name : t("campus.files.dropzone")}
              </p>
              <p className="text-xs text-text-secondary mt-1">
                {file
                  ? `${(file.size / (1024 * 1024)).toFixed(2)} Mo`
                  : t("campus.files.supportedFormats")}
              </p>
            </label>
          </>
        )}

        {/* Transcribed Result */}
        {resultText && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-success flex items-center gap-1.5">
                <Check size={14} />
                {t("campus.files.copiedToClipboard")}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCopyAgain}
                className="inline-flex items-center gap-1.5 text-xs"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {t("history.copy")}
              </Button>
            </div>
            <div className="max-h-48 overflow-y-auto p-3.5 rounded-2xl bg-mid-gray/10 text-sm text-text leading-relaxed font-normal whitespace-pre-wrap select-text">
              {resultText}
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-hairline">
          <Button
            variant="secondary"
            size="md"
            onClick={onClose}
            disabled={transcribing}
          >
            {t("common.cancel")}
          </Button>

          {!resultText && (
            <Button
              variant="primary"
              size="md"
              disabled={!file || transcribing}
              onClick={handleTranscribe}
              className="inline-flex items-center gap-2"
            >
              {transcribing ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  {t("campus.files.transcribing")}
                </>
              ) : (
                t("campus.files.actionButton")
              )}
            </Button>
          )}

          {resultText && (
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                setFile(null);
                setResultText(null);
              }}
            >
              {t("campus.files.title")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
