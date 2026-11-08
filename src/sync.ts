// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Sync between the desktop app and the phone app (mobile/): bookmarks, highlights, where you are in each
// book, reading plans and their progress, and Recent. Shared by both, so they merge the same way.
//
// Each side turns what it keeps into items, one per thing that can change on its own: a bookmark, a
// highlight, a plan's settings, each day of a plan read. A ledger remembers each item's value as last seen
// and when it changed; an item gone since is kept as removed (with when), so a removal spreads too. A sync
// sends the items, the Mac keeps the newer of each, and both take the result. Recent is a list merged by
// when each place was read.

import type { Plan } from "./plans";

/** One item as sent: its value, or that it was removed; and when that happened (ms since 1970). */
export interface Item {
  t: number;
  v?: unknown;
  del?: true;
}
export type Items = Record<string, Item>;

/** A place read lately: a Bible chapter (and verse) or a book's chapter. */
export interface Place {
  at: number;
  book?: number;
  chapter?: number;
  verse?: number;
  to?: number;
  bible?: string;
  module?: string;
  /** A book's chapter title, and the kind of book ("reference", "devotional"). */
  title?: string;
  kind?: string;
}

/** What a sync carries each way. */
export interface Payload {
  v: 1;
  /** From a phone: when it last synced (ms), and what it's called; for journal entries changed on both
   *  sides since then, which are both kept (keepBoth). */
  since?: number;
  from?: string;
  /** Set by a side that syncs the journal. Journal items only go to a side that sets it: one without
   *  the journal would take every entry for removed on its next sync and delete them everywhere. */
  journal?: true;
  items: Items;
  recent: Place[];
}

/** What a side remembers between syncs: each item's value (as text) and when it last changed. */
export type Ledger = Record<string, { t: number; h?: string; del?: true }>;

/** JSON with object keys sorted, so the same value always reads the same. */
export function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v as object)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v);
}

/** A short fingerprint of a long text (cyrb53), so the ledger doesn't keep a copy of every journal entry. */
function hash(s: string): string {
  let h1 = 0xdeadbeef,
    h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + s.length.toString(36);
}

/** What the ledger keeps of a value to know it again: the value as text, or (a long one) its hash. Short
 *  values stay as they were, so ledgers written before this read the same. */
export function fingerprint(v: unknown): string {
  const s = stable(v);
  return s.length > 200 ? `#${hash(s)}` : s;
}

/** A removal is remembered this long, for a device that syncs rarely. */
const KEEP_REMOVED = 180 * 86_400_000;

/** The ledger brought up to date with what the side has now: a new or changed item is stamped `now`,
 *  one gone is marked removed at `now`. */
export function stamp(ledger: Ledger, now: Record<string, unknown>, at = Date.now()): Ledger {
  const out: Ledger = {};
  for (const [k, v] of Object.entries(now)) {
    const h = fingerprint(v);
    const was = ledger[k];
    out[k] = was && !was.del && was.h === h ? was : { t: at, h };
  }
  for (const [k, was] of Object.entries(ledger)) {
    if (k in now) continue;
    if (was.del) {
      if (at - was.t < KEEP_REMOVED) out[k] = was;
    } else out[k] = { t: at, del: true };
  }
  return out;
}

/** What to send: each item's value, or that it was removed. */
export function payload(ledger: Ledger, now: Record<string, unknown>, recent: Place[]): Payload {
  const items: Items = {};
  for (const [k, e] of Object.entries(ledger)) items[k] = e.del ? { t: e.t, del: true } : { t: e.t, v: now[k] };
  return { v: 1, items, recent };
}

/** Two sides' items: the newer of each. */
export function mergeItems(a: Items, b: Items): Items {
  const out: Items = { ...a };
  for (const [k, e] of Object.entries(b)) if (!out[k] || e.t > out[k].t) out[k] = e;
  return out;
}

const placeKey = (p: Place) => (p.module ? `d|${p.module}|${p.title}` : `v|${p.book}.${p.chapter}`);

/** Two Recent lists as one: once per chapter, the latest read first. */
export function mergeRecent(a: Place[], b: Place[], max = 50): Place[] {
  const by = new Map<string, Place>();
  for (const p of [...a, ...b]) {
    const k = placeKey(p);
    const was = by.get(k);
    if (!was || p.at > was.at) by.set(k, p);
  }
  return [...by.values()].sort((x, y) => y.at - x.at).slice(0, max);
}

export function merge(a: Payload, b: Payload): Payload {
  return { v: 1, items: mergeItems(a.items, b.items), recent: mergeRecent(a.recent, b.recent) };
}

// ---------- guards against a mistake spreading ----------
// A side that reads something as empty by mistake (a file it couldn't read, a store not loaded yet) would
// otherwise take every item in it for removed and spread that to every device. Both sides apply these.

/** The most items of one group a sync may remove, or one side may find gone before taking it for empty. */
export const SYNC_LIMIT = 10;

/** The group an item's removals are counted in: its kind (bm, hl, at, j, plan), a plan's days by plan. */
export function groupOf(k: string): string {
  if (k.startsWith("pd|")) return k.slice(0, k.indexOf("|", 3));
  return k.slice(0, k.indexOf("|"));
}
/** For "empty by mistake": plans and their days together, as a plan has few items of its own. */
const vanishGroup = (k: string) => (k.startsWith("pd|") || k.startsWith("plan|") ? "plans" : groupOf(k));

/** The groups that are empty here now although the ledger knew more than SYNC_LIMIT items in them:
 *  taken for unread or lost, not emptied on purpose. */
export function vanished(ledger: Ledger, now: Record<string, unknown>): Set<string> {
  const known = new Map<string, number>();
  for (const [k, e] of Object.entries(ledger)) if (!e.del) known.set(vanishGroup(k), (known.get(vanishGroup(k)) ?? 0) + 1);
  const here = new Set(Object.keys(now).map(vanishGroup));
  return new Set([...known].filter(([g, n]) => n > SYNC_LIMIT && !here.has(g)).map(([g]) => g));
}

/** The ledger with the given groups forgotten: nothing in them is then taken for removed, and the other
 *  side sends them back. */
export const forget = (ledger: Ledger, groups: Set<string>): Ledger =>
  groups.size ? Object.fromEntries(Object.entries(ledger).filter(([k]) => !groups.has(vanishGroup(k)))) : ledger;

/** The groups in which a sync's result would remove more than SYNC_LIMIT of the items here. A plan's days
 *  don't count when the plan itself goes too (a plan deleted). */
export function overRemoved(here: Record<string, unknown>, next: Record<string, unknown>): Set<string> {
  const n = new Map<string, number>();
  for (const k of Object.keys(here)) {
    if (k in next) continue;
    if (k.startsWith("pd|")) {
      const plan = `plan|${k.split("|")[1]}`;
      if (plan in here && !(plan in next)) continue;
    }
    n.set(groupOf(k), (n.get(groupOf(k)) ?? 0) + 1);
  }
  return new Set([...n].filter(([, c]) => c > SYNC_LIMIT).map(([g]) => g));
}

/** A sync's result with what's here kept for the given groups (their removals refused, additions kept). */
export function keepGroups(here: Record<string, unknown>, next: Record<string, unknown>, groups: Set<string>): Record<string, unknown> {
  if (!groups.size) return next;
  const out = { ...next };
  for (const [k, v] of Object.entries(here)) if (groups.has(groupOf(k)) && !(k in out)) out[k] = v;
  return out;
}

/** A sync's merged result with any mass removal refused: in each group where it would remove more than
 *  SYNC_LIMIT of what's here, what's here goes back in, stamped now, so it wins and syncs back to the other
 *  side too. Answers the groups refused. */
export function refuseMassRemoval(
  here: Record<string, unknown>,
  merged: Payload,
  at = Date.now(),
): { merged: Payload; refused: Set<string> } {
  const next = settle(merged).now;
  const refused = overRemoved(here, next);
  if (!refused.size) return { merged, refused };
  const items = { ...merged.items };
  for (const [k, v] of Object.entries(here)) if (refused.has(groupOf(k)) && !(k in next)) items[k] = { t: at, v };
  return { merged: { ...merged, items }, refused };
}

// ---------- the journal ----------

/** A journal entry as both sides keep it (the desktop's journal.rs Entry). */
export interface Entry {
  id: string;
  title: string;
  /** Local time, "2026-09-23T07:02". */
  created: string;
  updated: string;
  /** References as written, "John 3:1-8". */
  verses: string[];
  tags: string[];
  /** Markdown. */
  body: string;
}

export const entryKey = (id: string) => `j|${id}`;

/** The items without the journal's, for a side that doesn't sync it. */
export const withoutJournal = (items: Items): Items => Object.fromEntries(Object.entries(items).filter(([k]) => !k.startsWith("j|")));

/** An entry's id for a copy: unique, and close to the desktop's own (state.tsx uid). */
const copyId = (id: string) => `${id}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** On the computer, before merging a phone's items with its own: a journal entry changed on both since
 *  the phone last synced is kept twice rather than one edit lost. The computer's keeps its id and is
 *  stamped newest, so it wins everywhere; the phone's comes back as a new entry, "Title (from iPhone)". */
export function keepBoth(mine: Items, theirs: Payload): Items {
  const since = theirs.since ?? 0;
  const out: Items = { ...theirs.items };
  for (const [k, e] of Object.entries(theirs.items)) {
    const m = mine[k];
    if (!k.startsWith("j|") || !m || m.del || e.del || m.t <= since || e.t <= since) continue;
    if (stable(m.v) === stable(e.v)) continue;
    const v = e.v as Entry;
    const id = copyId(v.id);
    out[entryKey(id)] = { t: e.t, v: { ...v, id, title: `${v.title || "Untitled"} (from ${theirs.from || "phone"})` } };
    // The computer's own wins: theirs is dropped and its own stamped newer than either.
    delete out[k];
    mine[k] = { ...m, t: Math.max(m.t, e.t) + 1 };
  }
  return out;
}

/** After a sync: the values to keep (removed ones left out), and the ledger that matches them. */
export function settle(p: Payload): { now: Record<string, unknown>; ledger: Ledger } {
  const now: Record<string, unknown> = {};
  const ledger: Ledger = {};
  for (const [k, e] of Object.entries(p.items)) {
    if (e.del) ledger[k] = { t: e.t, del: true };
    else {
      now[k] = e.v;
      ledger[k] = { t: e.t, h: fingerprint(e.v) };
    }
  }
  return { now, ledger };
}

/** The items under a prefix ("bm|"), their keys without it. */
export function under(now: Record<string, unknown>, prefix: string): [string, unknown][] {
  return Object.entries(now)
    .filter(([k]) => k.startsWith(prefix))
    .map(([k, v]) => [k.slice(prefix.length), v]);
}

// ---------- bookmarks ----------

/** A bookmark as both sides understand it: a verse (or verses) in a Bible, or a paragraph of a book. */
export type Mark =
  | { book: number; chapter: number; verse?: number; to?: number; bible: string; created: string }
  | { module: string; title: string; para: number; kind?: string; created: string };

export const markKey = (m: Mark) =>
  "module" in m
    ? `bm|d|${m.module}|${m.title}|${m.para}`
    : `bm|v|${m.book}.${m.chapter}${m.verse ? `.${m.verse}` : ""}${m.to && m.to !== m.verse ? `-${m.to}` : ""}`;

// ---------- plans ----------

/** A plan as items: its settings (all but what's been read), and an item for each day read or skipped,
 *  date read and (Psalms, proverbs and others) date done, so ticks on two devices both count. */
export function planItems(p: Plan): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const id = p.id;
  if (p.kind === "sequence") {
    const { done, skipped, readDates, ...rest } = p;
    out[`plan|${id}`] = rest;
    for (const i of done) out[`pd|${id}|done|${i}`] = 1;
    for (const i of skipped) out[`pd|${id}|skip|${i}`] = 1;
    const n = new Map<string, number>();
    for (const d of readDates ?? []) n.set(d, (n.get(d) ?? 0) + 1);
    for (const [d, c] of n) out[`pd|${id}|read|${d}`] = c;
  } else {
    const { doneDates, ...rest } = p;
    out[`plan|${id}`] = rest;
    for (const d of doneDates) out[`pd|${id}|date|${d}`] = 1;
  }
  return out;
}

/** The plans back from their items, in the order they were started. */
export function plansFrom(now: Record<string, unknown>): Plan[] {
  const plans: Plan[] = [];
  for (const [id, rest] of under(now, "plan|")) {
    const days = under(now, `pd|${id}|`);
    const of = (what: string) => days.filter(([k]) => k.startsWith(`${what}|`)).map(([k, v]) => [k.slice(what.length + 1), v] as const);
    const r = rest as Plan;
    if (r.kind === "sequence") {
      const readDates: string[] = [];
      for (const [d, c] of of("read").sort()) for (let i = 0; i < Number(c); i++) readDates.push(d);
      plans.push({
        ...r,
        done: of("done")
          .map(([i]) => Number(i))
          .sort((x, y) => x - y),
        skipped: of("skip")
          .map(([i]) => Number(i))
          .sort((x, y) => x - y),
        ...(readDates.length ? { readDates } : {}),
      });
    } else
      plans.push({
        ...r,
        doneDates: of("date")
          .map(([d]) => d)
          .sort(),
      });
  }
  return plans.sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
}
