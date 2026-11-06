// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// The reading plans, kept on the phone. Their logic is the desktop's plans.ts, unchanged: the same
// plans, days, ticks and catching up.

import { useSyncExternalStore } from "react";
import { balanced, BOOKS, chaptersOf, perDay, Plan, PpoPlan, Sizes, ymd, today } from "./plansShared";
import { api, save, saved } from "./api";

let plans: Plan[] = saved<Plan[]>("plans", []);
const watchers = new Set<() => void>();

export const plansStore = {
  get: () => plans,
  set(f: (p: Plan[]) => Plan[]) {
    plans = f(plans);
    save("plans", plans);
    watchers.forEach((w) => w());
  },
  subscribe(f: () => void) {
    watchers.add(f);
    return () => {
      watchers.delete(f);
    };
  },
  /** One plan changed. */
  update(p: Plan) {
    plansStore.set((ps) => ps.map((x) => (x.id === p.id ? p : x)));
  },
};

export function usePlans() {
  return useSyncExternalStore(
    (f) => {
      watchers.add(f);
      return () => watchers.delete(f);
    },
    () => plans,
  );
}

export type Choice = "year" | "nt90" | "gospels" | "ppo" | "meyer";

export const CHOICES: { id: Choice; name: string; meta: string }[] = [
  { id: "year", name: "The whole Bible in a year", meta: "365 days of similar length" },
  { id: "nt90", name: "New Testament in 90 days", meta: "90 days of similar length" },
  { id: "gospels", name: "The Gospels, a chapter a day", meta: "89 days" },
  { id: "ppo", name: "Psalm, Proverb and one more", meta: "3 chapters a day · Proverbs by the date · the rest in order" },
  { id: "meyer", name: "F. B. Meyer, Through the Bible Day by Day", meta: "a passage a day, each with his note" },
];

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/** A new plan, starting today in `bible`, as the desktop's Plans screen builds them (PlansScreen.tsx). */
export async function buildPlan(choice: Choice, bible: string): Promise<Plan> {
  const id = uid();
  const start = ymd(today());
  if (choice === "ppo") {
    const p: PpoPlan = {
      id,
      kind: "ppo",
      name: "Psalm, Proverb and one more",
      start,
      bible,
      nextPsalm: 1,
      nextOther: [40, 1],
      otherFrom: "all",
      shortMonths: "last",
      doneDates: [],
      active: true,
    };
    return p;
  }
  const s = (await api.chapterSizes(bible)) as Sizes;
  const base = { id, kind: "sequence" as const, start, bible, weekdaysOnly: false, done: [], skipped: [], shift: 0, active: true };
  if (choice === "year") return { ...base, name: "The whole Bible in a year", days: balanced(s, 365) };
  if (choice === "nt90")
    return {
      ...base,
      name: "New Testament in 90 days",
      days: balanced(
        chaptersOf(
          s,
          BOOKS.filter((b) => b.n >= 40 && b.n <= 66).map((b) => b.n),
        ),
        90,
      ),
    };
  if (choice === "gospels") return { ...base, name: "The Gospels, a chapter a day", days: perDay(chaptersOf(s, [40, 41, 42, 43]), 1) };
  const ranges = await api.commentaryRanges("meyer");
  return {
    ...base,
    name: "Through the Bible Day by Day",
    noteModule: "meyer",
    days: ranges.map(([b, cb, vb, ce, ve]) => [{ b, c: cb, v: vb, c2: ce, v2: ve }]),
  };
}

/** Starts a plan as the current one; the one before is kept, paused. */
export function startPlan(p: Plan) {
  plansStore.set((ps) => [...ps.map((x) => ({ ...x, active: false })), { ...p, active: true }]);
}
