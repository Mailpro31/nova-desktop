import React, { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { FileAudio, UploadCloud, X, RefreshCw, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../ui/Button";
import { loadCampusSession } from "@/lib/campusSession";
import { CampusApi } from "@/lib/campusApi";

interface CampusFileTranscribeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CampusFileTranscribeModal: React.FC<CampusFileTranscribeModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [resultText, setResultText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      const text = await api.transcribeAudioFile(
        session.token,
        bytes,
        file.name,
      );

      setResultText(text);

      // Copy to clipboard
      await navigator.clipboard.writeText(text).catch(() => {});

      toast.success(t("campus.files.copiedToClipboard"));
    } catch (err) {
      console.error("File transcription failed:", err);
      toast.error(t("campus.files.error"));
    } finally {
      setTranscribing(false);
    }
  };

  const handleCopyAgain = async () => {
    if (!resultText) return;
    await navigator.clipboard.writeText(resultText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success(t("history.copied"));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white rounded-3xl border border-hairline shadow-2xl max-w-lg w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-accent/10 text-accent">
              <FileAudio size={20} />
            </span>
            <div>
              <h3 className="text-base font-semibold text-text">
                {t("campus.files.title")}
              </h3>
              <p className="text-xs text-text-secondary">
                {t("campus.files.description")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-text-secondary hover:bg-mid-gray/15 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Dropzone */}
        {!resultText && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
              isDragOver
                ? "border-accent bg-accent/5 scale-[1.01]"
                : "border-hairline hover:border-text-secondary/40 hover:bg-mid-gray/5"
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".wav,.mp3,.m4a,.ogg,audio/*"
              className="hidden"
            />
            <UploadCloud
              size={36}
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
          </div>
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
          <Button variant="secondary" size="md" onClick={onClose}>
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
