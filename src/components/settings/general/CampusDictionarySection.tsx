import React, { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  BookA,
  Plus,
  Trash2,
  Download,
  Upload,
  FileSearch,
  RefreshCw,
  Sparkles,
  Building,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { Textarea } from "../../ui/Textarea";
import { loadCampusSession } from "@/lib/campusSession";
import { CampusApi, campusErrorText } from "@/lib/campusApi";
import type {
  CampusSharedDictEntry,
  CampusPersonalDictEntry,
} from "@/lib/campusApi";

export const CampusDictionarySection: React.FC = () => {
  const { t } = useTranslation();
  const [shared, setShared] = useState<CampusSharedDictEntry[]>([]);
  const [personal, setPersonal] = useState<CampusPersonalDictEntry[]>([]);
  const [loading, setLoading] = useState(false);

  // New entry form
  const [newTerm, setNewTerm] = useState("");
  const [newReplacement, setNewReplacement] = useState("");
  const [adding, setAdding] = useState(false);

  // Analyze doc modal/state
  const [showAnalyze, setShowAnalyze] = useState(false);
  const [analyzeText, setAnalyzeText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docFileInputRef = useRef<HTMLInputElement>(null);

  const loadVocabulary = useCallback(async () => {
    const session = await loadCampusSession();
    if (!session) return;
    setLoading(true);
    try {
      const api = new CampusApi(session.server_url);
      const data = await api.getVocabulary();
      setShared(data.shared || []);
      setPersonal(data.personal || []);
    } catch (err) {
      console.error("Failed to load campus vocabulary:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVocabulary();
  }, [loadVocabulary]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTerm.trim()) return;

    const session = await loadCampusSession();
    if (!session) return;

    setAdding(true);
    try {
      const api = new CampusApi(session.server_url);
      await api.addDictionaryEntry(newTerm.trim(), newReplacement.trim());
      setNewTerm("");
      setNewReplacement("");
      await loadVocabulary();
      toast.success(t("settings.advanced.customWords.add"));
    } catch (err) {
      console.error("Failed to add dictionary entry:", err);
      const msg = campusErrorText(err, t("campus.errors.network"));
      if (msg) toast.error(msg);
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: number) => {
    const session = await loadCampusSession();
    if (!session) return;

    try {
      const api = new CampusApi(session.server_url);
      await api.deleteDictionaryEntry(id);
      await loadVocabulary();
    } catch (err) {
      console.error("Failed to delete dictionary entry:", err);
      const msg = campusErrorText(err, t("campus.errors.network"));
      if (msg) toast.error(msg);
    }
  };

  const handleExportCsv = async () => {
    const session = await loadCampusSession();
    if (!session) return;

    try {
      const api = new CampusApi(session.server_url);
      const csv = await api.exportDictionary();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", "dictionnaire_nova.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Failed to export dictionary:", err);
      const msg = campusErrorText(err, t("campus.errors.network"));
      if (msg) toast.error(msg);
    }
  };

  const handleImportFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const session = await loadCampusSession();
    if (!session) return;

    try {
      const text = await file.text();
      const api = new CampusApi(session.server_url);
      const res = await api.importDictionary(text);
      await loadVocabulary();
      toast.success(
        t("campus.dictionary.importSuccess", { count: res.imported }),
      );
    } catch (err) {
      console.error("Failed to import dictionary:", err);
      const msg = campusErrorText(err, t("campus.errors.network"));
      if (msg) toast.error(msg);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDocFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setAnalyzeText(text);
    } catch (err) {
      console.error("Failed to read document:", err);
    } finally {
      if (docFileInputRef.current) docFileInputRef.current.value = "";
    }
  };

  const handleAnalyze = async () => {
    if (!analyzeText.trim()) return;

    const session = await loadCampusSession();
    if (!session) return;

    setAnalyzing(true);
    try {
      const api = new CampusApi(session.server_url);
      const res = await api.analyzeDocument(analyzeText.trim());
      await loadVocabulary();
      setShowAnalyze(false);
      setAnalyzeText("");
      if (res.terms_added > 0) {
        toast.success(
          t("campus.dictionary.analyzeSuccess", { count: res.terms_added }),
        );
      } else {
        toast.info(t("campus.dictionary.analyzeEmpty"));
      }
    } catch (err) {
      console.error("Failed to analyze document:", err);
      const msg = campusErrorText(err, t("campus.errors.network"));
      if (msg) toast.error(msg);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-6 px-4 py-3">
      {/* Top action buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-hairline">
        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportFileChange}
            accept=".csv,text/csv"
            className="hidden"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5"
          >
            <Upload size={14} />
            {t("campus.dictionary.importCsv")}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5"
          >
            <Download size={14} />
            {t("campus.dictionary.exportCsv")}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowAnalyze(!showAnalyze)}
            className="inline-flex items-center gap-1.5 text-accent"
          >
            <FileSearch size={14} />
            {t("campus.dictionary.analyzeDoc")}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={loadVocabulary}
            disabled={loading}
            aria-label={t("campus.account.refresh")}
            title={t("campus.account.refresh")}
          >
            <RefreshCw
              size={14}
              className={
                loading ? "animate-spin motion-reduce:animate-none" : ""
              }
              aria-hidden="true"
            />
          </Button>
        </div>
      </div>

      {/* Document Analysis Box */}
      {showAnalyze && (
        <div className="space-y-3 border-s-2 border-accent bg-accent/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-accent" />
            <h4
              id="campus-document-analysis-title"
              className="text-sm font-semibold text-text"
            >
              {t("campus.dictionary.analyzeDocTitle")}
            </h4>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed">
            {t("campus.dictionary.analyzeDocDescription")}
          </p>

          <Textarea
            value={analyzeText}
            onChange={(e) => setAnalyzeText(e.target.value)}
            placeholder={t("campus.dictionary.analyzeDocPlaceholder")}
            rows={4}
            aria-labelledby="campus-document-analysis-title"
            className="w-full p-2.5 font-mono text-xs"
          />

          <div className="flex items-center justify-between gap-2">
            <input
              type="file"
              ref={docFileInputRef}
              onChange={handleDocFileUpload}
              accept=".txt,.md,.text"
              className="hidden"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => docFileInputRef.current?.click()}
              className="text-xs"
            >
              {t("campus.files.dropzone")}
            </Button>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowAnalyze(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleAnalyze}
                disabled={!analyzeText.trim() || analyzing}
                className="inline-flex items-center gap-1.5"
              >
                {analyzing ? (
                  <>
                    <RefreshCw
                      size={14}
                      className="animate-spin motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                    {t("campus.dictionary.analyzing")}
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    {t("campus.dictionary.analyzeDocButton")}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Shared vocabulary (Organization - read-only) */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Building size={16} className="text-text-secondary" />
          <h3 className="text-sm font-semibold text-text">
            {t("campus.dictionary.sharedTitle")}
          </h3>
          <span className="rounded-full bg-inset px-2 py-0.5 text-[11px] font-medium text-text-secondary">
            {t("campus.dictionary.sharedBadge")}
          </span>
        </div>
        <p className="text-xs text-text-secondary">
          {t("campus.dictionary.sharedDescription")}
        </p>

        {shared.length === 0 ? (
          <p className="py-2 text-xs text-text-secondary">
            {t("campus.dictionary.sharedEmpty")}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2 pt-1">
            {shared.map((item) => (
              <div
                key={item.id}
                className="inline-flex items-center gap-1.5 rounded-chip bg-inset px-3 py-1.5 text-xs font-medium"
              >
                <span className="text-text">{item.term}</span>
                {item.replacement && (
                  <>
                    <span className="text-text-secondary">→</span>
                    <span className="text-text-secondary">
                      {item.replacement}
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Personal vocabulary */}
      <div className="space-y-3 pt-2 border-t border-hairline">
        <div className="flex items-center gap-2">
          <User size={16} className="text-text-secondary" />
          <h3 className="text-sm font-semibold text-text">
            {t("campus.dictionary.personalTitle")}
          </h3>
        </div>
        <p className="text-xs text-text-secondary">
          {t("campus.dictionary.personalDescription")}
        </p>

        {/* Add personal term form */}
        <form onSubmit={handleAdd} className="grid gap-3 sm:grid-cols-2">
          <label
            className="block space-y-1.5 text-xs font-medium text-text"
            htmlFor="campus-dictionary-term"
          >
            {t("campus.dictionary.termLabel")}
            <Input
              id="campus-dictionary-term"
              type="text"
              value={newTerm}
              onChange={(e) => setNewTerm(e.target.value)}
              placeholder={t("campus.dictionary.termPlaceholder")}
            />
          </label>
          <label
            className="block space-y-1.5 text-xs font-medium text-text"
            htmlFor="campus-dictionary-replacement"
          >
            {t("campus.dictionary.replacementLabel")}
            <Input
              id="campus-dictionary-replacement"
              type="text"
              value={newReplacement}
              onChange={(e) => setNewReplacement(e.target.value)}
              placeholder={t("campus.dictionary.replacementPlaceholder")}
            />
          </label>
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={!newTerm.trim() || adding}
            className="sm:col-start-2 sm:justify-self-end"
          >
            <Plus size={16} />
            {t("campus.dictionary.addTerm")}
          </Button>
        </form>

        {/* Personal terms list */}
        {personal.length === 0 ? (
          <p className="py-2 text-xs text-text-secondary">
            {t("campus.dictionary.personalEmpty")}
          </p>
        ) : (
          <div className="divide-y divide-hairline border-y border-hairline">
            {personal.map((item) => {
              const isLearned = item.source === "learned";
              return (
                <div
                  key={item.id}
                  className="group flex min-h-12 items-center justify-between gap-2 px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span
                      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
                        isLearned
                          ? "bg-accent/10 text-accent"
                          : "bg-mid-gray/15 text-text-secondary"
                      }`}
                    >
                      {isLearned
                        ? t("campus.dictionary.learnedBadge")
                        : t("campus.dictionary.manualBadge")}
                    </span>
                    <span className="text-sm font-medium text-text truncate">
                      {item.term}
                    </span>
                    {item.replacement && (
                      <span className="text-xs text-text-secondary truncate">
                        → {item.replacement}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    aria-label={t("common.delete")}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-danger/10 hover:text-danger focus:outline-none focus-visible:ring-2 focus-visible:ring-danger"
                    title={t("common.delete")}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
