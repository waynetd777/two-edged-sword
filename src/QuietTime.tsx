// Quiet time: today's plan and devotionals as one session. Each part opens in turn (a chapter in
// the Bible reader, a devotional in the reading column, an online one in its own window) under a
// floating bar with Previous and Next. With audio, a part that finishes reading opens the next,
// waits two seconds and reads on. Parts are ticked off as they are finished, and the plan's day is
// marked read once all its Bible parts are. A plan with worship songs gets a Worship part before
// or after the reading: songs from the Music library chosen for the day (worship.ts), played in
// Music while the part is open, moving on when they finish.

import { useEffect, useRef, useState } from "react";
import { Working } from "./Ask";
import { api, isReadOnly, MusicState } from "./api";
import { book } from "./bible";
import { docSegments } from "./esword";
import { Icon, Pause, Play } from "./icons";
import { current, dayTitle, doneToday, firstUndone, ONLINE_DEVOTIONALS, Part, Plan, progressKey, tickPart, today as startOfToday, todayFor, ymd } from "./plans";
import { usePlayer } from "./speech";
import { QuietStep, useApp } from "./state";
import { Picked, pickSongs } from "./worship";

const FIRST_DELAY = 900; // let the first part's screen open before reading starts
const NEXT_DELAY = 2000;
const AUTO_PLAY = 12; // seconds the worship card shows, with audio, before its songs start

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

/** The session's parts as the app shows them: devotionals it has, named by their abbreviations. */
function sessionSteps(app: ReturnType<typeof useApp>, plan: Plan, parts: Part[], day: Date): QuietStep[] {
  const ids = (plan.devotionals ?? []).filter((id) => id.startsWith("online:") || app.mod("devotional", id));
  return quietSteps(plan, parts, ids, day).map((s) => (s.kind === "devotional" ? { ...s, label: app.mod("devotional", s.module)?.abbrev || s.label } : s));
}

/** What worship songs are chosen for: the session's other parts. */
const worshipAbout = (steps: QuietStep[]) => steps.filter((x) => x.kind !== "worship").map((x) => x.label);

/** Chooses today's worship songs a little after the app opens, when the plan has them and today
 *  isn't read yet, so they're ready when Quiet time starts (the assistant can take most of a minute). */
export function useWorshipAhead() {
  const app = useApp();
  const plan = current(app.plans);
  const t = plan && !(plan.kind === "sequence" && firstUndone(plan) < 0) ? todayFor(plan) : null;
  const done = !!plan && (plan.kind === "ppo" ? plan.doneDates : plan.readDates ?? []).includes(ymd(startOfToday()));
  const w = plan?.worship;
  const ready = app.plansReady && !!app.lib;
  const key = plan && t && w && !done ? JSON.stringify([plan.id, t.label, w, (plan.devotionals ?? []).join(), app.settings.model]) : null;
  useEffect(() => {
    if (!ready || !key || !plan || !t || !w || isReadOnly()) return;
    const timer = window.setTimeout(() => {
      const steps = sessionSteps(app, plan, t.parts, startOfToday());
      if (steps.some((x) => x.kind === "worship")) pickSongs(w.songs, worshipAbout(steps), w.when, app.settings.model).catch(() => {});
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [ready, key]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function useStartQuietTime() {
  const app = useApp();
  return (plan: Plan, parts: Part[], audio: boolean, preview = false) => {
    const day = startOfToday();
    const steps = sessionSteps(app, plan, parts, day);
    if (!steps.length) return;
    // A preview runs from the start and records nothing.
    if (preview) { app.setSession({ planId: plan.id, dayKey: progressKey(plan, day), steps, i: 0, audio, started: Date.now(), preview }); return; }
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
    if (!s || s.preview) return;
    app.setPlans((ps) => ps.map((p) => (p.id === s.planId ? tickPart(p, s.dayKey, key, bibleKeys, startOfToday()) : p)));
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
      app.toast(s.preview ? "Preview done · nothing was marked" : "Quiet time done");
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
    // Not in screenshot mode, where a scene gives its songs (or shows them still being chosen).
    if (!s || !w || w.kind !== "worship" || w.picked || isReadOnly()) return;
    const started = s.started;
    const about = worshipAbout(s.steps);
    const put = (p: Picked) =>
      app.setSession((x) => (x && x.started === started ? { ...x, steps: x.steps.map((y) => (y.kind === "worship" ? { ...y, picked: p.songs, intro: p.intro, note: p.note } : y)) } : x));
    pickSongs(w.songs, about, w.when, app.settings.model).then(put).catch((e) => put({ songs: [], note: e instanceof Error ? e.message : String(e) }));
  }, [s?.started]); // eslint-disable-line react-hooks/exhaustive-deps

  // The Worship part: once its songs are chosen, a card says why each suits the reading, and they
  // play in Music when asked (Play, or by themselves after a few seconds with audio). The bar and
  // card show what's playing; the part moves on when they finish, and leaving it pauses them.
  const cur = s?.steps[s.i];
  const songs = cur?.kind === "worship" ? cur.picked : undefined;
  const [now, setNow] = useState<MusicState | null>(null);
  /** Asks Music what's playing now (after pause or skip, so the bar keeps up). */
  const checkNow = useRef<() => void>(() => {});
  const control = (cmd: "pause" | "play" | "next" | "show") => api.musicControl(cmd).then(() => checkNow.current()).catch((e) => app.toast(String(e)));
  const nowRef = useRef<MusicState | null>(null);
  const [playing, setPlaying] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  useEffect(() => { setPlaying(false); setCountdown(null); }, [s?.started, s?.i]);
  useEffect(() => {
    if (!songs?.length || playing || !s?.audio) { setCountdown(null); return; }
    let n = AUTO_PLAY;
    setCountdown(n);
    const t = window.setInterval(() => { n -= 1; if (n <= 0) { window.clearInterval(t); setCountdown(null); setPlaying(true); } else setCountdown(n); }, 1000);
    return () => window.clearInterval(t);
  }, [s?.started, s?.i, !!songs?.length, playing]); // eslint-disable-line react-hooks/exhaustive-deps
  nowRef.current = now;
  // While the songs are on, Space pauses and resumes them instead of reading aloud: caught on the
  // way down, before the readers' own Space (which listen on the way up) can see it.
  useEffect(() => {
    if (!songs?.length || !playing) return;
    const k = (e: KeyboardEvent) => {
      if (e.key !== " " || e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const st = nowRef.current;
      if (st?.ours) control(st.state === "playing" ? "pause" : "play");
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [s?.started, s?.i, !!songs?.length, playing]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setNow(null);
    // None chosen (the card says why): it waits for Next.
    if (!songs?.length || !playing) return;
    let dead = false, heard = false, poll: number | undefined;
    const check = async () => {
      const st = await api.musicState().catch(() => null);
      if (dead || !st) return;
      setNow(st);
      if (st.ours && st.state === "playing") heard = true;
      else if (heard && (!st.ours || st.state === "stopped")) { window.clearInterval(poll); goRef.current(1); }
    };
    checkNow.current = check;
    api.musicPlay(songs.map((x) => x.id)).then((n) => {
      if (dead) return;
      if (!n) { app.toast("Couldn't find the songs in Music"); return; }
      // At once, so pause and skip work as soon as it's playing, then every second.
      check();
      poll = window.setInterval(check, 1000);
    }).catch((e) => { if (!dead) app.toast(String(e)); });
    return () => { dead = true; checkNow.current = () => {}; window.clearInterval(poll); api.musicControl("pause").catch(() => {}); };
  }, [s?.started, s?.i, !!songs, playing]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <>
    <div role="region" aria-label="Quiet time" style={at?.x !== undefined
      ? { position: "fixed", top: at.y, left: at.x, right: 16, transform: "translateY(-50%)", display: "flex", pointerEvents: "none", zIndex: 45 }
      : { position: "fixed", top: at?.y ?? 84, transform: "translateY(-50%)", left: focus ? 0 : 200, right: 0, display: "flex", justifyContent: "center", pointerEvents: "none", zIndex: 45 }}>
      <div style={{ pointerEvents: "auto", display: "flex", alignItems: "center", gap: 10, padding: "6px 8px 6px 14px", borderRadius: 24, background: "var(--panel)", border: "1px solid var(--border)", boxShadow: "0 10px 30px var(--shadow)", maxWidth: "calc(100% - 48px)" }}>
        <span className="label" style={{ color: "var(--accent)", whiteSpace: "nowrap" }}>{s.preview ? "Preview" : "Quiet time"}{s.audio && <Icon name="speaker" size={12} style={{ marginLeft: 6, verticalAlign: -2 }} />}</span>
        <span style={{ display: "flex", gap: 4 }} aria-label={`Part ${s.i + 1} of ${s.steps.length}`}>
          {s.steps.map((x, k) => (
            <button key={x.key + k} type="button" title={x.label + (done.includes(x.key) ? " · read" : "")} onClick={() => app.setSession((y) => (y ? { ...y, i: k } : y))}
              style={{ width: k === s.i ? 18 : 8, height: 8, borderRadius: 999, border: 0, padding: 0, cursor: "pointer", background: k === s.i ? "var(--accent)" : done.includes(x.key) ? "var(--barsoft)" : "var(--border)", transition: "width 0.2s" }} />
          ))}
        </span>
        <b style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{step.label}</b>
        {step.kind === "online" && <span className="n" style={{ whiteSpace: "nowrap" }}>in its own window · Next when done</span>}
        {step.kind === "worship" && <WorshipNow step={step} now={now} started={playing} onPlay={() => setPlaying(true)} control={control} />}
        <button className="ibtn" type="button" aria-label="Previous part" title="Previous" disabled={s.i === 0} onClick={() => go(-1)}><Icon name="back" /></button>
        <button className="btn primary small" type="button" onClick={() => go(1)} style={{ whiteSpace: "nowrap" }}>{next ? <>Next: {next.label}<Icon name="fwd" size={13} /></> : <><Icon name="check" size={13} />Finish</>}</button>
        <button className="ibtn" type="button" aria-label="End quiet time" title="End" onClick={end}><Icon name="x" /></button>
      </div>
    </div>
      {/* Outside the bar's box: its transform would otherwise be what "fixed" is fixed to. */}
      {step.kind === "worship" && (
        <div style={{ position: "fixed", top: (at?.y ?? 84) + 30, left: at?.x ?? (focus ? 0 : 200), right: at?.x !== undefined ? 16 : 0, display: "flex", justifyContent: at?.x !== undefined ? "flex-start" : "center", pointerEvents: "none", zIndex: 45 }}>
          <WorshipCard key={s.started} step={step} now={now} started={playing} countdown={countdown} onPlay={() => setPlaying(true)} />
        </div>
      )}
    </>
  );
}

/** In the bar during the Worship part: Play until the songs start, then the song playing, with pause and skip. */
function WorshipNow({ step, now, started, onPlay, control }: { step: Extract<QuietStep, { kind: "worship" }>; now: MusicState | null; started: boolean; onPlay: () => void; control: (cmd: "pause" | "play" | "next" | "show") => void }) {
  // Wrapped: .working keeps to the top of a column (Ask's), and the bar centres its items.
  if (!step.picked) return <span style={{ display: "inline-flex", alignItems: "center" }}><Working text="Choosing songs" /></span>;
  if (!step.picked.length) return null; // the card says why
  if (!started) return <button className="btn small" type="button" onClick={onPlay}><Play size={11} />Play songs</button>;
  const playing = now?.ours && now.state === "playing";
  const k = now?.ours ? step.picked.findIndex((x) => x.name === now.name) : -1;
  return (
    <>
      <span className="n" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, maxWidth: 320 }}>
        {now?.ours ? <>{k >= 0 ? `${k + 1} of ${step.picked.length} · ` : ""}{now.name} — {now.artist}</> : "Starting…"}
      </span>
      {/* Until Music says the playlist is on, there's nothing of ours to pause or skip. */}
      <button className="ibtn" type="button" disabled={!now?.ours} aria-label={playing ? "Pause" : "Play"} title={playing ? "Pause" : "Play"} onClick={() => control(playing ? "pause" : "play")}>{playing ? <Pause size={12} /> : <Play size={12} />}</button>
      <button className="ibtn" type="button" disabled={!now?.ours} aria-label="Next song" title="Next song" onClick={() => control("next")}><Icon name="fwd" /></button>
      <button className="btn small" type="button" disabled={!now?.ours} title="Open Music, where its lyrics button shows the words as the song plays" onClick={() => control("show")}><Icon name="quote" size={12} />Lyrics</button>
    </>
  );
}

/** Under the bar during the Worship part: what today's reading is about, and why each song was chosen. */
function WorshipCard({ step, now, started, countdown, onPlay }: { step: Extract<QuietStep, { kind: "worship" }>; now: MusicState | null; started: boolean; countdown: number | null; onPlay: () => void }) {
  const [hidden, setHidden] = useState(false);
  if (!step.picked || hidden) return null;
  const k = started && now?.ours ? step.picked.findIndex((x) => x.name === now.name) : -1;
  return (
    <div className="card" style={{ pointerEvents: "auto", width: 560, maxWidth: "calc(100% - 48px)", padding: "14px 18px 16px", boxShadow: "0 14px 40px var(--shadow)", display: "flex", flexDirection: "column", gap: 10, maxHeight: "60vh", overflow: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="label">Worship · {step.when === "before" ? "before your reading" : "after your reading"}</span>
        <button className="ibtn" type="button" aria-label="Hide" title="Hide" style={{ marginLeft: "auto" }} onClick={() => setHidden(true)}><Icon name="x" /></button>
      </div>
      {step.intro && <p style={{ margin: 0, font: "400 15px/1.55 var(--serif)" }}>{step.intro}</p>}
      {step.note && <div className={step.picked.length ? "hint" : "err"} style={{ fontSize: 12.5 }}>{step.note}</div>}
      {step.picked.length > 0 && (
        <ol style={{ margin: 0, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 8 }}>
          {step.picked.map((x, i) => (
            <li key={x.id} style={{ color: i === k ? "var(--accent)" : undefined }}>
              <b style={{ fontWeight: 600 }}>{x.name}</b> <span className="n">— {x.artist}{i === k ? " · playing" : ""}</span>
              {x.why && <div style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--muted)", marginTop: 2 }}>{x.why}</div>}
            </li>
          ))}
        </ol>
      )}
      {!started && step.picked.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="btn primary" type="button" onClick={onPlay}><Play size={12} />Play songs</button>
          {countdown !== null && <span className="n">Starting in {countdown}s</span>}
        </div>
      )}
    </div>
  );
}
