import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus, Trash2 } from "lucide-react";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { SettingContainer } from "../../ui/SettingContainer";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { TierBadge } from "../license/TierBadge";
import { useSettings } from "../../../hooks/useSettings";

type Variable = { key: string; value: string };

/**
 * Raccourcis personnels : l'utilisateur associe un mot-clé (« mon IBAN »,
 * « mon adresse »…) à une valeur. À la reformulation, l'IA insère la valeur
 * exacte quand le texte dicté fait référence au mot-clé. 100 % côté app +
 * commande `update_custom_variables`. Réservé à Nova Pro.
 */
export const CustomVariablesSettings: React.FC = () => {
  const { settings, refreshSettings } = useSettings();
  const [rows, setRows] = useState<Variable[]>([]);
  const [canUse, setCanUse] = useState(true);
  const [saving, setSaving] = useState(false);

  // Charge les variables enregistrées (champ absent des bindings tant que le
  // build Rust n'a pas régénéré les types → lecture souple).
  useEffect(() => {
    const stored =
      ((settings as unknown as { custom_variables?: Variable[] } | null)
        ?.custom_variables) ?? [];
    setRows(stored.length ? stored : [{ key: "", value: "" }]);
  }, [settings]);

  useEffect(() => {
    invoke<{ features: Record<string, boolean> }>("get_license_status")
      .then((s) => setCanUse(s.features?.custom_variables ?? true))
      .catch(() => setCanUse(true));
  }, []);

  const update = (i: number, patch: Partial<Variable>) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const addRow = () => setRows((r) => [...r, { key: "", value: "" }]);
  const removeRow = (i: number) =>
    setRows((r) => (r.length <= 1 ? [{ key: "", value: "" }] : r.filter((_, idx) => idx !== i)));

  const save = async () => {
    setSaving(true);
    try {
      const variables = rows
        .map((r) => ({ key: r.key.trim(), value: r.value.trim() }))
        .filter((r) => r.key && r.value);
      await invoke("update_custom_variables", { variables });
      await refreshSettings();
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsGroup title="Raccourcis">
      <SettingContainer
        title="Mes informations"
        description="Associez un mot-clé à une valeur (IBAN, adresse, téléphone…). En dictant, dites simplement le mot-clé : l'IA insère la valeur exacte lors de la reformulation."
        layout="stacked"
        grouped={true}
      >
        <div className="space-y-3">
          <TierBadge feature="custom_variables" />

          <div className="flex flex-col gap-2">
            {rows.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  type="text"
                  value={row.key}
                  onChange={(e) => update(i, { key: e.target.value })}
                  placeholder="Mot-clé (ex. mon IBAN)"
                  variant="compact"
                  className="w-1/3 min-w-[120px]"
                  disabled={!canUse}
                />
                <Input
                  type="text"
                  value={row.value}
                  onChange={(e) => update(i, { value: e.target.value })}
                  placeholder="Valeur (ex. FR76 3000 …)"
                  variant="compact"
                  className="flex-1"
                  disabled={!canUse}
                />
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  disabled={!canUse}
                  aria-label="Supprimer"
                  className="shrink-0 w-9 h-9 flex items-center justify-center rounded-md text-text-secondary hover:bg-mid-gray/10 disabled:opacity-40"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button
              variant="secondary"
              size="sm"
              onClick={addRow}
              disabled={!canUse}
            >
              <Plus className="w-4 h-4 mr-1" />
              Ajouter
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={save}
              disabled={!canUse || saving}
            >
              {saving ? "…" : "Enregistrer"}
            </Button>
          </div>
        </div>
      </SettingContainer>
    </SettingsGroup>
  );
};

export default CustomVariablesSettings;
