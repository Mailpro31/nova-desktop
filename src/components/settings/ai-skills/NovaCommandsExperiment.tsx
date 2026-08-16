import React, { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "../../ui/Button";
import { ToggleSwitch } from "../../ui/ToggleSwitch";
import { ShortcutInput } from "../ShortcutInput";
import { useSettings } from "../../../hooks/useSettings";
import { commands, type CommandsDiagnostics } from "@/bindings";

/**
 * Banc de validation Nova Commands.
 *
 * **Hors interface utilisateur finale.** Affiché uniquement en mode debug
 * (`Ctrl+Shift+D`), le temps de valider la couche native sur applications
 * Windows réelles. Le brief l'exige : le moteur reste expérimental tant que
 * cette validation n'a pas eu lieu, et un panneau de diagnostic n'a rien à
 * faire dans un produit livré.
 */
export const NovaCommandsExperiment: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting, updateSetting } = useSettings();
  const [diagnostics, setDiagnostics] = useState<CommandsDiagnostics | null>(
    null,
  );

  const enabled = getSetting("nova_commands_enabled") ?? false;
  const shortcut = getSetting("bindings")?.command?.current_binding ?? "";

  return (
    <section className="mt-[32px] pt-[24px] border-t border-hairline">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-3">
        {t("novaCommands.experimentTitle")}
      </h2>

      <ToggleSwitch
        checked={enabled}
        onChange={(next) => void updateSetting("nova_commands_enabled", next)}
        label={t("novaCommands.settingLabel")}
        description={t("novaCommands.settingDescription")}
        descriptionMode="inline"
      />

      {/* Aucun raccourci n'est attribué par défaut : sans lui, la capture ne
          peut pas se produire, puisque Nova doit rester en arrière-plan au
          moment où l'utilisateur sélectionne son texte. Le champ vit ici, et
          non dans les Réglages, tant que la fonctionnalité est expérimentale. */}
      {enabled && (
        <>
          {!shortcut && (
            <p className="mt-3 px-4 py-3 rounded-card bg-warning/10 text-sm text-text-secondary leading-relaxed">
              {t("novaCommands.shortcutMissing")}
            </p>
          )}
          <div className="mt-3">
            <ShortcutInput shortcutId="command" descriptionMode="inline" />
          </div>
        </>
      )}

      <div className="mt-4 flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={async () =>
            setDiagnostics(await commands.novaCommandDiagnostics())
          }
        >
          {t("novaCommands.runDiagnostics")}
        </Button>
      </div>

      {diagnostics && (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs font-mono text-text-secondary">
          <Row
            label="sequence_detection"
            value={String(diagnostics.sequence_detection)}
          />
          <Row label="clipboard_kind" value={diagnostics.clipboard_kind} />
          <Row
            label="clipboard_restorable"
            value={String(diagnostics.clipboard_restorable)}
          />
          <Row
            label="foreground_process"
            value={diagnostics.foreground_process || "—"}
          />
          <Row
            label="foreground_pid"
            value={String(diagnostics.foreground_pid)}
          />
          <Row label="enabled" value={String(diagnostics.enabled)} />
        </dl>
      )}
    </section>
  );
};

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <>
    {/* Noms de champs techniques : ils doivent rester identiques à ceux du
        rapport Rust pour être comparables, donc jamais traduits. */}
    <dt>{label}</dt>
    <dd className="text-text">{value}</dd>
  </>
);

export default NovaCommandsExperiment;
