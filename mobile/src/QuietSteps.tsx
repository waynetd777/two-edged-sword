// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Quiet time's steps on the phone, as on the desktop's plan page (src/QuietSteps.tsx): the plan's steps in
// order (synced with the plan). Edit shows each row's bin and handle, to remove a step or drag it
// elsewhere; tapping a step opens its settings. Worship and the closing verse can't be added here (they
// need the computer's Music library and AI assistant): ones set on the computer show, and can be moved or
// removed, but are left out when the phone goes through Quiet time.

import { invoke } from "@tauri-apps/api/core";
import { useRef, useState } from "react";
import { parseRef } from "../../src/bible";
import { prayingNow } from "../../src/prayer";
import type { Module } from "./api";
import { Icon, type IconName } from "./icons";
import {
  fillDate,
  partLabel,
  Plan,
  PlanStep,
  planSteps,
  psalmLabel,
  refPart,
  stepId,
  StepKind,
  today,
  todayFor,
  withSteps,
} from "./plansShared";
import { plansStore } from "./plansStore";
import { usePrayer } from "./prayerStore";
import { useOnline, webStore } from "./webStore";

/** The verse highlight colours, as the highlight picker shows them (the desktop's ReaderTools.tsx HL_DOT). */
const DOT = {
  red: "#e59a92",
  orange: "#efb97e",
  yellow: "#e9d271",
  green: "#a9cf9f",
  teal: "#8fcfc6",
  blue: "#9fc0e6",
  purple: "#c1a9e3",
};
const KINDS: Record<StepKind, { name: string; icon: IconName; blurb: string; colour: string; mac?: true }> = {
  prayer: { name: "Prayer", icon: "prayer", blurb: "Pray through your prayer list", colour: DOT.purple },
  worship: { name: "Worship", icon: "music", blurb: "Songs for today's reading", colour: DOT.red, mac: true },
  reading: { name: "Reading", icon: "book", blurb: "From your plan: all of today's, or one part", colour: DOT.blue },
  devotional: { name: "Devotional", icon: "paragraph", blurb: "From your library or online", colour: DOT.green },
  closing: { name: "Closing verse", icon: "quote", blurb: "A verse that gathers up the day", colour: DOT.yellow, mac: true },
  passage: { name: "Favourite passage", icon: "star", blurb: "The same passage every day", colour: DOT.orange },
  still: { name: "Be still", icon: "clock", blurb: "A quiet pause, with a bell at the end", colour: DOT.teal },
};
const ADDABLE: StepKind[] = ["prayer", "reading", "devotional", "passage", "still"];

const StepIcon = ({ kind }: { kind: StepKind }) => (
  <span className="qs-ico" style={{ background: KINDS[kind].colour }}>
    <Icon name={KINDS[kind].icon} size={18} />
  </span>
);

export function StepsList({ plan, modules }: { plan: Plan; modules: Module[] }) {
  const steps = planSteps(plan);
  const online = useOnline();
  const prayer = usePrayer();
  const parts = todayFor(plan).parts.map((x) => psalmLabel(partLabel(x)));
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState<string | "add" | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const set = (xs: PlanStep[]) => {
    const now = plansStore.get().find((p) => p.id === plan.id) ?? plan;
    plansStore.update(withSteps(now, xs));
  };
  const points = prayingNow(prayer).length;
  const devName = (id: string) => online.find((o) => o.id === id)?.title ?? modules.find((m) => m.id === id)?.title ?? "Devotional";
  const name = (x: PlanStep) =>
    x.kind === "reading"
      ? x.part === undefined
        ? "Today's reading"
        : (parts[x.part] ?? `Reading ${x.part + 1}`)
      : x.kind === "devotional"
        ? devName(x.devotional)
        : x.kind === "worship" && x.style === "praise"
          ? "Praise"
          : KINDS[x.kind].name;
  const note = (x: PlanStep) => {
    if (KINDS[x.kind].mac) return "Plays on your Mac";
    if (x.kind === "prayer") return points ? `Pray through ${points} ${points === 1 ? "point" : "points"}` : "Your prayer list is empty";
    if (x.kind === "reading") return x.part === undefined ? parts.join(" · ") : `Today's reading ${x.part + 1}`;
    if (x.kind === "devotional") return online.some((o) => o.id === x.devotional) ? "Online" : "From your library";
    if (x.kind === "passage") return psalmLabel(partLabel(x.passage));
    if (x.kind === "still") return `${x.minutes} ${x.minutes === 1 ? "minute" : "minutes"} of quiet`;
    return "";
  };
  const move = (id: string, to: number) => {
    const xs = [...planSteps(plansStore.get().find((p) => p.id === plan.id) ?? plan)];
    const from = xs.findIndex((x) => x.id === id);
    if (from < 0 || to < 0 || to >= xs.length || to === from) return;
    const [x] = xs.splice(from, 1);
    xs.splice(to, 0, x);
    set(xs);
  };
  // Dragged by the handle: rows swap as the finger passes their middles.
  const startDrag = (e: React.PointerEvent, id: string) => {
    e.preventDefault();
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
  const add = (kind: StepKind) => {
    const id = stepId();
    const dev = modules.find((m) => m.kind === "devotional")?.id ?? online[0].id;
    const fresh: PlanStep =
      kind === "devotional"
        ? { id, kind, devotional: dev }
        : kind === "passage"
          ? { id, kind, passage: { b: 20, c: 3, v: 5, v2: 6 } }
          : kind === "still"
            ? { id, kind, minutes: 3 }
            : kind === "worship"
              ? { id, kind, songs: 2 }
              : { id, kind };
    set([...steps, fresh]);
    setOpen(kind === "prayer" || kind === "reading" ? null : id);
  };
  const chosen = steps.find((x) => x.id === open);

  return (
    <>
      <p className="label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18 }}>
        <span>Steps</span>
        <button className="linkbtn" onClick={() => setEditing(!editing)}>
          {editing ? "Done" : "Edit"}
        </button>
      </p>
      <ol
        ref={list}
        className={`qsteps card flush ${editing ? "editing" : ""} ${dragging ? "dragging" : ""}`}
        aria-label="Quiet time's steps"
      >
        {steps.map((x) => (
          <li key={x.id} data-step={x.id} className={`qstep ${x.id === dragging ? "drag" : ""} ${KINDS[x.kind].mac ? "mac" : ""}`}>
            {editing && (
              <button
                className="qstep-del"
                aria-label={`Remove ${name(x)}`}
                disabled={steps.length === 1}
                onClick={() => set(steps.filter((y) => y.id !== x.id))}
              >
                <Icon name="trash" size={18} />
              </button>
            )}
            <button className="qstep-main" disabled={editing} onClick={() => setOpen(x.id)}>
              <StepIcon kind={x.kind} />
              <span className="qstep-text">
                <b>{name(x)}</b>
                <span>{note(x)}</span>
              </span>
              {!editing && <span className="m">›</span>}
            </button>
            {editing && (
              <span className="qstep-grip" role="button" aria-label={`Move ${name(x)}`} onPointerDown={(e) => startDrag(e, x.id)}>
                <Icon name="grip" size={22} />
              </span>
            )}
          </li>
        ))}
      </ol>
      <button className="qsteps-add" onClick={() => setOpen("add")}>
        <Icon name="plus" size={18} />
        Add a step
      </button>

      {open && (
        <>
          <div className="scrim" onClick={() => setOpen(null)} />
          <section className="sheet qsheet" aria-label={open === "add" ? "Add a step" : chosen ? name(chosen) : ""}>
            {open === "add" ? (
              <>
                <div className="qsheet-head">
                  <h2>Add a step</h2>
                  <button className="linkbtn" onClick={() => setOpen(null)}>
                    Cancel
                  </button>
                </div>
                {ADDABLE.map((k) => (
                  <button key={k} className="qsheet-kind" onClick={() => add(k)}>
                    <StepIcon kind={k} />
                    <span className="qstep-text">
                      <b>{KINDS[k].name}</b>
                      <span>{KINDS[k].blurb}</span>
                    </span>
                  </button>
                ))}
                <p className="m" style={{ margin: "4px 4px 0" }}>
                  Worship and Closing verse are added on your Mac: they need its Music library and AI assistant.
                </p>
              </>
            ) : chosen ? (
              <>
                <div className="qsheet-head">
                  <StepIcon kind={chosen.kind} />
                  <h2>{name(chosen)}</h2>
                  <button className="linkbtn" onClick={() => setOpen(null)}>
                    Done
                  </button>
                </div>
                <StepSettings
                  step={chosen}
                  parts={parts}
                  modules={modules}
                  onChange={(y) => set(steps.map((z) => (z.id === y.id ? y : z)))}
                />
                <button
                  className="secondary danger"
                  disabled={steps.length === 1}
                  onClick={() => {
                    set(steps.filter((y) => y.id !== chosen.id));
                    setOpen(null);
                  }}
                >
                  <Icon name="trash" size={18} />
                  Remove this step
                </button>
              </>
            ) : null}
          </section>
        </>
      )}
    </>
  );
}

function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg wrapseg" role="tablist">
      {options.map(([v, l]) => (
        <button key={String(v)} role="tab" aria-selected={v === value} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

function StepSettings({
  step,
  parts,
  modules,
  onChange,
}: {
  step: PlanStep;
  parts: string[];
  modules: Module[];
  onChange: (x: PlanStep) => void;
}) {
  if (step.kind === "worship" || step.kind === "closing")
    return (
      <p className="m qsheet-note">
        {step.kind === "worship"
          ? "Songs chosen from your Mac's Music library by its AI assistant. They play when you go through Quiet time on your Mac; on the phone this step is left out."
          : "A verse chosen by your Mac's AI assistant to gather up the day. It's shown when you go through Quiet time on your Mac; on the phone this step is left out."}
      </p>
    );
  if (step.kind === "prayer")
    return <p className="m qsheet-note">Opens Pray through, one point at a time. Left out while your prayer list is empty.</p>;
  if (step.kind === "reading")
    return (
      <div className="qsheet-field">
        <span>Read</span>
        <Seg
          value={step.part ?? -1}
          options={[[-1, "All of today's"] as [number, string], ...parts.map((p, i) => [i, p] as [number, string])]}
          onChange={(n) => onChange(n < 0 ? { id: step.id, kind: "reading" } : { ...step, part: n })}
        />
        <p className="m">Parts of the day no Reading step has are read after the last one.</p>
      </div>
    );
  if (step.kind === "still")
    return (
      <div className="qsheet-field">
        <span>Length</span>
        <Seg
          value={step.minutes}
          options={[1, 2, 3, 5, 10].map((n) => [n, `${n} min`] as [number, string])}
          onChange={(n) => onChange({ ...step, minutes: n })}
        />
      </div>
    );
  if (step.kind === "passage") return <PassageChoice step={step} onChange={onChange} />;
  return <DevotionalChoice step={step} modules={modules} onChange={onChange} />;
}

function PassageChoice({ step, onChange }: { step: Extract<PlanStep, { kind: "passage" }>; onChange: (x: PlanStep) => void }) {
  const [text, setText] = useState("");
  const ref = parseRef(text);
  return (
    <form
      className="qsheet-field"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ref) return;
        onChange({ ...step, passage: refPart(ref) });
        setText("");
      }}
    >
      <span>Passage</span>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="field"
          style={{ flex: 1, minWidth: 0 }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={psalmLabel(partLabel(step.passage))}
          aria-label="Passage"
        />
        <button className="primary" type="submit" disabled={!ref} style={{ flex: "none" }}>
          Change
        </button>
      </div>
      {text && !ref && <p className="m">Not a passage: try Proverbs 3:5-6 or Psalm 23.</p>}
    </form>
  );
}

/** Which devotional a Devotional step reads: one in the phone's library, or online (the user's own sites too). */
function DevotionalChoice({
  step,
  modules,
  onChange,
}: {
  step: Extract<PlanStep, { kind: "devotional" }>;
  modules: Module[];
  onChange: (x: PlanStep) => void;
}) {
  const local = modules.filter((m) => m.kind === "devotional");
  const online = useOnline();
  const pick = (id: string) => onChange({ ...step, devotional: id });
  const Opt = ({ id, title, own, note }: { id: string; title: string; own?: boolean; note?: string }) => (
    <div className="qsheet-opt">
      <label>
        <input type="radio" name={`dev-${step.id}`} checked={step.devotional === id} onChange={() => pick(id)} />
        <span>
          {title}
          {note && <span className="m"> · {note}</span>}
        </span>
      </label>
      {own && (
        <button className="ibtn" aria-label={`Remove ${title}`} onClick={() => webStore.setSites((s) => s.filter((w) => w.id !== id))}>
          <Icon name="close" size={18} />
        </button>
      )}
    </div>
  );
  return (
    <div className="qsheet-field">
      {local.length > 0 && <span>In your library</span>}
      {local.map((m) => (
        <Opt key={m.id} id={m.id} title={m.title} />
      ))}
      <span style={{ marginTop: 8 }}>Online</span>
      {online.map((o) => (
        <Opt key={o.id} id={o.id} title={o.title} own={o.own} note={o.window ? "opens on its own" : undefined} />
      ))}
      <AddWebsite onAdd={(id) => pick(id)} />
    </div>
  );
}

/** A devotional website of the user's own, by name and address; checked as it's added, as on the
 *  desktop: a site that won't be shown inside the app opens in a view of its own. Synced with the computer. */
function AddWebsite({ onAdd }: { onAdd: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!open)
    return (
      <button className="secondary" style={{ marginTop: 8 }} onClick={() => setOpen(true)}>
        <Icon name="plus" size={18} />
        Add a website…
      </button>
    );
  const address = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
  const add = async () => {
    if (!title.trim() || !url.trim()) return;
    if (address.startsWith("http://")) return setErr("The address must start with https://");
    setBusy(true);
    setErr(null);
    try {
      const frameable = await invoke<boolean>("web_frameable", { url: fillDate(address, today()) });
      const id = `web:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      webStore.setSites((s) => [...s, { id, title: title.trim(), url: address, ...(frameable ? {} : { window: true }) }]);
      onAdd(id);
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
      className="qsheet-field"
      style={{ marginTop: 8 }}
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      <input className="field" placeholder="Name" aria-label="Name" value={title} onChange={(e) => setTitle(e.target.value)} />
      <input
        className="field"
        placeholder="https://…"
        aria-label="Address"
        inputMode="url"
        autoCapitalize="off"
        autoCorrect="off"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <p className="m">
        For a page that changes address each day, put {"{yyyy}"}, {"{mm}"} and {"{dd}"} where today's date goes.
      </p>
      {err && (
        <p className="m" style={{ color: "var(--red)" }}>
          {err}
        </p>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="secondary" type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button className="primary" type="submit" disabled={busy || !title.trim() || !url.trim()}>
          {busy ? "Checking…" : "Add"}
        </button>
      </div>
    </form>
  );
}
