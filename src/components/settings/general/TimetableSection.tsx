import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileUp, Link2, RefreshCw, Trash2, Lightbulb } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { useTimetableStore } from "@/stores/timetableStore";
import { courseAt, type CourseEvent } from "@/lib/timetable";

const ERROR_CODES = [
  "invalid_link",
  "unreachable",
  "unreadable",
  "not_calendar",
  "too_large",
  "keyring",
  "storage",
] as const;

/** Le cours en cours, sinon le prochain : de quoi vérifier d'un coup d'œil. */
function currentOrNext(
  events: readonly CourseEvent[],
  now: number,
): { course: CourseEvent; current: boolean } | null {
  const current = courseAt(events, now);
  if (current) return { course: current, current: true };
  const next = events.find((event) => event.start > now);
  return next ? { course: next, current: false } : null;
}

/**
 * Relier son emploi du temps : un lien d'abonnement (relu toutes les six
 * heures) ou un fichier `.ics`. Nova range ensuite chaque dictée sous le cours
 * pendant lequel elle a été faite. Le lien et le calendrier restent sur le
 * poste.
 */
export const TimetableSection: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { status, events, busy, error, loaded, load, connect, importFile } =
    useTimetableStore();
  const disconnect = useTimetableStore((state) => state.disconnect);
  const [link, setLink] = useState("");

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const errorText = (code: string | null): string | null => {
    if (!code) return null;
    return (ERROR_CODES as readonly string[]).includes(code)
      ? t(`organization.timetable.errors.${code}`)
      : t("organization.timetable.errors.storage");
  };

  const when = (seconds: number, withDay: boolean) =>
    new Intl.DateTimeFormat(i18n.language, {
      ...(withDay ? { weekday: "long", day: "numeric", month: "long" } : {}),
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(seconds * 1000));

  const upcoming = useMemo(
    () => currentOrNext(events, Math.floor(Date.now() / 1000)),
    [events],
  );

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!link.trim()) return;
    if (await connect(link.trim())) {
      setLink("");
      toast.success(t("organization.timetable.connected"));
    }
  };

  const handleImport = async () => {
    const path = await open({
      multiple: false,
      directory: false,
      filters: [
        { name: t("organization.timetable.fileFilter"), extensions: ["ics"] },
      ],
    });
    if (typeof path !== "string") return;
    if (await importFile(path))
      toast.success(t("organization.timetable.imported"));
  };

  const source = status?.source ?? null;

  return (
    <div className="space-y-4 px-4 py-3">
      <div className="flex items-start gap-2.5 border-s-2 border-accent bg-accent/5 px-3 py-2.5">
        <Lightbulb size={16} className="text-accent shrink-0 mt-0.5" />
        <p className="text-xs text-text-secondary leading-relaxed">
          {t("organization.timetable.intro")}
        </p>
      </div>

      {source === null ? (
        <form onSubmit={handleConnect} className="space-y-2">
          <label
            htmlFor="timetable-link"
            className="block text-xs font-medium text-text"
          >
            {t("organization.timetable.linkLabel")}
          </label>
          <div className="flex flex-wrap gap-2">
            <Input
              type="url"
              id="timetable-link"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="webcal://…"
              className="min-w-0 flex-1 text-sm"
              autoComplete="off"
              spellCheck={false}
            />
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={!link.trim() || busy}
              className="inline-flex items-center gap-1.5"
            >
              <Link2 size={14} aria-hidden="true" />
              {t("organization.timetable.connect")}
            </Button>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed">
            {t("organization.timetable.linkHelp")}
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void handleImport()}
            disabled={busy}
            className="inline-flex items-center gap-1.5"
          >
            <FileUp size={14} aria-hidden="true" />
            {t("organization.timetable.importFile")}
          </Button>
        </form>
      ) : (
        <div className="space-y-3">
          <dl className="divide-y divide-hairline border-y border-hairline">
            <div className="flex min-h-11 items-center justify-between gap-3 px-2 py-2">
              <dt className="text-sm text-text-secondary">
                {source === "link"
                  ? t("organization.timetable.fromLink")
                  : t("organization.timetable.fromFile")}
              </dt>
              <dd className="text-sm text-text">
                {status?.updated_at
                  ? t("organization.timetable.updated", {
                      when: when(status.updated_at, true),
                    })
                  : null}
              </dd>
            </div>
            <div className="flex min-h-11 items-center justify-between gap-3 px-2 py-2">
              <dt className="text-sm text-text-secondary">
                {upcoming?.current
                  ? t("organization.timetable.current")
                  : t("organization.timetable.next")}
              </dt>
              <dd className="min-w-0 text-end text-sm text-text">
                {upcoming
                  ? `${upcoming.course.summary} · ${when(upcoming.course.start, !upcoming.current)}`
                  : t("organization.timetable.noCourse")}
              </dd>
            </div>
          </dl>
          <div className="flex flex-wrap justify-end gap-2">
            {source === "link" ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void load(true)}
                disabled={busy}
                className="inline-flex items-center gap-1.5"
              >
                <RefreshCw
                  size={14}
                  aria-hidden="true"
                  className={
                    busy ? "animate-spin motion-reduce:animate-none" : ""
                  }
                />
                {t("organization.timetable.refresh")}
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleImport()}
                disabled={busy}
                className="inline-flex items-center gap-1.5"
              >
                <FileUp size={14} aria-hidden="true" />
                {t("organization.timetable.importOther")}
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void disconnect()}
              disabled={busy}
              className="inline-flex items-center gap-1.5"
            >
              <Trash2 size={14} aria-hidden="true" />
              {t("organization.timetable.remove")}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-danger leading-relaxed">
          {errorText(error)}
        </p>
      )}

      <p className="text-xs text-text-secondary leading-relaxed">
        {t("organization.timetable.privacy")}
      </p>
    </div>
  );
};
