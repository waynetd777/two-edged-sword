import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { book, BOOKS, fmtRef, parseRef, SECTIONS, SHORT } from "./bible";
import { Icon, Play } from "./icons";
import {
  addDays, balanced, behind, chaptersOf, dateOf, dayLabel, firstUndone, fmtDay, fmtLong, indexOn, markDayRead, markPpoRead, paired, readOn, streak, unmarkDayRead, parseYmd, partRef, perDay, Plan, PpoPlan, dayTitle, ONLINE_DEVOTIONALS, doneToday, progressKey, ppoPreview, ppoUpcoming, SequencePlan, Sizes, today, todayFor, ymd,
} from "./plans";
import { Topbar } from "./Shell";
import { uid, useApp } from "./state";
import { confirmDelete, Dialog, Popover, Seg } from "./ui";
import { useStartQuietTime } from "./QuietTime";
import { useAssistant } from "./assistant";

let sizesCache: Record<string, Sizes> = {};
async function sizes(bible: string): Promise<Sizes> {
  if (!sizesCache[bible]) sizesCache[bible] = await api.chapterSizes(bible);
  return sizesCache[bible];
}

export function PlansScreen() {
  const app = useApp();
  const canAsk = useAssistant().available;
  const plan = app.plans.find((p) => p.active) ?? app.plans[0];
  const [picker, setPicker] = useState(false);
  const [builder, setBuilder] = useState(false);
  const [behindOpen, setBehindOpen] = useState(false);
  const [month, setMonth] = useState(() => { const d = today(); d.setDate(1); return d; });

  const update = (p: Plan) => app.setPlans((ps) => ps.map((x) => (x.id === p.id ? p : x)));
  const startQuiet = useStartQuietTime();
  const partsDone = plan ? doneToday(plan, progressKey(plan, today())) : [];
  const t = plan ? todayFor(plan) : null;
  const late = plan?.kind === "sequence" ? behind(plan) : 0;

  // Offer to catch up when behind, as Settings says.
  useEffect(() => {
    if (plan?.kind !== "sequence" || late <= 0 || !plan.active) return;
    const w = app.settings.whenBehind;
    if (w === "ask") return;
    if (w === "move") update({ ...plan, shift: plan.shift + late });
    if (w === "skip") update({ ...plan, skipped: [...plan.skipped, ...plan.days.map((_, i) => i).filter((i) => i < indexOn(plan, today()) && !plan.done.includes(i) && !plan.skipped.includes(i))] });
  }, [plan?.id, late]); // eslint-disable-line react-hooks/exhaustive-deps

  const markRead = () => {
    if (!plan) return;
    if (plan.kind === "ppo") update(markPpoRead(plan, today()));
    else update(markDayRead(plan, today()));
    app.toast("Marked as read");
  };
  const unmarkRead = () => {
    if (!plan) return;
    update(unmarkDayRead(plan, today()));
    app.toast("Marked as unread");
  };
  // A plan is read in the Bible it was set up with, when that Bible is still in the library.
  const toPlanBible = () => { if (app.mod("bible", plan.bible) && app.settings.bible !== plan.bible) app.set({ bible: plan.bible }); };
  const openPart = (i = 0) => { const x = t?.parts[i]; if (x) { toPlanBible(); app.open({ book: x.b, chapter: x.c, verse: x.v, to: x.v2 }, "read"); } };

  // Days to mark on the calendar.
  const doneDays = useMemo(() => {
    const s = new Set<string>();
    if (!plan) return s;
    if (plan.kind === "ppo") plan.doneDates.forEach((d) => s.add(d));
    else plan.done.forEach((i) => s.add(ymd(dateOf(plan, i))));
    return s;
  }, [plan]);
  const upcoming = useMemo(() => {
    if (!plan) return [];
    if (plan.kind === "ppo") return ppoUpcoming(plan, today(), 6).map((x) => ({ date: x.date, label: x.parts.map((p) => fmtRef(partRef(p)).replace("Psalms", "Psalm")).join(" · ") }));
    const i = firstUndone(plan);
    if (i < 0) return [];
    return plan.days.slice(i + 1, i + 7).map((d, k) => ({ date: dateOf(plan, i + 1 + k), label: dayLabel(d) }));
  }, [plan]);

  if (!plan) {
    return (
      <div className="main">
        <Topbar />
        <div style={{ flexGrow: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="card" style={{ padding: 28, maxWidth: 480, display: "flex", flexDirection: "column", gap: 10 }}>
            <h1 style={{ margin: 0, font: "500 28px var(--display)" }}>Quiet time</h1>
            <p style={{ margin: 0, color: "var(--muted)" }}>Read through the Bible, a part of it, or a Psalm, a Proverb and one more chapter every day.</p>
            <div style={{ display: "flex", gap: 8 }}><button className="btn primary" type="button" onClick={() => setPicker(true)}>Choose a plan…</button><button className="btn" type="button" onClick={() => setBuilder(true)}>Make a plan…</button></div>
          </div>
        </div>
        {picker && <PlanPicker onClose={() => setPicker(false)} onBuild={() => { setPicker(false); setBuilder(true); }} />}
        {builder && <PlanBuilder onClose={() => setBuilder(false)} />}
      </div>
    );
  }

  const seq = plan.kind === "sequence" ? plan : null;
  const finish = seq ? dateOf(seq, seq.days.length - 1) : null;
  const first = new Date(month);
  const lead = (first.getDay() + 6) % 7;
  const dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [...Array(lead).fill(null), ...Array.from({ length: dim }, (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1))];
  const tk = ymd(today());
  const readingFor = (d: Date) => {
    if (plan.kind === "ppo") return null;
    const i = indexOn(plan, d);
    return i >= 0 && i < plan.days.length && ymd(dateOf(plan, i)) === ymd(d) ? plan.days[i] : null;
  };

  return (
    <div className="main">
      <Topbar />
      <div className="scroll" style={{ flexGrow: 1, padding: "20px 28px 100px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <h1 style={{ margin: 0, font: "500 30px/1 var(--display)" }}>Quiet time</h1>
          {app.plans.length > 1 && <select className="btn small" value={plan.id} onChange={(e) => app.setPlans((ps) => ps.map((p) => ({ ...p, active: p.id === e.target.value })))} aria-label="Plan">{app.plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
          <button className="btn" type="button" style={{ marginLeft: "auto" }} onClick={() => setPicker(true)}><Icon name="plus" />Choose a plan…</button>
          <button className="btn" type="button" onClick={() => setBuilder(true)}>Make a plan…</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 440px", gap: 16 }}>
          <div className="card" style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="label">Current plan</span>
              {seq && (late > 0 ? <button type="button" className="chip" style={{ color: "var(--pufg)", borderColor: "var(--pufg)" }} onClick={() => setBehindOpen(true)}>{late} behind · catch up…</button> : <span className="chip" style={{ color: "var(--good)", borderColor: "var(--good)", cursor: "default" }}>On track</span>)}
              {!plan.active && <span className="chip" style={{ cursor: "default" }}>Paused</span>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ font: "500 34px/1.1 var(--display)" }}>{plan.name}</div>
              <div style={{ color: "var(--muted)" }}>Started {fmtLong(parseYmd(plan.start))}{finish ? ` · finishes ${fmtLong(finish)}` : " · no end: it goes round again"} · {app.mod("bible", plan.bible)?.abbrev ?? plan.bible}</div>
            </div>
            {seq ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontVariantNumeric: "tabular-nums" }}><span><b>{seq.done.length}</b> of {seq.days.length} days</span><span style={{ color: "var(--muted)" }}>{t?.pct}% · {seq.days.length - seq.done.length - seq.skipped.length} to go</span></div>
                <div style={{ height: 8, borderRadius: 999, background: "var(--border)", overflow: "hidden" }}><div style={{ width: `${t?.pct}%`, height: 8, background: "var(--accent)" }} /></div>
                <StreakLine plan={plan} />
              </div>
            ) : plan.kind === "ppo" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span><b>{plan.doneDates.length}</b> {plan.doneDates.length === 1 ? "day" : "days"} read</span><span style={{ color: "var(--muted)" }}>next other chapter {book(plan.nextOther[0]).name} {plan.nextOther[1]} · {t?.pct}% round</span></div>
                <div style={{ height: 8, borderRadius: 999, background: "var(--border)", overflow: "hidden" }}><div style={{ width: `${t?.pct}%`, height: 8, background: "var(--accent)" }} /></div>
                <StreakLine plan={plan} />
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: "auto", flexWrap: "wrap" }}>
              <button className="btn" type="button" onClick={() => update({ ...plan, active: !plan.active })}>{plan.active ? "Pause plan" : "Resume plan"}</button>
              {seq && <button className="btn" type="button" onClick={() => setBehindOpen(true)}>Move the rest later…</button>}
              <button className="btn" type="button" style={{ marginLeft: "auto", color: "var(--bad)" }} onClick={async () => { if (await confirmDelete(`the plan “${plan.name}”`, "Its progress is lost too. This can't be undone.")) app.setPlans((ps) => ps.filter((p) => p.id !== plan.id)); }}><Icon name="trash" />Delete</button>
            </div>
          </div>
          <div className="card" style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 12, background: "var(--accentsoft)", borderColor: "var(--ring)" }}>
            <div className="label" style={{ color: "var(--accent)" }}>{plan.kind === "ppo" ? `Today · ${fmtLong(today())}` : t?.label === "Finished" ? "Finished" : `Next · day ${firstUndone(seq!) + 1}`}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {t?.parts.map((x, i) => {
                const read = Array.from({ length: (x.c2 ?? x.c) - x.c + 1 }, (_, k) => `${x.b}.${x.c + k}`).every((k) => partsDone.includes(k));
                return <button key={i} type="button" className="partlink" title={`Open ${fmtRef(partRef(x)).replace("Psalms", "Psalm")} in the ${app.mod("bible", plan.bible)?.abbrev ?? "plan's Bible"}`} onClick={() => openPart(i)} style={{ alignSelf: "flex-start", border: 0, padding: "2px 8px", margin: "0 -8px", borderRadius: 8, textAlign: "left", cursor: "pointer", font: `500 ${t.parts.length > 1 ? 30 : 44}px/1.1 var(--display)`, color: read ? "var(--muted)" : "var(--text)", display: "flex", alignItems: "center", gap: 10 }}>{fmtRef(partRef(x)).replace("Psalms", "Psalm")}{read && <Icon name="check" size={20} style={{ color: "var(--good)" }} />}</button>;
              })}
            </div>
            {plan.kind === "ppo" && plan.doneDates.includes(tk) && <div style={{ color: "var(--good)", display: "flex", gap: 6, alignItems: "center" }}><Icon name="check" />Read today</div>}
            <div style={{ display: "flex", gap: 8, marginTop: "auto", flexWrap: "wrap" }}>
              <button className="btn primary" type="button" style={{ height: 34, padding: "0 16px" }} title="Step through today's readings and devotionals" onClick={() => t && startQuiet(plan, t.parts, false)}><Icon name="read" />Read</button>
              <button className="btn" type="button" style={{ height: 34 }} title="Read today's readings and devotionals aloud, one after another" onClick={() => t && startQuiet(plan, t.parts, true)}><Play size={12} />Read with audio</button>
              {/* Once today is marked, the button undoes it. A sequence plan can still mark another
                  day read (catching up), so it keeps both. */}
              {readOn(plan, today()) && <button className="btn" type="button" style={{ height: 34, marginLeft: "auto" }} title="Undo today's mark: the plan goes back to where it was" onClick={unmarkRead}><Icon name="x" />Mark as unread</button>}
              {!(plan.kind === "ppo" && plan.doneDates.includes(tk)) && <button className="btn" type="button" style={{ height: 34, marginLeft: readOn(plan, today()) ? undefined : "auto" }} onClick={markRead}><Icon name="check" />Mark as read</button>}
            </div>
            {canAsk && t?.parts[0] && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                <span style={{ color: "var(--accent)", display: "inline-flex" }}><Icon name="chat" /></span>
                {[`Background before I read ${fmtRef(partRef(t.parts[t.parts.length - 1]))}`, `What to look for in ${fmtRef(partRef(t.parts[t.parts.length - 1]))}`].map((s) => (
                  <button key={s} type="button" className="chip" onClick={() => { const x = t.parts[t.parts.length - 1]; toPlanBible(); app.open({ book: x.b, chapter: x.c }); app.setPending({ ask: s }); }}>{s.replace(/ (Psalms?|Proverbs) .*$/, "")}</button>
                ))}
              </div>
            )}
          </div>
        </div>
        <DevotionalsCard plan={plan} update={update} />
        <div style={{ display: "grid", gridTemplateColumns: "420px minmax(0,1fr)", gap: 16 }}>
          <div className="card" style={{ padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <b>{month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</b>
              <button className="ibtn" type="button" aria-label="Previous month" style={{ marginLeft: "auto" }} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><Icon name="back" /></button>
              <button className="ibtn" type="button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><Icon name="fwd" /></button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0,1fr))", gap: 4 }}>
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <span key={d} style={{ fontSize: 11, color: "var(--muted)", textAlign: "center" }}>{d}</span>)}
              {cells.map((d, k) => {
                if (!d) return <span key={k} />;
                const key = ymd(d), done = doneDays.has(key), isToday = key === tk;
                const r = readingFor(d);
                return (
                  <button key={k} type="button" title={r ? dayLabel(r) : undefined} disabled={!r && plan.kind !== "ppo"} onClick={() => { if (r) { toPlanBible(); app.open({ book: r[0].b, chapter: r[0].c }, "read"); } }}
                    style={{ height: 38, borderRadius: 8, border: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, fontSize: 12, fontVariantNumeric: "tabular-nums", cursor: r ? "pointer" : "default", color: isToday ? "var(--accent)" : done ? "var(--text)" : "var(--muted)", fontWeight: isToday ? 700 : 400, background: isToday ? "var(--accentsoft)" : "transparent", boxShadow: isToday ? "inset 0 0 0 1.5px var(--accent)" : undefined }}>
                    {d.getDate()}<span style={{ width: 5, height: 5, borderRadius: "50%", background: done ? "var(--accent)" : "transparent" }} />
                  </button>
                );
              })}
            </div>
          </div>
          <div className="card" style={{ padding: "12px 18px" }}>
            <div className="label" style={{ padding: "4px 4px 6px" }}>Coming up</div>
            {upcoming.map((u) => (
              <div key={u.date.toISOString()} style={{ display: "grid", gridTemplateColumns: "120px minmax(0,1fr)", gap: 12, alignItems: "center", minHeight: 40, padding: "0 4px", borderBottom: "1px solid var(--border)" }}>
                <span style={{ color: "var(--muted)" }}>{fmtDay(u.date)}</span><b style={{ font: "600 16px var(--display)" }}>{u.label}</b>
              </div>
            ))}
            {!upcoming.length && <div className="n" style={{ padding: 4 }}>Nothing more: the plan is finished.</div>}
          </div>
        </div>
      </div>
      {picker && <PlanPicker onClose={() => setPicker(false)} onBuild={() => { setPicker(false); setBuilder(true); }} />}
      {builder && <PlanBuilder onClose={() => setBuilder(false)} />}
      {behindOpen && seq && <BehindDialog plan={seq} onClose={() => setBehindOpen(false)} onApply={(p) => { update(p); setBehindOpen(false); }} />}
    </div>
  );
}

type Choice = "ppo" | "year" | "nt90" | "gospels" | "meyer";

function PlanPicker({ onClose, onBuild }: { onClose: () => void; onBuild: () => void }) {
  const app = useApp();
  const meyer = app.mod("commentary", "meyer");
  const [choice, setChoice] = useState<Choice>("ppo");
  const [start, setStart] = useState(ymd(today()));
  const [bible, setBible] = useState(app.settings.bible);
  const [weekdays, setWeekdays] = useState(false);
  const [keep, setKeep] = useState(true);
  const [psalm, setPsalm] = useState(1);
  const [other, setOther] = useState("Genesis 1");
  const [otherFrom, setOtherFrom] = useState<PpoPlan["otherFrom"]>("all");
  const [shortMonths, setShortMonths] = useState<PpoPlan["shortMonths"]>("last");
  const [preview, setPreview] = useState<{ date: string; label: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const otherRef = parseRef(other);
  const otherOk = !!otherRef && otherRef.book !== 19 && otherRef.book !== 20;

  const OPTIONS: { id: Choice; name: string; meta: string; group: string }[] = [
    { id: "ppo", name: "Psalm, Proverb and one more", meta: "3 chapters a day · Proverbs by the date · the rest in order, round and round", group: "Through the Bible" },
    { id: "year", name: "The whole Bible in a year", meta: "365 days of similar length", group: "Through the Bible" },
    { id: "nt90", name: "New Testament in 90 days", meta: "90 days of similar length", group: "Through the Bible" },
    { id: "gospels", name: "The Gospels, a chapter a day", meta: "89 days", group: "Through the Bible" },
    ...(meyer ? [{ id: "meyer" as Choice, name: "F. B. Meyer, Through the Bible Day by Day", meta: "a passage a day, each with his note", group: "From your library" }] : []),
  ];

  const build = async (): Promise<Plan> => {
    const id = uid();
    if (choice === "ppo") return { id, kind: "ppo", name: "Psalm, Proverb and one more", start, bible, nextPsalm: psalm, nextOther: [otherRef!.book, otherRef!.chapter], otherFrom, shortMonths, doneDates: [], active: true };
    const s = await sizes(bible);
    const base = { id, kind: "sequence" as const, start, bible, weekdaysOnly: weekdays, done: [], skipped: [], shift: 0, active: true };
    if (choice === "year") return { ...base, name: "The whole Bible in a year", days: balanced(s, 365) };
    if (choice === "nt90") return { ...base, name: "New Testament in 90 days", days: balanced(chaptersOf(s, BOOKS.filter((b) => b.n >= 40).map((b) => b.n)), 90) };
    if (choice === "gospels") return { ...base, name: "The Gospels, a chapter a day", days: perDay(chaptersOf(s, [40, 41, 42, 43]), 1) };
    const ranges = await api.commentaryRanges("meyer");
    return { ...base, name: "Through the Bible Day by Day", noteModule: "meyer", days: ranges.map(([b, cb, vb, ce, ve]) => [{ b, c: cb, v: vb, c2: ce, v2: ve }]) };
  };

  useEffect(() => {
    let dead = false;
    if (choice === "ppo" && !otherOk) { setPreview([]); return; }
    build().then((p) => {
      if (dead) return;
      if (p.kind === "ppo") setPreview(ppoPreview(p, parseYmd(start), 8).map((x) => ({ date: fmtDay(x.date), label: x.parts.map((q) => fmtRef(partRef(q)).replace("Psalms", "Psalm")).join(" · ") })));
      else setPreview(p.days.slice(0, 7).map((d, i) => ({ date: fmtDay(dateOf(p, i)), label: dayLabel(d) })));
    });
    return () => { dead = true; };
  }, [choice, start, bible, weekdays, psalm, other, otherFrom, shortMonths]); // eslint-disable-line react-hooks/exhaustive-deps

  const startPlan = async () => {
    setBusy(true);
    const p = await build();
    // The new plan becomes the current one; the old one is kept (paused) or removed.
    app.setPlans((ps) => [...ps.filter((x) => keep || !x.active).map((x) => ({ ...x, active: false })), p]);
    setBusy(false);
    onClose();
  };
  const opt = OPTIONS.find((o) => o.id === choice)!;
  let lastGroup = "";
  return (
    <Dialog onClose={onClose} width={900} label="Choose a reading plan">
      <div style={{ display: "grid", gridTemplateColumns: "330px minmax(0,1fr)", minHeight: 520 }}>
        <div style={{ borderRight: "1px solid var(--border)", padding: "16px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ font: "500 24px/1.2 var(--display)", padding: "0 12px 6px" }}>Choose a plan</div>
          {OPTIONS.map((o) => {
            const head = o.group !== lastGroup ? <div className="label" style={{ padding: "10px 12px 4px" }}>{o.group}</div> : null;
            lastGroup = o.group;
            return (
              <div key={o.id}>{head}
                <button type="button" onClick={() => setChoice(o.id)} aria-pressed={choice === o.id} style={{ display: "grid", gridTemplateColumns: "18px minmax(0,1fr)", gap: 10, padding: "10px 12px", borderRadius: 9, border: `1px solid ${choice === o.id ? "var(--ring)" : "transparent"}`, background: choice === o.id ? "var(--accentsoft)" : "transparent", cursor: "pointer", textAlign: "left", width: "100%" }}>
                  <span style={{ width: 14, height: 14, borderRadius: "50%", border: choice === o.id ? "4px solid var(--accent)" : "1.5px solid var(--track)", marginTop: 2 }} />
                  <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><b style={{ fontSize: 13 }}>{o.name}</b><span className="hint" style={{ fontSize: 12 }}>{o.meta}</span></span>
                </button>
              </div>
            );
          })}
          <div className="label" style={{ padding: "10px 12px 4px" }}>Your own</div>
          <button type="button" className="bm" style={{ padding: "10px 12px" }} onClick={onBuild}><b>Make a plan…</b><span className="r">choose books and pace</span></button>
        </div>
        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ font: "500 26px/1.15 var(--display)" }}>{opt.name}</div>
          {choice === "ppo" && <div style={{ color: "var(--muted)" }}>Three chapters a day. Proverbs follows the date. Psalms and the other chapter carry on in order and start again at the beginning when they run out.</div>}
          <div style={{ display: "grid", gridTemplateColumns: "120px minmax(0,1fr)", gap: "8px 10px", alignItems: "center" }}>
            <span className="n">Start</span><input type="date" className="btn" value={start} onChange={(e) => setStart(e.target.value)} style={{ width: 200 }} />
            {choice === "ppo" && <>
              <span className="n">First psalm</span>
              <select className="btn" value={psalm} onChange={(e) => setPsalm(+e.target.value)} style={{ width: 200 }}>{Array.from({ length: 150 }, (_, i) => <option key={i} value={i + 1}>Psalm {i + 1}</option>)}</select>
              <span className="n">First chapter</span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}><label className="field" style={{ width: 200 }}><input value={other} onChange={(e) => setOther(e.target.value)} aria-label="First chapter" /></label><span className={otherOk ? "n" : "err"} style={{ fontSize: 12 }}>{otherOk ? `then ${book(otherRef!.book).name} ${otherRef!.chapter + 1 <= book(otherRef!.book).chapters ? otherRef!.chapter + 1 : "…"}` : "e.g. John 3 (not Psalms or Proverbs)"}</span></span>
              <span className="n">Taken from</span>
              <Seg value={otherFrom} options={[["all", "Whole Bible"], ["ot", "Old Testament"], ["nt", "New Testament"]]} onChange={setOtherFrom} />
              <span className="n">Short months</span>
              <Seg value={shortMonths} options={[["last", "Read leftover Proverbs on the last day"], ["skip", "Skip them"]]} onChange={setShortMonths} />
            </>}
            <span className="n">Translation</span>
            <select className="btn" value={bible} onChange={(e) => setBible(e.target.value)} style={{ width: 260 }}>{app.bibles.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}</select>
            {choice !== "ppo" && <><span className="n">Days</span><label className="opt"><input type="checkbox" checked={weekdays} onChange={(e) => setWeekdays(e.target.checked)} />Weekdays only</label></>}
          </div>
          <div style={{ padding: "10px 14px", borderRadius: 10, background: "var(--panel2)", border: "1px solid var(--border)" }}>
            <div className="label" style={{ paddingBottom: 4 }}>First week</div>
            {preview.map((x) => <div key={x.date} style={{ display: "grid", gridTemplateColumns: "100px minmax(0,1fr)", gap: 8, fontSize: 12.5, minHeight: 24, alignItems: "center", borderBottom: "1px solid var(--border)" }}><span style={{ color: "var(--muted)" }}>{x.date}</span><span>{x.label}</span></div>)}
          </div>
        </div>
      </div>
      <div className="foot">
        {app.plans.some((p) => p.active) && <label className="opt"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />Keep my current plan too</label>}
        <button className="btn" type="button" style={{ marginLeft: "auto" }} onClick={onClose}>Cancel</button>
        <button className="btn primary" type="button" disabled={busy || (choice === "ppo" && !otherOk)} onClick={startPlan}>Start plan</button>
      </div>
    </Dialog>
  );
}

function PlanBuilder({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const [name, setName] = useState("");
  const [books, setBooks] = useState<number[]>([1, 2, 3, 4, 5]);
  const [pace, setPace] = useState<"chapters" | "finish" | "even">("chapters");
  const [n, setN] = useState(2);
  const [finishBy, setFinishBy] = useState(ymd(addDays(today(), 90)));
  const [order, setOrder] = useState<"bible" | "paired">("bible");
  const [weekdays, setWeekdays] = useState(false);
  const [start, setStart] = useState(ymd(today()));
  const [s, setS] = useState<Sizes>([]);
  useEffect(() => { sizes(app.settings.bible).then(setS); }, [app.settings.bible]);
  const chs = chaptersOf(s, books);
  const verses = chs.reduce((a, c) => a + c[2], 0);
  const daysUntil = Math.max(1, Math.round((parseYmd(finishBy).getTime() - parseYmd(start).getTime()) / 86400000) + 1);
  const days = !chs.length ? [] : order === "paired" ? paired(chs) : pace === "chapters" ? perDay(chs, n) : pace === "finish" ? balanced(chs, Math.min(daysUntil, chs.length)) : balanced(chs, Math.max(1, Math.round(verses / 85)));
  const toggle = (b: number) => setBooks((x) => (x.includes(b) ? x.filter((y) => y !== b) : [...x, b].sort((a, c) => a - c)));
  const group = (from: number, to: number) => { const g = BOOKS.filter((b) => b.n >= from && b.n <= to).map((b) => b.n); setBooks((x) => (g.every((y) => x.includes(y)) ? x.filter((y) => !g.includes(y)) : Array.from(new Set([...x, ...g])).sort((a, c) => a - c))); };
  const label = books.length ? (books.length === 1 ? book(books[0]).name : `${book(books[0]).name} to ${book(books[books.length - 1]).name}`) : "";
  const plan: SequencePlan = { id: uid(), kind: "sequence", name: name.trim() || label, start, bible: app.settings.bible, weekdaysOnly: weekdays, days, done: [], skipped: [], shift: 0, active: true };
  const end = days.length ? dateOf(plan, days.length - 1) : null;
  return (
    <Dialog onClose={onClose} width={780} label="Make a plan">
      <div style={{ padding: "20px 24px 6px" }}><div style={{ font: "500 26px/1.15 var(--display)" }}>Make a plan</div><div style={{ color: "var(--muted)" }}>Choose what to read and how fast. The app splits it into days.</div></div>
      <div style={{ padding: "10px 24px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "90px minmax(0,1fr)", gap: 10, alignItems: "center" }}>
          <span className="n">Name</span><label className="field" style={{ width: 320 }}><input value={name} onChange={(e) => setName(e.target.value)} placeholder={label || "My plan"} aria-label="Plan name" /></label>
          <span className="n">Start</span><input type="date" className="btn" value={start} onChange={(e) => setStart(e.target.value)} style={{ width: 200 }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}><span className="label" style={{ marginRight: 8 }}>Books</span>{SECTIONS.map((x) => <button key={x.name} type="button" className="chip" onClick={() => group(x.from, x.to)}>{x.name}</button>)}<button type="button" className="chip" onClick={() => setBooks([])}>Clear</button></div>
          {[BOOKS.filter((b) => b.n <= 39), BOOKS.filter((b) => b.n >= 40)].map((list, k) => (
            <div key={k} style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {list.map((b) => <button key={b.n} type="button" title={b.name} aria-pressed={books.includes(b.n)} onClick={() => toggle(b.n)} style={{ height: 24, padding: "0 6px", borderRadius: 6, border: "1px solid var(--border)", background: books.includes(b.n) ? "var(--accent)" : "var(--panel)", color: books.includes(b.n) ? "var(--onaccent)" : "var(--muted)", fontSize: 11.5, fontWeight: books.includes(b.n) ? 600 : 400, cursor: "pointer" }}>{SHORT[b.n - 1]}</button>)}
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="label">Pace</span>
            <label className="opt"><input type="radio" name="pace" checked={pace === "chapters"} onChange={() => setPace("chapters")} /><select className="btn small" value={n} onChange={(e) => { setN(+e.target.value); setPace("chapters"); }}>{[1, 2, 3, 4, 5, 6].map((x) => <option key={x}>{x}</option>)}</select>chapters a day</label>
            <label className="opt"><input type="radio" name="pace" checked={pace === "finish"} onChange={() => setPace("finish")} />Finish by <input type="date" className="btn small" value={finishBy} onChange={(e) => { setFinishBy(e.target.value); setPace("finish"); }} /></label>
            <label className="opt"><input type="radio" name="pace" checked={pace === "even"} onChange={() => setPace("even")} />Even days of about 85 verses</label>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="label">Order</span>
            <label className="opt"><input type="radio" name="ord" checked={order === "bible"} onChange={() => setOrder("bible")} />In Bible order</label>
            <label className="opt"><input type="radio" name="ord" checked={order === "paired"} onChange={() => setOrder("paired")} />One Old and one New Testament chapter a day</label>
            <label className="opt"><input type="checkbox" checked={weekdays} onChange={(e) => setWeekdays(e.target.checked)} />Weekdays only</label>
          </div>
        </div>
        {days.length > 0 && (
          <div style={{ padding: "12px 14px", borderRadius: 10, background: "var(--accentsoft)", border: "1px solid var(--ring)", display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><b>{label} · {chs.length} chapters</b><span className="hint">{days.length} days · {fmtLong(parseYmd(start))} to {end && fmtLong(end)}</span></div>
            <span className="n" style={{ marginLeft: "auto" }}>Day 1: {dayLabel(days[0])}</span>
          </div>
        )}
      </div>
      <div className="foot">
        <span className="hint">You can pause or move a plan later without losing progress.</span>
        <button className="btn" type="button" style={{ marginLeft: "auto" }} onClick={onClose}>Cancel</button>
        <button className="btn primary" type="button" disabled={!days.length} onClick={() => { app.setPlans((ps) => [...ps.map((p) => ({ ...p, active: false })), plan]); onClose(); }}>Create plan</button>
      </div>
    </Dialog>
  );
}

function BehindDialog({ plan, onClose, onApply }: { plan: SequencePlan; onClose: () => void; onApply: (p: SequencePlan) => void }) {
  const app = useApp();
  const late = behind(plan);
  const [choice, setChoice] = useState<"move" | "catchup" | "skip">("move");
  const [always, setAlways] = useState(false);
  const due = indexOn(plan, today());
  const missed = plan.days.map((_, i) => i).filter((i) => i < due && !plan.done.includes(i) && !plan.skipped.includes(i));
  const oldEnd = dateOf(plan, plan.days.length - 1);
  const newEnd = dateOf({ ...plan, shift: plan.shift + late }, plan.days.length - 1);
  const apply = () => {
    if (always && choice !== "catchup") app.set({ whenBehind: choice });
    if (choice === "move") onApply({ ...plan, shift: plan.shift + late });
    else if (choice === "skip") onApply({ ...plan, skipped: [...plan.skipped, ...missed] });
    else onClose();
  };
  const opts: [typeof choice, string, string][] = [
    ["move", "Move the rest later", late ? `Carry on from ${dayLabel(plan.days[missed[0]])} today. The plan now finishes ${fmtLong(newEnd)} instead of ${fmtLong(oldEnd)}.` : "You're up to date. Nothing to move."],
    ["catchup", "Catch up", "Keep the dates and read the missed days alongside today's. Tick them off as you go."],
    ["skip", "Skip them", `Mark ${missed.length} missed reading${missed.length === 1 ? "" : "s"} as skipped. They stay in the calendar so you can read them any time.`],
  ];
  return (
    <Dialog onClose={onClose} width={600} label="Behind on a reading plan">
      <div style={{ padding: "20px 24px 8px" }}><div style={{ font: "500 26px/1.15 var(--display)" }}>{late ? `You're ${late} reading${late === 1 ? "" : "s"} behind` : "You're up to date"}</div><div style={{ color: "var(--muted)" }}>{plan.name}{missed.length ? ` · missed ${missed.slice(0, 4).map((i) => dayLabel(plan.days[i])).join(", ")}${missed.length > 4 ? "…" : ""}` : ""}</div></div>
      <div style={{ padding: "8px 18px", display: "flex", flexDirection: "column", gap: 6 }}>
        {opts.map(([id, t, m]) => (
          <button key={id} type="button" onClick={() => setChoice(id)} aria-pressed={choice === id} style={{ display: "grid", gridTemplateColumns: "18px minmax(0,1fr)", gap: 10, padding: "10px 12px", borderRadius: 9, border: `1px solid ${choice === id ? "var(--ring)" : "transparent"}`, background: choice === id ? "var(--accentsoft)" : "transparent", cursor: "pointer", textAlign: "left" }}>
            <span style={{ width: 14, height: 14, borderRadius: "50%", border: choice === id ? "4px solid var(--accent)" : "1.5px solid var(--track)", marginTop: 2 }} />
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><b style={{ fontSize: 13 }}>{t}</b><span className="hint" style={{ fontSize: 12 }}>{m}</span></span>
          </button>
        ))}
      </div>
      <div className="hint" style={{ margin: "4px 24px 14px", padding: "10px 12px", borderRadius: 9, background: "var(--panel2)", border: "1px solid var(--border)" }}>In the Psalm, Proverb and one more plan, Proverbs always follows the date and the Psalm and other chapter simply wait for you, so it never falls behind.</div>
      <div className="foot">
        <label className="opt"><input type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)} disabled={choice === "catchup"} />Always do this</label>
        <button className="btn" type="button" style={{ marginLeft: "auto" }} onClick={onClose}>Not now</button>
        <button className="btn primary" type="button" onClick={apply}>{opts.find((o) => o[0] === choice)![1]}</button>
      </div>
    </Dialog>
  );
}


/** The day's reading in each devotional chosen for the plan, with a way to choose them. */
function DevotionalsCard({ plan, update }: { plan: Plan; update: (p: Plan) => void }) {
  const app = useApp();
  const [choose, setChoose] = useState<DOMRect | null>(null);
  const [heads, setHeads] = useState<Record<string, string>>({});
  const local = (app.lib?.modules ?? []).filter((m) => m.kind === "devotional");
  const chosen = (plan.devotionals ?? []).filter((id) => local.some((m) => m.id === id) || ONLINE_DEVOTIONALS.some((o) => o.id === id));
  const read = doneToday(plan, progressKey(plan, new Date()));
  const day = new Date();
  const title = dayTitle(day);
  const key = chosen.join(",");
  // What each local devotional is about today: its first heading, and the verse it opens with.
  useEffect(() => {
    let live = true;
    Promise.all(chosen.filter((id) => !id.startsWith("online:")).map(async (id) => {
      const html = await api.devotion(id, title).catch(() => null);
      if (!html) return [id, ""] as const;
      const doc = new DOMParser().parseFromString(html, "text/html");
      const h = doc.querySelector("h1, h2, h3")?.textContent?.trim() ?? "";
      const ref = doc.querySelector("ref, h4")?.textContent?.trim() ?? "";
      const first = (doc.body.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 90);
      return [id, [h && h[0] + h.slice(1).toLowerCase(), ref].filter(Boolean).join(" · ") || first + "…"] as const;
    })).then((xs) => live && setHeads(Object.fromEntries(xs)));
    return () => { live = false; };
  }, [key, title]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (id: string) => {
    const cur = plan.devotionals ?? [];
    update({ ...plan, devotionals: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  };
  const open = (id: string) => {
    const o = ONLINE_DEVOTIONALS.find((x) => x.id === id);
    if (o) api.openWeb(o.id, o.url(day), o.title).catch((e) => app.toast(String(e)));
    else app.openDoc(id, title, "devotional");
  };
  return (
    <div className="card" style={{ padding: "16px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: chosen.length ? 8 : 0 }}>
        <span className="label">Devotionals · {title}</span>
        <button className="btn small" type="button" style={{ marginLeft: "auto" }} onClick={(e) => setChoose(e.currentTarget.getBoundingClientRect())}><Icon name="plus" size={13} />{chosen.length ? "Change…" : "Add devotionals…"}</button>
      </div>
      {chosen.length === 0 && <div className="hint" style={{ marginTop: 6 }}>Read a devotional or two each day alongside the plan: the day's reading shows here.</div>}
      {chosen.map((id) => {
        const o = ONLINE_DEVOTIONALS.find((x) => x.id === id);
        const m = local.find((x) => x.id === id);
        return (
          <div key={id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "center", gap: 12, minHeight: 46, borderTop: "1px solid var(--border)" }}>
            <div style={{ minWidth: 0 }}>
              <b style={{ font: "600 15px var(--display)", display: "inline-flex", alignItems: "center", gap: 6 }}>{o?.title ?? m?.abbrev ?? m?.title}{read.includes(id) && <Icon name="check" size={13} style={{ color: "var(--good)" }} />}</b>
              <div className="n" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o ? "Online · opens in its own window" : heads[id] ?? "…"}</div>
            </div>
            <button className="btn" type="button" onClick={() => open(id)}>{o ? <><Icon name="link" size={13} />Open</> : <><Icon name="read" size={13} />Read</>}</button>
          </div>
        );
      })}
      {choose && (
        <Popover anchor={choose} onClose={() => setChoose(null)} width={320}>
          <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
            {local.length > 0 && <div className="label" style={{ padding: "2px 0 4px" }}>In your library</div>}
            {local.map((m) => <label key={m.id} className="opt" title={m.title}><input type="checkbox" checked={chosen.includes(m.id)} onChange={() => toggle(m.id)} />{m.title}</label>)}
            <div className="label" style={{ padding: "10px 0 4px" }}>Online</div>
            {ONLINE_DEVOTIONALS.map((o) => <label key={o.id} className="opt"><input type="checkbox" checked={chosen.includes(o.id)} onChange={() => toggle(o.id)} />{o.title}</label>)}
          </div>
        </Popover>
      )}
    </div>
  );
}

/** Under the progress bar: the streak, the best one, and the last week. */
function StreakLine({ plan }: { plan: Plan }) {
  const st = streak(plan);
  const unit = plan.kind === "sequence" && plan.weekdaysOnly ? "weekday" : "day";
  const days = (n: number) => `${n} ${n === 1 ? unit : unit + "s"}`;
  return (
    <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 12.5, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
      <span title={st.today || !st.current ? undefined : "Read today to keep it going"}><b style={{ color: st.current ? "var(--text)" : undefined }}>{days(st.current)}</b> in a row{st.current && !st.today ? " · read today to keep it going" : ""}</span>
      <span>Best <b style={{ color: "var(--text)" }}>{days(st.best)}</b></span>
      <span><b style={{ color: "var(--text)" }}>{st.week}</b> of the last 7 {unit}s</span>
    </div>
  );
}
