// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { ReactNode, useEffect, useRef, useState } from "react";
import { Module, saved, scene } from "./api";
import { Help } from "./Help";
import { JournalList } from "./JournalEdit";
import { Icon } from "./icons";
import { NavButtons } from "./NavButtons";
import {
  behind,
  current,
  doneToday,
  fmtLong,
  markDayRead,
  partLabel,
  partRef,
  Plan,
  progressKey,
  psalmLabel,
  readOn,
  tickPart,
  today,
  todayFor,
  unmarkDayRead,
} from "./plansShared";
import { buildPlan, Choice, CHOICES, plansStore, startPlan, usePlans } from "./plansStore";
import type { Jump } from "./Search";
import { Settings } from "./Settings";
import { player, usePlayer } from "./player";
import { partKey, startQuiet } from "./QuietSession";
import { StepsList } from "./QuietSteps";

/** A screen with a title in its top bar: Journal, Settings and Help. */
export function Titled({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <header className="topbar">
        <NavButtons />
        <h1 className="bartitle">{title}</h1>
      </header>
      <div className="results">{children}</div>
    </>
  );
}

export const JournalScreen = () => (
  <Titled title="Journal">
    <JournalList />
  </Titled>
);
export const SettingsScreen = ({ modules }: { modules: Module[] }) => (
  <Titled title="Settings">
    <Settings modules={modules} />
  </Titled>
);
export const HelpScreen = () => (
  <Titled title="Help">
    <Help />
  </Titled>
);

/** Quiet time: today's reading from the current plan, Quiet time's steps, then the plans to keep or start. */
export function PlansTab({ modules, onJump, onLibrary }: { modules: Module[]; onJump: (j: Jump) => void; onLibrary: () => void }) {
  useEffect(() => {
    // Debug: plan=<choice> starts a plan.
    scene.then((sc) => {
      const c = sc.find((x) => x.startsWith("plan="))?.slice(5) as Choice | undefined;
      if (c && !plansStore.get().length) buildPlan(c, "kjv").then(startPlan);
    });
  }, []);
  const plan = current(usePlans());
  const top = useRef<HTMLDivElement>(null);
  return (
    <>
      <header className="topbar">
        <NavButtons />
        <h1 className="bartitle">Quiet time</h1>
      </header>
      <div className="results" ref={top}>
        <p className="label" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Today's reading</span>
          <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>{fmtLong(today()).replace(/ \d{4}$/, "")}</span>
        </p>
        {plan ? (
          <TodayCard plan={plan} modules={modules} onJump={onJump} />
        ) : (
          <div className="card">
            <p style={{ margin: 0 }}>Choose a reading plan below, and today's reading shows here each day.</p>
          </div>
        )}
        {plan && <StepsList plan={plan} modules={modules} />}
        <div style={{ marginTop: 18 }}>
          <Plans modules={modules} onLibrary={onLibrary} onStarted={() => top.current?.scrollTo({ top: 0, behavior: "smooth" })} />
        </div>
      </div>
    </>
  );
}

function TodayCard({ plan, modules, onJump }: { plan: Plan; modules: Module[]; onJump: (j: Jump) => void }) {
  const pl = usePlayer();
  const d = today();
  const t = todayFor(plan);
  const key = progressKey(plan, d);
  const ticked = doneToday(plan, key);
  const read = readOn(plan, d);
  const finished = plan.kind === "sequence" && t.label === "Finished";
  const late = plan.kind === "sequence" ? behind(plan) : 0;
  const keys = t.parts.map(partKey);
  const tick = (k: string) => plansStore.update(tickPart(plan, key, k, keys, d));
  /** Quiet time in the plan's steps, read aloud, each step going on to the next by itself. */
  const listen = () => startQuiet(plan, modules, true);
  const listening = pl.on;
  useEffect(() => {
    scene.then((sc) => sc.includes("listenplan") && setTimeout(listen, 1500));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontWeight: 600 }}>{plan.name}</span>
        <span className="m">{t.progress}</span>
      </div>
      <div className="progress" style={{ margin: "10px 0 4px" }}>
        <span style={{ width: `${t.pct}%` }} />
      </div>
      {late > 0 && (
        <p className="m" style={{ margin: "6px 0 0" }}>
          {late === 1 ? "A day behind" : `${late} days behind`}
        </p>
      )}
      {finished ? (
        <p style={{ margin: "12px 0 0" }}>Finished. Well done! Choose a new plan under Quiet time.</p>
      ) : (
        <>
          <div style={{ marginTop: 8 }}>
            {t.parts.map((x) => {
              const k = partKey(x);
              const on = read || ticked.includes(k);
              return (
                <div key={k} className="row" style={{ padding: 0, borderTop: "1px solid var(--line)" }}>
                  <button
                    className={`tick ${on ? "on" : ""}`}
                    aria-label={on ? `${partLabel(x)} read` : `Mark ${partLabel(x)} read`}
                    onClick={() => !on && tick(k)}
                  >
                    {on && <Icon name="check" size={14} />}
                  </button>
                  <button
                    className="grow"
                    style={{
                      border: "none",
                      background: "none",
                      textAlign: "left",
                      minHeight: 48,
                      fontSize: 17,
                      fontFamily: "var(--read)",
                      color: on ? "var(--muted)" : "var(--text)",
                      textDecoration: on ? "line-through" : "none",
                    }}
                    onClick={() => onJump({ ref: partRef(x) })}
                  >
                    {psalmLabel(partLabel(x))}
                  </button>
                  <span className="m">›</span>
                </div>
              );
            })}
          </div>
          <div className="actions">
            {read ? (
              <button className="secondary" onClick={() => plansStore.update(unmarkDayRead(plan, d))}>
                Read today · Undo
              </button>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="primary" onClick={() => startQuiet(plan, modules, false)}>
                    {ticked.length ? "Continue" : "Begin"}
                  </button>
                  <button className="secondary listenplan" onClick={() => (listening ? player.stop() : listen())}>
                    <Icon name="speaker" size={18} />
                    {listening ? "Stop" : "Listen"}
                  </button>
                </div>
                <button className="secondary" style={{ flex: "none" }} onClick={() => plansStore.update(markDayRead(plan, d))}>
                  Mark as read
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Plans({ modules, onLibrary, onStarted }: { modules: Module[]; onLibrary: () => void; onStarted: () => void }) {
  const plans = usePlans();
  const [busy, setBusy] = useState<Choice | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Plan | null>(null);
  const hasMeyer = modules.some((m) => m.kind === "commentary" && m.id === "meyer");
  const bible = saved("bible", "kjv+").replace(/\+$/, "");
  const bibleId = modules.some((m) => m.id === bible) ? bible : saved("bible", "kjv+");

  const start = (c: Choice) => {
    setBusy(c);
    setErr(null);
    buildPlan(c, bibleId)
      .then((p) => {
        startPlan(p);
        onStarted();
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setBusy(null));
  };

  return (
    <>
      {plans.length > 0 && (
        <>
          <p className="label">Your plans</p>
          {plans.map((p) => {
            const t = todayFor(p);
            return (
              <div key={p.id} className={`card ${p.active ? "current" : ""}`} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ flex: 1, fontWeight: 600 }}>{p.name}</span>
                  {p.active ? <span className="tag on">Current</span> : <span className="tag">Paused</span>}
                </div>
                <p className="m" style={{ margin: "4px 0 8px" }}>
                  {t.progress} · {t.label}
                </p>
                <div className="progress">
                  <span style={{ width: `${t.pct}%` }} />
                </div>
                <div className="actions">
                  {p.active ? (
                    <button
                      className="secondary"
                      onClick={() => plansStore.set((ps) => ps.map((x) => (x.id === p.id ? { ...x, active: false } : x)))}
                    >
                      Pause
                    </button>
                  ) : (
                    <button className="secondary" onClick={() => plansStore.set((ps) => ps.map((x) => ({ ...x, active: x.id === p.id })))}>
                      Make current
                    </button>
                  )}
                  <button className="secondary danger" onClick={() => setDeleting(p)}>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </>
      )}

      <p className="label" style={{ marginTop: plans.length ? 18 : 0 }}>
        Start a plan
      </p>
      <div className="card flush">
        {CHOICES.map((c) =>
          c.id === "meyer" && !hasMeyer ? (
            <button key={c.id} className="row" onClick={onLibrary}>
              <span className="grow" style={{ display: "flex", flexDirection: "column", padding: "8px 0" }}>
                <span>{c.name}</span>
                <span className="m">Download F. B. Meyer's notes in the Library first</span>
              </span>
              <span className="m">›</span>
            </button>
          ) : (
            <button key={c.id} className="row" disabled={!!busy} onClick={() => start(c.id)}>
              <span className="grow" style={{ display: "flex", flexDirection: "column", padding: "8px 0" }}>
                <span>{c.name}</span>
                <span className="m">{busy === c.id ? "Making the plan…" : c.meta}</span>
              </span>
              <span className="m">+</span>
            </button>
          ),
        )}
      </div>
      {err && (
        <p className="m" style={{ color: "var(--red)", marginTop: 8 }}>
          Couldn't make the plan: {err}
        </p>
      )}
      <p className="m" style={{ marginTop: 10, lineHeight: 1.5 }}>
        A plan starts today, in the Bible you're reading. Starting one pauses the current plan; it keeps its place.
      </p>

      {deleting && (
        <>
          <div className="scrim" onClick={() => setDeleting(null)} />
          <section className="sheet" aria-label="Delete plan" style={{ padding: "16px 16px calc(var(--bottom) + 16px)" }}>
            <p style={{ margin: "0 0 14px", fontSize: 16 }}>Delete “{deleting.name}” and its progress?</p>
            <div className="actions">
              <button className="secondary" onClick={() => setDeleting(null)}>
                Keep
              </button>
              <button
                className="primary danger"
                onClick={() => {
                  plansStore.set((ps) => ps.filter((x) => x.id !== deleting.id));
                  setDeleting(null);
                }}
              >
                Delete
              </button>
            </div>
          </section>
        </>
      )}
    </>
  );
}
