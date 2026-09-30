import React, { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { PencilLine } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../ui/Button";
import { commands, type LearnableTerm } from "@/bindings";
import { useSettings } from "@/hooks/useSettings";
import { isOrganizationMode } from "@/lib/mode";

interface HistoryCorrectionProps {
  entryId: number;
  text: string;
  disabled?: boolean;
}

const termKey = (term: LearnableTerm) => `${term.heard}→${term.expected}`;

/**
 * Corriger une dictée, et apprendre de la correction.
 *
 * Ce que l'élève corrige est ce que le moteur entend mal chez lui. Nova le lui
 * **propose** pour son vocabulaire — qui guide aussi, côté serveur, la
 * transcription suivante. Chaque terme est une case décochable ; rien n'est
 * ajouté sans un clic. Ce qui peut s'apprendre, et surtout ce qui ne s'apprend
 * jamais (un mot courant, une majuscule de début de phrase, une phrase
 * réécrite), est décidé côté Rust : `voice_calibration::corrected_terms`.
 */
export const HistoryCorrection: React.FC<HistoryCorrectionProps> = ({
  entryId,
  text,
  disabled,
}) => {
  const { t } = useTranslation();
  const { getSetting, updateSetting } = useSettings();
  const fieldId = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [saving, setSaving] = useState(false);
  const [terms, setTerms] = useState<LearnableTerm[]>([]);
  const [rejected, setRejected] = useState<Set<string>>(new Set());

  const save = async () => {
    setSaving(true);
    const result = await commands.correctHistoryEntry(entryId, draft);
    setSaving(false);
    if (result.status === "error") {
      toast.error(t("settings.history.correction.error"));
      return;
    }
    setEditing(false);
    setRejected(new Set());
    setTerms(result.data);
  };

  const learn = async () => {
    const accepted = terms.filter((term) => !rejected.has(termKey(term)));
    if (isOrganizationMode()) {
      for (const term of accepted) {
        await commands.learnOrganizationDictionary(term.heard, term.expected);
      }
    } else if (accepted.length > 0) {
      const existing = getSetting("custom_words") ?? [];
      const additions = accepted
        .map((term) => term.expected)
        .filter((word) => !existing.includes(word));
      if (additions.length > 0) {
        await updateSetting("custom_words", [...existing, ...additions]);
      }
    }
    setTerms([]);
    if (accepted.length > 0)
      toast.success(t("settings.history.correction.learned"));
  };

  const toggle = (term: LearnableTerm) =>
    setRejected((previous) => {
      const next = new Set(previous);
      const key = termKey(term);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <label htmlFor={fieldId} className="text-xs text-text-secondary">
          {t("settings.history.correction.field")}
        </label>
        <textarea
          id={fieldId}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={4}
          className="w-full resize-y rounded-control border border-hairline-strong bg-inset px-3 py-2 text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            disabled={saving || !draft.trim()}
            onClick={() => void save()}
          >
            {t("settings.history.correction.save")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={() => {
              setEditing(false);
              setDraft(text);
            }}
          >
            {t("common.cancel")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => {
            setDraft(text);
            setTerms([]);
            setEditing(true);
          }}
        >
          <PencilLine size={14} strokeWidth={2} aria-hidden="true" />
          {t("settings.history.correction.start")}
        </Button>
      </div>
      {terms.length > 0 && (
        <fieldset className="flex flex-col gap-2 rounded-card border border-hairline px-3.5 py-3">
          <legend className="px-1 text-sm text-text">
            {t("settings.history.correction.proposal")}
          </legend>
          {terms.map((term) => (
            <label
              key={termKey(term)}
              className="flex cursor-pointer items-start gap-3 text-sm text-text"
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={!rejected.has(termKey(term))}
                onChange={() => toggle(term)}
              />
              <span>
                {t("settings.history.correction.term", {
                  expected: term.expected,
                  heard: term.heard,
                })}
              </span>
            </label>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <Button variant="primary" size="sm" onClick={() => void learn()}>
              {t("settings.history.correction.learn")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setTerms([])}>
              {t("settings.history.correction.skip")}
            </Button>
          </div>
        </fieldset>
      )}
    </div>
  );
};

export default HistoryCorrection;
