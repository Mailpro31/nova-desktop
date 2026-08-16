import React, { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { Dropdown } from "../../ui/Dropdown";
import { TierBadge } from "../license/TierBadge";
import { useSettings } from "../../../hooks/useSettings";
import { styleColor } from "../../../lib/styleColors";

type PromptLite = { id: string; name: string };
type Rule = { style: string; keyword: string };

/**
 * Configuration du Style « Automatique » : Nova choisit le Style d'après l'app
 * au premier plan. Deux réglages :
 *  - liste noire de confidentialité (gratuit) : apps jamais inspectées ;
 *  - règles personnalisées (Nova Ultra) : associer un mot-clé à un Style.
 * Les champs sont absents des bindings tant que le build n'a pas régénéré les
 * types → lecture souple + écriture via invoke brut.
 */
export const AutoStyleSettings: React.FC<{ prompts: PromptLite[] }> = ({
  prompts,
}) => {
  const { t } = useTranslation();
  const { settings, refreshSettings } = useSettings();
  const [blocklist, setBlocklist] = useState("");
  const [rules, setRules] = useState<Rule[]>([]);
  const [canCustomize, setCanCustomize] = useState(true);
  const [saving, setSaving] = useState(false);

  const styleOptions = useMemo(
    () => prompts.map((p) => ({ value: p.id, label: p.name })),
    [prompts],
  );

  useEffect(() => {
    const s = settings as unknown as {
      auto_style_blocklist?: string[];
      auto_style_rules?: Record<string, string[]>;
    } | null;
    setBlocklist((s?.auto_style_blocklist ?? []).join(", "));
    const flat: Rule[] = [];
    Object.entries(s?.auto_style_rules ?? {}).forEach(([style, kws]) =>
      (kws ?? []).forEach((keyword) => flat.push({ style, keyword })),
    );
    setRules(flat);
  }, [settings]);

  useEffect(() => {
    invoke<{ features: Record<string, boolean> }>("get_license_status")
      .then((s) => setCanCustomize(s.features?.custom_auto_rules ?? true))
      .catch(() => setCanCustomize(true));
  }, []);

  const addRule = () =>
    setRules((r) => [
      ...r,
      { style: prompts[0]?.id ?? "nova_style_email", keyword: "" },
    ]);
  const updateRule = (i: number, patch: Partial<Rule>) =>
    setRules((r) =>
      r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)),
    );
  const removeRule = (i: number) =>
    setRules((r) => r.filter((_, idx) => idx !== i));

  const save = async () => {
    setSaving(true);
    try {
      const grouped: Record<string, string[]> = {};
      if (canCustomize) {
        rules.forEach(({ style, keyword }) => {
          const k = keyword.trim();
          if (!style || !k) return;
          (grouped[style] ??= []).push(k);
        });
      }
      const bl = blocklist
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      await invoke("update_auto_style_config", {
        rules: grouped,
        blocklist: bl,
      });
      await refreshSettings();
    } finally {
      setSaving(false);
    }
  };

  return (
    // Conteneur aligné sur la planche : creux discret, rayon de carte, filet
    // standard. La description générale a été retirée — elle vit désormais une
    // seule fois, sous le Style « Automatique » lui-même.
    <div className="space-y-4 rounded-card border border-hairline bg-inset p-3.5">
      {/* Liste noire de confidentialité — gratuit */}
      <div className="space-y-1.5">
        <label className="text-sm font-semibold">
          {t("settings.postProcessing.autoStyle.blocklistLabel")}
        </label>
        <Input
          type="text"
          value={blocklist}
          onChange={(e) => setBlocklist(e.target.value)}
          placeholder="keepass, 1password, mabanque"
          variant="compact"
        />
        <p className="text-xs text-mid-gray/70">
          {t("settings.postProcessing.autoStyle.blocklistTip")}
        </p>
      </div>

      {/* Règles personnalisées — Nova Ultra */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <label className="text-sm font-semibold">
            {t("settings.postProcessing.autoStyle.rulesLabel")}
          </label>
          <TierBadge feature="custom_auto_rules" />
        </div>

        {canCustomize ? (
          <>
            <div className="flex flex-col gap-2">
              {rules.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    type="text"
                    value={row.keyword}
                    onChange={(e) => updateRule(i, { keyword: e.target.value })}
                    placeholder={t(
                      "settings.postProcessing.autoStyle.keywordPlaceholder",
                    )}
                    variant="compact"
                    className="flex-1 min-w-0"
                  />
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: styleColor(row.style) }}
                    aria-hidden="true"
                  />
                  <Dropdown
                    selectedValue={row.style}
                    options={styleOptions}
                    onSelect={(v) => updateRule(i, { style: v ?? row.style })}
                    className="w-40 shrink-0"
                  />
                  <button
                    type="button"
                    onClick={() => removeRule(i)}
                    aria-label={t("common.remove", "Supprimer")}
                    className="shrink-0 w-9 h-9 flex items-center justify-center rounded-md text-text-secondary hover:bg-mid-gray/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <Button variant="secondary" size="sm" onClick={addRule}>
              <Plus className="w-4 h-4 mr-1" />
              {t("settings.postProcessing.autoStyle.addRule")}
            </Button>
          </>
        ) : (
          <p className="text-xs text-text-secondary">
            {t("settings.postProcessing.prompts.ultraOnly")}
          </p>
        )}
      </div>

      <Button variant="primary" size="md" onClick={save} disabled={saving}>
        {saving ? "…" : t("settings.postProcessing.autoStyle.save")}
      </Button>
    </div>
  );
};

export default AutoStyleSettings;
