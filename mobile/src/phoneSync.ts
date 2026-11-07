// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Sync with the desktop app on the same Wi-Fi (src/sync.ts merges; the desktop's sync.rs answers):
// bookmarks, highlights, reading plans, Recent and the chapter last read in each book. The computer is
// found over Bonjour (the tes-native plugin's discover), paired once with the code its Settings shows,
// and synced with at start, on coming forward, every five minutes while open, a few seconds after a
// change here, and from Settings.

import { invoke } from "@tauri-apps/api/core";
import { useSyncExternalStore } from "react";
import {
  Ledger,
  Mark as SyncMark,
  markKey,
  merge,
  Payload,
  payload,
  Place,
  planItems,
  plansFrom,
  settle,
  stamp,
  under,
} from "../../src/sync";
import { save, saved, type Module } from "./api";
import { bookmarks, Mark } from "./bookmarks";
import { highlights, HlColor } from "./highlights";
import { plansStore } from "./plansStore";

/** The computer paired with: its name (as announced), where it was last found, and this phone's token. */
export interface Paired {
  name: string;
  host: string;
  port: number;
  token: string;
}

interface Found {
  name: string;
  host: string;
  port: number;
}

export interface SyncState {
  paired: Paired | null;
  /** When it last synced (ms), or why it couldn't. */
  last: number;
  error: string | null;
  busy: boolean;
}

let state: SyncState = { paired: saved<Paired | null>("syncPaired", null), last: saved("syncLast", 0), error: null, busy: false };
const watchers = new Set<() => void>();
const set = (s: Partial<SyncState>) => {
  state = { ...state, ...s };
  watchers.forEach((w) => w());
};
export function useSync() {
  return useSyncExternalStore(
    (f) => {
      watchers.add(f);
      return () => watchers.delete(f);
    },
    () => state,
  );
}

// ---------- what the phone keeps, as items ----------

const DOC_AT = "tes.docAt.";

function docAtNow(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(DOC_AT)) out[k.slice(DOC_AT.length)] = JSON.parse(localStorage.getItem(k) ?? '""');
    }
  } catch {
    // Storage unavailable: nothing to sync.
  }
  return out;
}

const toSync = (m: Mark): SyncMark =>
  m.doc
    ? { module: m.doc.module, title: m.doc.chapter, para: m.doc.para ?? 1, ...(m.doc.kind ? { kind: m.doc.kind } : {}), created: m.at }
    : {
        book: m.ref!.book,
        chapter: m.ref!.chapter,
        ...(m.ref!.verse ? { verse: m.ref!.verse } : {}),
        ...(m.ref!.to && m.ref!.to !== m.ref!.verse ? { to: m.ref!.to } : {}),
        bible: m.bible ?? "",
        created: m.at,
      };

/** A book's title, for a bookmark or place that came from the desktop (which doesn't send it). */
const bookTitle = (module: string) => saved<Module[]>("modules", []).find((x) => x.id === module)?.title ?? module;

const fromSync = (m: SyncMark): Mark =>
  "module" in m
    ? {
        doc: {
          module: m.module,
          chapter: m.title,
          title: bookTitle(m.module),
          ...(m.para !== 1 ? { para: m.para } : {}),
          ...(m.kind ? { kind: m.kind } : {}),
        },
        at: m.created,
      }
    : { ref: { book: m.book, chapter: m.chapter, verse: m.verse ?? 0, ...(m.to ? { to: m.to } : {}) }, bible: m.bible, at: m.created };

function itemsNow(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const m of bookmarks.list()) {
    const s = toSync(m);
    out[markKey(s)] = s;
  }
  for (const [k, c] of Object.entries(highlights.get())) out[`hl|${k}`] = c;
  for (const [m, t] of Object.entries(docAtNow())) out[`at|${m}`] = t;
  for (const p of plansStore.get()) Object.assign(out, planItems(p));
  return out;
}

const placesNow = (): Place[] =>
  bookmarks
    .recent()
    .map((m) =>
      m.doc
        ? { at: Date.parse(m.at) || 0, module: m.doc.module, title: m.doc.chapter, ...(m.doc.kind ? { kind: m.doc.kind } : {}) }
        : {
            at: Date.parse(m.at) || 0,
            book: m.ref!.book,
            chapter: m.ref!.chapter,
            ...(m.ref!.verse ? { verse: m.ref!.verse } : {}),
            ...(m.bible ? { bible: m.bible } : {}),
          },
    );

const fromPlace = (p: Place): Mark =>
  p.module
    ? {
        doc: { module: p.module, chapter: p.title ?? "", title: bookTitle(p.module), ...(p.kind ? { kind: p.kind } : {}) },
        at: new Date(p.at).toISOString(),
      }
    : {
        ref: { book: p.book ?? 1, chapter: p.chapter ?? 1, verse: p.verse ?? 1 },
        ...(p.bible ? { bible: p.bible } : {}),
        at: new Date(p.at).toISOString(),
      };

// ---------- the ledger: when each thing last changed here ----------

let ledger: Ledger = saved<Ledger>("syncLedger", {});
/** Notes what changed here since last time, and when. */
function note() {
  ledger = stamp(ledger, itemsNow());
  save("syncLedger", ledger);
}
let soon: number | undefined;
/** Set while a sync's result is being put in place: that isn't a change made here. */
let applying = false;
/** A change here: noted now, and synced a few seconds later (so a run of ticks goes as one). */
function changed() {
  if (applying) return;
  note();
  window.clearTimeout(soon);
  soon = window.setTimeout(() => syncNow().catch(() => {}), 4000);
}

/** Starts watching for changes, and syncs now; again whenever the app comes forward. */
export function startSync() {
  note();
  bookmarks.subscribe(changed);
  highlights.subscribe(changed);
  plansStore.subscribe(changed);
  window.addEventListener("tes-docat", changed);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && syncNow().catch(() => {}));
  // While it's open, every five minutes too, for changes made on the computer.
  window.setInterval(() => document.visibilityState === "visible" && syncNow().catch(() => {}), 5 * 60_000);
  syncNow().catch(() => {});
}

// ---------- the computer ----------

/** Computers on this Wi-Fi with the app open, found over Bonjour for a few seconds. */
const discoverOnce = () =>
  invoke<Found[] | { list: Found[] }>("plugin:tes-native|discover")
    .then((r) => (Array.isArray(r) ? r : (r?.list ?? [])))
    .catch(() => [] as Found[]);
/** Looked for twice if need be: the first search can be lost to the "local network" permission prompt. */
export const discover = async () => {
  const f = await discoverOnce();
  return f.length ? f : discoverOnce();
};

const url = (f: { host: string; port: number }) => `http://${f.host.includes(":") ? `[${f.host}]` : f.host}:${f.port}`;

/** Pairs with a computer found, with the code its Settings shows. */
export async function pair(f: Found, code: string, deviceName: string) {
  const r = await invoke<{ token: string; name: string }>("sync_pair", { url: url(f), code: code.trim(), name: deviceName });
  // The computer's own name (as Bonjour announces it), so it can be found again by name even when it was
  // paired by its address.
  const paired = { name: r.name || f.name, host: f.host, port: f.port, token: r.token };
  save("syncPaired", paired);
  set({ paired, error: null });
  await syncNow();
}

export function unpair() {
  save("syncPaired", null);
  save("syncLast", 0);
  set({ paired: null, last: 0, error: null });
}

let running: Promise<void> | null = null;
/** One sync with the paired computer; found again (by name) if it has moved on the network. */
export function syncNow(): Promise<void> {
  if (!state.paired) return Promise.resolve();
  if (!running)
    running = run().finally(() => {
      running = null;
    });
  return running;
}

async function post(p: Paired, body: Payload): Promise<Payload> {
  return invoke<Payload>("sync_post", { url: url(p), token: p.token, payload: body });
}

async function run() {
  const p = state.paired;
  if (!p) return;
  set({ busy: true });
  try {
    note();
    const mine = payload(ledger, itemsNow(), placesNow());
    let merged: Payload;
    try {
      merged = await post(p, mine);
    } catch (e) {
      if (String(e).includes("not paired")) throw e;
      // Not where it was: look for it again by name.
      const f = (await discover()).find((x) => x.name === p.name);
      if (!f) throw new Error(`${p.name} isn't on this Wi-Fi, or Two-edged Sword isn't open on it.`);
      const moved = { ...p, host: f.host, port: f.port };
      save("syncPaired", moved);
      set({ paired: moved });
      merged = await post(moved, mine);
    }
    apply(merge(mine, merged));
    const last = Date.now();
    save("syncLast", last);
    set({ last, error: null, busy: false });
  } catch (e) {
    const msg = String(e).replace(/^Error: /, "");
    set({ busy: false, error: msg.includes("not paired") ? "The computer no longer knows this device. Pair again." : msg });
  }
}

/** The merged result, kept here: each store replaced, and the ledger matched to it so nothing is
 *  taken for a change. */
function apply(m: Payload) {
  const done = settle(m);
  ledger = done.ledger;
  save("syncLedger", ledger);
  const marks = under(done.now, "bm|")
    .map(([, v]) => fromSync(v as SyncMark))
    .sort((a, b) => b.at.localeCompare(a.at));
  const recent = m.recent.slice(0, 30).map(fromPlace);
  applying = true;
  try {
    bookmarks.replace(marks, recent);
    highlights.replace(Object.fromEntries(under(done.now, "hl|")) as Record<string, HlColor>);
    const at = Object.fromEntries(under(done.now, "at|")) as Record<string, string>;
    for (const k of Object.keys(docAtNow())) if (!(k in at)) localStorage.removeItem(DOC_AT + k);
    for (const [k, t] of Object.entries(at)) save(`docAt.${k}`, t);
    plansStore.set(() => plansFrom(done.now));
  } finally {
    applying = false;
  }
  window.clearTimeout(soon);
}
