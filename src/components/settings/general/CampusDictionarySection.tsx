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
import { loadCampusSession } from "@/lib/campusSession";
import { CampusApi } from "@/lib/campusApi";
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
      const data = await api.getVocabulary(session.token);
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
      await api.addDictionaryEntry(
        session.token,
        newTerm.trim(),
        newReplacement.trim(),
      );
      setNewTerm("");
      setNewReplacement("");
      await loadVocabulary();
      toast.success(t("settings.advanced.customWords.add"));
    } catch (err) {
      console.error("Failed to add dictionary entry:", err);
      toast.error(t("campus.errors.network"));
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: number) => {
    const session = await loadCampusSession();
    if (!session) return;

    try {
      const api = new CampusApi(session.server_url);
      await api.deleteDictionaryEntry(session.token, id);
      await loadVocabulary();
    } catch (err) {
      console.error("Failed to delete dictionary entry:", err);
      toast.error(t("campus.errors.network"));
    }
  };

  const handleExportCsv = async () => {
    const session = await loadCampusSession();
    if (!session) return;

    try {
      const api = new CampusApi(session.server_url);
      const csv = await api.exportDictionary(session.token);
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
      toast.error(t("campus.errors.network"));
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
      const res = await api.importDictionary(session.token, text);
      await loadVocabulary();
      toast.success(t("campus.dictionary.importSuccess", { count: res.imported }));
    } catch (err) {
      console.error("Failed to import dictionary:", err);
      toast.error(t("campus.errors.network"));
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
      const res = await api.analyzeDocument(session.token, analyzeText.trim());
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
      toast.error(t("campus.errors.network"));
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
            className="inline-flex items-center gap-1.5"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>

      {/* Document Analysis Box */}
      {showAnalyze && (
        <div className="p-4 rounded-2xl bg-accent/5 border border-accent/20 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-accent" />
            <h4 className="text-sm font-semibold text-text">
              {t("campus.dictionary.analyzeDocTitle")}
            </h4>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed">
            {t("campus.dictionary.analyzeDocDescription")}
          </p>

          <textarea
            value={analyzeText}
            onChange={(e) => setAnalyzeText(e.target.value)}
            placeholder={t("campus.dictionary.analyzeDocPlaceholder")}
            rows={4}
            className="w-full text-xs font-mono p-2.5 rounded-xl border border-hairline bg-white focus:outline-none focus:ring-1 focus:ring-accent"
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
                    <RefreshCw size={14} className="animate-spin" />
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
          <span className="text-[10px] font-medium uppercase px-2 py-0.5 rounded-full bg-mid-gray/15 text-text-secondary">
            {t("campus.dictionary.sharedBadge")}
          </span>
        </div>
        <p className="text-xs text-text-secondary">
          {t("campus.dictionary.sharedDescription")}
        </p>

        {shared.length === 0 ? (
          <p className="text-xs text-text-secondary/70 italic py-2">
            {t("campus.dictionary.sharedEmpty")}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2 pt-1">
            {shared.map((item) => (
              <div
                key={item.id}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-hairline shadow-xs text-xs font-medium"
              >
                <span className="text-text">{item.term}</span>
                {item.replacement && (
                  <>
                    <span className="text-text-secondary">→</span>
                    <span className="text-text-secondary">{item.replacement}</span>
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
        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-2">
          <Input
            type="text"
            value={newTerm}
            onChange={(e) => setNewTerm(e.target.value)}
            placeholder={t("campus.dictionary.termPlaceholder")}
            className="flex-1 text-sm"
          />
          <Input
            type="text"
            value={newReplacement}
            onChange={(e) => setNewReplacement(e.target.value)}
            placeholder={t("campus.dictionary.replacementPlaceholder")}
            className="flex-1 text-sm"
          />
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={!newTerm.trim() || adding}
            className="inline-flex items-center justify-center gap-1.5 shrink-0"
          >
            <Plus size={16} />
            {t("campus.dictionary.addTerm")}
          </Button>
        </form>

        {/* Personal terms list */}
        {personal.length === 0 ? (
          <p className="text-xs text-text-secondary/70 italic py-2">
            {t("campus.dictionary.personalEmpty")}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            {personal.map((item) => {
              const isLearned = item.source === "learned";
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white border border-hairline shadow-xs group"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span
                      className={`text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-md shrink-0 ${
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
                    className="p-1 rounded-lg text-text-secondary/50 hover:text-danger hover:bg-danger/10 transition-colors shrink-0"
                    title={t("common.delete")}
                  >
                    <Trash2 size={14} />
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
