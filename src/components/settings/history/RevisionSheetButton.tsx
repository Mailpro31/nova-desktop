import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ClipboardList } from "lucide-react";
import { toast } from "sonner";

import { commands, type HistoryEntry } from "@/bindings";
import { clockTime } from "@/lib/revisionExport";
import { revisionSheet, SHEET_SECTIONS } from "@/lib/revisionSheet";

interface RevisionSheetButtonProps {
  /** Les dictées de la section, telles que l'historique les montre. */
  entries: HistoryEntry[];
  /** Le nom de la section : « Aujourd'hui », « Hier », ou le cours. */
  section: string;
  /** Le jour à nommer, en secondes : celui du cours. Aujourd'hui sinon. */
  date?: number;
}

/**
 * Copier la fiche de révision d'un cours, mise en forme, pour la coller dans
 * Word ou OneNote. Elle ne contient que ce que l'élève a dit et marqué
 * (`revisionSheet`) : rien n'est rédigé par un modèle, rien ne quitte le poste.
 */
export const RevisionSheetButton: React.FC<RevisionSheetButtonProps> = ({
  entries,
  section,
  date,
}) => {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);

  const copy = async () => {
    const name = `${section} — ${new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "long",
    }).format(date === undefined ? new Date() : new Date(date * 1000))}`;
    const sections = Object.fromEntries(
      SHEET_SECTIONS.map(({ key }) => [
        key,
        t(`revisionSheet.sections.${key}`),
      ]),
    ) as Record<(typeof SHEET_SECTIONS)[number]["key"], string>;
    const text = revisionSheet(
      entries,
      {
        title: t("revisionSheet.title", { name }),
        sections,
        slide: (label) => label,
        empty: t("revisionSheet.empty"),
      },
      (at) => clockTime(at, i18n.language),
    );
    setBusy(true);
    try {
      const result = await commands.copyFormattedText(text);
      if (result.status === "error") throw new Error(result.error);
      toast.success(t("revisionSheet.copied"));
    } catch {
      toast.error(t("revisionSheet.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void copy()}
      className="inline-flex cursor-pointer items-center gap-1 rounded-chip px-1.5 py-0.5 text-xs text-text-secondary transition-colors duration-[140ms] hover:bg-mid-gray/10 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-35"
    >
      <ClipboardList size={13} aria-hidden="true" />
      {t("revisionSheet.button")}
    </button>
  );
};

export default RevisionSheetButton;
