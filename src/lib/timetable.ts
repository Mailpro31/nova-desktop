import type { HistoryEntry } from "@/bindings";

/**
 * L'emploi du temps de l'élève, lu dans un fichier ICS (le format que
 * publient ADE, Hyperplanning, Outlook ou Google Agenda). Il sert à une seule
 * chose : savoir dans quel cours une dictée a été faite, pour la ranger sous
 * ce cours dans l'historique et nommer l'export d'après lui.
 *
 * Tout reste sur le poste : le fichier n'est envoyé à aucun serveur, et le
 * cours n'est pas écrit dans la base de l'historique — il est retrouvé à
 * l'affichage, d'après l'heure de la dictée. Un emploi du temps relié après
 * coup range donc aussi les dictées déjà faites.
 */

/** Une séance de cours, en secondes depuis l'époque Unix. */
export interface CourseEvent {
  /** Identifiant stable d'une séance : UID et heure de début. */
  key: string;
  start: number;
  end: number;
  summary: string;
  location: string;
}

// Les séances répétées sont calculées sur une fenêtre autour d'aujourd'hui :
// l'historique remonte rarement au-delà d'un semestre.
const PAST_DAYS = 200;
const FUTURE_DAYS = 60;
const DAY = 86_400;

interface Property {
  params: Record<string, string>;
  value: string;
}

type RawEvent = Map<string, Property[]>;

/** Les lignes logiques : une ligne qui commence par un espace continue la précédente. */
function unfold(text: string): string[] {
  return text.replace(/\r?\n[ \t]/gu, "").split(/\r?\n/u);
}

/** « DTSTART;TZID=Europe/Paris:20261005T083000 » → nom, paramètres, valeur. */
function parseLine(line: string): [string, Property] | null {
  let quoted = false;
  let colon = -1;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') quoted = !quoted;
    else if (c === ":" && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon <= 0) return null;
  const [name, ...rawParams] = line.slice(0, colon).split(";");
  const params: Record<string, string> = {};
  for (const param of rawParams) {
    const equals = param.indexOf("=");
    if (equals > 0) {
      params[param.slice(0, equals).toUpperCase()] = param
        .slice(equals + 1)
        .replace(/^"|"$/gu, "");
    }
  }
  return [name.toUpperCase(), { params, value: line.slice(colon + 1) }];
}

function unescapeText(value: string): string {
  return value
    .replace(/\\[nN]/gu, " ")
    .replace(/\\([,;\\])/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * Une date-heure ICS en secondes. « …Z » est en temps universel ; sans « Z »
 * (avec ou sans TZID), c'est l'heure locale du poste — un emploi du temps
 * d'école est publié dans le fuseau de l'école, qui est celui de l'élève.
 * Une date seule (journée entière) n'est pas une séance : `null`.
 */
export function parseIcsDate(value: string): number | null {
  const found = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/u.exec(
    value.trim(),
  );
  if (!found) return null;
  const [, y, mo, d, h, mi, s, utc] = found;
  const parts = [+y, +mo - 1, +d, +h, +mi, +s] as const;
  const ms = utc ? Date.UTC(...parts) : new Date(...parts).getTime();
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

/** « PT1H30M » → 5 400. */
function parseDuration(value: string): number | null {
  const found =
    /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/u.exec(
      value.trim(),
    );
  if (!found) return null;
  const [, w, d, h, m, s] = found.map((part) => +(part ?? 0));
  const total = w * 7 * DAY + d * DAY + h * 3600 + m * 60 + s;
  return total > 0 ? total : null;
}

function first(event: RawEvent, name: string): Property | undefined {
  return event.get(name)?.[0];
}

const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** Décale une date de `days` jours en gardant son heure (locale ou UTC). */
function shiftDays(seconds: number, days: number, utc: boolean): number {
  const date = new Date(seconds * 1000);
  if (utc) date.setUTCDate(date.getUTCDate() + days);
  else date.setDate(date.getDate() + days);
  return Math.floor(date.getTime() / 1000);
}

function weekday(seconds: number, utc: boolean): number {
  const date = new Date(seconds * 1000);
  return utc ? date.getUTCDay() : date.getDay();
}

/**
 * Les débuts des séances d'un cours répété. Seuls les rythmes d'un emploi du
 * temps sont calculés : tous les jours, toutes les semaines (avec ses jours).
 * Un autre rythme ne garde que la première séance — mieux vaut un cours
 * manquant qu'un cours inventé.
 */
function occurrences(
  start: number,
  rule: string,
  utc: boolean,
  until: number,
): number[] {
  const parts = new Map(
    rule.split(";").map((part) => {
      const [key, value = ""] = part.split("=");
      return [key.toUpperCase(), value.toUpperCase()] as const;
    }),
  );
  const freq = parts.get("FREQ");
  if (freq !== "DAILY" && freq !== "WEEKLY") return [start];
  const interval = Math.max(1, Number(parts.get("INTERVAL") ?? 1) || 1);
  const count = parts.has("COUNT") ? Number(parts.get("COUNT")) : Infinity;
  const ruleUntil = parts.has("UNTIL")
    ? (parseIcsDate(parts.get("UNTIL")!) ??
      parseIcsDate(`${parts.get("UNTIL")}T235959`))
    : null;
  const last = Math.min(until, ruleUntil ?? Infinity);
  const days =
    freq === "WEEKLY" && parts.get("BYDAY")
      ? parts
          .get("BYDAY")!
          .split(",")
          .map((day) => WEEKDAYS.indexOf(day.slice(-2)))
          .filter((day) => day >= 0)
      : [weekday(start, utc)];

  const found: number[] = [];
  if (freq === "DAILY") {
    for (let at = start, n = 0; at <= last && n < count; n += 1) {
      found.push(at);
      at = shiftDays(at, interval, utc);
    }
    return found;
  }
  // Semaine par semaine, depuis le dimanche de la première séance.
  let weekStart = shiftDays(start, -weekday(start, utc), utc);
  while (weekStart <= last && found.length < count) {
    for (const day of [...days].sort((a, b) => a - b)) {
      const at = shiftDays(weekStart, day, utc);
      if (at < start || at > last || found.length >= count) continue;
      found.push(at);
    }
    weekStart = shiftDays(weekStart, 7 * interval, utc);
  }
  return found;
}

/**
 * Les séances d'un fichier ICS, triées. Les séances annulées, les journées
 * entières et les événements sans fin sont écartés ; une séance déplacée
 * (RECURRENCE-ID) remplace celle qu'elle déplace ; une date exclue (EXDATE)
 * disparaît.
 */
export function parseIcs(
  text: string,
  now: number = Math.floor(Date.now() / 1000),
): CourseEvent[] {
  const raw: RawEvent[] = [];
  let current: RawEvent | null = null;
  for (const line of unfold(text)) {
    const upper = line.trim().toUpperCase();
    if (upper === "BEGIN:VEVENT") {
      current = new Map();
      continue;
    }
    if (upper === "END:VEVENT") {
      if (current) raw.push(current);
      current = null;
      continue;
    }
    if (!current) continue;
    const parsed = parseLine(line);
    if (!parsed) continue;
    const [name, property] = parsed;
    current.set(name, [...(current.get(name) ?? []), property]);
  }

  const from = now - PAST_DAYS * DAY;
  const until = now + FUTURE_DAYS * DAY;
  const moved = new Set<string>();
  const events: CourseEvent[] = [];

  // Les séances déplacées d'abord : elles retirent la séance d'origine.
  for (const event of raw) {
    const recurrence = first(event, "RECURRENCE-ID");
    const at = recurrence ? parseIcsDate(recurrence.value) : null;
    if (at !== null) moved.add(`${first(event, "UID")?.value ?? ""}@${at}`);
  }

  for (const event of raw) {
    if (first(event, "STATUS")?.value.toUpperCase() === "CANCELLED") continue;
    const startProperty = first(event, "DTSTART");
    const start = startProperty ? parseIcsDate(startProperty.value) : null;
    if (start === null || !startProperty) continue;
    const endProperty = first(event, "DTEND");
    const end = endProperty ? parseIcsDate(endProperty.value) : null;
    const length =
      end !== null
        ? end - start
        : parseDuration(first(event, "DURATION")?.value ?? "");
    if (!length || length <= 0) continue;

    const uid = first(event, "UID")?.value ?? "";
    const summary = unescapeText(first(event, "SUMMARY")?.value ?? "");
    if (!summary) continue;
    const location = unescapeText(first(event, "LOCATION")?.value ?? "");
    const utc = startProperty.value.trim().endsWith("Z");
    const rule = first(event, "RRULE")?.value;
    const isOverride = first(event, "RECURRENCE-ID") !== undefined;
    const starts =
      rule && !isOverride ? occurrences(start, rule, utc, until) : [start];
    const excluded = new Set(
      (event.get("EXDATE") ?? [])
        .flatMap((property) => property.value.split(","))
        .map(parseIcsDate)
        .filter((at): at is number => at !== null),
    );

    for (const at of starts) {
      if (at + length < from || at > until) continue;
      if (excluded.has(at)) continue;
      if (!isOverride && moved.has(`${uid}@${at}`)) continue;
      events.push({
        key: `${uid}@${at}`,
        start: at,
        end: at + length,
        summary,
        location,
      });
    }
  }
  return events.sort((a, b) => a.start - b.start || a.end - b.end);
}

// Une dictée faite juste avant le début ou juste après la fin appartient
// encore au cours : l'élève s'installe, ou finit sa phrase.
const BEFORE_START = 5 * 60;
const AFTER_END = 10 * 60;

/**
 * Le cours d'une dictée, ou `null`. Une séance qui contient vraiment la
 * dictée l'emporte sur une séance voisine dans la marge ; entre deux séances
 * qui se chevauchent, la plus récemment commencée.
 */
export function courseAt(
  events: readonly CourseEvent[],
  timestamp: number,
): CourseEvent | null {
  let inside: CourseEvent | null = null;
  let near: CourseEvent | null = null;
  for (const event of events) {
    if (event.start > timestamp + BEFORE_START) break;
    if (timestamp >= event.start && timestamp < event.end) {
      inside = event;
    } else if (
      timestamp >= event.start - BEFORE_START &&
      timestamp < event.end + AFTER_END
    ) {
      near = event;
    }
  }
  return inside ?? near;
}

/** Une suite de dictées faites pendant la même séance, ou hors de tout cours. */
export interface CourseRun {
  course: CourseEvent | null;
  entries: HistoryEntry[];
}

/**
 * Découpe une liste de dictées (dans l'ordre de l'historique) en suites
 * consécutives d'un même cours. L'ordre n'est jamais changé.
 */
export function courseRuns(
  entries: readonly HistoryEntry[],
  events: readonly CourseEvent[],
): CourseRun[] {
  const runs: CourseRun[] = [];
  for (const entry of entries) {
    const course = courseAt(events, entry.timestamp);
    const last = runs[runs.length - 1];
    if (last && (last.course?.key ?? null) === (course?.key ?? null)) {
      last.entries.push(entry);
    } else {
      runs.push({ course, entries: [entry] });
    }
  }
  return runs;
}

/** Un fichier qui ressemble à un calendrier ICS. */
export function looksLikeIcs(text: string): boolean {
  return /^\s*BEGIN:VCALENDAR/iu.test(text);
}
