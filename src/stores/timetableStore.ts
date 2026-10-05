import { create } from "zustand";

import { commands, type TimetableStatus } from "@/bindings";
import { parseIcs, type CourseEvent } from "@/lib/timetable";

/**
 * L'emploi du temps relié sur ce poste, lu une fois puis partagé par
 * l'historique et les réglages.
 *
 * Une erreur est un code court venu de `commands::timetable` (`unreachable`,
 * `not_calendar`…), traduit à l'affichage. Elle n'efface jamais les séances
 * déjà lues : un réseau absent ne doit pas faire disparaître les cours.
 */
interface TimetableState {
  status: TimetableStatus | null;
  events: CourseEvent[];
  busy: boolean;
  error: string | null;
  loaded: boolean;

  /** Lit l'emploi du temps ; `refresh` force la relecture par le lien. */
  load: (refresh?: boolean) => Promise<void>;
  connect: (link: string) => Promise<boolean>;
  importFile: (path: string) => Promise<boolean>;
  disconnect: () => Promise<void>;
}

const NO_STATUS: TimetableStatus = { source: null, updated_at: null };

export const useTimetableStore = create<TimetableState>()((set, get) => {
  /** Relit l'état et la copie locale après un changement. */
  const reload = async (refresh: boolean) => {
    const status = await commands.timetableStatus().catch(() => NO_STATUS);
    const result = await commands.timetableLoad(refresh);
    if (result.status === "error") {
      set({ status, error: result.error, loaded: true });
      return;
    }
    set({
      status: await commands.timetableStatus().catch(() => status),
      events: result.data ? parseIcs(result.data) : [],
      error: null,
      loaded: true,
    });
  };

  const run = async (work: () => Promise<boolean>): Promise<boolean> => {
    if (get().busy) return false;
    set({ busy: true, error: null });
    try {
      return await work();
    } catch {
      set({ error: "storage" });
      return false;
    } finally {
      set({ busy: false });
    }
  };

  return {
    status: null,
    events: [],
    busy: false,
    error: null,
    loaded: false,

    load: async (refresh = false) => {
      await run(async () => {
        await reload(refresh);
        return get().error === null;
      });
    },

    connect: (link) =>
      run(async () => {
        const result = await commands.timetableConnect(link);
        if (result.status === "error") {
          set({ error: result.error });
          return false;
        }
        await reload(false);
        return true;
      }),

    importFile: (path) =>
      run(async () => {
        const result = await commands.timetableImport(path);
        if (result.status === "error") {
          set({ error: result.error });
          return false;
        }
        await reload(false);
        return true;
      }),

    disconnect: async () => {
      await run(async () => {
        const result = await commands.timetableDisconnect();
        if (result.status === "error") {
          set({ error: result.error });
          return false;
        }
        set({ status: NO_STATUS, events: [] });
        return true;
      });
    },
  };
});
