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
  checkPayload,
  clamp,
  entryKey,
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
  forget,
  refuseMassRemoval,
  removedKeys,
  stamp,
  under,
  vanished,
  withoutJournal,
} from "../../src/sync";
import { save, saved, type Module } from "./api";
import { bookmarks, Mark } from "./bookmarks";
import { highlights, HlColor } from "./highlights";
import { Entry, journal } from "./journal";
import { plansStore } from "./plansStore";

/** The computer paired with: its name (as announced), where it was last found, and this device's id
 *  there and the key agreed when it paired. A pairing made before sync was encrypted has neither. */
export interface Paired {
  name: string;
  host: string;
  port: number;
  id: string;
  key: string;
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
  /** It must be paired again: paired before sync was encrypted, or forgotten by the computer. */
  needsPairing: boolean;
}

const pairedNow = saved<Paired | null>("syncPaired", null);
const oldPairing = !!pairedNow && (!pairedNow.id || !pairedNow.key);
let state: SyncState = {
  paired: pairedNow,
  last: saved("syncLast", 0),
  error: null,
  busy: false,
  needsPairing: oldPairing,
};
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
  for (const e of journal.get()) out[entryKey(e.id)] = e;
  return out;
}

/** What this device is called on the computer, and on a journal entry kept from both sides. */
export const deviceName = () => {
  const ua = navigator.userAgent;
  return /iPad|Macintosh/.test(ua) && navigator.maxTouchPoints > 1
    ? "iPad"
    : /iPhone/.test(ua)
      ? "iPhone"
      : /Android/.test(ua)
        ? "Android phone"
        : "Phone";
};

const placesNow = (): Place[] =>
  bookmarks.recent().map((m) =>
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

/** The ledger as saved: undefined when there's none yet (never synced), null when it couldn't be read
 *  (then nothing syncs, rather than start afresh over it). */
function readLedger(): Ledger | null | undefined {
  try {
    const text = localStorage.getItem("tes.syncLedger");
    if (text === null) return undefined;
    const l = JSON.parse(text) as unknown;
    return l && typeof l === "object" && !Array.isArray(l) ? (l as Ledger) : null;
  } catch {
    return null;
  }
}
const read = readLedger();
let ledger: Ledger | null = read === undefined ? {} : read;
/** Never synced: what's here is stamped as of long ago, so the computer's values win the first sync. */
let fresh = read === undefined;
if (read === null) invoke("log", { msg: "sync: the ledger couldn't be read; not syncing" }).catch(() => {});
/** What was here at the last look: something gone since was removed here on purpose (a sync's own
 *  changes are put in place with `applying` set, and reset it). Only those are synced as removed. */
let seen: Record<string, unknown> | null = null;
const removedHere = new Set<string>();
/** Set while a sync's journal is being written: the ledger isn't saved until it is. */
let holding = false;

/** Notes what's been removed here since the last look. */
function look() {
  const now = itemsNow();
  if (seen) for (const k of removedKeys(seen, now)) removedHere.add(k);
  seen = now;
  return now;
}

/** Notes what changed here since last time, and when. Not before the journal has been read: its
 *  entries would be taken for new. */
function note() {
  const now = look();
  if (!journal.loaded() || !ledger) return;
  // Something empty here that wasn't (a store reset, the journal's file lost) isn't taken for removed:
  // it's forgotten, and the computer sends it back.
  ledger = fresh ? stamp({}, now, new Set(), 0) : stamp(forget(ledger, vanished(ledger, now)), now, removedHere);
  fresh = false;
  removedHere.clear();
  if (!holding) save("syncLedger", ledger);
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
  look();
  journal.load().then(note, () => {});
  bookmarks.subscribe(changed);
  highlights.subscribe(changed);
  plansStore.subscribe(changed);
  journal.subscribe(changed);
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

/** A network error in plain words: the computer couldn't be reached (its own errors are already plain). */
export function plain(e: unknown, f: { host: string }): string {
  const m = String(e).replace(/^Error: /, "");
  if (/os error|Connection|connect|timed out|Network|dns|resolve/i.test(m))
    return `Couldn't reach the computer at ${f.host}. Check that Two-edged Sword is open on it and that both are on the same Wi-Fi.`;
  return m;
}

export const PAIR_AGAIN = "Sync is now encrypted, so this device needs to be paired with the computer again: tap Pair again.";
const FORGOTTEN = "The computer no longer knows this device. Tap Pair again.";

/** Pairs with a computer found, with the code its Settings shows: a key is agreed with it, and kept. */
export async function pair(f: Found, code: string, deviceName: string) {
  const r = await invoke<{ id: string; key: string; name: string }>("sync_pair", {
    url: url(f),
    code: code.trim(),
    name: deviceName,
  }).catch((e) => {
    throw new Error(plain(e, f));
  });
  // The computer's own name (as Bonjour announces it), so it can be found again by name even when it was
  // paired by its address.
  const paired: Paired = { name: r.name || f.name, host: f.host, port: f.port, id: r.id, key: r.key };
  save("syncPaired", paired);
  // A new pairing starts afresh: the computer's clock and this one's as of the last sync.
  save("syncSince", 0);
  save("syncSentAt", 0);
  set({ paired, error: null, needsPairing: false });
  await syncNow();
}

export function unpair() {
  save("syncPaired", null);
  save("syncJournal", false);
  save("syncLast", 0);
  set({ paired: null, last: 0, error: null, needsPairing: false });
}

let running: Promise<void> | null = null;
/** Asked for while one was under way: one more after it. */
let again = false;
/** One sync with the paired computer; found again (by name) if it has moved on the network. */
export function syncNow(): Promise<void> {
  if (!state.paired) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = run().finally(() => {
    running = null;
    if (again) {
      again = false;
      window.setTimeout(() => syncNow().catch(() => {}), 500);
    }
  });
  return running;
}

/** Each request's counter, higher every time (the computer refuses one it has seen). */
function nextCtr() {
  const n = Math.max(Date.now(), saved("syncCtr", 0) + 1);
  save("syncCtr", n);
  return n;
}

/** An encrypted request to the paired computer at `at`; answers its reply, checked and decrypted. */
const call = <T>(at: Paired, path: "/hello" | "/sync", body: unknown) =>
  invoke<T>("sync_call", { url: url(at), id: at.id, key: at.key, ctr: nextCtr(), path, body });

/** The computer paired with, looked for again: one found over Bonjour (by its name first) that proves it
 *  has this pairing's key, before anything else is sent to it. */
async function findAgain(p: Paired): Promise<Paired | null> {
  const found = await discover();
  for (const f of [...found.filter((x) => x.name === p.name), ...found.filter((x) => x.name !== p.name)]) {
    const at = { ...p, host: f.host, port: f.port };
    try {
      await call(at, "/hello", {});
      return at;
    } catch (e) {
      // The one paired with, which has forgotten this device: said as such.
      if (f.name === p.name && String(e).includes("not paired")) throw e;
      // Otherwise not the one paired with, or not answering.
    }
  }
  return null;
}

async function run() {
  const p = state.paired;
  if (!p) return;
  if (!p.id || !p.key) {
    set({ error: PAIR_AGAIN, needsPairing: true });
    return;
  }
  if (!ledger) {
    set({ error: "This device's sync records couldn't be read, so nothing was synced." });
    return;
  }
  set({ busy: true });
  try {
    await journal.load().catch(() => {
      throw new Error("The journal couldn't be read, so nothing was synced.");
    });
    note();
    if (!ledger) return;
    const sentAt = Date.now();
    // The journal only goes to a computer that has said it syncs it (an older one would delete it).
    const all = payload(ledger, itemsNow(), placesNow());
    const withJ = saved("syncJournal", false);
    // Changed here since the last sync, by this phone's own clock: for entries changed on both sides.
    const lastSent = saved("syncSentAt", 0);
    const changedHere = withJ ? Object.keys(all.items).filter((k) => k.startsWith("j|") && all.items[k].t > lastSent) : [];
    const mine: Payload = {
      ...all,
      items: withJ ? all.items : withoutJournal(all.items),
      since: saved("syncSince", 0),
      changed: changedHere,
      from: deviceName(),
      journal: true,
    };
    let reply: unknown;
    try {
      reply = await call(p, "/sync", mine);
    } catch (e) {
      if (String(e).includes("not paired")) throw e;
      // Not where it was: looked for again, and only used once it has shown it's the one paired with.
      const moved = await findAgain(p);
      if (!moved) throw new Error(`${p.name} isn't on this Wi-Fi, or Two-edged Sword isn't open on it.`, { cause: e });
      reply = await call(moved, "/sync", mine);
      save("syncPaired", moved);
      set({ paired: moved });
    }
    const checked = checkPayload(reply);
    if (!checked) throw new Error("The computer's answer couldn't be read.");
    if (checked.dropped.length) invoke("log", { msg: `sync: dropped ${checked.dropped.length} malformed items` }).catch(() => {});
    const merged = checked.payload;
    // The computer's clock may be ahead: nothing it sent is later than when this sync began here.
    const theirs: Payload = {
      ...merged,
      items: clamp(merged.items, sentAt),
      recent: merged.recent.map((x) => (x.at > sentAt ? { ...x, at: sentAt } : x)),
    };
    // The journal is only taken from the reply when this sync sent it too: otherwise the reply has the
    // computer's entries and not this phone's, and they'd be lost.
    const late = await apply(merge(mine, theirs), !!merged.journal && withJ, sentAt);
    save("syncSince", merged.serverNow ?? 0);
    save("syncSentAt", sentAt);
    const last = Date.now();
    save("syncLast", last);
    set({ last, error: null, busy: false, needsPairing: false });
    // Changes made while it was under way go next.
    if (late) {
      window.clearTimeout(soon);
      soon = window.setTimeout(() => syncNow().catch(() => {}), 4000);
    }
    // The computer syncs the journal: from now on it goes too, starting straight away.
    if (merged.journal && !withJ) {
      save("syncJournal", true);
      window.setTimeout(() => syncNow().catch(() => {}), 500);
    }
  } catch (e) {
    const msg = String(e).replace(/^Error: /, "");
    const forgotten = msg.includes("not paired");
    set({ busy: false, error: forgotten ? FORGOTTEN : plain(msg, p), needsPairing: forgotten });
  }
}

/** The merged result, kept here: each store replaced, and the ledger matched to it so nothing is
 *  taken for a change. What changed here while the sync was under way is kept over it, and synced next
 *  time. The journal is written before the ledger is kept: if it can't be, the ledger stays as it was.
 *  Answers whether anything changed here meanwhile. */
async function apply(m0: Payload, withJournal: boolean, sentAt: number): Promise<boolean> {
  note();
  const before = ledger ?? {};
  // Changed here since the request went: what's here now wins.
  const nowHere = itemsNow();
  const late = Object.entries(before).filter(([k, e]) => e.t > sentAt && (withJournal || !k.startsWith("j|")));
  const items = { ...m0.items };
  for (const [k, e] of late) items[k] = e.del ? { t: e.t, del: true } : k in nowHere ? { t: e.t, v: nowHere[k] } : items[k];
  // A result that would remove many of one kind here (the computer lost them) is refused: they're kept,
  // and sync back to it.
  const here = withJournal ? nowHere : Object.fromEntries(Object.entries(nowHere).filter(([k]) => !k.startsWith("j|")));
  const { merged: m, refused } = refuseMassRemoval(here, { ...m0, items });
  if (refused.size) invoke("log", { msg: `sync: would remove many ${[...refused].join(", ")}; kept` }).catch(() => {});
  const done = settle(withJournal ? m : { ...m, items: withoutJournal(m.items) });
  // Without the journal, its ledger entries stay as they were here.
  const next = withJournal
    ? done.ledger
    : { ...done.ledger, ...Object.fromEntries(Object.entries(before).filter(([k]) => k.startsWith("j|"))) };
  const marks = under(done.now, "bm|")
    .map(([, v]) => fromSync(v as SyncMark))
    .sort((a, b) => b.at.localeCompare(a.at));
  const recent = m.recent.slice(0, 30).map(fromPlace);
  let written: Promise<void> = Promise.resolve();
  applying = true;
  try {
    bookmarks.replace(marks, recent);
    highlights.replace(Object.fromEntries(under(done.now, "hl|")) as Record<string, HlColor>);
    const at = Object.fromEntries(under(done.now, "at|")) as Record<string, string>;
    for (const k of Object.keys(docAtNow())) if (!(k in at)) localStorage.removeItem(DOC_AT + k);
    for (const [k, t] of Object.entries(at)) save(`docAt.${k}`, t);
    plansStore.set(() => plansFrom(done.now));
    // Only from a sync that carried the journal both ways; otherwise what's here stays as it is.
    if (withJournal) written = journal.replace(under(done.now, "j|").map(([, v]) => v as Entry));
  } finally {
    applying = false;
  }
  seen = itemsNow();
  ledger = next;
  holding = true;
  try {
    await written;
  } catch (e) {
    // Not on disk: the ledger stays as it was, so this sync's changes aren't taken for done.
    ledger = before;
    throw new Error(`The journal couldn't be saved, so the sync wasn't finished: ${String(e).replace(/^Error: /, "")}`, { cause: e });
  } finally {
    holding = false;
  }
  // What changed here while the journal was written, noted on top; and the ledger kept.
  note();
  save("syncLedger", ledger);
  return late.length > 0 || Object.values(ledger ?? {}).some((e) => e.t > sentAt);
}
