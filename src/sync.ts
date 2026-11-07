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

/** A removal is remembered this long, for a device that syncs rarely. */
const KEEP_REMOVED = 180 * 86_400_000;

/** The ledger brought up to date with what the side has now: a new or changed item is stamped `now`,
 *  one gone is marked removed at `now`. */
export function stamp(ledger: Ledger, now: Record<string, unknown>, at = Date.now()): Ledger {
  const out: Ledger = {};
  for (const [k, v] of Object.entries(now)) {
    const h = stable(v);
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

/** After a sync: the values to keep (removed ones left out), and the ledger that matches them. */
export function settle(p: Payload): { now: Record<string, unknown>; ledger: Ledger } {
  const now: Record<string, unknown> = {};
  const ledger: Ledger = {};
  for (const [k, e] of Object.entries(p.items)) {
    if (e.del) ledger[k] = { t: e.t, del: true };
    else {
      now[k] = e.v;
      ledger[k] = { t: e.t, h: stable(e.v) };
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
