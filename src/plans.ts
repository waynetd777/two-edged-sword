// Reading plans. A "sequence" plan is a fixed list of daily readings laid out on the calendar
// from a start date. The "ppo" plan (a Psalm, a Proverb and one more) has no end: Proverbs
// follows the date, while the Psalm and the other chapter move on each time a day is read.

import { book, BOOKS, fmtRef, Ref } from "./bible";

/** One passage: whole chapters (c..c2), or a verse range when v is set. */
export interface Part { b: number; c: number; c2?: number; v?: number; v2?: number }

export interface SequencePlan {
  id: string;
  kind: "sequence";
  name: string;
  start: string; // YYYY-MM-DD
  bible: string;
  weekdaysOnly: boolean;
  days: Part[][];
  done: number[];
  skipped: number[];
  /** Days the rest of the plan has been moved later by. */
  shift: number;
  /** Commentary whose note goes with each day (F. B. Meyer). */
  noteModule?: string;
  /** Devotionals read each day alongside the plan: e-Sword module ids, or ONLINE_DEVOTIONALS ids. */
  devotionals?: string[];
  /** Parts of the current day ticked off so far (see progressKey). */
  progress?: Progress;
  active: boolean;
}

/** Which day `done` belongs to, and the parts of it read: "43.3" for a chapter, a devotional's id. */
export interface Progress { key: string; done: string[] }

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
  progress?: Progress;
  active: boolean;
}

export type Plan = SequencePlan | PpoPlan;

// ---------- dates ----------

export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const parseYmd = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
export const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
export const fmtDay = (d: Date, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) => d.toLocaleDateString("en-GB", opts);
export const fmtLong = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** The calendar date of plan day i. */
export function dateOf(p: SequencePlan, i: number): Date {
  let d = parseYmd(p.start);
  let n = i + p.shift;
  if (!p.weekdaysOnly) return addDays(d, n);
  while (isWeekend(d)) d = addDays(d, 1);
  while (n > 0) { d = addDays(d, 1); if (!isWeekend(d)) n--; }
  return d;
}

/** Which plan day falls on the date (clamped to the plan), or -1 before it starts. */
export function indexOn(p: SequencePlan, date: Date): number {
  const start = parseYmd(p.start);
  if (date < start) return -1;
  let n: number;
  if (!p.weekdaysOnly) n = Math.round((date.getTime() - start.getTime()) / 86400000);
  else { n = 0; for (let d = new Date(start); d < date; d = addDays(d, 1)) if (!isWeekend(d)) n++; if (isWeekend(date)) n--; }
  return Math.min(n - p.shift, p.days.length - 1);
}

export const firstUndone = (p: SequencePlan) => p.days.findIndex((_, i) => !p.done.includes(i) && !p.skipped.includes(i));
/** How many readings due by today are not read. */
export function behind(p: SequencePlan): number {
  const due = indexOn(p, today());
  let n = 0;
  for (let i = 0; i < due; i++) if (!p.done.includes(i) && !p.skipped.includes(i)) n++;
  return n;
}

// ---------- labels ----------

export function partRef(x: Part): Ref {
  if (x.v) return { book: x.b, chapter: x.c, verse: x.v, to: x.c2 && x.c2 !== x.c ? x.v2 : x.v2, toChapter: x.c2 && x.c2 !== x.c ? x.c2 : undefined };
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
  const ot = chs.filter((c) => c[0] <= 39), nt = chs.filter((c) => c[0] >= 40);
  const out: Part[][] = [];
  for (let i = 0; i < Math.max(ot.length, nt.length); i++) {
    const day: [number, number][] = [];
    if (ot[i]) day.push([ot[i][0], ot[i][1]]);
    if (nt[i]) day.push([nt[i][0], nt[i][1]]);
    out.push(chaptersToParts(day));
  }
  return out;
}

export const chaptersOf = (sizes: Sizes, books: number[]) => sizes.filter((s) => books.includes(s[0]));

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

export function ppoReading(p: PpoPlan, d: Date): Part[] {
  const [p1, p2] = proverbsFor(d, p.shortMonths);
  return [{ b: 19, c: p.nextPsalm }, p1 === p2 ? { b: 20, c: p1 } : { b: 20, c: p1, c2: p2 }, { b: p.nextOther[0], c: p.nextOther[1] }];
}

/** The PPO readings for the coming days, assuming each day is read. */
export function ppoPreview(p: PpoPlan, from: Date, n: number): { date: Date; parts: Part[] }[] {
  const out = [];
  let psalm = p.nextPsalm, other = p.nextOther;
  for (let i = 0; i < n; i++) {
    const d = addDays(from, i);
    out.push({ date: d, parts: ppoReading({ ...p, nextPsalm: psalm, nextOther: other }, d) });
    psalm = (psalm % 150) + 1;
    other = nextOtherAfter(other, p.otherFrom);
  }
  return out;
}

/** The days after `today`. Until today is marked read the plan has not moved on, so skip today's chapters. */
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** A day as a devotional's title: "September 24". */
export const dayTitle = (d: Date) => `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;

/** Devotionals read online, opened in a window of their own. */
export const ONLINE_DEVOTIONALS: { id: string; title: string; url: (d: Date) => string }[] = [
  { id: "online:odb", title: "Our Daily Bread", url: () => "https://www.odbm.org/en/devotionals" },
  { id: "online:heartlight", title: "Heartlight", url: (d) => `https://www.heartlight.org/cgi-shl/todaysverse.cgi?day=${ymd(d).replace(/-/g, "")}&ver=niv` },
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
  return i >= 0 && !p.done.includes(i) ? { ...p, done: [...p.done, i] } : p;
}

/**
 * Ticks off one part of the day. When every Bible part in `bibleParts` is read, the day is marked
 * read too, once. `key` is the day the session started on, so marking cannot run into the next day.
 */
export function tickPart(p: Plan, key: string, part: string, bibleParts: string[], d: Date): Plan {
  const done = Array.from(new Set([...doneToday(p, key), part]));
  let next: Plan = { ...p, progress: { key, done } };
  const dayRead = p.kind === "ppo" ? p.doneDates.includes(key) : p.done.includes(+key.slice(4));
  if (!dayRead && bibleParts.length && bibleParts.every((x) => done.includes(x))) next = markDayRead(next, d);
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

export interface Today { label: string; progress: string; pct: number; parts: Part[] }

export function current(plans: Plan[]): Plan | undefined {
  return plans.find((p) => p.active);
}

export function todayFor(p: Plan): Today {
  if (p.kind === "ppo") {
    const parts = ppoReading(p, today());
    const done = p.doneDates.includes(ymd(today()));
    const bs = otherBooks(p.otherFrom);
    const total = bs.reduce((n, b) => n + book(b).chapters, 0);
    let pos = 0;
    for (const b of bs) { if (b === p.nextOther[0]) { pos += p.nextOther[1] - 1; break; } pos += book(b).chapters; }
    return { label: parts.map((x) => partLabel(x).replace("Psalms", "Psalm")).join(" · "), progress: done ? "read today" : `day ${p.doneDates.length + 1}`, pct: Math.round((pos / total) * 100), parts };
  }
  const i = firstUndone(p);
  const idx = i < 0 ? p.days.length - 1 : i;
  const parts = p.days[idx] ?? [];
  return { label: i < 0 ? "Finished" : dayLabel(parts), progress: `day ${idx + 1} of ${p.days.length}`, pct: Math.round((p.done.length / p.days.length) * 100), parts };
}

export function todayReading(app: { plans: Plan[] }): Today | null {
  const p = current(app.plans);
  return p ? todayFor(p) : null;
}

export const refOfParts = (parts: Part[]) => parts.map((x) => fmtRef(partRef(x)));
