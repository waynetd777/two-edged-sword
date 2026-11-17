// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Quiet time's steps on a plan's page: the parts of Quiet time in the order they come (plans.ts
// PlanStep), any of them as often as wanted. Rows are dragged by their handle (or moved with the arrow
// keys on it) and removed with their bin; the step chosen has its settings beside the list.

import { useRef, useState } from "react";
import { api } from "./api";
import { parseRef, psalmLabel } from "./bible";
import { Icon } from "./icons";
import {
  dayTitle,
  fillDate,
  onlineDevotionals,
  partLabel,
  Plan,
  PlanStep,
  planSteps,
  refPart,
  stepId,
  StepKind,
  today,
  todayFor,
  WebDevotional,
  withSteps,
} from "./plans";
import { prayingNow } from "./prayer";
import { uid, useApp } from "./state";
import { InvertButton, inverts } from "./WebPage";
import { HL_DOT } from "./ReaderTools";
import type { HlColor } from "./state";
import { Popover, Seg } from "./ui";

/** Each kind of step: its name, icon (on one of the verse highlight colours), what it's for. */
export const KINDS: Record<StepKind, { name: string; icon: string; blurb: string; colour: HlColor }> = {
  prayer: { name: "Prayer", icon: "prayer", blurb: "Pray through your prayer list", colour: "purple" },
  worship: { name: "Worship", icon: "music", blurb: "Songs chosen for today's reading", colour: "red" },
  reading: { name: "Reading", icon: "read", blurb: "From your plan: all of today's, or one part", colour: "blue" },
  devotional: { name: "Devotional", icon: "bible", blurb: "From your library or online", colour: "green" },
  closing: { name: "Closing verse", icon: "quote", blurb: "A verse that gathers up the day", colour: "yellow" },
  passage: { name: "Favourite passage", icon: "bookmark", blurb: "The same passage every day", colour: "orange" },
  still: { name: "Be still", icon: "clock", blurb: "A quiet pause, with a bell at the end", colour: "teal" },
};
const ORDER: StepKind[] = ["prayer", "worship", "reading", "devotional", "closing", "passage", "still"];

/** Ready-made orders to start from. */
const PRESETS: { name: string; steps: () => PlanStep[] }[] = [
  {
    name: "Songs, reading, songs",
    steps: () => [
      { id: stepId(), kind: "worship", songs: 1 },
      { id: stepId(), kind: "prayer" },
      { id: stepId(), kind: "reading" },
      { id: stepId(), kind: "worship", songs: 2 },
      { id: stepId(), kind: "closing" },
    ],
  },
  { name: "Reading only", steps: () => [{ id: stepId(), kind: "reading" }] },
  {
    name: "Prayer and reading",
    steps: () => [
      { id: stepId(), kind: "still", minutes: 2 },
      { id: stepId(), kind: "prayer" },
      { id: stepId(), kind: "reading" },
      { id: stepId(), kind: "closing" },
    ],
  },
];

type Names = { devotional: (id: string) => string; part: (i: number) => string };

/** A step's name in the list. */
export function stepName(x: PlanStep, n: Names): string {
  if (x.kind === "reading") return x.part === undefined ? "Today's reading" : n.part(x.part);
  if (x.kind === "devotional") return n.devotional(x.devotional);
  if (x.kind === "worship" && x.style === "praise") return "Praise";
  return KINDS[x.kind].name;
}

/** The line under a step's name. */
function stepNote(x: PlanStep, n: Names & { all: string; points: number; noReading: boolean }): string {
  if ((x.kind === "worship" || x.kind === "closing") && n.noReading) return "Needs a Reading step to choose from";
  switch (x.kind) {
    case "prayer":
      return n.points ? `Pray through ${n.points} ${n.points === 1 ? "point" : "points"}` : "Your prayer list is empty";
    case "worship":
      return `${x.songs} ${x.style ? `${x.style} ` : ""}${x.songs === 1 ? "song" : "songs"} for today's reading`;
    case "reading":
      return x.part === undefined ? n.all : `Today's reading ${x.part + 1}`;
    case "devotional":
      return dayTitle(today());
    case "closing":
      return "Chosen for today's reading";
    case "passage":
      return psalmLabel(partLabel(x.passage));
    case "still":
      return `${x.minutes} ${x.minutes === 1 ? "minute" : "minutes"} of quiet`;
  }
}

/** About how long a step takes, in minutes. */
function minutesOf(x: PlanStep, parts: number): number {
  switch (x.kind) {
    case "prayer":
      return 6;
    case "worship":
      return x.songs * 4;
    case "reading":
      return x.part === undefined ? Math.max(1, parts) * 5 : 5;
    case "devotional":
      return 5;
    case "closing":
    case "passage":
      return 1;
    case "still":
      return x.minutes;
  }
}

/** The names the steps go by, from the library and today's reading. */
function useNames(plan: Plan): Names & { parts: string[] } {
  const app = useApp();
  const online = onlineDevotionals(app.settings.webDevotionals);
  const parts = todayFor(plan).parts.map((x) => psalmLabel(partLabel(x)));
  return {
    parts,
    devotional: (id) => online.find((o) => o.id === id)?.title ?? app.mod("devotional", id)?.title ?? "Devotional",
    part: (i) => parts[i] ?? `Reading ${i + 1}`,
  };
}

/** A step's icon on its colour. */
const StepIcon = ({ kind }: { kind: StepKind }) => (
  <span className="qs-ico" style={{ background: HL_DOT[KINDS[kind].colour] }}>
    <Icon name={KINDS[kind].icon} size={15} />
  </span>
);

const Grip = () => (
  <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
    {[3, 8, 13].flatMap((y) => [<circle key={`a${y}`} cx="2.5" cy={y} r="1.4" />, <circle key={`b${y}`} cx="7.5" cy={y} r="1.4" />])}
  </svg>
);

export function StepsCard({ plan, update }: { plan: Plan; update: (p: Plan) => void }) {
  const app = useApp();
  const steps = planSteps(plan);
  const names = useNames(plan);
  const [sel, setSel] = useState<string | null>(steps[0]?.id ?? null);
  const [adding, setAdding] = useState<DOMRect | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const points = prayingNow(app.prayer).length;
  const noReading = !steps.some((x) => x.kind === "reading");
  const ctx = { ...names, all: names.parts.join(" · ") || "Today's chapters", points, noReading };
  const total = steps.reduce((n, x) => n + minutesOf(x, names.parts.length), 0);
  const chosen = steps.find((x) => x.id === sel) ?? steps[0];
  // The plan as it is now, for a drag that changes it many times before React has drawn it.
  const latest = useRef(plan);
  latest.current = plan;
  const set = (xs: PlanStep[]) => update(withSteps(latest.current, xs));

  const move = (id: string, to: number) => {
    const xs = [...planSteps(latest.current)];
    const from = xs.findIndex((x) => x.id === id);
    if (from < 0 || to < 0 || to >= xs.length || to === from) return;
    const [x] = xs.splice(from, 1);
    xs.splice(to, 0, x);
    set(xs);
  };
  const remove = (id: string) => {
    const xs = steps.filter((x) => x.id !== id);
    if (sel === id) setSel(xs[Math.max(0, steps.findIndex((x) => x.id === id) - 1)]?.id ?? null);
    set(xs);
  };
  const add = (kind: StepKind) => {
    const id = stepId();
    const local = (app.lib?.modules ?? []).find((m) => m.kind === "devotional");
    const fresh: PlanStep | null =
      kind === "worship"
        ? { id, kind, songs: 2 }
        : kind === "devotional"
          ? { id, kind, devotional: local?.id ?? onlineDevotionals(app.settings.webDevotionals)[0].id }
          : kind === "passage"
            ? { id, kind, passage: { b: 20, c: 3, v: 5, v2: 6 } }
            : kind === "still"
              ? { id, kind, minutes: 3 }
              : kind === "reading"
                ? { id, kind }
                : { id, kind };
    if (!fresh) return;
    // After the step chosen, or at the end.
    const at = chosen ? steps.findIndex((x) => x.id === chosen.id) + 1 : steps.length;
    set([...steps.slice(0, at), fresh, ...steps.slice(at)]);
    setSel(id);
    setAdding(null);
  };
  const change = (x: PlanStep) => set(steps.map((y) => (y.id === x.id ? x : y)));

  // Dragged by the handle: rows swap as the pointer passes their middles.
  const startDrag = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setSel(id);
    setDragging(id);
    const onMove = (ev: PointerEvent) => {
      const rows = [...(list.current?.querySelectorAll<HTMLElement>("[data-step]") ?? [])];
      const from = rows.findIndex((r) => r.dataset.step === id);
      let to = rows.findIndex((r) => {
        const b = r.getBoundingClientRect();
        return ev.clientY < b.top + b.height / 2;
      });
      if (to < 0) to = rows.length - 1;
      else if (to > from) to -= 1;
      if (to !== from) move(id, to);
    };
    const onUp = () => {
      setDragging(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  return (
    <div className="card qs">
      <div className="qs-list">
        <div className="qs-head">
          <span className="label">Quiet time</span>
          <span className="n">
            {steps.length} {steps.length === 1 ? "step" : "steps"}
          </span>
          <select
            className="btn small"
            style={{ marginLeft: "auto" }}
            aria-label="Start from a ready-made order"
            value=""
            onChange={(e) => {
              const p = PRESETS[+e.target.value];
              if (!p) return;
              const xs = p.steps();
              set(xs);
              setSel(xs[0].id);
            }}
          >
            <option value="">Start from…</option>
            {PRESETS.map((p, i) => (
              <option key={p.name} value={i}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <ol ref={list} className={`qs-steps ${dragging ? "dragging" : ""}`} aria-label="Quiet time's steps">
          {steps.map((x, i) => {
            const note = stepNote(x, ctx);
            const warn = note.startsWith("Needs");
            const name = stepName(x, names);
            return (
              <li
                key={x.id}
                data-step={x.id}
                className={`qs-step ${x.id === chosen?.id ? "on" : ""} ${x.id === dragging ? "drag" : ""}`}
                onClick={() => setSel(x.id)}
              >
                <button
                  type="button"
                  className="qs-grip"
                  aria-label={`Move ${name}, step ${i + 1} of ${steps.length}: drag, or use the arrow keys`}
                  title="Drag to move"
                  onPointerDown={(e) => startDrag(e, x.id)}
                  onKeyDown={(e) => {
                    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                    e.preventDefault();
                    move(x.id, i + (e.key === "ArrowUp" ? -1 : 1));
                  }}
                >
                  <Grip />
                </button>
                <span className="qs-num">{i + 1}</span>
                <StepIcon kind={x.kind} />
                <span className="qs-text">
                  <b>{name}</b>
                  <span className={warn ? "warn" : ""}>{note}</span>
                </span>
                <span className="qs-min">{minutesOf(x, names.parts.length)} min</span>
                <button
                  type="button"
                  className="ibtn qs-del"
                  aria-label={`Remove ${name}`}
                  title="Remove this step"
                  disabled={steps.length === 1}
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(x.id);
                  }}
                >
                  <Icon name="trash" />
                </button>
              </li>
            );
          })}
        </ol>
        <div className="qs-foot">
          <button className="btn small" type="button" onClick={(e) => setAdding(e.currentTarget.getBoundingClientRect())}>
            <Icon name="plus" size={12} />
            Add a step
          </button>
          {/* Under the steps' minutes: about how long the whole of Quiet time takes. */}
          <span className="qs-total">
            Total time <b>about {total} min</b>
          </span>
        </div>
        {adding && (
          <Popover anchor={adding} onClose={() => setAdding(null)} width={300}>
            <div className="qs-kinds" role="menu">
              {ORDER.map((k) => (
                <button key={k} type="button" role="menuitem" onClick={() => add(k)}>
                  <StepIcon kind={k} />
                  <span>
                    <b>{KINDS[k].name}</b>
                    <small>{KINDS[k].blurb}</small>
                  </span>
                </button>
              ))}
            </div>
          </Popover>
        )}
      </div>
      <div className="qs-detail">
        {chosen ? <StepSettings key={chosen.id} step={chosen} names={names} noReading={noReading} onChange={change} /> : null}
      </div>
    </div>
  );
}

/** What there is to set for one step, beside the list. */
function StepSettings({
  step,
  names,
  noReading,
  onChange,
}: {
  step: PlanStep;
  names: Names & { parts: string[] };
  noReading: boolean;
  onChange: (x: PlanStep) => void;
}) {
  const app = useApp();
  const about: Record<StepKind, string> = {
    prayer: "Opens Pray through, one point at a time.",
    worship:
      "The AI assistant picks songs from your Music library to suit the day's reading. Each Worship step gets different songs. They start by themselves after a countdown, which leaves time to read why each was chosen.",
    reading:
      "Choose one part to put songs or prayer between the readings. Parts of the day no Reading step has are read after the last one.",
    devotional: "The devotional's reading for the day.",
    closing: "A verse or short passage, chosen by the AI assistant to gather up what the day's reading taught.",
    passage: "Read every day, wherever you put it.",
    still: "A time to be quiet before God. A bell ends it, and Quiet time goes on.",
  };
  return (
    <>
      <div className="qs-dhead">
        <StepIcon kind={step.kind} />
        <h3>{stepName(step, names)}</h3>
      </div>
      <p className="hint" style={{ margin: 0 }}>
        {about[step.kind]}
      </p>
      {noReading && (step.kind === "worship" || step.kind === "closing") && (
        <div className="qs-warn">Add a Reading step: this one chooses from the day's reading.</div>
      )}
      {step.kind === "worship" && (
        <div className="qs-field">
          <span>Kind of songs</span>
          <Seg
            value={step.style ?? "either"}
            options={[
              ["praise", "Praise"],
              ["worship", "Worship"],
              ["either", "Either"],
            ]}
            onChange={(v) => onChange(v === "either" ? { id: step.id, kind: "worship", songs: step.songs } : { ...step, style: v })}
          />
          <span className="hint">
            Praise songs are upbeat and celebrate God; worship songs are slower and quieter. The assistant tells them apart from what it
            knows of each song.
          </span>
        </div>
      )}
      {step.kind === "worship" && (
        <div className="qs-field">
          <span>Songs</span>
          <Seg
            value={step.songs}
            options={[1, 2, 3, 4, 5].map((n) => [n, String(n)] as [number, string])}
            onChange={(n) => onChange({ ...step, songs: n })}
          />
        </div>
      )}
      {step.kind === "reading" && (
        <div className="qs-field">
          <span>Read</span>
          <Seg
            value={step.part ?? -1}
            options={[[-1, "All of today's"] as [number, string], ...names.parts.map((p, i) => [i, p] as [number, string])]}
            onChange={(n) => onChange(n < 0 ? { id: step.id, kind: "reading" } : { ...step, part: n })}
          />
          {names.parts.length > 1 && (
            <span className="hint">Each part is the plan's first, second or third reading of the day, whatever it is that day.</span>
          )}
        </div>
      )}
      {step.kind === "devotional" && <DevotionalChoice step={step} onChange={onChange} />}
      {step.kind === "prayer" && <PrayerInfo />}
      {step.kind === "passage" && <PassageChoice step={step} onChange={onChange} />}
      {step.kind === "still" && (
        <div className="qs-field">
          <span>Length</span>
          <Seg
            value={step.minutes}
            options={[1, 2, 3, 5, 10].map((n) => [n, `${n} min`] as [number, string])}
            onChange={(n) => onChange({ ...step, minutes: n })}
          />
        </div>
      )}
      {step.kind === "closing" && !app.settings.model && <span className="hint">Needs the AI assistant, set up in Settings.</span>}
    </>
  );
}

function PrayerInfo() {
  const app = useApp();
  const n = prayingNow(app.prayer).length;
  const cats = app.prayer.cats.length;
  return (
    <div className="qs-row">
      <span style={{ color: n ? "var(--text)" : "var(--muted)" }}>
        {n
          ? `${n} ${n === 1 ? "point" : "points"} in ${cats} ${cats === 1 ? "category" : "categories"}`
          : "Your prayer list is empty, so this step is left out"}
      </span>
      <button className="btn small" type="button" style={{ marginLeft: "auto" }} onClick={() => app.go("prayer")}>
        {n ? "Open Prayer" : "Start a list"}
      </button>
    </div>
  );
}

function PassageChoice({ step, onChange }: { step: Extract<PlanStep, { kind: "passage" }>; onChange: (x: PlanStep) => void }) {
  const [text, setText] = useState("");
  const ref = parseRef(text);
  return (
    <form
      className="qs-field"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ref) return;
        onChange({ ...step, passage: refPart(ref) });
        setText("");
      }}
    >
      <span>Passage</span>
      <div style={{ display: "flex", gap: 8 }}>
        <label className="field" style={{ flex: 1 }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={psalmLabel(partLabel(step.passage))}
            aria-label="Passage"
          />
        </label>
        <button className="btn small" type="submit" disabled={!ref}>
          Change
        </button>
      </div>
      {text && !ref && <span className="hint">Not a passage: try Proverbs 3:5-6 or Psalm 23.</span>}
    </form>
  );
}

/** Which devotional a Devotional step reads: one from the library, or online (with the user's own sites). */
function DevotionalChoice({ step, onChange }: { step: Extract<PlanStep, { kind: "devotional" }>; onChange: (x: PlanStep) => void }) {
  const app = useApp();
  const local = (app.lib?.modules ?? []).filter((m) => m.kind === "devotional");
  const online = onlineDevotionals(app.settings.webDevotionals);
  const day = today();
  const pick = (id: string) => onChange({ ...step, devotional: id });
  const open = () => {
    const o = online.find((x) => x.id === step.devotional);
    if (o?.window) api.openWeb(o.id, o.url(day), o.title, inverts(app.settings, o.id)).catch((e) => app.toast(String(e)));
    else if (o) app.openWebDoc(o.id, o.url(day), o.title);
    else app.openDoc(step.devotional, dayTitle(day), "devotional");
  };
  return (
    <div className="qs-field">
      {local.length > 0 && <span>In your library</span>}
      {local.map((m) => (
        <label key={m.id} className="opt" title={m.title}>
          <input type="radio" name={`dev-${step.id}`} checked={step.devotional === m.id} onChange={() => pick(m.id)} />
          {m.title}
        </label>
      ))}
      <span style={{ marginTop: 6 }}>Online</span>
      {online.map((o) => (
        <div key={o.id} style={{ display: "flex", alignItems: "center" }}>
          <label className="opt" style={{ flex: 1, minWidth: 0 }}>
            <input type="radio" name={`dev-${step.id}`} checked={step.devotional === o.id} onChange={() => pick(o.id)} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {o.title}
              {o.window && <span className="n"> · own window</span>}
            </span>
          </label>
          {o.own && (
            <button
              className="ibtn"
              type="button"
              aria-label={`Remove ${o.title}`}
              title="Remove this website"
              onClick={() => app.set({ webDevotionals: app.settings.webDevotionals.filter((w) => w.id !== o.id) })}
            >
              <Icon name="x" size={12} />
            </button>
          )}
          <InvertButton id={o.id} />
        </div>
      ))}
      <AddWebsite
        onAdd={(w) => {
          app.set({ webDevotionals: [...app.settings.webDevotionals, w] });
          pick(w.id);
        }}
      />
      <div className="qs-row">
        <button className="btn small" type="button" onClick={open}>
          <Icon name={online.some((o) => o.id === step.devotional) ? "link" : "read"} size={12} />
          Open today's
        </button>
      </div>
    </div>
  );
}

/** In the devotionals list: a website of the user's own, by name and address. Checked as it's
 *  added: a site that won't be shown inside the app is marked to open in its own window. */
export function AddWebsite({ onAdd }: { onAdd: (w: WebDevotional) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!open)
    return (
      <button
        className="btn small"
        type="button"
        title="Add a devotional website of your own"
        style={{ alignSelf: "flex-start", marginTop: 6 }}
        onClick={() => setOpen(true)}
      >
        <Icon name="plus" size={12} />
        Add a website…
      </button>
    );
  const address = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
  const add = async () => {
    if (!title.trim() || !url.trim()) return;
    if (address.startsWith("http://")) {
      setErr("The address must start with https://");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      // Checked with today's date in, as it will be opened.
      const frameable = await api.webFrameable(fillDate(address, today()));
      onAdd({ id: `web:${uid()}`, title: title.trim(), url: address, ...(frameable ? {} : { window: true }) });
      setOpen(false);
      setTitle("");
      setUrl("");
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      <label className="field">
        <input placeholder="Name" aria-label="Name" value={title} autoFocus onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field">
        <input placeholder="https://…" aria-label="Address" value={url} onChange={(e) => setUrl(e.target.value)} />
      </label>
      <div className="hint" style={{ fontSize: 12 }}>
        For a page that changes address each day, put {"{yyyy}"}, {"{mm}"} and {"{dd}"} where today's date goes.
      </div>
      {err && (
        <div className="err" style={{ fontSize: 12.5 }}>
          {err}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button className="btn small" type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button className="btn small primary" type="submit" disabled={busy || !title.trim() || !url.trim()}>
          {busy ? "Checking…" : "Add"}
        </button>
      </div>
    </form>
  );
}
