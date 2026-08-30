import React, { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { UploadCloud, RefreshCw, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
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

  const footer = (
    <>
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
        >
          {transcribing ? (
            <>
              <RefreshCw
                size={16}
                className="animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
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
    </>
  );

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !transcribing) onClose();
      }}
      title={t("campus.files.title")}
      description={t("campus.files.description")}
      closeLabel={t("common.close")}
      dismissible={!transcribing}
      contentFades={false}
      footer={footer}
      size="md"
    >
      <div className="space-y-5" aria-busy={transcribing}>
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
              className={`flex min-h-44 cursor-pointer flex-col items-center justify-center border border-dashed p-6 text-center [border-radius:var(--nova-radius-card)] transition-[background-color,border-color] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none ${
                isDragOver
                  ? "border-accent bg-accent/5"
                  : "border-text-secondary/30 bg-inset/55 hover:border-text-secondary/55 hover:bg-inset"
              }`}
            >
              <UploadCloud
                size={24}
                aria-hidden="true"
                className={`mb-3 ${isDragOver ? "text-accent" : "text-text-secondary"}`}
              />
              <p className="text-sm font-medium text-text">
                {file ? file.name : t("campus.files.dropzone")}
              </p>
              <p className="mt-1 text-xs text-text-secondary">
                {file
                  ? `${(file.size / (1024 * 1024)).toFixed(2)} Mo`
                  : t("campus.files.supportedFormats")}
              </p>
            </label>
          </>
        )}

        {resultText && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-medium text-success">
                <Check size={14} aria-hidden="true" />
                {t("campus.files.copiedToClipboard")}
              </span>
              <Button variant="secondary" size="sm" onClick={handleCopyAgain}>
                {copied ? (
                  <Check size={14} aria-hidden="true" />
                ) : (
                  <Copy size={14} aria-hidden="true" />
                )}
                {t("history.copy")}
              </Button>
            </div>
            <div className="max-h-52 select-text overflow-y-auto whitespace-pre-wrap border border-hairline bg-inset p-4 text-sm font-normal leading-relaxed text-text [border-radius:var(--nova-radius-card)]">
              {resultText}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
};
