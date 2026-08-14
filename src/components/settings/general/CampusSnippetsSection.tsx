import React, { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, Plus, Trash2, RefreshCw, Lightbulb, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { loadCampusSession } from "@/lib/campusSession";
import { CampusApi } from "@/lib/campusApi";
import type { CampusSnippetEntry } from "@/lib/campusApi";

export const CampusSnippetsSection: React.FC = () => {
  const { t } = useTranslation();
  const [snippets, setSnippets] = useState<CampusSnippetEntry[]>([]);
  const [loading, setLoading] = useState(false);

  // Form
  const [trigger, setTrigger] = useState("");
  const [content, setContent] = useState("");
  const [adding, setAdding] = useState(false);

  const loadSnippets = useCallback(async () => {
    const session = await loadCampusSession();
    if (!session) return;
    setLoading(true);
    try {
      const api = new CampusApi(session.server_url);
      const data = await api.getVocabulary(session.token);
      setSnippets(data.snippets || []);
    } catch (err) {
      console.error("Failed to load campus snippets:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSnippets();
  }, [loadSnippets]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trigger.trim() || !content.trim()) return;

    const session = await loadCampusSession();
    if (!session) return;

    setAdding(true);
    try {
      const api = new CampusApi(session.server_url);
      await api.addSnippet(session.token, trigger.trim(), content.trim());
      setTrigger("");
      setContent("");
      await loadSnippets();
      toast.success(t("campus.snippets.add"));
    } catch (err) {
      console.error("Failed to add snippet:", err);
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
      await api.deleteSnippet(session.token, id);
      await loadSnippets();
    } catch (err) {
      console.error("Failed to delete snippet:", err);
      toast.error(t("campus.errors.network"));
    }
  };

  return (
    <div className="space-y-4 px-4 py-3">
      {/* Tip card */}
      <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-accent/5 border border-accent/20">
        <Lightbulb size={16} className="text-accent shrink-0 mt-0.5" />
        <p className="text-xs text-text-secondary leading-relaxed">
          {t("campus.snippets.tip", { trigger: "mon lien visio" })}
        </p>
      </div>

      {/* Add form */}
      <form onSubmit={handleAdd} className="space-y-2 pt-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">
              {t("campus.snippets.triggerLabel")}
            </label>
            <Input
              type="text"
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
              placeholder={t("campus.snippets.triggerPlaceholder")}
              className="text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">
              {t("campus.snippets.contentLabel")}
            </label>
            <Input
              type="text"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t("campus.snippets.contentPlaceholder")}
              className="text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={!trigger.trim() || !content.trim() || adding}
            className="inline-flex items-center gap-1.5"
          >
            <Plus size={14} />
            {t("campus.snippets.add")}
          </Button>
        </div>
      </form>

      {/* Snippets list */}
      <div className="space-y-2 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            {t("campus.snippets.title")} ({snippets.length})
          </h4>
          <Button
            variant="secondary"
            size="sm"
            onClick={loadSnippets}
            disabled={loading}
            className="p-1 h-7 w-7 inline-flex items-center justify-center"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          </Button>
        </div>

        {snippets.length === 0 ? (
          <p className="text-xs text-text-secondary/70 italic py-2">
            {t("campus.snippets.empty")}
          </p>
        ) : (
          <div className="space-y-2">
            {snippets.map((snip) => (
              <div
                key={snip.id}
                className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-white border border-hairline shadow-xs group"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-mid-gray/10 text-accent shrink-0">
                    <MessageSquare size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-text truncate">
                      « {snip.trigger} »
                    </p>
                    <p className="text-xs text-text-secondary font-mono truncate mt-0.5">
                      {snip.content}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleDelete(snip.id)}
                  className="p-1.5 rounded-lg text-text-secondary/50 hover:text-danger hover:bg-danger/10 transition-colors shrink-0"
                  title={t("common.delete")}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
