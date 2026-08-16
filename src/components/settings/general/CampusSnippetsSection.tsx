import React, { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, Plus, Trash2, RefreshCw, Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { loadCampusSession } from "@/lib/campusSession";
import { CampusApi, campusErrorText } from "@/lib/campusApi";
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
      const data = await api.getVocabulary();
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
      await api.addSnippet(trigger.trim(), content.trim());
      setTrigger("");
      setContent("");
      await loadSnippets();
      toast.success(t("campus.snippets.add"));
    } catch (err) {
      console.error("Failed to add snippet:", err);
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
      await api.deleteSnippet(id);
      await loadSnippets();
    } catch (err) {
      console.error("Failed to delete snippet:", err);
      const msg = campusErrorText(err, t("campus.errors.network"));
      if (msg) toast.error(msg);
    }
  };

  return (
    <div className="space-y-4 px-4 py-3">
      {/* Tip card */}
      <div className="flex items-start gap-2.5 border-s-2 border-accent bg-accent/5 px-3 py-2.5">
        <Lightbulb size={16} className="text-accent shrink-0 mt-0.5" />
        <p className="text-xs text-text-secondary leading-relaxed">
          {t("campus.snippets.tip", { trigger: "mon lien visio" })}
        </p>
      </div>

      {/* Add form */}
      <form onSubmit={handleAdd} className="space-y-2 pt-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label
              htmlFor="campus-snippet-trigger"
              className="mb-1.5 block text-xs font-medium text-text"
            >
              {t("campus.snippets.triggerLabel")}
            </label>
            <Input
              type="text"
              id="campus-snippet-trigger"
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
              placeholder={t("campus.snippets.triggerPlaceholder")}
              className="text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="campus-snippet-content"
              className="mb-1.5 block text-xs font-medium text-text"
            >
              {t("campus.snippets.contentLabel")}
            </label>
            <Input
              type="text"
              id="campus-snippet-content"
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
          <h4 className="text-xs font-medium text-text-secondary">
            {t("campus.snippets.title")} ({snippets.length})
          </h4>
          <Button
            variant="secondary"
            size="sm"
            onClick={loadSnippets}
            disabled={loading}
            aria-label={t("campus.account.refresh")}
            title={t("campus.account.refresh")}
            className="h-9 w-9 p-0"
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

        {snippets.length === 0 ? (
          <p className="py-2 text-xs text-text-secondary">
            {t("campus.snippets.empty")}
          </p>
        ) : (
          <div className="divide-y divide-hairline border-y border-hairline">
            {snippets.map((snip) => (
              <div
                key={snip.id}
                className="group flex min-h-14 items-center justify-between gap-3 px-2 py-3"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
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
                  aria-label={t("common.delete")}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-danger/10 hover:text-danger focus:outline-none focus-visible:ring-2 focus-visible:ring-danger"
                  title={t("common.delete")}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
