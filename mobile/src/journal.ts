// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// The journal on the phone: the desktop's entries (src/sync.ts Entry), kept as JSON in the app's data
// folder (lib.rs journal_read and journal_write) and synced with the desktop as they are (phoneSync.ts).
// Read once at start; sync waits for that, or it would take a journal not yet read for an empty one.

import { invoke } from "@tauri-apps/api/core";
import { useSyncExternalStore } from "react";
import { mentionsPassage, Ref } from "../../src/bible";
import type { Entry } from "../../src/sync";

export type { Entry };

let all: Entry[] = [];
let loaded = false;
let ready: Promise<void> | null = null;
const watchers = new Set<() => void>();

const byNewest = (a: Entry, b: Entry) => b.created.localeCompare(a.created);

let writeTimer: number | undefined;
const write = () => {
  window.clearTimeout(writeTimer);
  writeTimer = window.setTimeout(
    () => invoke("journal_write", { text: JSON.stringify(all) }).catch((e) => invoke("log", { msg: `journal: ${e}` })),
    300,
  );
};

/** Local time as the desktop writes it, "2026-09-23T07:02". */
export const nowLocal = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
/** An id as the desktop makes them (state.tsx uid). */
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const journal = {
  /** Reads the journal once; resolves when it has been read. */
  load(): Promise<void> {
    if (!ready)
      ready = invoke<string>("journal_read")
        .then((t) => {
          const es = JSON.parse(t) as Entry[];
          all = Array.isArray(es) ? es.sort(byNewest) : [];
          loaded = true;
          watchers.forEach((w) => w());
        })
        .catch((e) => {
          ready = null;
          throw e;
        });
    return ready;
  },
  loaded: () => loaded,
  get: () => all,
  find: (id: string) => all.find((e) => e.id === id),
  /** Adds or replaces an entry. */
  save(e: Entry) {
    if (!loaded) return;
    all = [e, ...all.filter((x) => x.id !== e.id)].sort(byNewest);
    write();
    watchers.forEach((w) => w());
  },
  remove(id: string) {
    if (!loaded) return;
    all = all.filter((x) => x.id !== id);
    write();
    watchers.forEach((w) => w());
  },
  /** After a sync: the merged entries. */
  replace(es: Entry[]) {
    if (!loaded) return;
    all = [...es].sort(byNewest);
    write();
    watchers.forEach((w) => w());
  },
  subscribe(f: () => void) {
    watchers.add(f);
    return () => {
      watchers.delete(f);
    };
  },
};

export function useJournal() {
  return useSyncExternalStore(journal.subscribe, journal.get);
}

/** The entries on a passage (a verse, or a chapter), newest first. */
export const entriesOn = (es: Entry[], at: Ref) => es.filter((e) => mentionsPassage(e, at));
