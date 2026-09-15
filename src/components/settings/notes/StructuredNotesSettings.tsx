import React, { useState } from "react";
import { Clipboard } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { PageHeader } from "../../shell/PageHeader";
import { Button, Input, Textarea } from "@/components/ui";
import { commands } from "@/bindings";
import { useCapability } from "@/hooks/useOrganizationContext";
import { isOrganizationMode } from "@/lib/mode";
import {
  NOTE_TYPES,
  structuredNotesEngine,
  type NoteType,
} from "@/lib/structuredNotes";
import { useCampusStore } from "@/stores/campusStore";

/**
 * Notes structurées — on colle ou dicte du brut, Nova le range selon le type.
 *
 * L'exemple avant/après reste affiché en permanence, pour le type choisi : on
 * voit ce que l'outil fait avant même d'avoir écrit une ligne.
 */
export const StructuredNotesSettings: React.FC = () => {
  const { t } = useTranslation();
  const session = useCampusStore((state) => state.session);
  const capabilityOpen = useCapability("engineeringNotes");
  const engine = structuredNotesEngine({
    organizationMode: isOrganizationMode(),
    signedIn: Boolean(session),
    capabilityOpen,
  });

  const [noteType, setNoteType] = useState<NoteType>("free");
  const [text, setText] = useState("");
  const [instruction, setInstruction] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  const structure = async () => {
    if (!text.trim() || loading || engine === "unavailable") return;
    setLoading(true);
    try {
      if (engine === "organization") {
        const response = await commands.formatCampusStructuredNotes(
          text,
          noteType,
          instruction,
        );
        if (response.status === "error") throw new Error(response.error);
        setResult(response.data.text);
      } else {
        const response = await commands.formatStructuredNotesLocally(
          text,
          noteType,
          instruction,
        );
        if (response.status === "error") throw new Error(response.error);
        setResult(response.data);
      }
    } catch {
      toast.error(t("structuredNotes.error"));
    } finally {
      setLoading(false);
    }
  };

  const copyResult = async () => {
    await navigator.clipboard.writeText(result);
    toast.success(t("structuredNotes.copied"));
  };

  return (
    <>
      <PageHeader
        title={t("structuredNotes.title")}
        description={t("structuredNotes.subtitle")}
      />

      <div className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
            {t("structuredNotes.typeLabel")}
          </p>
          <div
            className="inline-flex max-w-full flex-wrap items-center gap-0.5 rounded-[18px] p-0.5"
            style={{ background: "var(--color-inset)" }}
            role="tablist"
            aria-label={t("structuredNotes.typeLabel")}
          >
            {NOTE_TYPES.map((type) => {
              const active = type === noteType;
              return (
                <button
                  key={type}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setNoteType(type)}
                  className={`shrink-0 cursor-pointer rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-accent text-white"
                      : "text-text-secondary hover:text-text"
                  }`}
                >
                  {t(`structuredNotes.types.${type}`)}
                </button>
              );
            })}
          </div>
        </div>

        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t("structuredNotes.inputPlaceholder")}
          rows={6}
          className="block w-full"
        />
        <Input
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder={t("structuredNotes.instructionPlaceholder")}
          className="block w-full"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="primary"
            size="md"
            disabled={!text.trim() || loading || engine === "unavailable"}
            onClick={() => void structure()}
          >
            {loading
              ? t("structuredNotes.working")
              : t("structuredNotes.action")}
          </Button>
          {engine === "unavailable" && !isOrganizationMode() && (
            <p className="text-xs text-text-secondary">
              {t("structuredNotes.unavailable")}
            </p>
          )}
        </div>

        {result && (
          <section className="space-y-3 border border-hairline bg-inset p-4 [border-radius:var(--nova-radius-card)]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-text">
                {t("structuredNotes.result")}
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void copyResult()}
              >
                <Clipboard size={14} className="mr-1" aria-hidden="true" />
                {t("common.copy")}
              </Button>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-text">
              {result}
            </p>
          </section>
        )}

        {/* L'exemple suit le type choisi et ne disparaît jamais : c'est lui qui
            montre à quoi sert l'outil. */}
        <section
          className="mt-[24px] border-t border-hairline pt-[20px]"
          aria-labelledby="structured-notes-example"
        >
          <h2
            id="structured-notes-example"
            className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-secondary"
          >
            {t("structuredNotes.exampleTitle")}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <ExamplePanel
              label={t("structuredNotes.exampleBefore")}
              body={t(`structuredNotes.examples.${noteType}.before`)}
            />
            <ExamplePanel
              label={t("structuredNotes.exampleAfter")}
              body={t(`structuredNotes.examples.${noteType}.after`)}
            />
          </div>
        </section>
      </div>
    </>
  );
};

const ExamplePanel: React.FC<{ label: string; body: string }> = ({
  label,
  body,
}) => (
  <div className="border border-hairline p-3 [border-radius:var(--nova-radius-card)]">
    <p className="mb-1.5 text-xs font-medium text-text-secondary">{label}</p>
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-text">
      {body}
    </p>
  </div>
);

export default StructuredNotesSettings;
