// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Reading plans. A "sequence" plan is a fixed list of daily readings laid out on the calendar
// from a start date. The "ppo" plan (a Psalm, a Proverb and one more) has no end: Proverbs
// follows the date, while the Psalm and the other chapter move on each time a day is read.

import { book, BOOKS, isApocrypha, Ref } from "./bible";

/** One passage: whole chapters (c..c2), or a verse range when v is set. */
export interface Part {
  b: number;
  c: number;
  c2?: number;
  v?: number;
  v2?: number;
}

export interface SequencePlan {
  id: string;
  kind: "sequence";
  name: string;
  start: string; // YYYY-MM-DD
  bible: string;
  weekdaysOnly: boolean;
  days: Part[][];
  done: number[];
  /** Dates a day was finished, YYYY-MM-DD, for streaks. Recorded from September 2026 on. */
  readDates?: string[];
  skipped: number[];
  /** Days the rest of the plan has been moved later by. */
  shift: number;
  /** Commentary whose note goes with each day (F. B. Meyer). */
  noteModule?: string;
  /** Devotionals read each day alongside the plan: e-Sword module ids, or online ones' (onlineDevotionals). */
  devotionals?: string[];
  /** Songs from the Music library, chosen for the day's reading; absent for none. */
  worship?: Worship;
  /** A closing verse, chosen by the assistant to wrap up the day's Quiet time (closing.ts). */
  closing?: boolean;
  /** Parts of the current day ticked off so far (see progressKey). */
  progress?: Progress;
  /** A favourite passage read every day, at the very end of Quiet time (after the closing verse). */
  finale?: Part;
  active: boolean;
}

/** Which day `done` belongs to, and the parts of it read: "43.3" for a chapter, a devotional's id. */
export interface Progress {
  key: string;
  done: string[];
}

/** Worship songs in Quiet time: how many before the reading and how many after it (different
 *  songs each time). Older plans saved one count and where it went (`songs`, `when`). */
export interface Worship {
  before?: number;
  after?: number;
  songs?: number;
  when?: "before" | "after" | "both";
}

/** How many worship songs come before the reading and after it; 0 for none. */
export function worshipCounts(w: Worship | undefined): { before: number; after: number } {
  if (!w) return { before: 0, after: 0 };
  if (w.before !== undefined || w.after !== undefined) return { before: w.before ?? 0, after: w.after ?? 0 };
  const n = w.songs ?? 3;
  return { before: w.when !== "after" ? n : 0, after: w.when === "after" || w.when === "both" ? n : 0 };
}

export interface PpoPlan {
  id: string;
  kind: "ppo";
  name: string;
  start: string;
  bible: string;
  nextPsalm: number;
  /** Next "other" chapter as [book, chapter]. */
  nextOther: [number, number];
  otherFrom: "all" | "ot" | "nt";
  shortMonths: "last" | "skip";
  /** Dates read, YYYY-MM-DD. */
  doneDates: string[];
  devotionals?: string[];
  /** Songs from the Music library, chosen for the day's reading; absent for none. */
  worship?: Worship;
  closing?: boolean;
  finale?: Part;
  progress?: Progress;
  active: boolean;
}

export type Plan = SequencePlan | PpoPlan;

// ---------- dates ----------

export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const parseYmd = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
/** A reading day starts at 4am, not midnight: a late-night Quiet time counts for the day before. */
export const DAY_STARTS_AT = 4;
/** Midnight of the reading day it is now. */
export const today = () => {
  const d = new Date(Date.now() - DAY_STARTS_AT * 3_600_000);
  d.setHours(0, 0, 0, 0);
  return d;
};
export const fmtDay = (d: Date, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) =>
  d.toLocaleDateString("en-GB", opts);
export const fmtLong = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** The calendar date of plan day i. */
export function dateOf(p: SequencePlan, i: number): Date {
  let d = parseYmd(p.start);
  let n = i + p.shift;
  if (!p.weekdaysOnly) return addDays(d, n);
  while (isWeekend(d)) d = addDays(d, 1);
  while (n > 0) {
    d = addDays(d, 1);
    if (!isWeekend(d)) n--;
  }
  return d;
}

/** Which plan day falls on the date (clamped to the plan), or -1 before it starts. */
export const indexOn = (p: SequencePlan, date: Date) => Math.min(dayOn(p, date), p.days.length - 1);
/** How many plan days come before the date: every day once the plan's end has passed. */
export const dueBefore = (p: SequencePlan, date: Date) => Math.max(0, Math.min(dayOn(p, date), p.days.length));
function dayOn(p: SequencePlan, date: Date): number {
  const start = parseYmd(p.start);
  if (date < start) return -1;
  let n: number;
  if (!p.weekdaysOnly) n = Math.round((date.getTime() - start.getTime()) / 86400000);
  else {
    n = 0;
    for (let d = new Date(start); d < date; d = addDays(d, 1)) if (!isWeekend(d)) n++;
    if (isWeekend(date)) n--;
  }
  return n - p.shift;
}

export const firstUndone = (p: SequencePlan) => p.days.findIndex((_, i) => !p.done.includes(i) && !p.skipped.includes(i));
/** How many readings due by today are not read. */
export function behind(p: SequencePlan): number {
  const due = dueBefore(p, today());
  let n = 0;
  for (let i = 0; i < due; i++) if (!p.done.includes(i) && !p.skipped.includes(i)) n++;
  return n;
}

// ---------- labels ----------

export function partRef(x: Part): Ref {
  if (x.v)
    return {
      book: x.b,
      chapter: x.c,
      verse: x.v,
      to: x.c2 && x.c2 !== x.c ? x.v2 : x.v2,
      toChapter: x.c2 && x.c2 !== x.c ? x.c2 : undefined,
    };
  return { book: x.b, chapter: x.c };
}

export function partLabel(x: Part): string {
  const b = book(x.b).name;
  if (x.v) {
    if (x.c2 && x.c2 !== x.c) return `${b} ${x.c}:${x.v}–${x.c2}:${x.v2}`;
    return `${b} ${x.c}:${x.v}${x.v2 && x.v2 !== x.v ? "–" + x.v2 : ""}`;
  }
  return x.c2 && x.c2 !== x.c ? `${b} ${x.c}–${x.c2}` : `${b} ${x.c}`;
}
export const dayLabel = (parts: Part[]) => parts.map(partLabel).join(", ");

/** A reference as a part: "Proverbs 3:5-6", "Psalm 23". */
export const refPart = (r: Ref): Part =>
  r.verse
    ? { b: r.book, c: r.chapter, v: r.verse, v2: r.to, ...(r.toChapter && r.toChapter !== r.chapter ? { c2: r.toChapter } : {}) }
    : { b: r.book, c: r.chapter };

/** Whole chapters as parts, merging runs in the same book: Genesis 1, 2, 3 → Genesis 1–3. */
export function chaptersToParts(chs: [number, number][]): Part[] {
  const out: Part[] = [];
  for (const [b, c] of chs) {
    const last = out[out.length - 1];
    if (last && last.b === b && (last.c2 ?? last.c) === c - 1 && !last.v) last.c2 = c;
    else out.push({ b, c });
  }
  return out;
}

// ---------- building ----------

export type Sizes = [number, number, number][]; // book, chapter, verses

/** Split chapters into `days` days of similar length, never cutting a chapter. */
export function balanced(chs: Sizes, days: number): Part[][] {
  const total = chs.reduce((n, c) => n + c[2], 0);
  const out: [number, number][][] = Array.from({ length: days }, () => []);
  let cum = 0;
  for (const [b, c, v] of chs) {
    const d = Math.min(days - 1, Math.floor(((cum + v / 2) * days) / total));
    out[d].push([b, c]);
    cum += v;
  }
  return out.filter((d) => d.length).map(chaptersToParts);
}

export function perDay(chs: Sizes, n: number): Part[][] {
  const out: Part[][] = [];
  for (let i = 0; i < chs.length; i += n) out.push(chaptersToParts(chs.slice(i, i + n).map(([b, c]) => [b, c])));
  return out;
}

/** One OT and one NT chapter a day, until both run out. */
export function paired(chs: Sizes): Part[][] {
  const ot = chs.filter((c) => c[0] <= 39),
    nt = chs.filter((c) => c[0] >= 40);
  const out: Part[][] = [];
  for (let i = 0; i < Math.max(ot.length, nt.length); i++) {
    const day: [number, number][] = [];
    if (ot[i]) day.push([ot[i][0], ot[i][1]]);
    if (nt[i]) day.push([nt[i][0], nt[i][1]]);
    out.push(chaptersToParts(day));
  }
  return out;
}

/** A plan's chapters: the Protestant canon's, not a Bible's apocryphal ones (Esther 11–16, Daniel 13–14). */
export const chaptersOf = (sizes: Sizes, books: number[]) => sizes.filter((s) => books.includes(s[0]) && !isApocrypha(s[0], s[1]));

// ---------- the Psalm, Proverb and one more plan ----------

const daysInMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

/** Proverbs chapters for a date: the day of the month, plus the leftovers on the last day of a short month. */
export function proverbsFor(d: Date, shortMonths: "last" | "skip"): [number, number] {
  const day = d.getDate();
  const dim = daysInMonth(d);
  if (shortMonths === "last" && day === dim && dim < 31) return [day, 31];
  return [day, day];
}

export function otherBooks(from: PpoPlan["otherFrom"]): number[] {
  return BOOKS.map((b) => b.n).filter((n) => n !== 19 && n !== 20 && (from === "all" || (from === "ot" ? n <= 39 : n >= 40)));
}

export function nextOtherAfter(cur: [number, number], from: PpoPlan["otherFrom"]): [number, number] {
  const bs = otherBooks(from);
  const [b, c] = cur;
  if (c < book(b).chapters) return [b, c + 1];
  const i = bs.indexOf(b);
  return [bs[(i + 1) % bs.length] ?? bs[0], 1];
}

/** The chapter before `cur` in the "other" reading order: the inverse of nextOtherAfter. */
export function prevOtherBefore(cur: [number, number], from: PpoPlan["otherFrom"]): [number, number] {
  const bs = otherBooks(from);
  const [b, c] = cur;
  if (c > 1) return [b, c - 1];
  const i = bs.indexOf(b);
  const pb = bs[(i - 1 + bs.length) % bs.length] ?? bs[0];
  return [pb, book(pb).chapters];
}

export function ppoReading(p: PpoPlan, d: Date): Part[] {
  const [p1, p2] = proverbsFor(d, p.shortMonths);
  return [{ b: 19, c: p.nextPsalm }, p1 === p2 ? { b: 20, c: p1 } : { b: 20, c: p1, c2: p2 }, { b: p.nextOther[0], c: p.nextOther[1] }];
}

/** What a Psalm-and-Proverb plan read on each date it was read (YYYY-MM-DD), worked back from where
 *  it is now: each day read moved the psalm and the other chapter on by one. */
export function ppoHistory(p: PpoPlan): Map<string, Part[]> {
  const dates = [...new Set(p.doneDates)].sort();
  const out = new Map<string, Part[]>();
  let psalm = p.nextPsalm,
    other = p.nextOther;
  for (let i = dates.length - 1; i >= 0; i--) {
    psalm = ((psalm + 148) % 150) + 1;
    other = prevOtherBefore(other, p.otherFrom);
    out.set(dates[i], ppoReading({ ...p, nextPsalm: psalm, nextOther: other }, parseYmd(dates[i])));
  }
  return out;
}

/** The PPO readings for the coming days, assuming each day is read. */
export function ppoPreview(p: PpoPlan, from: Date, n: number): { date: Date; parts: Part[] }[] {
  const out = [];
  let psalm = p.nextPsalm,
    other = p.nextOther;
  for (let i = 0; i < n; i++) {
    const d = addDays(from, i);
    out.push({ date: d, parts: ppoReading({ ...p, nextPsalm: psalm, nextOther: other }, d) });
    psalm = (psalm % 150) + 1;
    other = nextOtherAfter(other, p.otherFrom);
  }
  return out;
}

/** The days after `today`. Until today is marked read the plan has not moved on, so skip today's chapters. */
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
/** A day as a devotional's title: "September 24". */
export const dayTitle = (d: Date) => `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;

/** A devotional read online: its page is shown in the reading column (WebPage), or with `window`
 *  in a window of its own, for a site that won't be shown inside another. */
export interface OnlineDevotional {
  id: string;
  title: string;
  url: (d: Date) => string;
  window?: boolean;
  /** Added by the user (a WebDevotional). */
  own?: boolean;
}

/** A devotional website the user added. Its address may hold today's date: {yyyy}, {yy}, {mm},
 *  {m}, {dd}, {d}, {month} ("september") and {mon} ("sep"). */
export interface WebDevotional {
  id: string;
  title: string;
  url: string;
  window?: boolean;
}

/** An address with today's date put in for its placeholders. */
export function fillDate(url: string, d: Date): string {
  const month = MONTH_NAMES[d.getMonth()].toLowerCase();
  const two = (n: number) => String(n).padStart(2, "0");
  const parts: Record<string, string> = {
    yyyy: String(d.getFullYear()),
    yy: two(d.getFullYear() % 100),
    mm: two(d.getMonth() + 1),
    m: String(d.getMonth() + 1),
    dd: two(d.getDate()),
    d: String(d.getDate()),
    month,
    mon: month.slice(0, 3),
  };
  return url.replace(/\{(yyyy|yy|mm|m|dd|d|month|mon)\}/gi, (_, k: string) => parts[k.toLowerCase()]);
}

/** The online devotionals there are: the app's own, then the user's. */
export const onlineDevotionals = (own: WebDevotional[] = []): OnlineDevotional[] => [
  ...ONLINE_DEVOTIONALS,
  ...own.map((w) => ({ id: w.id, title: w.title, url: (d: Date) => fillDate(w.url, d), window: w.window, own: true })),
];

export const ONLINE_DEVOTIONALS: OnlineDevotional[] = [
  { id: "online:odb", title: "Our Daily Bread", url: () => "https://www.odbm.org/en/devotionals" },
  {
    id: "online:heartlight",
    title: "Heartlight",
    url: (d) => `https://www.heartlight.org/cgi-shl/todaysverse.cgi?day=${ymd(d).replace(/-/g, "")}&ver=niv`,
  },
];

/** The day being read: a sequence plan's next unread day, a Psalm-and-Proverb plan's date. */
export function progressKey(p: Plan, d: Date): string {
  return p.kind === "sequence" ? `day:${firstUndone(p)}` : ymd(d);
}

/** Parts of the day already ticked off. */
export const doneToday = (p: Plan, key: string): string[] => (p.progress?.key === key ? p.progress.done : []);

/** Marks the day read: the next unread day of a sequence, or the date of a Psalm-and-Proverb plan. */
export function markDayRead(p: Plan, d: Date): Plan {
  if (p.kind === "ppo") return markPpoRead(p, d);
  const i = firstUndone(p);
  if (i < 0 || p.done.includes(i)) return p;
  const k = ymd(d);
  return { ...p, done: [...p.done, i], readDates: p.readDates?.includes(k) ? p.readDates : [...(p.readDates ?? []), k] };
}

/** Undoes today's "mark as read": the date comes off, the plan steps back to where it was, and the
 *  parts ticked today are unticked (they would otherwise mark the day read again). */
export function unmarkDayRead(p: Plan, d: Date): Plan {
  const k = ymd(d);
  // The key the day's ticks were saved under: for a sequence, the day being unmarked (the last
  // marked), not the next unread one it would be while that day still counts as read.
  const key = p.kind === "sequence" ? `day:${p.done[p.done.length - 1]}` : progressKey(p, d);
  const progress = p.progress?.key === key ? undefined : p.progress;
  if (p.kind === "ppo") {
    if (!p.doneDates.includes(k)) return p;
    return {
      ...p,
      nextPsalm: ((p.nextPsalm + 148) % 150) + 1,
      nextOther: prevOtherBefore(p.nextOther, p.otherFrom),
      doneDates: p.doneDates.filter((x) => x !== k),
      progress,
    };
  }
  if (!p.readDates?.includes(k) || !p.done.length) return p;
  return { ...p, done: p.done.slice(0, -1), readDates: p.readDates.filter((x) => x !== k), progress };
}

/** Whether today was marked read (a sequence plan only knows this for days marked since dates were recorded). */
export const readOn = (p: Plan, d: Date) => (p.kind === "ppo" ? p.doneDates : (p.readDates ?? [])).includes(ymd(d));

export interface Streak {
  /** Days in a row up to today, or up to yesterday while today isn't read yet. */
  current: number;
  best: number;
  /** Of the last seven reading days (weekdays only, for a weekdays plan), how many were read. */
  week: number;
  /** Whether today is read. */
  today: boolean;
}

/** Streaks from the dates a plan was read on. A weekdays-only plan doesn't break on weekends. */
export function streak(p: Plan, now = today()): Streak {
  const dates = new Set(p.kind === "ppo" ? p.doneDates : (p.readDates ?? []));
  const counts = (d: Date) => !(p.kind === "sequence" && p.weekdaysOnly && isWeekend(d));
  const prev = (d: Date) => {
    let x = addDays(d, -1);
    while (!counts(x)) x = addDays(x, -1);
    return x;
  };
  const read = (d: Date) => dates.has(ymd(d));
  let day = counts(now) ? now : prev(now);
  const isToday = read(now);
  if (!read(day)) day = prev(day);
  let current = 0;
  while (read(day)) {
    current++;
    day = prev(day);
  }
  let best = 0;
  const sorted = [...dates].sort();
  let run = 0,
    last: Date | null = null;
  for (const s of sorted) {
    const d = parseYmd(s);
    if (!counts(d)) continue;
    run = last && ymd(prev(d)) === ymd(last) ? run + 1 : 1;
    best = Math.max(best, run);
    last = d;
  }
  let week = 0;
  for (let i = 0, d = counts(now) ? now : prev(now); i < 7; i++, d = prev(d)) if (read(d)) week++;
  return { current, best: Math.max(best, current), week, today: isToday };
}

/**
 * Ticks off one part of the day. When every Bible part in `bibleParts` is read, the day is marked
 * read too, once. `key` is the day the session started on, so marking cannot run into the next day:
 * a Psalm-and-Proverb session finished after midnight marks the day it began.
 */
export function tickPart(p: Plan, key: string, part: string, bibleParts: string[], d: Date): Plan {
  const done = Array.from(new Set([...doneToday(p, key), part]));
  let next: Plan = { ...p, progress: { key, done } };
  const dayRead = p.kind === "ppo" ? p.doneDates.includes(key) : p.done.includes(+key.slice(4));
  if (!dayRead && bibleParts.length && bibleParts.every((x) => done.includes(x)))
    next = markDayRead(next, p.kind === "ppo" ? parseYmd(key) : d);
  return next;
}

export function ppoUpcoming(p: PpoPlan, today: Date, n: number): { date: Date; parts: Part[] }[] {
  return p.doneDates.includes(ymd(today)) ? ppoPreview(p, addDays(today, 1), n) : ppoPreview(p, today, n + 1).slice(1);
}

export function markPpoRead(p: PpoPlan, d: Date): PpoPlan {
  const k = ymd(d);
  if (p.doneDates.includes(k)) return p;
  return { ...p, nextPsalm: (p.nextPsalm % 150) + 1, nextOther: nextOtherAfter(p.nextOther, p.otherFrom), doneDates: [...p.doneDates, k] };
}

// ---------- summary for the sidebar ----------

export interface Today {
  label: string;
  progress: string;
  pct: number;
  parts: Part[];
}

export function current(plans: Plan[]): Plan | undefined {
  return plans.find((p) => p.active);
}

export function todayFor(p: Plan): Today {
  if (p.kind === "ppo") {
    const done = p.doneDates.includes(ymd(today()));
    // Marking the day moved the psalm and other chapter on; a day that's read shows what was read.
    const read = done ? { ...p, nextPsalm: ((p.nextPsalm + 148) % 150) + 1, nextOther: prevOtherBefore(p.nextOther, p.otherFrom) } : p;
    const parts = ppoReading(read, today());
    const bs = otherBooks(p.otherFrom);
    const total = bs.reduce((n, b) => n + book(b).chapters, 0);
    let pos = 0;
    for (const b of bs) {
      if (b === p.nextOther[0]) {
        pos += p.nextOther[1] - 1;
        break;
      }
      pos += book(b).chapters;
    }
    return {
      label: parts.map((x) => partLabel(x).replace("Psalms", "Psalm")).join(" · "),
      progress: done ? "read today" : `day ${p.doneDates.length + 1}`,
      pct: Math.round((pos / total) * 100),
      parts,
    };
  }
  const i = firstUndone(p);
  const idx = i < 0 ? p.days.length - 1 : i;
  const parts = p.days[idx] ?? [];
  return {
    label: i < 0 ? "Finished" : dayLabel(parts),
    progress: `day ${idx + 1} of ${p.days.length}`,
    pct: Math.round((p.done.length / p.days.length) * 100),
    parts,
  };
}

export function todayReading(app: { plans: Plan[] }): Today | null {
  const p = current(app.plans);
  return p ? todayFor(p) : null;
}
