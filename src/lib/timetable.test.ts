import { describe, expect, test } from "bun:test";
import type { HistoryEntry } from "@/bindings";
import {
  courseAt,
  courseRuns,
  looksLikeIcs,
  parseIcs,
  parseIcsDate,
} from "./timetable";

/** Une heure locale du poste, en secondes : les tests valent dans tout fuseau. */
function local(y: number, mo: number, d: number, h: number, mi = 0): number {
  return Math.floor(new Date(y, mo - 1, d, h, mi).getTime() / 1000);
}

const NOW = local(2026, 10, 5, 12);

function calendar(...events: string[]): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ADE//FR",
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

let id = 0;
function entry(timestamp: number): HistoryEntry {
  id += 1;
  return {
    id,
    file_name: `handy-${timestamp}.wav`,
    timestamp,
    saved: false,
    title: "",
    transcription_text: `dictée ${id}`,
    post_processed_text: null,
    post_process_prompt: null,
    post_process_requested: false,
  } as HistoryEntry;
}

describe("emploi du temps", () => {
  test("les dates ICS : locale, universelle, journée entière", () => {
    expect(parseIcsDate("20261005T083000")).toBe(local(2026, 10, 5, 8, 30));
    expect(parseIcsDate("20261005T063000Z")).toBe(
      Date.UTC(2026, 9, 5, 6, 30) / 1000,
    );
    expect(parseIcsDate("20261005")).toBeNull();
  });

  test("une séance d'ADE, avec ses lignes repliées et ses échappements", () => {
    const events = parseIcs(
      calendar(
        "BEGIN:VEVENT",
        "UID:ade-1",
        "DTSTART;TZID=Europe/Paris:20261005T083000",
        "DTEND;TZID=Europe/Paris:20261005T103000",
        "SUMMARY:Mécanique des fluides\\, CM",
        "LOCATION:Amphi A",
        "DESCRIPTION:Groupe A\\nM. Martin",
        " (suite repliée)",
        "END:VEVENT",
      ),
      NOW,
    );
    expect(events).toEqual([
      {
        key: `ade-1@${local(2026, 10, 5, 8, 30)}`,
        start: local(2026, 10, 5, 8, 30),
        end: local(2026, 10, 5, 10, 30),
        summary: "Mécanique des fluides, CM",
        location: "Amphi A",
      },
    ]);
  });

  test("une ligne repliée au milieu du titre est recollée", () => {
    const [event] = parseIcs(
      calendar(
        "BEGIN:VEVENT",
        "UID:x",
        "DTSTART:20261005T083000",
        "DURATION:PT1H30M",
        "SUMMARY:Transformée de La",
        " place",
        "END:VEVENT",
      ),
      NOW,
    );
    expect(event.summary).toBe("Transformée de Laplace");
    expect(event.end - event.start).toBe(5400);
  });

  test("annulée, journée entière ou sans fin : pas une séance", () => {
    const events = parseIcs(
      calendar(
        "BEGIN:VEVENT",
        "UID:a",
        "DTSTART:20261005T083000",
        "DTEND:20261005T100000",
        "SUMMARY:Annulé",
        "STATUS:CANCELLED",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:b",
        "DTSTART;VALUE=DATE:20261005",
        "DTEND;VALUE=DATE:20261006",
        "SUMMARY:Journée portes ouvertes",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:c",
        "DTSTART:20261005T083000",
        "SUMMARY:Sans fin",
        "END:VEVENT",
      ),
      NOW,
    );
    expect(events).toEqual([]);
  });

  test("un cours hebdomadaire d'Outlook : séances, exclusion, déplacement", () => {
    const events = parseIcs(
      calendar(
        "BEGIN:VEVENT",
        "UID:maths",
        "DTSTART;TZID=Romance Standard Time:20260914T140000",
        "DTEND;TZID=Romance Standard Time:20260914T160000",
        "RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261019T235959Z",
        "EXDATE;TZID=Romance Standard Time:20260928T140000",
        "SUMMARY:Analyse",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:maths",
        "RECURRENCE-ID;TZID=Romance Standard Time:20261005T140000",
        "DTSTART;TZID=Romance Standard Time:20261006T100000",
        "DTEND;TZID=Romance Standard Time:20261006T120000",
        "SUMMARY:Analyse (déplacé)",
        "END:VEVENT",
      ),
      NOW,
    );
    expect(events.map((event) => [event.start, event.summary])).toEqual([
      [local(2026, 9, 14, 14), "Analyse"],
      [local(2026, 9, 21, 14), "Analyse"],
      // Le 28 est exclu ; le 5 octobre est déplacé au 6.
      [local(2026, 10, 6, 10), "Analyse (déplacé)"],
      [local(2026, 10, 12, 14), "Analyse"],
      [local(2026, 10, 19, 14), "Analyse"],
    ]);
  });

  test("plusieurs jours par semaine, et un nombre de séances", () => {
    const events = parseIcs(
      calendar(
        "BEGIN:VEVENT",
        "UID:td",
        "DTSTART:20261005T080000",
        "DTEND:20261005T090000",
        "RRULE:FREQ=WEEKLY;BYDAY=MO,TH;COUNT=3",
        "SUMMARY:TD",
        "END:VEVENT",
      ),
      NOW,
    );
    expect(events.map((event) => event.start)).toEqual([
      local(2026, 10, 5, 8),
      local(2026, 10, 8, 8),
      local(2026, 10, 12, 8),
    ]);
  });

  test("le passage à l'heure d'hiver garde l'heure du cours", () => {
    const events = parseIcs(
      calendar(
        "BEGIN:VEVENT",
        "UID:dst",
        "DTSTART;TZID=Europe/Paris:20261019T140000",
        "DTEND;TZID=Europe/Paris:20261019T160000",
        "RRULE:FREQ=WEEKLY;COUNT=3",
        "SUMMARY:Analyse",
        "END:VEVENT",
      ),
      NOW,
    );
    expect(events.map((event) => [event.start, event.end])).toEqual([
      [local(2026, 10, 19, 14), local(2026, 10, 19, 16)],
      [local(2026, 10, 26, 14), local(2026, 10, 26, 16)],
      [local(2026, 11, 2, 14), local(2026, 11, 2, 16)],
    ]);
  });

  test("un rythme inconnu ne garde que la première séance", () => {
    const events = parseIcs(
      calendar(
        "BEGIN:VEVENT",
        "UID:m",
        "DTSTART:20261005T080000",
        "DTEND:20261005T090000",
        "RRULE:FREQ=MONTHLY;COUNT=5",
        "SUMMARY:Conseil",
        "END:VEVENT",
      ),
      NOW,
    );
    expect(events).toHaveLength(1);
  });

  test("le cours d'une dictée, avec une marge autour de la séance", () => {
    const events = parseIcs(
      calendar(
        "BEGIN:VEVENT",
        "UID:1",
        "DTSTART:20261005T083000",
        "DTEND:20261005T103000",
        "SUMMARY:Fluides",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:2",
        "DTSTART:20261005T104500",
        "DTEND:20261005T124500",
        "SUMMARY:Anglais",
        "END:VEVENT",
      ),
      NOW,
    );
    const at = (h: number, mi: number) =>
      courseAt(events, local(2026, 10, 5, h, mi))?.summary ?? null;
    expect(at(9, 0)).toBe("Fluides");
    expect(at(8, 27)).toBe("Fluides");
    expect(at(10, 35)).toBe("Fluides");
    // 10 h 42 : dans la marge des deux cours, celui qui commence l'emporte.
    expect(at(10, 42)).toBe("Anglais");
    expect(at(11, 0)).toBe("Anglais");
    expect(at(8, 0)).toBeNull();
    expect(at(13, 0)).toBeNull();
  });

  test("les dictées sont regroupées par séance, sans changer leur ordre", () => {
    const events = parseIcs(
      calendar(
        "BEGIN:VEVENT",
        "UID:1",
        "DTSTART:20261005T083000",
        "DTEND:20261005T103000",
        "SUMMARY:Fluides",
        "END:VEVENT",
      ),
      NOW,
    );
    const entries = [
      entry(local(2026, 10, 5, 18)),
      entry(local(2026, 10, 5, 10)),
      entry(local(2026, 10, 5, 9)),
      entry(local(2026, 10, 5, 7)),
    ];
    const runs = courseRuns(entries, events);
    expect(
      runs.map((run) => [
        run.course?.summary ?? null,
        run.entries.map((e) => e.id),
      ]),
    ).toEqual([
      [null, [entries[0].id]],
      ["Fluides", [entries[1].id, entries[2].id]],
      [null, [entries[3].id]],
    ]);
  });

  test("seul un calendrier est accepté", () => {
    expect(looksLikeIcs("BEGIN:VCALENDAR\r\nEND:VCALENDAR")).toBe(true);
    expect(looksLikeIcs("<html>Connexion</html>")).toBe(false);
  });
});
