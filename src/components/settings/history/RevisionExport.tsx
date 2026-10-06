import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { Download } from "lucide-react";
import { toast } from "sonner";

import { commands, type HistoryEntry } from "@/bindings";
import {
  clockTime,
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

const ANKI_ERRORS: Record<string, string> = {
  anki_not_running: "history.export.ankiNotRunning",
  anki_too_old: "history.export.ankiTooOld",
  anki_no_model: "history.export.ankiNoModel",
  anki_error: "history.export.ankiFailed",
};

interface RevisionExportProps {
  /** Les dictées de la section, telles que l'historique les montre. */
  entries: HistoryEntry[];
  /** Le nom de la section : « Aujourd'hui », « Hier », ou le cours. */
  section: string;
  /** Le jour à nommer, en secondes : celui du cours. Aujourd'hui sinon. */
  date?: number;
}

/**
 * Exporter une section de l'historique pour réviser : des notes, des cartes
 * Anki, une carte mentale. Le fichier est écrit là où l'élève le choisit ;
 * rien ne quitte le poste.
 */
export const RevisionExport: React.FC<RevisionExportProps> = ({
  entries,
  section,
  date,
}) => {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const title = t("history.export.title", {
    section,
    date: new Intl.DateTimeFormat(i18n.language, { dateStyle: "long" }).format(
      date === undefined ? new Date() : new Date(date * 1000),
    ),
  });

  // Envoyer directement dans Anki : quatre étapes d'import en moins pour un
  // élève dyspraxique. Les codes d'erreur viennent de `commands::anki`.
  const sendToAnki = async () => {
    const cards = revisionCards(entries);
    if (cards.length === 0) {
      toast.info(t("history.export.noCards"));
      return;
    }
    setBusy(true);
    try {
      const result = await commands.ankiSendCards(title, cards);
      if (result.status === "error") {
        toast.error(
          t(ANKI_ERRORS[result.error] ?? "history.export.ankiFailed"),
        );
        return;
      }
      const { added, skipped, deck } = result.data;
      toast.success(
        skipped > 0
          ? t("history.export.ankiSentSkipped", { count: added, skipped, deck })
          : t("history.export.ankiSent", { count: added, deck }),
      );
      setOpen(false);
    } catch {
      toast.error(t("history.export.ankiFailed"));
    } finally {
      setBusy(false);
    }
  };

  const exportAs = async (format: Format) => {
    if (format === "anki" && revisionCards(entries).length === 0) {
      toast.info(t("history.export.noCards"));
      return;
    }
    const content =
      format === "markdown"
        ? toMarkdown(entries, title, (at) => clockTime(at, i18n.language))
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
      {open && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void sendToAnki()}
          className="cursor-pointer rounded-chip border border-hairline px-2 py-0.5 text-xs text-text transition-colors duration-[140ms] hover:bg-mid-gray/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-35"
        >
          {t("history.export.ankiSend")}
        </button>
      )}
    </div>
  );
};

export default RevisionExport;
