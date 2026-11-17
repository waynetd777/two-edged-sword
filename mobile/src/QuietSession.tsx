// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Quiet time on the phone, as on the desktop (src/QuietTime.tsx): the day's steps in the plan's order
// (plans.ts planSteps), each opened in turn under a bar with Back, Next and End. With Listen, each part
// read aloud goes on to the next by itself. Worship and the closing verse need the computer (its Music
// library and AI assistant), so they are left out here. The day's reading is ticked off part by part
// as it's passed.

import { useEffect, useState, useSyncExternalStore } from "react";
import { PrayThrough } from "../../src/PrayerBoard";
import { prayingNow } from "../../src/prayer";
import { saved } from "./api";
import { todayTitle } from "./DocView";
import { Icon } from "./icons";
import { player, type PlanStretch } from "./player";
import {
  onlineDevotionals,
  Part,
  partLabel,
  partRef,
  Plan,
  planSteps,
  progressKey,
  psalmLabel,
  tickPart,
  today,
  todayFor,
} from "./plansShared";
import { plansStore } from "./plansStore";
import { prayerStore, usePrayer } from "./prayerStore";
import { readChapter } from "./PrayerScreen";
import type { Jump } from "./Search";
import { closeWebDevotional, openWebDevotional } from "./WebPage";
import { webStore } from "./webStore";
import type { Module } from "./api";

/** A part's key among the day's ticks (as the Today card's). */
export const partKey = (x: { b: number; c: number; v?: number }) => `${x.b}.${x.c}${x.v ? `.${x.v}` : ""}`;

/** One part of the phone's Quiet time. */
type Step = { label: string } &
  /** Some of the day's reading; `every`: the favourite passage rather than the plan's. */
  (
    | { kind: "reading"; parts: Part[]; every?: boolean }
    | { kind: "doc"; module: string }
    | { kind: "web"; id: string }
    | { kind: "prayer" }
    | { kind: "still"; minutes: number }
  );

interface Session {
  planId: string;
  steps: Step[];
  i: number;
  audio: boolean;
  /** Changes for each step opened, so one opened again starts afresh. */
  n: number;
}
let session: Session | null = null;
const watchers = new Set<() => void>();
const put = (s: Session | null) => {
  session = s;
  watchers.forEach((w) => w());
};
const useSession = () =>
  useSyncExternalStore(
    (f) => {
      watchers.add(f);
      return () => watchers.delete(f);
    },
    () => session,
  );

/** Today's steps as the phone goes through them: the plan's, less those it can't do. */
export function phoneSteps(plan: Plan, modules: Module[]): Step[] {
  const parts = todayFor(plan).parts;
  const steps = planSteps(plan);
  const online = onlineDevotionals(webStore.get().sites);
  const claimed = new Set(steps.flatMap((x) => (x.kind === "reading" && x.part !== undefined ? [x.part] : [])));
  const given = new Set<number>();
  const take = (ix: number[]) => ix.filter((i) => i < parts.length && !given.has(i) && given.add(i)).map((i) => parts[i]);
  const reading = (ps: Part[]): Step => ({ kind: "reading", parts: ps, label: ps.map((p) => psalmLabel(partLabel(p))).join(" · ") });
  const last = steps.map((x) => x.kind).lastIndexOf("reading");
  const out: Step[] = [];
  steps.forEach((x, i) => {
    if (x.kind === "reading") {
      const ps = take(x.part !== undefined ? [x.part] : parts.map((_, k) => k).filter((k) => !claimed.has(k)));
      // The rest of the day after the last Reading step.
      if (i === last) ps.push(...take(parts.map((_, k) => k)));
      if (ps.length) out.push(reading(ps));
    } else if (x.kind === "devotional") {
      const o = online.find((y) => y.id === x.devotional);
      const m = modules.find((y) => y.id === x.devotional && y.kind === "devotional");
      if (o) out.push({ kind: "web", id: o.id, label: o.title });
      else if (m) out.push({ kind: "doc", module: m.id, label: m.title });
    } else if (x.kind === "prayer") {
      if (prayingNow(prayerStore.get()).length) out.push({ kind: "prayer", label: "Prayer" });
    } else if (x.kind === "passage")
      out.push({ kind: "reading", parts: [x.passage], every: true, label: psalmLabel(partLabel(x.passage)) });
    else if (x.kind === "still") out.push({ kind: "still", minutes: x.minutes, label: "Be still" });
    // Worship and the closing verse: on the computer only.
  });
  if (last < 0) {
    const ps = take(parts.map((_, k) => k));
    if (ps.length) out.push(reading(ps));
  }
  return out.some((x) => x.kind === "reading" && !x.every) ? out : [];
}

/** Starts today's Quiet time: from the first step not done yet, read aloud with `audio`. */
export function startQuiet(plan: Plan, modules: Module[], audio: boolean) {
  const steps = phoneSteps(plan, modules);
  if (!steps.length) return;
  const done = new Set(planDone(plan));
  const i = Math.max(
    0,
    steps.findIndex((x) => x.kind !== "reading" || x.every || x.parts.some((p) => !done.has(partKey(p)))),
  );
  put({ planId: plan.id, steps, i, audio, n: (session?.n ?? 0) + 1 });
}
const planDone = (p: Plan) => (p.progress?.key === progressKey(p, today()) ? p.progress.done : []);

/** Ticks off the day's parts in a step as it's passed: against the plan as it is now. */
function tick(planId: string, parts: Part[]) {
  for (const x of parts) {
    const now = plansStore.get().find((p) => p.id === planId);
    if (!now) return;
    const keys = todayFor(now).parts.map(partKey);
    if (keys.includes(partKey(x))) plansStore.update(tickPart(now, progressKey(now, today()), partKey(x), keys, today()));
  }
}

/** A day's parts as stretches to read aloud (whole chapters one by one, a verse range as it runs). */
function stretches(parts: Part[]): PlanStretch[] {
  const out: PlanStretch[] = [];
  parts.forEach((x, part) => {
    const last = x.c2 ?? x.c;
    if (!x.v) for (let c = x.c; c <= last; c++) out.push({ book: x.b, chapter: c, from: 1, part });
    else if (last === x.c) out.push({ book: x.b, chapter: x.c, from: x.v, to: x.v2 ?? x.v, part });
    else {
      out.push({ book: x.b, chapter: x.c, from: x.v, part });
      for (let c = x.c + 1; c < last; c++) out.push({ book: x.b, chapter: c, from: 1, part });
      out.push({ book: x.b, chapter: last, from: 1, to: x.v2, part });
    }
  });
  return out;
}

/** Moves on (or back): forward ticks off what's being left; past the last step ends Quiet time. */
function go(d: number) {
  const s = session;
  if (!s) return;
  const cur = s.steps[s.i];
  if (d > 0 && cur.kind === "reading" && !cur.every) tick(s.planId, cur.parts);
  const j = s.i + d;
  if (j < 0) return;
  player.stop();
  closeWebDevotional();
  put(j >= s.steps.length ? null : { ...s, i: j, n: s.n + 1 });
}

/** The bar, and what a step shows over the page (Pray through, Be still); opens each step as it comes. */
export function QuietHost({ onJump }: { onJump: (j: Jump) => void }) {
  const s = useSession();
  const prayer = usePrayer();
  const step = s?.steps[s.i];
  useEffect(() => {
    if (!s || !step) return;
    const plan = plansStore.get().find((p) => p.id === s.planId);
    const bible = saved("bible", "kjv+");
    const next = () => go(1);
    if (step.kind === "reading") {
      const p = step.parts[0];
      onJump({ ref: partRef(p) });
      if (s.audio)
        window.setTimeout(
          () =>
            player.playPlan(
              bible,
              stretches(step.parts),
              (k) => !step.every && plan && tick(plan.id, [step.parts[k]]),
              `${plan?.name ?? "Quiet time"} · ${step.label}`,
              next,
            ),
          900,
        );
    } else if (step.kind === "doc") {
      onJump({ book: step.module });
      if (s.audio) window.setTimeout(() => player.playDoc({ module: step.module, chapter: todayTitle(), title: step.label }, 1, next), 900);
    } else if (step.kind === "web") {
      const site = onlineDevotionals(webStore.get().sites).find((o) => o.id === step.id);
      if (site) openWebDevotional(site, today(), s.audio ? { onRead: next } : {});
    }
    // Prayer and Be still show over the page (below).
  }, [s?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!s || !step) return null;
  const nextStep = s.steps[s.i + 1];
  return (
    <>
      {step.kind === "prayer" && (
        <PrayThrough
          key={s.n}
          list={prayer}
          onChange={prayerStore.set}
          touch
          doneLabel="Go on"
          chapter={readChapter}
          onClose={() => go(1)}
        />
      )}
      {step.kind === "still" && <StillSheet key={s.n} minutes={step.minutes} onDone={() => go(1)} />}
      <div className="qbar" role="region" aria-label="Quiet time">
        <div className="qbar-dots" aria-label={`Step ${s.i + 1} of ${s.steps.length}`}>
          {s.steps.map((_, k) => (
            <span key={k} className={k === s.i ? "on" : k < s.i ? "past" : ""} />
          ))}
        </div>
        <div className="qbar-row">
          <button className="ibtn" aria-label="Back a step" disabled={s.i === 0} onClick={() => go(-1)}>
            <Icon name="back" />
          </button>
          <span className="qbar-now">
            <b>{step.label}</b>
            {s.audio && <span className="m"> · Listening</span>}
          </span>
          <button className="primary qbar-next" onClick={() => go(1)}>
            {nextStep ? "Next" : "Finish"}
            {nextStep ? <Icon name="forward" size={16} /> : <Icon name="check" size={16} />}
          </button>
          <button
            className="ibtn"
            aria-label="End Quiet time"
            onClick={() => {
              player.stop();
              closeWebDevotional();
              put(null);
            }}
          >
            <Icon name="close" />
          </button>
        </div>
      </div>
    </>
  );
}

/** A soft bell, made here (no sound file), as the desktop's. */
function chime() {
  try {
    const ctx = new AudioContext();
    const t = ctx.currentTime;
    for (const [f, g] of [
      [528, 0.22],
      [1056, 0.06],
      [1584, 0.03],
    ]) {
      const o = ctx.createOscillator();
      const v = ctx.createGain();
      o.frequency.value = f;
      v.gain.setValueAtTime(0, t);
      v.gain.linearRampToValueAtTime(g, t + 0.02);
      v.gain.exponentialRampToValueAtTime(0.0001, t + 4);
      o.connect(v).connect(ctx.destination);
      o.start(t);
      o.stop(t + 4.1);
    }
    window.setTimeout(() => ctx.close(), 4500);
  } catch {
    // No sound to be had: the pause still ends.
  }
}

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

/** Be still: a quiet pause, its time counting down, a bell at the end, then on. Kept by the clock, not by
 *  counting seconds, so a phone that slept meanwhile is right when it wakes. */
function StillSheet({ minutes, onDone }: { minutes: number; onDone: () => void }) {
  const [end, setEnd] = useState(() => Date.now() + minutes * 60_000);
  const [paused, setPaused] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const left = Math.max(0, Math.ceil((end - (paused ?? now)) / 1000));
  useEffect(() => {
    if (paused !== null) return;
    if (left <= 0) {
      chime();
      const t = window.setTimeout(onDone, 2500);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => setNow(Date.now()), 250);
    return () => window.clearTimeout(t);
  }, [now, paused, left]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="still" role="dialog" aria-label="Be still">
      <span className="label">Be still</span>
      <div className="still-time">{mmss(left)}</div>
      <p className="still-verse">Be still, and know that I am God. Psalm 46:10</p>
      <button
        className="secondary"
        disabled={left <= 0}
        onClick={() => {
          if (paused === null) setPaused(Date.now());
          else {
            setEnd(end + (Date.now() - paused));
            setPaused(null);
            setNow(Date.now());
          }
        }}
      >
        <Icon name={paused === null ? "pause" : "play"} size={18} />
        {paused === null ? "Pause" : "Carry on"}
      </button>
    </div>
  );
}
