import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { Download } from "lucide-react";
import { toast } from "sonner";

import type { HistoryEntry } from "@/bindings";
import {
  exportFileName,
  revisionCards,
  toAnkiCsv,
  toMarkdown,
  toOpml,
} from "@/lib/revisionExport";

type Format = "markdown" | "anki" | "mindmap";

const EXTENSION: Record<Format, string> = {
  markdown: "md",
  anki: "csv",
  mindmap: "opml",
};

interface RevisionExportProps {
  /** Les dictées de la section, telles que l'historique les montre. */
  entries: HistoryEntry[];
  /** Le nom de la section : « Aujourd'hui », « Hier »… */
  section: string;
}

/**
 * Exporter une section de l'historique pour réviser : des notes, des cartes
 * Anki, une carte mentale. Le fichier est écrit là où l'élève le choisit ;
 * rien ne quitte le poste.
 */
export const RevisionExport: React.FC<RevisionExportProps> = ({
  entries,
  section,
}) => {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const title = t("history.export.title", {
    section,
    date: new Intl.DateTimeFormat(i18n.language, { dateStyle: "long" }).format(
      new Date(),
    ),
  });

  const exportAs = async (format: Format) => {
    if (format === "anki" && revisionCards(entries).length === 0) {
      toast.info(t("history.export.noCards"));
      return;
    }
    const content =
      format === "markdown"
        ? toMarkdown(entries, title)
        : format === "anki"
          ? toAnkiCsv(entries, title)
          : toOpml(entries, title, t("history.export.notes"));
    setBusy(true);
    try {
      const path = await save({
        defaultPath: exportFileName(title, EXTENSION[format]),
      });
      // Fenêtre fermée : il n'y a rien à dire.
      if (!path) return;
      await writeTextFile(path, content);
      toast.success(t("history.export.saved"));
      setOpen(false);
    } catch {
      toast.error(t("history.export.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="inline-flex cursor-pointer items-center gap-1 rounded-chip px-1.5 py-0.5 text-xs text-text-secondary transition-colors duration-[140ms] hover:bg-mid-gray/10 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Download size={13} aria-hidden="true" />
        {t("history.export.button")}
      </button>
      {open &&
        (["markdown", "anki", "mindmap"] as Format[]).map((format) => (
          <button
            key={format}
            type="button"
            disabled={busy}
            onClick={() => void exportAs(format)}
            className="cursor-pointer rounded-chip border border-hairline px-2 py-0.5 text-xs text-text transition-colors duration-[140ms] hover:bg-mid-gray/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-35"
          >
            {t(`history.export.${format}`)}
          </button>
        ))}
    </div>
  );
};

export default RevisionExport;
