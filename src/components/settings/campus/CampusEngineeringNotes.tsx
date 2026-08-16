import React, { useMemo, useState } from "react";
import { Clipboard, FileCog } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button, Input, Textarea } from "@/components/ui";
import { CampusApi } from "@/lib/campusApi";
import { useCampusStore } from "@/stores/campusStore";

export const CampusEngineeringNotes: React.FC = () => {
  const { t } = useTranslation();
  const session = useCampusStore((state) => state.session);
  const [text, setText] = useState("");
  const [instruction, setInstruction] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const api = useMemo(
    () => (session ? new CampusApi(session.server_url) : null),
    [session],
  );

  const formatNotes = async () => {
    if (!api || !text.trim() || loading) return;
    setLoading(true);
    try {
      const response = await api.formatEngineeringNotes(text, instruction);
      setResult(response.text);
    } catch {
      toast.error(t("campus.engineeringNotes.error"));
    } finally {
      setLoading(false);
    }
  };

  const copyResult = async () => {
    await navigator.clipboard.writeText(result);
    toast.success(t("campus.engineeringNotes.copied"));
  };

  return (
    <section className="space-y-4 border-y border-hairline py-5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-inset text-text-secondary">
          <FileCog size={18} aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-text">
            {t("campus.engineeringNotes.title")}
          </h2>
          <p className="mt-0.5 text-sm leading-relaxed text-text-secondary">
            {t("campus.engineeringNotes.description")}
          </p>
        </div>
      </div>
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={t("campus.engineeringNotes.inputPlaceholder")}
        rows={5}
      />
      <Input
        value={instruction}
        onChange={(event) => setInstruction(event.target.value)}
        placeholder={t("campus.engineeringNotes.instructionPlaceholder")}
      />
      <Button
        type="button"
        variant="primary"
        size="md"
        disabled={!text.trim() || loading || !api}
        onClick={() => void formatNotes()}
      >
        {loading
          ? t("campus.engineeringNotes.working")
          : t("campus.engineeringNotes.action")}
      </Button>
      {result && (
        <div className="space-y-3 border border-hairline bg-inset p-4 [border-radius:var(--nova-radius-card)]">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-text">
              {t("campus.engineeringNotes.result")}
            </h3>
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
        </div>
      )}
    </section>
  );
};

export default CampusEngineeringNotes;
