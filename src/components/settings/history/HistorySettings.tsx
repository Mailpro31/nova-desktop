import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
  Check,
  Copy,
  FolderOpen,
  RotateCcw,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "../../shell/PageHeader";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { KeyboardShortcut } from "../../ui/KeyboardShortcut";
import { AudioPlayer } from "../../ui/AudioPlayer";
import {
  filterEntries,
  groupByRecency,
  type HistoryBucket,
} from "./useHistoryGroups";
import { useSettings } from "../../../hooks/useSettings";
import { commands, events, type HistoryEntry } from "@/bindings";
import { formatDateTime } from "@/utils/dateFormat";
import { useOsType } from "@/hooks/useOsType";
import { convertFileSrc } from "@tauri-apps/api/core";
import { readFile } from "@tauri-apps/plugin-fs";

const BUCKET_LABEL: Record<HistoryBucket, string> = {
  today: "history.group.today",
  yesterday: "history.group.yesterday",
  week: "history.group.week",
  older: "history.group.older",
};

/**
 * Historique — ce que Nova a réellement transcrit.
 *
 * Pas un journal technique : la question est « qu'ai-je dicté récemment ? ».
 * Une liste dense, groupée par proximité temporelle, où l'on parcourt vite.
 *
 * **C'est la seule surface du produit qui montre du contenu dicté**, et
 * uniquement parce que l'utilisateur l'a ouverte volontairement. L'accueil, la
 * barre latérale et la palette n'en montrent nulle part.
 *
 * L'historique est borné par `history_limit` (1000 au maximum) et vit dans une
 * base SQLite locale : tout charger d'un coup est correct, et la recherche se
 * fait donc en mémoire, sans requête serveur ni pagination à trous.
 */
export const HistorySettings: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { getSetting } = useSettings();
  const osType = useOsType();

  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  const shortcut =
    (
      getSetting("bindings") as
        | Record<string, { current_binding?: string }>
        | undefined
    )?.transcribe?.current_binding ?? null;

  const load = useCallback(async () => {
    try {
      // `limit: null` renvoie tout l'historique — voir l'invariant plus haut.
      const result = await commands.getHistoryEntries(null, null);
      if (result.status === "ok") setEntries(result.data.entries);
    } catch (error) {
      console.error("Failed to load history:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Mise à jour en direct après une dictée : l'événement existe déjà, aucun
  // sondage n'est ajouté.
  useEffect(() => {
    const unlisten = events.historyUpdatePayload.listen((event) => {
      const payload = event.payload;
      setEntries((prev) => {
        switch (payload.action) {
          case "added":
            return [payload.entry, ...prev];
          case "updated":
            return prev.map((e) =>
              e.id === payload.entry.id ? payload.entry : e,
            );
          case "deleted":
            return prev.filter((e) => e.id !== payload.id);
          case "toggled":
            return prev.map((e) =>
              e.id === payload.id ? { ...e, saved: !e.saved } : e,
            );
        }
      });
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  const groups = useMemo(
    () => groupByRecency(filterEntries(entries, query)),
    [entries, query],
  );
  const matchCount = groups.reduce((n, g) => n + g.entries.length, 0);

  const remove = async (id: number) => {
    const previous = entries;
    setEntries((prev) => prev.filter((e) => e.id !== id));
    try {
      const result = await commands.deleteHistoryEntry(id);
      if (result.status !== "ok") throw new Error(String(result.error));
    } catch {
      // Restauration immédiate : la suppression optimiste ne doit pas faire
      // disparaître une entrée qui existe toujours.
      setEntries(previous);
      toast.error(t("settings.history.deleteError"));
    }
  };

  return (
    <>
      <PageHeader
        title={t("settings.history.title")}
        description={t("history.subtitle")}
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void commands.openRecordingsFolder()}
          >
            <FolderOpen size={15} strokeWidth={1.75} aria-hidden="true" />
            {t("settings.history.openFolder")}
          </Button>
        }
      />

      {/* La recherche n'apparaît que lorsqu'il y a matière à chercher : un
          champ au-dessus de trois entrées est du décor. */}
      {entries.length > 8 && (
        <div className="relative mb-[20px]">
          <Search
            size={15}
            strokeWidth={1.75}
            aria-hidden="true"
            className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-text-secondary"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("history.searchPlaceholder")}
            aria-label={t("history.searchPlaceholder")}
            className="w-full ps-9"
          />
        </div>
      )}

      {loading ? (
        <p className="py-6 text-sm text-text-secondary">
          {t("settings.history.loading")}
        </p>
      ) : entries.length === 0 ? (
        <div className="py-[48px] text-center">
          <p className="text-sm text-text">{t("history.empty")}</p>
          {shortcut && (
            <p className="mt-3 flex flex-wrap items-center justify-center gap-2 text-sm text-text-secondary">
              <KeyboardShortcut binding={shortcut} size="sm" />
              <span>{t("home.hero.dictateHint")}</span>
            </p>
          )}
        </div>
      ) : matchCount === 0 ? (
        <p className="py-6 text-sm text-text-secondary">
          {t("history.noMatch", { query })}
        </p>
      ) : (
        <div className="flex flex-col gap-[24px]">
          {groups.map((group) => (
            <section key={group.bucket}>
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                {t(BUCKET_LABEL[group.bucket])}
              </h2>
              <ul>
                {group.entries.map((entry) => (
                  <HistoryRow
                    key={entry.id}
                    entry={entry}
                    bucket={group.bucket}
                    expanded={expanded === entry.id}
                    onToggle={() =>
                      setExpanded((id) => (id === entry.id ? null : entry.id))
                    }
                    onDelete={() => void remove(entry.id)}
                    osType={osType}
                    locale={i18n.language}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
};

interface HistoryRowProps {
  entry: HistoryEntry;
  bucket: HistoryBucket;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  osType: string | null;
  locale: string;
}

/**
 * Une dictée : heure, texte, actions. Repliée elle tient en trois lignes, ce
 * qui permet d'en parcourir beaucoup ; dépliée elle montre le texte entier, la
 * date, le Style employé et l'audio.
 */
const HistoryRow: React.FC<HistoryRowProps> = ({
  entry,
  bucket,
  expanded,
  onToggle,
  onDelete,
  osType,
  locale,
}) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const text = entry.transcription_text.trim();
  const hasText = text.length > 0;

  // Le Style employé est enregistré avec la transcription mais n'était affiché
  // nulle part. C'est la seule métadonnée réellement stockée qui explique
  // pourquoi un texte est rédigé ainsi.
  const styleName = entry.post_process_prompt?.trim() || null;

  const copy = async () => {
    if (!hasText) return;
    await writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const retranscribe = async () => {
    setRetrying(true);
    try {
      const result = await commands.retryHistoryEntryTranscription(entry.id);
      if (result.status !== "ok") throw new Error(String(result.error));
    } catch {
      toast.error(t("settings.history.retranscribeError"));
    } finally {
      setRetrying(false);
    }
  };

  const loadAudio = useCallback(async () => {
    try {
      const result = await commands.getAudioFilePath(entry.file_name);
      if (result.status !== "ok") return null;
      // Sous Linux, le protocole `asset` n'est pas disponible : on relit le
      // fichier et on sert un blob. Comportement d'origine, conservé tel quel.
      if (osType === "linux") {
        const data = await readFile(result.data);
        return URL.createObjectURL(new Blob([data], { type: "audio/wav" }));
      }
      return convertFileSrc(result.data, "asset");
    } catch {
      return null;
    }
  }, [entry.file_name, osType]);

  // Dans les tranches récentes, le jour est déjà donné par l'en-tête de
  // section : répéter la date complète à chaque ligne ne dit rien de plus.
  const time =
    bucket === "today" || bucket === "yesterday"
      ? new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(
          new Date(entry.timestamp * 1000),
        )
      : formatDateTime(String(entry.timestamp), locale);

  return (
    <li className="border-b border-hairline last:border-b-0">
      <div className="flex items-start gap-3 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="min-w-0 flex-1 cursor-pointer px-2 text-start focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
        >
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-xs tabular-nums text-text-secondary">
              {time}
            </span>
            {styleName && (
              <span className="text-xs text-text-secondary">{styleName}</span>
            )}
          </span>
          <span
            // `line-clamp` impose son propre `display` : lui adjoindre `block`
            // annulerait la troncature, l'ordre des classes n'y changeant rien.
            className={`mt-0.5 whitespace-pre-wrap break-words text-sm ${
              expanded ? "block" : "line-clamp-3"
            } ${hasText ? "text-text" : "italic text-text-secondary"}`}
          >
            {retrying
              ? t("settings.history.transcribing")
              : hasText
                ? text
                : t("settings.history.transcriptionFailed")}
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-0.5 pe-1">
          <RowAction
            onClick={() => void copy()}
            label={t("settings.history.copyToClipboard")}
            disabled={!hasText || retrying}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </RowAction>
          <RowAction
            onClick={() => void commands.toggleHistoryEntrySaved(entry.id)}
            label={
              entry.saved
                ? t("settings.history.unsave")
                : t("settings.history.save")
            }
            active={entry.saved}
          >
            <Star size={15} fill={entry.saved ? "currentColor" : "none"} />
          </RowAction>
          <RowAction
            onClick={onDelete}
            label={t("settings.history.delete")}
            disabled={retrying}
            danger
          >
            <Trash2 size={15} />
          </RowAction>
        </div>
      </div>

      {expanded && (
        <div className="flex flex-col gap-3 px-2 pb-3">
          <AudioPlayer onLoadRequest={loadAudio} className="w-full" />
          <div>
            <Button
              variant="ghost"
              size="sm"
              disabled={retrying}
              onClick={() => void retranscribe()}
            >
              <RotateCcw size={14} strokeWidth={2} aria-hidden="true" />
              {t("settings.history.retranscribe")}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
};

const RowAction: React.FC<{
  onClick: () => void;
  label: string;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}> = ({ onClick, label, disabled, active, danger, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    title={label}
    className={`cursor-pointer rounded-chip p-1.5 transition-colors duration-[140ms] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-35 ${
      active
        ? "text-accent"
        : danger
          ? "text-text-secondary hover:bg-danger/10 hover:text-danger"
          : "text-text-secondary hover:bg-mid-gray/10 hover:text-text"
    }`}
  >
    {children}
  </button>
);

export default HistorySettings;
