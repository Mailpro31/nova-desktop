import React, { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  ListFilter,
  Plus,
  Trash2,
  RefreshCw,
  Building,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { loadCampusSession } from "@/lib/campusSession";
import { CampusApi, campusErrorText } from "@/lib/campusApi";
import type { CampusRuleEntry } from "@/lib/campusApi";

export const CampusFormattingSection: React.FC = () => {
  const { t } = useTranslation();
  const [sharedRules, setSharedRules] = useState<CampusRuleEntry[]>([]);
  const [personalRules, setPersonalRules] = useState<CampusRuleEntry[]>([]);
  const [loading, setLoading] = useState(false);

  // Form
  const [newRule, setNewRule] = useState("");
  const [adding, setAdding] = useState(false);

  const loadRules = useCallback(async () => {
    const session = await loadCampusSession();
    if (!session) return;
    setLoading(true);
    try {
      const api = new CampusApi(session.server_url);
      const data = await api.getFormattingRules(session.token);
      setSharedRules(data.shared || []);
      setPersonalRules(data.personal || []);
    } catch (err) {
      console.error("Failed to load formatting rules:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRule.trim()) return;

    const session = await loadCampusSession();
    if (!session) return;

    setAdding(true);
    try {
      const api = new CampusApi(session.server_url);
      await api.addFormattingRule(session.token, newRule.trim());
      setNewRule("");
      await loadRules();
      toast.success(t("campus.formatting.addRule"));
    } catch (err) {
      console.error("Failed to add formatting rule:", err);
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
      await api.deleteFormattingRule(session.token, id);
      await loadRules();
    } catch (err) {
      console.error("Failed to delete formatting rule:", err);
      const msg = campusErrorText(err, t("campus.errors.network"));
      if (msg) toast.error(msg);
    }
  };

  return (
    <div className="space-y-5 px-4 py-3">
      {/* Shared rules */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Building size={16} className="text-text-secondary" />
          <h3 className="text-sm font-semibold text-text">
            {t("campus.formatting.sharedTitle")}
          </h3>
          <span className="text-[10px] font-medium uppercase px-2 py-0.5 rounded-full bg-mid-gray/15 text-text-secondary">
            {t("campus.dictionary.sharedBadge")}
          </span>
        </div>
        <p className="text-xs text-text-secondary">
          {t("campus.formatting.sharedDescription")}
        </p>

        {sharedRules.length === 0 ? (
          <p className="text-xs text-text-secondary/70 italic py-2">
            {t("campus.formatting.sharedEmpty")}
          </p>
        ) : (
          <div className="space-y-1.5 pt-1">
            {sharedRules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-hairline shadow-xs text-xs text-text"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                <span className="flex-1 leading-relaxed">{rule.rule}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Personal rules */}
      <div className="space-y-3 pt-2 border-t border-hairline">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User size={16} className="text-text-secondary" />
            <h3 className="text-sm font-semibold text-text">
              {t("campus.formatting.personalTitle")}
            </h3>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={loadRules}
            disabled={loading}
            className="p-1 h-7 w-7 inline-flex items-center justify-center"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          </Button>
        </div>
        <p className="text-xs text-text-secondary">
          {t("campus.formatting.personalDescription")}
        </p>

        {/* Add personal rule form */}
        <form onSubmit={handleAdd} className="flex gap-2">
          <Input
            type="text"
            value={newRule}
            onChange={(e) => setNewRule(e.target.value)}
            placeholder={t("campus.formatting.rulePlaceholder")}
            className="flex-1 text-sm"
          />
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={!newRule.trim() || adding}
            className="inline-flex items-center justify-center gap-1.5 shrink-0"
          >
            <Plus size={16} />
            {t("campus.formatting.addRule")}
          </Button>
        </form>

        {/* Personal rules list */}
        {personalRules.length === 0 ? (
          <p className="text-xs text-text-secondary/70 italic py-2">
            {t("campus.formatting.personalEmpty")}
          </p>
        ) : (
          <div className="space-y-1.5 pt-1">
            {personalRules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white border border-hairline shadow-xs group"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                  <span className="text-xs text-text leading-relaxed">
                    {rule.rule}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(rule.id)}
                  className="p-1 rounded-lg text-text-secondary/50 hover:text-danger hover:bg-danger/10 transition-colors shrink-0"
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
