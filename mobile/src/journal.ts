// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// The journal on the phone: the desktop's entries (src/sync.ts Entry), kept as JSON in the app's data
// folder (lib.rs journal_read and journal_write) and synced with the desktop as they are (phoneSync.ts).
// Read once at start; sync waits for that, or it would take a journal not yet read for an empty one.
// A change made before it's read waits for the read, and is then made on what was read.

import { invoke } from "@tauri-apps/api/core";
import { useSyncExternalStore } from "react";
import { mentionsPassage, Ref } from "../../src/bible";
import { entryKey, validValue, type Entry } from "../../src/sync";

export type { Entry };

let all: Entry[] = [];
let loaded = false;
let ready: Promise<void> | null = null;
/** Why the journal couldn't be read or saved, for the screens to say. */
let error: string | null = null;
/** Changes made before the journal was read: made on it once it is. */
let early: ((es: Entry[]) => Entry[])[] = [];
const watchers = new Set<() => void>();
const notify = () => watchers.forEach((w) => w());
const log = (msg: string) => invoke("log", { msg }).catch(() => {});

const byNewest = (a: Entry, b: Entry) => b.created.localeCompare(a.created);

// Writes, one after another: each writes the journal as it is when its turn comes.
let chain: Promise<void> = Promise.resolve();
let writeTimer: number | undefined;
/** Writes the journal now, after any write under way; resolves once it's on disk. */
const writeNow = (): Promise<void> => {
  window.clearTimeout(writeTimer);
  writeTimer = undefined;
  const run = chain.then(() => invoke<void>("journal_write", { text: JSON.stringify(all) }));
  chain = run.then(
    () => {
      if (error?.startsWith("Couldn't save")) {
        error = null;
        notify();
      }
    },
    (e) => {
      log(`journal: ${e}`);
      error = `Couldn't save the journal: ${String(e).replace(/^Error: /, "")}`;
      notify();
    },
  );
  return run;
};
/** A write a moment after the last change, so a run of them goes as one. */
const write = () => {
  window.clearTimeout(writeTimer);
  writeTimer = window.setTimeout(() => void writeNow().catch(() => {}), 300);
};

/** Local time as the desktop writes it, "2026-09-23T07:02". */
export const nowLocal = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
/** An id as the desktop makes them (state.tsx uid). */
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/** The entries read, without any that aren't entries (a damaged or hand-edited file). */
function entriesOf(es: unknown[]): Entry[] {
  const ok = es.filter((e): e is Entry => validValue(entryKey(String((e as Entry)?.id)), e));
  if (ok.length < es.length) log(`journal: ${es.length - ok.length} entries that couldn't be read were left out`);
  return ok.sort(byNewest);
}

/** Read; then the changes made meanwhile. */
function loadedWith(es: Entry[]) {
  all = es;
  for (const f of early) all = f(all);
  const changed = early.length > 0;
  early = [];
  loaded = true;
  notify();
  if (changed) write();
}

/** A change: made now if the journal has been read, otherwise once it has. */
function change(f: (es: Entry[]) => Entry[]) {
  if (!loaded) {
    early.push(f);
    journal.load().catch(() => {});
    return;
  }
  all = f(all);
  write();
  notify();
}

export const journal = {
  /** Reads the journal once; resolves when it has been read. A file that can't be read is moved aside
   *  (kept, as journal.json.bad-…) and the journal starts again empty, with an error to say so; the
   *  computer's sync then brings back what it has. */
  load(): Promise<void> {
    if (!ready)
      ready = invoke<string>("journal_read")
        .then((t) => {
          const es = JSON.parse(t) as unknown;
          if (!Array.isArray(es)) throw new Error("not a list of entries");
          loadedWith(entriesOf(es));
        })
        .catch(async (e) => {
          log(`journal: couldn't read it: ${e}`);
          const kept = await invoke<string>("journal_set_aside").catch((e2) => {
            // Not moved: nothing is written over it. Tried again on the next load.
            ready = null;
            error = `The journal couldn't be read: ${String(e2).replace(/^Error: /, "")}`;
            notify();
            throw e;
          });
          error = `The journal couldn't be read, so a new one was started. The old file was kept as ${kept}.`;
          loadedWith([]);
        });
    return ready;
  },
  loaded: () => loaded,
  /** Why the journal couldn't be read or saved; null when all is well. */
  error: () => error,
  get: () => all,
  find: (id: string) => all.find((e) => e.id === id),
  /** Adds or replaces an entry. */
  save(e: Entry) {
    change((es) => [e, ...es.filter((x) => x.id !== e.id)].sort(byNewest));
  },
  remove(id: string) {
    change((es) => es.filter((x) => x.id !== id));
  },
  /** After a sync: the merged entries, here at once; resolves once they're on disk (sync keeps its
   *  ledger only then). */
  replace(es: Entry[]): Promise<void> {
    if (!loaded) return Promise.reject(new Error("The journal hasn't been read."));
    all = [...es].sort(byNewest);
    notify();
    return writeNow();
  },
  /** Writes a change still waiting (the app going to the background). */
  flush(): Promise<void> {
    return writeTimer !== undefined ? writeNow() : chain;
  },
  subscribe(f: () => void) {
    watchers.add(f);
    return () => {
      watchers.delete(f);
    };
  },
};

// A change still waiting is written when the app goes to the background, where it may be closed.
const away = () => void journal.flush().catch(() => {});
document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && away());
window.addEventListener("pagehide", away);

export function useJournal() {
  return useSyncExternalStore(journal.subscribe, journal.get);
}

/** The journal's error, if any, for a screen to show. */
export function useJournalError() {
  return useSyncExternalStore(journal.subscribe, journal.error);
}

/** The entries on a passage (a verse, or a chapter), newest first. */
export const entriesOn = (es: Entry[], at: Ref) => es.filter((e) => mentionsPassage(e, at));
