// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// The prayer list, as the desktop and the phone app both keep it: categories the user names, each with its
// prayer points. Shared by both apps (src/Prayer*.tsx, mobile/src/prayerStore.ts) and synced item by item
// (src/sync.ts): a category is "pc|<id>", a point "pp|<id>". Order is a number on each, so moving one
// thing changes only that thing and two devices' moves merge.

/** A category's colour: one of these names, drawn from the theme (prayer.css). */
export const CAT_COLOURS = ["gold", "green", "blue", "purple", "red", "teal", "orange", "grey"] as const;
export type CatColour = (typeof CAT_COLOURS)[number];

export interface PrayerCat {
  id: string;
  name: string;
  colour: CatColour;
  order: number;
  /** Folded on this device's screen; not synced (see prayerItems). */
  folded?: boolean;
}

export interface PrayerPoint {
  id: string;
  /** Its category's id. */
  cat: string;
  title: string;
  /** A short line under the title. */
  note?: string;
  /** References as written, "Jas 5:15". */
  verses: string[];
  order: number;
  /** When it was added, "2026-11-16". */
  created: string;
  /** When it was marked answered, "2026-11-16"; answered points show under Answered. */
  answered?: string;
}

export interface PrayerList {
  cats: PrayerCat[];
  points: PrayerPoint[];
}

export const EMPTY_PRAYER: PrayerList = { cats: [], points: [] };

export const prayerId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/** Today, as points keep their dates. */
export const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const byOrder = <T extends { order: number; id: string }>(a: T, b: T) => a.order - b.order || a.id.localeCompare(b.id);

/** The categories in order. */
export const catsInOrder = (l: PrayerList) => [...l.cats].sort(byOrder);

/** A category's points still being prayed for, in order. */
export const pointsIn = (l: PrayerList, cat: string) => l.points.filter((p) => p.cat === cat && !p.answered).sort(byOrder);

/** Every answered point, the latest first. */
export const answeredPoints = (l: PrayerList) =>
  l.points.filter((p) => p.answered).sort((a, b) => (b.answered ?? "").localeCompare(a.answered ?? "") || byOrder(a, b));

/** Every point still being prayed for, category by category: Pray through's order. */
export const prayingNow = (l: PrayerList) => catsInOrder(l).flatMap((c) => pointsIn(l, c.id));

/** An order number that puts something between `before` and `after` (either may be missing). */
export function orderBetween(before?: number, after?: number): number {
  if (before === undefined && after === undefined) return 1;
  if (before === undefined) return after! - 1;
  if (after === undefined) return before + 1;
  return (before + after) / 2;
}

/** The list with point `id` moved into category `cat` at position `index` among its points still being
 *  prayed for (its own place not counted). Only the moved point changes. */
export function movePoint(l: PrayerList, id: string, cat: string, index: number): PrayerList {
  const others = pointsIn(l, cat).filter((p) => p.id !== id);
  const i = Math.max(0, Math.min(index, others.length));
  const order = orderBetween(others[i - 1]?.order, others[i]?.order);
  return { ...l, points: l.points.map((p) => (p.id === id ? { ...p, cat, order } : p)) };
}

/** The list with category `id` moved to position `index` (its own place not counted). */
export function moveCat(l: PrayerList, id: string, index: number): PrayerList {
  const others = catsInOrder(l).filter((c) => c.id !== id);
  const i = Math.max(0, Math.min(index, others.length));
  const order = orderBetween(others[i - 1]?.order, others[i]?.order);
  return { ...l, cats: l.cats.map((c) => (c.id === id ? { ...c, order } : c)) };
}

/** A new category's colour: the first not yet used, or round again. */
export const nextColour = (l: PrayerList): CatColour =>
  CAT_COLOURS.find((c) => !l.cats.some((x) => x.colour === c)) ?? CAT_COLOURS[l.cats.length % CAT_COLOURS.length];

export function addCat(l: PrayerList, name: string): { list: PrayerList; id: string } {
  const id = prayerId();
  const last = catsInOrder(l).slice(-1)[0];
  return { id, list: { ...l, cats: [...l.cats, { id, name, colour: nextColour(l), order: orderBetween(last?.order) }] } };
}

export function addPoint(l: PrayerList, cat: string, title: string): { list: PrayerList; id: string } {
  const id = prayerId();
  const last = pointsIn(l, cat).slice(-1)[0];
  const p: PrayerPoint = { id, cat, title, verses: [], order: orderBetween(last?.order), created: todayYmd() };
  return { id, list: { ...l, points: [...l.points, p] } };
}

export const updatePoint = (l: PrayerList, id: string, patch: Partial<PrayerPoint>): PrayerList => ({
  ...l,
  points: l.points.map((p) => (p.id === id ? { ...p, ...patch } : p)),
});

export const updateCat = (l: PrayerList, id: string, patch: Partial<PrayerCat>): PrayerList => ({
  ...l,
  cats: l.cats.map((c) => (c.id === id ? { ...c, ...patch } : c)),
});

export const deletePoint = (l: PrayerList, id: string): PrayerList => ({ ...l, points: l.points.filter((p) => p.id !== id) });

/** A category goes with its points, answered ones too. */
export const deleteCat = (l: PrayerList, id: string): PrayerList => ({
  cats: l.cats.filter((c) => c.id !== id),
  points: l.points.filter((p) => p.cat !== id),
});

/** Marks a point answered today, or back to being prayed for (at the end of its category). */
export function setAnswered(l: PrayerList, id: string, answered: boolean): PrayerList {
  const p = l.points.find((x) => x.id === id);
  if (!p) return l;
  if (answered) return updatePoint(l, id, { answered: todayYmd() });
  const last = pointsIn(l, p.cat).slice(-1)[0];
  return updatePoint(l, id, { answered: undefined, order: orderBetween(last?.order) });
}

// ---------- sync ----------

export const catKey = (id: string) => `pc|${id}`;
export const pointKey = (id: string) => `pp|${id}`;
export const isPrayerKey = (k: string) => k.startsWith("pc|") || k.startsWith("pp|");

/** The list as sync's items. A category's folding is this device's own, so it isn't sent. */
export function prayerItems(l: PrayerList): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of l.cats) out[catKey(c.id)] = { id: c.id, name: c.name, colour: c.colour, order: c.order };
  for (const p of l.points) {
    const v: PrayerPoint = { id: p.id, cat: p.cat, title: p.title, verses: p.verses, order: p.order, created: p.created };
    if (p.note) v.note = p.note;
    if (p.answered) v.answered = p.answered;
    out[pointKey(p.id)] = v;
  }
  return out;
}

/** The list back from sync's items, keeping this device's folding. A point whose category is gone isn't
 *  shown (it comes back if the category does). */
export function prayerFrom(now: Record<string, unknown>, was: PrayerList): PrayerList {
  const folded = new Set(was.cats.filter((c) => c.folded).map((c) => c.id));
  const cats: PrayerCat[] = [];
  const points: PrayerPoint[] = [];
  for (const [k, v] of Object.entries(now)) {
    if (k.startsWith("pc|")) {
      const c = v as PrayerCat;
      cats.push(folded.has(c.id) ? { ...c, folded: true } : c);
    } else if (k.startsWith("pp|")) points.push(v as PrayerPoint);
  }
  return { cats, points };
}

const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Whether a synced value is a prayer category or point, for the key it came under. */
export function validPrayer(k: string, v: unknown): boolean {
  if (!isObj(v) || !isStr(v.id) || !isNum(v.order)) return false;
  if (k.startsWith("pc|")) return v.id === k.slice(3) && isStr(v.name) && (CAT_COLOURS as readonly string[]).includes(v.colour as string);
  if (k.startsWith("pp|"))
    return (
      v.id === k.slice(3) &&
      isStr(v.cat) &&
      isStr(v.title) &&
      isStr(v.created) &&
      Array.isArray(v.verses) &&
      v.verses.every(isStr) &&
      (v.note === undefined || isStr(v.note)) &&
      (v.answered === undefined || isStr(v.answered))
    );
  return false;
}

/** A stored list as read back: anything malformed dropped. */
export function readPrayer(v: unknown): PrayerList {
  if (!isObj(v) || !Array.isArray(v.cats) || !Array.isArray(v.points)) return EMPTY_PRAYER;
  return {
    cats: v.cats.filter((c) => isObj(c) && validPrayer(catKey(String(c.id)), { ...c, folded: undefined })) as PrayerCat[],
    points: v.points.filter((p) => isObj(p) && validPrayer(pointKey(String(p.id)), p)) as PrayerPoint[],
  };
}
