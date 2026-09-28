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
import { loadOrganizationSession } from "@/lib/organizationSession";
import { OrganizationApi, campusErrorText } from "@/lib/organizationApi";
import type { OrganizationRuleEntry } from "@/lib/organizationApi";

export const OrganizationFormattingSection: React.FC = () => {
  const { t } = useTranslation();
  const [sharedRules, setSharedRules] = useState<OrganizationRuleEntry[]>([]);
  const [personalRules, setPersonalRules] = useState<OrganizationRuleEntry[]>(
    [],
  );
  const [loading, setLoading] = useState(false);

  // Form
  const [newRule, setNewRule] = useState("");
  const [adding, setAdding] = useState(false);

  const loadRules = useCallback(async () => {
    const session = await loadOrganizationSession();
    if (!session) return;
    setLoading(true);
    try {
      const api = new OrganizationApi(session.server_url);
      const data = await api.getFormattingRules();
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

    const session = await loadOrganizationSession();
    if (!session) return;

    setAdding(true);
    try {
      const api = new OrganizationApi(session.server_url);
      await api.addFormattingRule(newRule.trim());
      setNewRule("");
      await loadRules();
      toast.success(t("organization.formatting.addRule"));
    } catch (err) {
      console.error("Failed to add formatting rule:", err);
      const msg = campusErrorText(err, t("organization.errors.network"));
      if (msg) toast.error(msg);
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: number) => {
    const session = await loadOrganizationSession();
    if (!session) return;

    try {
      const api = new OrganizationApi(session.server_url);
      await api.deleteFormattingRule(id);
      await loadRules();
    } catch (err) {
      console.error("Failed to delete formatting rule:", err);
      const msg = campusErrorText(err, t("organization.errors.network"));
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
            {t("organization.formatting.sharedTitle")}
          </h3>
          <span className="rounded-full bg-inset px-2 py-0.5 text-[11px] font-medium text-text-secondary">
            {t("organization.dictionary.sharedBadge")}
          </span>
        </div>
        <p className="text-xs text-text-secondary">
          {t("organization.formatting.sharedDescription")}
        </p>

        {sharedRules.length === 0 ? (
          <p className="py-2 text-xs text-text-secondary">
            {t("organization.formatting.sharedEmpty")}
          </p>
        ) : (
          <div className="divide-y divide-hairline border-y border-hairline">
            {sharedRules.map((rule) => (
              <div
                key={rule.id}
                className="flex min-h-11 items-center gap-2 px-3 py-2 text-xs text-text"
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
              {t("organization.formatting.personalTitle")}
            </h3>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={loadRules}
            disabled={loading}
            aria-label={t("organization.account.refresh")}
            title={t("organization.account.refresh")}
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
        <p className="text-xs text-text-secondary">
          {t("organization.formatting.personalDescription")}
        </p>

        {/* Add personal rule form */}
        <form
          onSubmit={handleAdd}
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
        >
          <label
            htmlFor="campus-formatting-rule"
            className="flex flex-1 flex-col gap-1.5 text-xs font-medium text-text"
          >
            {t("organization.formatting.addRule")}
            <Input
              id="campus-formatting-rule"
              type="text"
              value={newRule}
              onChange={(e) => setNewRule(e.target.value)}
              placeholder={t("organization.formatting.rulePlaceholder")}
            />
          </label>
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={!newRule.trim() || adding}
            className="inline-flex items-center justify-center gap-1.5 shrink-0"
          >
            <Plus size={16} />
            {t("organization.formatting.addRule")}
          </Button>
        </form>

        {/* Personal rules list */}
        {personalRules.length === 0 ? (
          <p className="py-2 text-xs text-text-secondary">
            {t("organization.formatting.personalEmpty")}
          </p>
        ) : (
          <div className="divide-y divide-hairline border-y border-hairline">
            {personalRules.map((rule) => (
              <div
                key={rule.id}
                className="group flex min-h-12 items-center justify-between gap-2 px-3 py-2"
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
