// Quiet time: today's plan and devotionals as one session. Each part opens in turn (a chapter in
// the Bible reader, a devotional in the reading column, an online one in its own window) under a
// floating bar with Previous and Next. With audio, a part that finishes reading opens the next,
// waits two seconds and reads on. Parts are ticked off as they are finished, and the plan's day is
// marked read once all its Bible parts are. A plan with worship songs gets a Worship part before
// or after the reading: songs from the Music library chosen for the day (worship.ts), played in
// Music while the part is open, moving on when they finish.

import { useEffect, useRef, useState } from "react";
import { Working } from "./Ask";
import { api, MusicState } from "./api";
import { book } from "./bible";
import { docSegments } from "./esword";
import { Icon, Pause, Play } from "./icons";
import { dayTitle, doneToday, ONLINE_DEVOTIONALS, Part, Plan, progressKey, tickPart } from "./plans";
import { usePlayer } from "./speech";
import { QuietStep, useApp } from "./state";
import { pickSongs } from "./worship";

const FIRST_DELAY = 900; // let the first part's screen open before reading starts
const NEXT_DELAY = 2000;

/** Today's parts, one chapter at a time, then the chosen devotionals; worship songs first or last. */
export function quietSteps(plan: Plan, parts: Part[], devotionalIds: string[], day: Date): QuietStep[] {
  const steps: QuietStep[] = [];
  for (const p of parts) {
    const last = p.c2 ?? p.c;
    for (let c = p.c; c <= last; c++) {
      const whole = p.c === last && p.v ? { v: p.v, v2: p.v2 } : {};
      const label = `${book(p.b).name.replace(/^Psalms$/, "Psalm")} ${c}${whole.v ? `:${whole.v}${whole.v2 ? `–${whole.v2}` : ""}` : ""}`;
      steps.push({ key: `${p.b}.${c}`, label, kind: "bible", bible: plan.bible, b: p.b, c, ...whole });
    }
  }
  for (const id of devotionalIds) {
    const o = ONLINE_DEVOTIONALS.find((x) => x.id === id);
    if (o) steps.push({ key: id, label: o.title, kind: "online", id, url: o.url(day) });
    else steps.push({ key: id, label: id, kind: "devotional", module: id, title: dayTitle(day) });
  }
  const w = plan.worship;
  if (w && steps.length) {
    const step: QuietStep = { key: "worship", label: "Worship", kind: "worship", songs: w.songs, when: w.when };
    if (w.when === "before") steps.unshift(step); else steps.push(step);
  }
  return steps;
}

export function useStartQuietTime() {
  const app = useApp();
  return (plan: Plan, parts: Part[], audio: boolean) => {
    const day = new Date();
    const ids = (plan.devotionals ?? []).filter((id) => id.startsWith("online:") || app.mod("devotional", id));
    const steps = quietSteps(plan, parts, ids, day).map((s) => (s.kind === "devotional" ? { ...s, label: app.mod("devotional", s.module)?.abbrev || s.label } : s));
    if (!steps.length) return;
    // Start at the first part not yet read today.
    const dayKey = progressKey(plan, day);
    const done = doneToday(plan, dayKey);
    const i = Math.max(0, steps.findIndex((s) => !done.includes(s.key)));
    app.setSession({ planId: plan.id, dayKey, steps, i, audio, started: Date.now() });
  };
}

/** Opens each part as the session reaches it, reads it aloud in audio mode, and shows the bar. */
export function QuietTime({ focus }: { focus: boolean }) {
  const app = useApp();
  const player = usePlayer();
  const s = app.session;
  const timer = useRef<number | undefined>(undefined);
  const first = useRef(true);

  const plan = s ? app.plans.find((p) => p.id === s.planId) : undefined;
  const bibleKeys = s ? s.steps.filter((x) => x.kind === "bible").map((x) => x.key) : [];
  const done = plan && s ? doneToday(plan, s.dayKey) : [];

  const tick = (key: string) => {
    if (!s) return;
    app.setPlans((ps) => ps.map((p) => (p.id === s.planId ? tickPart(p, s.dayKey, key, bibleKeys, new Date()) : p)));
  };
  // Forward ticks off the part being left; going past the last part ends the session.
  const go = (d: number) => {
    if (!s) return;
    if (d > 0) tick(s.steps[s.i].key);
    const j = s.i + d;
    if (j < 0) return;
    if (j >= s.steps.length) {
      window.clearTimeout(timer.current);
      app.setSession(null);
      app.toast("Quiet time done");
      return;
    }
    app.setSession((x) => (x ? { ...x, i: j } : x));
  };
  const goRef = useRef(go);
  goRef.current = go;

  // A new session starts with the short delay; later parts wait two seconds.
  useEffect(() => { first.current = true; }, [s?.started]);

  // Worship songs are chosen as the session starts, so they're ready by the time they're wanted.
  useEffect(() => {
    const w = s?.steps.find((x) => x.kind === "worship");
    if (!s || !w || w.kind !== "worship" || w.picked) return;
    const started = s.started;
    const about = s.steps.filter((x) => x.kind !== "worship").map((x) => x.label);
    const put = (picked: { id: string; name: string; artist: string }[], note?: string) =>
      app.setSession((x) => (x && x.started === started ? { ...x, steps: x.steps.map((y) => (y.kind === "worship" ? { ...y, picked, note } : y)) } : x));
    pickSongs(w.songs, about, w.when, app.settings.model).then((p) => put(p.songs, p.note)).catch((e) => put([], e instanceof Error ? e.message : String(e)));
  }, [s?.started]); // eslint-disable-line react-hooks/exhaustive-deps

  // The Worship part: its songs play in Music (once chosen), the bar shows what's playing, and the
  // part moves on when they finish. Leaving it pauses them.
  const cur = s?.steps[s.i];
  const songs = cur?.kind === "worship" ? cur.picked : undefined;
  const [now, setNow] = useState<MusicState | null>(null);
  useEffect(() => {
    setNow(null);
    // None chosen (the bar says why): it waits for Next.
    if (!songs?.length) return;
    let dead = false, heard = false, poll: number | undefined;
    api.musicPlay(songs.map((x) => x.id)).then((n) => {
      if (dead) return;
      if (!n) { app.toast("Couldn't find the songs in Music"); return; }
      poll = window.setInterval(async () => {
        const st = await api.musicState().catch(() => null);
        if (dead || !st) return;
        setNow(st);
        if (st.ours && st.state === "playing") heard = true;
        else if (heard && (!st.ours || st.state === "stopped")) { window.clearInterval(poll); goRef.current(1); }
      }, 2000);
    }).catch((e) => { if (!dead) app.toast(String(e)); });
    return () => { dead = true; window.clearInterval(poll); api.musicControl("pause").catch(() => {}); };
  }, [s?.started, s?.i, !!songs]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    window.clearTimeout(timer.current);
    if (!s) return;
    const step = s.steps[s.i];
    if (step.kind === "bible") {
      if (app.mod("bible", step.bible) && app.settings.bible !== step.bible) app.set({ bible: step.bible });
      app.open({ book: step.b, chapter: step.c, verse: step.v, to: step.v2 }, "read");
    } else if (step.kind === "devotional") {
      app.openDoc(step.module, step.title, "devotional");
    } else if (step.kind === "worship") {
      // Plays where it is (the effect above); the page stays as it was.
    } else {
      api.openWeb(step.id, step.url, step.label).catch((e) => app.toast(String(e)));
    }
    if (s.audio && step.kind !== "online" && step.kind !== "worship") {
      const delay = first.current ? FIRST_DELAY : NEXT_DELAY;
      const onEnd = () => goRef.current(1);
      timer.current = window.setTimeout(async () => {
        if (step.kind === "bible") player.play(step.bible, step.b, step.c, step.v, { toVerse: step.v2, onEnd });
        else if (step.kind === "devotional") {
          const html = await api.devotion(step.module, step.title).catch(() => null);
          const segs = html ? docSegments(html) : [];
          if (segs.length) player.playDoc(step.module, step.title, segs, 0, "devotional", { onEnd });
          else onEnd();
        }
      }, delay);
    }
    first.current = false;
    return () => window.clearTimeout(timer.current);
  }, [s?.started, s?.i]); // eslint-disable-line react-hooks/exhaustive-deps

  // Where the bar sits: level with the page's heading (data-quiet-anchor), centred over the page,
  // or in focus mode just right of the heading's text. Measured as if scrolled to the top, so the
  // bar stays put while the page scrolls under it.
  const [at, setAt] = useState<{ x?: number; y: number } | null>(null);
  useEffect(() => {
    if (!s) return;
    const measure = () => {
      const el = document.querySelector<HTMLElement>("[data-quiet-anchor]");
      if (!el) { setAt({ y: 84 }); return; }
      const range = document.createRange();
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      const y = r.top + r.height / 2 + (el.closest(".scroll")?.scrollTop ?? 0);
      setAt(focus ? { x: r.right + 24, y } : { y });
    };
    const ts = [0, 80, 400, 1000].map((ms) => window.setTimeout(measure, ms)); // headings arrive with the content
    window.addEventListener("resize", measure);
    return () => { ts.forEach(window.clearTimeout); window.removeEventListener("resize", measure); };
  }, [s?.i, s?.started, focus, app.loc.book, app.loc.chapter, app.doc?.title, app.settings.studyPane]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!s) return null;
  const step = s.steps[s.i];
  const next = s.steps[s.i + 1];
  const end = () => { window.clearTimeout(timer.current); if (s.audio) player.stop(); app.setSession(null); };
  return (
    <div role="region" aria-label="Quiet time" style={at?.x !== undefined
      ? { position: "fixed", top: at.y, left: at.x, right: 16, transform: "translateY(-50%)", display: "flex", pointerEvents: "none", zIndex: 45 }
      : { position: "fixed", top: at?.y ?? 84, transform: "translateY(-50%)", left: focus ? 0 : 200, right: 0, display: "flex", justifyContent: "center", pointerEvents: "none", zIndex: 45 }}>
      <div style={{ pointerEvents: "auto", display: "flex", alignItems: "center", gap: 10, padding: "6px 8px 6px 14px", borderRadius: 24, background: "var(--panel)", border: "1px solid var(--border)", boxShadow: "0 10px 30px var(--shadow)", maxWidth: "calc(100% - 48px)" }}>
        <span className="label" style={{ color: "var(--accent)", whiteSpace: "nowrap" }}>Quiet time{s.audio && <Icon name="speaker" size={12} style={{ marginLeft: 6, verticalAlign: -2 }} />}</span>
        <span style={{ display: "flex", gap: 4 }} aria-label={`Part ${s.i + 1} of ${s.steps.length}`}>
          {s.steps.map((x, k) => (
            <button key={x.key + k} type="button" title={x.label + (done.includes(x.key) ? " · read" : "")} onClick={() => app.setSession((y) => (y ? { ...y, i: k } : y))}
              style={{ width: k === s.i ? 18 : 8, height: 8, borderRadius: 999, border: 0, padding: 0, cursor: "pointer", background: k === s.i ? "var(--accent)" : done.includes(x.key) ? "var(--barsoft)" : "var(--border)", transition: "width 0.2s" }} />
          ))}
        </span>
        <b style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{step.label}</b>
        {step.kind === "online" && <span className="n" style={{ whiteSpace: "nowrap" }}>in its own window · Next when done</span>}
        {step.kind === "worship" && <WorshipNow step={step} now={now} />}
        <button className="ibtn" type="button" aria-label="Previous part" title="Previous" disabled={s.i === 0} onClick={() => go(-1)}><Icon name="back" /></button>
        <button className="btn primary small" type="button" onClick={() => go(1)} style={{ whiteSpace: "nowrap" }}>{next ? <>Next: {next.label}<Icon name="fwd" size={13} /></> : <><Icon name="check" size={13} />Finish</>}</button>
        <button className="ibtn" type="button" aria-label="End quiet time" title="End" onClick={end}><Icon name="x" /></button>
      </div>
    </div>
  );
}

/** In the bar during the Worship part: the song playing, with pause and skip. */
function WorshipNow({ step, now }: { step: Extract<QuietStep, { kind: "worship" }>; now: MusicState | null }) {
  if (!step.picked) return <Working text="Choosing songs" />;
  if (!step.picked.length) return <span className="n err" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }} title={step.note}>{step.note ?? "No songs"}</span>;
  const playing = now?.ours && now.state === "playing";
  const k = now?.ours ? step.picked.findIndex((x) => x.name === now.name) : -1;
  const list = step.picked.map((x, i) => `${i + 1}. ${x.name} — ${x.artist}`).join("\n") + (step.note ? `\n\n${step.note}` : "");
  return (
    <>
      <span className="n" title={list} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, maxWidth: 320 }}>
        {now?.ours ? <>{k >= 0 ? `${k + 1} of ${step.picked.length} · ` : ""}{now.name} — {now.artist}</> : `${step.picked.length} song${step.picked.length === 1 ? "" : "s"}`}
      </span>
      <button className="ibtn" type="button" aria-label={playing ? "Pause" : "Play"} title={playing ? "Pause" : "Play"} onClick={() => api.musicControl(playing ? "pause" : "play").catch(() => {})}>{playing ? <Pause size={12} /> : <Play size={12} />}</button>
      <button className="ibtn" type="button" aria-label="Next song" title="Next song" onClick={() => api.musicControl("next").catch(() => {})}><Icon name="fwd" /></button>
    </>
  );
}
