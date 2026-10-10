// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { book, BOOKS, fmtRef, parseRef, psalmLabel, SECTIONS, SHORT } from "./bible";
import { Icon, Play } from "./icons";
import {
  addDays,
  balanced,
  behind,
  chaptersOf,
  dateOf,
  dayLabel,
  dueBefore,
  firstUndone,
  fmtDay,
  fmtLong,
  indexOn,
  markDayRead,
  markPpoRead,
  paired,
  readOn,
  streak,
  unmarkDayRead,
  parseYmd,
  partLabel,
  partRef,
  refPart,
  perDay,
  Plan,
  PpoPlan,
  dayTitle,
  fillDate,
  onlineDevotionals,
  WebDevotional,
  doneToday,
  progressKey,
  ppoHistory,
  ppoPreview,
  ppoUpcoming,
  SequencePlan,
  Sizes,
  today,
  todayFor,
  todayIfOngoing,
  ymd,
  worshipCounts,
} from "./plans";
import { BibleSelect, SearchField, Topbar } from "./Shell";
import { uid, useApp } from "./state";
import { useReadingDay } from "./readingDay";
import { InvertButton, inverts } from "./WebPage";
import { confirmDelete, Dialog, Popover, Seg, Switch } from "./ui";
import { useStartQuietTime } from "./QuietTime";
import { useAssistant } from "./assistant";
import { chapterSizes } from "./sizes";

/** A plan is read in the Bible it was set up with, when that Bible is still in the library. */
function readInPlanBible(app: ReturnType<typeof useApp>, plan: Plan) {
  if (app.mod("bible", plan.bible) && app.settings.bible !== plan.bible) app.set({ bible: plan.bible });
}

export function PlansScreen({ openPalette }: { openPalette: () => void }) {
  const app = useApp();
  const plan = app.plans.find((p) => p.active) ?? app.plans[0];
  const [picker, setPicker] = useState(false);
  const [builder, setBuilder] = useState(false);
  const [behindOpen, setBehindOpen] = useState(false);
  /** After the current plan is deleted, with others left: which to carry on with. */
  const [nextOpen, setNextOpen] = useState(false);

  // Drawn again when the reading day changes (at 4am), so a screen left open moves on to it.
  useReadingDay();
  const update = (p: Plan) => app.setPlans((ps) => ps.map((x) => (x.id === p.id ? p : x)));
  const t = plan ? todayFor(plan) : null;
  const late = plan?.kind === "sequence" ? behind(plan) : 0;

  // Offer to catch up when behind, as Settings says.
  useEffect(() => {
    if (plan?.kind !== "sequence" || late <= 0 || !plan.active) return;
    const w = app.settings.whenBehind;
    if (w === "ask") return;
    if (w === "move") update({ ...plan, shift: plan.shift + late });
    if (w === "skip")
      update({
        ...plan,
        skipped: [
          ...plan.skipped,
          ...plan.days.map((_, i) => i).filter((i) => i < dueBefore(plan, today()) && !plan.done.includes(i) && !plan.skipped.includes(i)),
        ],
      });
  }, [plan?.id, late]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!plan) {
    return (
      <div className="main">
        <Topbar>
          <SearchField onOpen={openPalette} />
        </Topbar>
        <div style={{ flexGrow: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="card" style={{ padding: 28, maxWidth: 480, display: "flex", flexDirection: "column", gap: 10 }}>
            <h1 style={{ margin: 0, font: "500 28px var(--display)" }}>Quiet time</h1>
            <p style={{ margin: 0, color: "var(--muted)" }}>
              Read through the Bible, a part of it, or a Psalm, a Proverb and one more chapter every day.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn primary" type="button" onClick={() => setPicker(true)}>
                Choose a plan…
              </button>
              <button className="btn" type="button" onClick={() => setBuilder(true)}>
                Make a plan…
              </button>
            </div>
          </div>
        </div>
        {picker && (
          <PlanPicker
            onClose={() => setPicker(false)}
            onBuild={() => {
              setPicker(false);
              setBuilder(true);
            }}
          />
        )}
        {builder && <PlanBuilder onClose={() => setBuilder(false)} />}
      </div>
    );
  }

  const seq = plan.kind === "sequence" ? plan : null;
  const finish = seq ? dateOf(seq, seq.days.length - 1) : null;

  return (
    <div className="main">
      <Topbar>
        <SearchField onOpen={openPalette} />
      </Topbar>
      <div className="scroll" style={{ flexGrow: 1, padding: "20px 28px 100px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <h1 style={{ margin: 0, font: "500 30px/1 var(--display)" }}>Quiet time</h1>
          {app.plans.length > 1 && (
            <select
              className="btn small"
              value={plan.id}
              onChange={(e) => app.setPlans((ps) => ps.map((p) => ({ ...p, active: p.id === e.target.value })))}
              aria-label="Plan"
            >
              {app.plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <div style={{ marginLeft: "auto", alignSelf: "center", display: "flex", alignItems: "center", gap: 14 }}>
            <button className="btn" type="button" onClick={() => setPicker(true)}>
              <Icon name="plus" />
              Choose a plan…
            </button>
            <button className="btn" type="button" onClick={() => setBuilder(true)}>
              Make a plan…
            </button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 440px", gap: 16 }}>
          <div className="card" style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="label">Current plan</span>
              {seq &&
                (late > 0 ? (
                  <button
                    type="button"
                    className="chip"
                    style={{ color: "var(--pufg)", borderColor: "var(--pufg)" }}
                    onClick={() => setBehindOpen(true)}
                  >
                    {late} behind · catch up…
                  </button>
                ) : (
                  <span className="chip" style={{ color: "var(--good)", borderColor: "var(--good)", cursor: "default" }}>
                    On track
                  </span>
                ))}
              {!plan.active && (
                <>
                  <span
                    className="chip"
                    style={{ color: "var(--pufg)", borderColor: "var(--pufg)", background: "var(--pubg)", cursor: "default" }}
                  >
                    Paused
                  </span>
                  <button className="btn primary small" type="button" onClick={() => update({ ...plan, active: true })}>
                    <Play size={11} />
                    Resume plan
                  </button>
                </>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ font: "500 34px/1.1 var(--display)" }}>{plan.name}</div>
              <div style={{ color: "var(--muted)" }}>
                Started {fmtLong(parseYmd(plan.start))}
                {finish ? ` · finishes ${fmtLong(finish)}` : " · no end: it goes round again"} ·{" "}
                {app.mod("bible", plan.bible)?.abbrev ?? plan.bible}
              </div>
            </div>
            {seq ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontVariantNumeric: "tabular-nums" }}>
                  <span>
                    <b>{seq.done.length}</b> of {seq.days.length} days
                  </span>
                  <span style={{ color: "var(--muted)" }}>
                    {t?.pct}% · {seq.days.length - seq.done.length - seq.skipped.length} to go
                  </span>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: "var(--border)", overflow: "hidden" }}>
                  <div style={{ width: `${t?.pct}%`, height: 8, background: "var(--accent)" }} />
                </div>
                <StreakLine plan={plan} />
              </div>
            ) : (
              plan.kind === "ppo" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>
                      <b>{plan.doneDates.length}</b> {plan.doneDates.length === 1 ? "day" : "days"} read
                    </span>
                    <span style={{ color: "var(--muted)" }}>
                      next other chapter {book(plan.nextOther[0]).name} {plan.nextOther[1]} · {t?.pct}% round
                    </span>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: "var(--border)", overflow: "hidden" }}>
                    <div style={{ width: `${t?.pct}%`, height: 8, background: "var(--accent)" }} />
                  </div>
                  <StreakLine plan={plan} />
                </div>
              )
            )}
            <div style={{ display: "flex", gap: 8, marginTop: "auto", flexWrap: "wrap" }}>
              {plan.active && (
                <button className="btn" type="button" onClick={() => update({ ...plan, active: false })}>
                  Pause plan
                </button>
              )}
              {seq && (
                <button className="btn" type="button" onClick={() => setBehindOpen(true)}>
                  Move the rest later…
                </button>
              )}
              <button
                className="btn"
                type="button"
                style={{ marginLeft: "auto", color: "var(--bad)" }}
                onClick={async () => {
                  if (!(await confirmDelete(`the plan “${plan.name}”`, "Its progress is lost too. This can't be undone."))) return;
                  app.setPlans((ps) => ps.filter((p) => p.id !== plan.id));
                  if (plan.active && app.plans.length > 1) setNextOpen(true);
                }}
              >
                <Icon name="trash" />
                Delete
              </button>
            </div>
          </div>
          <TodayCard plan={plan} update={update} />
        </div>
        {/* Side by side, three across on a wide window, fewer as it narrows. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, alignItems: "stretch" }}>
          <DevotionalsCard plan={plan} update={update} />
          <WorshipCard plan={plan} update={update} />
          <ClosingSetting plan={plan} update={update} />
        </div>
        <TryQuietTime plan={plan} />
        <div style={{ display: "grid", gridTemplateColumns: "420px minmax(0,1fr)", gap: 16 }}>
          <PlanCalendar plan={plan} />
          <ComingUp plan={plan} />
        </div>
      </div>
      {picker && (
        <PlanPicker
          onClose={() => setPicker(false)}
          onBuild={() => {
            setPicker(false);
            setBuilder(true);
          }}
        />
      )}
      {builder && <PlanBuilder onClose={() => setBuilder(false)} />}
      {nextOpen && (
        <NextPlanDialog
          onClose={() => setNextOpen(false)}
          onChoose={(id) => {
            app.setPlans((ps) => ps.map((p) => ({ ...p, active: p.id === id })));
            setNextOpen(false);
          }}
        />
      )}
      {behindOpen && seq && (
        <BehindDialog
          plan={seq}
          onClose={() => setBehindOpen(false)}
          onApply={(p) => {
            update(p);
            setBehindOpen(false);
          }}
        />
      )}
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
    {
      id: "ppo",
      name: "Psalm, Proverb and one more",
      meta: "3 chapters a day · Proverbs by the date · the rest in order, round and round",
      group: "Through the Bible",
    },
    { id: "year", name: "The whole Bible in a year", meta: "365 days of similar length", group: "Through the Bible" },
    { id: "nt90", name: "New Testament in 90 days", meta: "90 days of similar length", group: "Through the Bible" },
    { id: "gospels", name: "The Gospels, a chapter a day", meta: "89 days", group: "Through the Bible" },
    ...(meyer
      ? [
          {
            id: "meyer" as Choice,
            name: "F. B. Meyer, Through the Bible Day by Day",
            meta: "a passage a day, each with his note",
            group: "From your library",
          },
        ]
      : []),
  ];

  const build = async (): Promise<Plan> => {
    const id = uid();
    if (choice === "ppo")
      return {
        id,
        kind: "ppo",
        name: "Psalm, Proverb and one more",
        start,
        bible,
        nextPsalm: psalm,
        nextOther: [otherRef!.book, otherRef!.chapter],
        otherFrom,
        shortMonths,
        doneDates: [],
        active: true,
      };
    const s = await chapterSizes(bible);
    const base = { id, kind: "sequence" as const, start, bible, weekdaysOnly: weekdays, done: [], skipped: [], shift: 0, active: true };
    if (choice === "year") return { ...base, name: "The whole Bible in a year", days: balanced(s, 365) };
    if (choice === "nt90")
      return {
        ...base,
        name: "New Testament in 90 days",
        days: balanced(
          chaptersOf(
            s,
            BOOKS.filter((b) => b.n >= 40).map((b) => b.n),
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
  };

  useEffect(() => {
    let dead = false;
    if (choice === "ppo" && !otherOk) {
      setPreview([]);
      return;
    }
    build()
      .then((p) => {
        if (dead) return;
        if (p.kind === "ppo")
          setPreview(
            ppoPreview(p, parseYmd(start), 8).map((x) => ({
              date: fmtDay(x.date),
              label: x.parts.map((q) => psalmLabel(fmtRef(partRef(q)))).join(" · "),
            })),
          );
        else setPreview(p.days.slice(0, 7).map((d, i) => ({ date: fmtDay(dateOf(p, i)), label: dayLabel(d) })));
      })
      .catch((e) => {
        if (!dead) {
          console.error(e);
          setPreview([]);
        }
      });
    return () => {
      dead = true;
    };
  }, [choice, start, bible, weekdays, psalm, other, otherFrom, shortMonths]); // eslint-disable-line react-hooks/exhaustive-deps

  const startPlan = async () => {
    setBusy(true);
    let p: Plan;
    try {
      p = await build();
    } catch (e) {
      app.toast(`Couldn't make the plan: ${e}`);
      return;
    } finally {
      setBusy(false);
    }
    // The new plan becomes the current one; the old one is kept (paused) or removed.
    app.setPlans((ps) => [...ps.filter((x) => keep || !x.active).map((x) => ({ ...x, active: false })), p]);
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
            const head =
              o.group !== lastGroup ? (
                <div className="label" style={{ padding: "10px 12px 4px" }}>
                  {o.group}
                </div>
              ) : null;
            lastGroup = o.group;
            return (
              <div key={o.id}>
                {head}
                <ChoiceCard on={choice === o.id} title={o.name} meta={o.meta} onClick={() => setChoice(o.id)} />
              </div>
            );
          })}
          <div className="label" style={{ padding: "10px 12px 4px" }}>
            Your own
          </div>
          <button type="button" className="bm" style={{ padding: "10px 12px" }} onClick={onBuild}>
            <b>Make a plan…</b>
            <span className="r">choose books and pace</span>
          </button>
        </div>
        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ font: "500 26px/1.15 var(--display)" }}>{opt.name}</div>
          {choice === "ppo" && (
            <div style={{ color: "var(--muted)" }}>
              Three chapters a day. Proverbs follows the date. Psalms and the other chapter carry on in order and start again at the
              beginning when they run out.
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "120px minmax(0,1fr)", gap: "8px 10px", alignItems: "center" }}>
            <span className="n">Start</span>
            <input type="date" className="btn" value={start} onChange={(e) => setStart(e.target.value)} style={{ width: 200 }} />
            {choice === "ppo" && (
              <>
                <span className="n">First psalm</span>
                <select className="btn" value={psalm} onChange={(e) => setPsalm(+e.target.value)} style={{ width: 200 }}>
                  {Array.from({ length: 150 }, (_, i) => (
                    <option key={i} value={i + 1}>
                      Psalm {i + 1}
                    </option>
                  ))}
                </select>
                <span className="n">First chapter</span>
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <label className="field" style={{ width: 200 }}>
                    <input value={other} onChange={(e) => setOther(e.target.value)} aria-label="First chapter" />
                  </label>
                  <span className={otherOk ? "n" : "err"} style={{ fontSize: 12 }}>
                    {otherOk
                      ? `then ${book(otherRef!.book).name} ${otherRef!.chapter + 1 <= book(otherRef!.book).chapters ? otherRef!.chapter + 1 : "…"}`
                      : "e.g. John 3 (not Psalms or Proverbs)"}
                  </span>
                </span>
                <span className="n">Taken from</span>
                <Seg
                  value={otherFrom}
                  options={[
                    ["all", "Whole Bible"],
                    ["ot", "Old Testament"],
                    ["nt", "New Testament"],
                  ]}
                  onChange={setOtherFrom}
                />
                <span className="n">Short months</span>
                <Seg
                  value={shortMonths}
                  options={[
                    ["last", "Read leftover Proverbs on the last day"],
                    ["skip", "Skip them"],
                  ]}
                  onChange={setShortMonths}
                />
              </>
            )}
            <span className="n">Translation</span>
            <BibleSelect titled all value={bible} onChange={setBible} style={{ width: 260 }} />
            {choice !== "ppo" && (
              <>
                <span className="n">Days</span>
                <label className="opt">
                  <input type="checkbox" checked={weekdays} onChange={(e) => setWeekdays(e.target.checked)} />
                  Weekdays only
                </label>
              </>
            )}
          </div>
          <div style={{ padding: "10px 14px", borderRadius: 10, background: "var(--panel2)", border: "1px solid var(--border)" }}>
            <div className="label" style={{ paddingBottom: 4 }}>
              First week
            </div>
            {preview.map((x) => (
              <div
                key={x.date}
                style={{
                  display: "grid",
                  gridTemplateColumns: "100px minmax(0,1fr)",
                  gap: 8,
                  fontSize: 12.5,
                  minHeight: 24,
                  alignItems: "center",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span style={{ color: "var(--muted)" }}>{x.date}</span>
                <span>{x.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="foot">
        {app.plans.some((p) => p.active) && (
          <label className="opt">
            <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
            Keep my current plan too
          </label>
        )}
        <button className="btn" type="button" style={{ marginLeft: "auto" }} onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" type="button" disabled={busy || (choice === "ppo" && !otherOk)} onClick={startPlan}>
          Start plan
        </button>
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
  useEffect(() => {
    let live = true;
    chapterSizes(app.settings.bible)
      .then((x) => live && setS(x))
      .catch((e) => app.toast(`Couldn't read the Bible's chapters: ${e}`));
    return () => {
      live = false;
    };
  }, [app.settings.bible]); // eslint-disable-line react-hooks/exhaustive-deps
  const chs = chaptersOf(s, books);
  const verses = chs.reduce((a, c) => a + c[2], 0);
  const daysUntil = Math.max(1, Math.round((parseYmd(finishBy).getTime() - parseYmd(start).getTime()) / 86400000) + 1);
  const days = !chs.length
    ? []
    : order === "paired"
      ? paired(chs)
      : pace === "chapters"
        ? perDay(chs, n)
        : pace === "finish"
          ? balanced(chs, Math.min(daysUntil, chs.length))
          : balanced(chs, Math.max(1, Math.round(verses / 85)));
  const toggle = (b: number) => setBooks((x) => (x.includes(b) ? x.filter((y) => y !== b) : [...x, b].sort((a, c) => a - c)));
  const group = (from: number, to: number) => {
    const g = BOOKS.filter((b) => b.n >= from && b.n <= to).map((b) => b.n);
    setBooks((x) =>
      g.every((y) => x.includes(y)) ? x.filter((y) => !g.includes(y)) : Array.from(new Set([...x, ...g])).sort((a, c) => a - c),
    );
  };
  const label = books.length
    ? books.length === 1
      ? book(books[0]).name
      : `${book(books[0]).name} to ${book(books[books.length - 1]).name}`
    : "";
  const plan: SequencePlan = {
    id: uid(),
    kind: "sequence",
    name: name.trim() || label,
    start,
    bible: app.settings.bible,
    weekdaysOnly: weekdays,
    days,
    done: [],
    skipped: [],
    shift: 0,
    active: true,
  };
  const end = days.length ? dateOf(plan, days.length - 1) : null;
  return (
    <Dialog onClose={onClose} width={780} label="Make a plan">
      <div style={{ padding: "20px 24px 6px" }}>
        <div style={{ font: "500 26px/1.15 var(--display)" }}>Make a plan</div>
        <div style={{ color: "var(--muted)" }}>Choose what to read and how fast. The app splits it into days.</div>
      </div>
      <div style={{ padding: "10px 24px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "90px minmax(0,1fr)", gap: 10, alignItems: "center" }}>
          <span className="n">Name</span>
          <label className="field" style={{ width: 320 }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={label || "My plan"} aria-label="Plan name" />
          </label>
          <span className="n">Start</span>
          <input type="date" className="btn" value={start} onChange={(e) => setStart(e.target.value)} style={{ width: 200 }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span className="label" style={{ marginRight: 8 }}>
              Books
            </span>
            {SECTIONS.map((x) => (
              <button key={x.name} type="button" className="chip" onClick={() => group(x.from, x.to)}>
                {x.name}
              </button>
            ))}
            <button type="button" className="chip" onClick={() => setBooks([])}>
              Clear
            </button>
          </div>
          {[BOOKS.filter((b) => b.n <= 39), BOOKS.filter((b) => b.n >= 40)].map((list, k) => (
            <div key={k} style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {list.map((b) => (
                <button
                  key={b.n}
                  type="button"
                  title={b.name}
                  aria-pressed={books.includes(b.n)}
                  onClick={() => toggle(b.n)}
                  style={{
                    height: 24,
                    padding: "0 6px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: books.includes(b.n) ? "var(--accent)" : "var(--panel)",
                    color: books.includes(b.n) ? "var(--onaccent)" : "var(--muted)",
                    fontSize: 11.5,
                    fontWeight: books.includes(b.n) ? 600 : 400,
                    cursor: "pointer",
                  }}
                >
                  {SHORT[b.n - 1]}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="label">Pace</span>
            <label className="opt">
              <input type="radio" name="pace" checked={pace === "chapters"} onChange={() => setPace("chapters")} />
              <select
                className="btn small"
                value={n}
                onChange={(e) => {
                  setN(+e.target.value);
                  setPace("chapters");
                }}
              >
                {[1, 2, 3, 4, 5, 6].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
              chapters a day
            </label>
            <label className="opt">
              <input type="radio" name="pace" checked={pace === "finish"} onChange={() => setPace("finish")} />
              Finish by{" "}
              <input
                type="date"
                className="btn small"
                value={finishBy}
                onChange={(e) => {
                  setFinishBy(e.target.value);
                  setPace("finish");
                }}
              />
            </label>
            <label className="opt">
              <input type="radio" name="pace" checked={pace === "even"} onChange={() => setPace("even")} />
              Even days of about 85 verses
            </label>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="label">Order</span>
            <label className="opt">
              <input type="radio" name="ord" checked={order === "bible"} onChange={() => setOrder("bible")} />
              In Bible order
            </label>
            <label className="opt">
              <input type="radio" name="ord" checked={order === "paired"} onChange={() => setOrder("paired")} />
              One Old and one New Testament chapter a day
            </label>
            <label className="opt">
              <input type="checkbox" checked={weekdays} onChange={(e) => setWeekdays(e.target.checked)} />
              Weekdays only
            </label>
          </div>
        </div>
        {days.length > 0 && (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              background: "var(--accentsoft)",
              border: "1px solid var(--ring)",
              display: "flex",
              alignItems: "center",
              gap: 16,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <b>
                {label} · {chs.length} chapters
              </b>
              <span className="hint">
                {days.length} days · {fmtLong(parseYmd(start))} to {end && fmtLong(end)}
              </span>
            </div>
            <span className="n" style={{ marginLeft: "auto" }}>
              Day 1: {dayLabel(days[0])}
            </span>
          </div>
        )}
      </div>
      <div className="foot">
        <span className="hint">You can pause or move a plan later without losing progress.</span>
        <button className="btn" type="button" style={{ marginLeft: "auto" }} onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn primary"
          type="button"
          disabled={!days.length}
          onClick={() => {
            app.setPlans((ps) => [...ps.map((p) => ({ ...p, active: false })), plan]);
            onClose();
          }}
        >
          Create plan
        </button>
      </div>
    </Dialog>
  );
}

function BehindDialog({ plan, onClose, onApply }: { plan: SequencePlan; onClose: () => void; onApply: (p: SequencePlan) => void }) {
  const app = useApp();
  const late = behind(plan);
  const [choice, setChoice] = useState<"move" | "catchup" | "skip">("move");
  const [always, setAlways] = useState(false);
  const due = dueBefore(plan, today());
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
    [
      "move",
      "Move the rest later",
      late
        ? `Carry on from ${dayLabel(plan.days[missed[0]])} today. The plan now finishes ${fmtLong(newEnd)} instead of ${fmtLong(oldEnd)}.`
        : "You're up to date. Nothing to move.",
    ],
    ["catchup", "Catch up", "Keep the dates and read the missed days alongside today's. Tick them off as you go."],
    [
      "skip",
      "Skip them",
      `Mark ${missed.length} missed reading${missed.length === 1 ? "" : "s"} as skipped. They stay in the calendar so you can read them any time.`,
    ],
  ];
  return (
    <Dialog onClose={onClose} width={600} label="Behind on a reading plan">
      <div style={{ padding: "20px 24px 8px" }}>
        <div style={{ font: "500 26px/1.15 var(--display)" }}>
          {late ? `You're ${late} reading${late === 1 ? "" : "s"} behind` : "You're up to date"}
        </div>
        <div style={{ color: "var(--muted)" }}>
          {plan.name}
          {missed.length
            ? ` · missed ${missed
                .slice(0, 4)
                .map((i) => dayLabel(plan.days[i]))
                .join(", ")}${missed.length > 4 ? "…" : ""}`
            : ""}
        </div>
      </div>
      <div style={{ padding: "8px 18px", display: "flex", flexDirection: "column", gap: 6 }}>
        {opts.map(([id, t, m]) => (
          <ChoiceCard key={id} on={choice === id} title={t} meta={m} onClick={() => setChoice(id)} />
        ))}
      </div>
      <div
        className="hint"
        style={{
          margin: "4px 24px 14px",
          padding: "10px 12px",
          borderRadius: 9,
          background: "var(--panel2)",
          border: "1px solid var(--border)",
        }}
      >
        In the Psalm, Proverb and one more plan, Proverbs always follows the date and the Psalm and other chapter simply wait for you, so it
        never falls behind.
      </div>
      <div className="foot">
        <label className="opt">
          <input type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)} disabled={choice === "catchup"} />
          Always do this
        </label>
        <button className="btn" type="button" style={{ marginLeft: "auto" }} onClick={onClose}>
          Not now
        </button>
        <button className="btn primary" type="button" onClick={apply}>
          {opts.find((o) => o[0] === choice)![1]}
        </button>
      </div>
    </Dialog>
  );
}

/** After the current plan is deleted: one of the others to make current, or none for now. */
function NextPlanDialog({ onClose, onChoose }: { onClose: () => void; onChoose: (id: string) => void }) {
  const app = useApp();
  return (
    <Dialog onClose={onClose} width={480} label="Choose your current plan">
      <div style={{ padding: "20px 24px 8px" }}>
        <div style={{ font: "500 26px/1.15 var(--display)" }}>Carry on with another plan?</div>
        <div style={{ color: "var(--muted)" }}>Choose one to make it your current plan. The others stay paused.</div>
      </div>
      <div style={{ padding: "6px 24px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
        {app.plans.map((p) => (
          <button key={p.id} className="btn" type="button" style={{ justifyContent: "flex-start" }} onClick={() => onChoose(p.id)}>
            <Play size={11} />
            {p.name}
          </button>
        ))}
      </div>
      <div className="foot">
        <button className="btn" type="button" style={{ marginLeft: "auto" }} onClick={onClose}>
          Not now
        </button>
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
  const online = onlineDevotionals(app.settings.webDevotionals);
  const chosen = (plan.devotionals ?? []).filter((id) => local.some((m) => m.id === id) || online.some((o) => o.id === id));
  const read = doneToday(plan, progressKey(plan, today()));
  const day = today();
  const title = dayTitle(day);
  const key = chosen.join(",");
  // What each local devotional is about today: its first heading, and the verse it opens with.
  useEffect(() => {
    let live = true;
    Promise.all(
      chosen
        .filter((id) => !online.some((o) => o.id === id))
        .map(async (id) => {
          const html = await api.devotion(id, title).catch(() => null);
          if (!html) return [id, ""] as const;
          const doc = new DOMParser().parseFromString(html, "text/html");
          const h = doc.querySelector("h1, h2, h3")?.textContent?.trim() ?? "";
          const ref = doc.querySelector("ref, h4")?.textContent?.trim() ?? "";
          const first = (doc.body.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 90);
          return [id, [h && h[0] + h.slice(1).toLowerCase(), ref].filter(Boolean).join(" · ") || first + "…"] as const;
        }),
    ).then((xs) => live && setHeads(Object.fromEntries(xs)));
    return () => {
      live = false;
    };
  }, [key, title]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (id: string) => {
    const cur = plan.devotionals ?? [];
    update({ ...plan, devotionals: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  };
  const open = (id: string) => {
    const o = online.find((x) => x.id === id);
    if (o?.window) api.openWeb(o.id, o.url(day), o.title, inverts(app.settings, o.id)).catch((e) => app.toast(String(e)));
    else if (o) app.openWebDoc(o.id, o.url(day), o.title);
    else app.openDoc(id, title, "devotional");
  };
  return (
    <div className="card" style={{ padding: "16px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: chosen.length ? 8 : 0 }}>
        <span className="label">Devotionals · {title}</span>
        <button
          className="btn small"
          type="button"
          style={{ marginLeft: "auto" }}
          onClick={(e) => setChoose(e.currentTarget.getBoundingClientRect())}
        >
          <Icon name="plus" size={13} />
          {chosen.length ? "Change…" : "Add devotionals…"}
        </button>
      </div>
      {chosen.length === 0 && (
        <div className="hint" style={{ marginTop: 6 }}>
          Read a devotional or two each day alongside the plan: the day's reading shows here.
        </div>
      )}
      {chosen.map((id) => {
        const o = online.find((x) => x.id === id);
        const m = local.find((x) => x.id === id);
        return (
          <div
            key={id}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0,1fr) auto",
              alignItems: "center",
              gap: 12,
              minHeight: 46,
              borderTop: "1px solid var(--border)",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <b style={{ font: "600 15px var(--display)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                {o?.title ?? m?.abbrev ?? m?.title}
                {read.includes(id) && <Icon name="check" size={13} style={{ color: "var(--good)" }} />}
              </b>
              <div className="n" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {o ? (o.window ? "Online · opens in its own window" : "Online · shown in the reading column") : (heads[id] ?? "…")}
              </div>
            </div>
            <button className="btn" type="button" onClick={() => open(id)}>
              {o ? (
                <>
                  <Icon name="link" size={13} />
                  Open
                </>
              ) : (
                <>
                  <Icon name="read" size={13} />
                  Read
                </>
              )}
            </button>
          </div>
        );
      })}
      {choose && (
        <Popover anchor={choose} onClose={() => setChoose(null)} width={320}>
          <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
            {local.length > 0 && (
              <div className="label" style={{ padding: "2px 0 4px" }}>
                In your library
              </div>
            )}
            {local.map((m) => (
              <label key={m.id} className="opt" title={m.title}>
                <input type="checkbox" checked={chosen.includes(m.id)} onChange={() => toggle(m.id)} />
                {m.title}
              </label>
            ))}
            <div className="label" style={{ padding: "10px 0 4px" }}>
              Online
            </div>
            {online.map((o) => (
              <div key={o.id} style={{ display: "flex", alignItems: "center" }}>
                <label className="opt" style={{ flex: 1, minWidth: 0 }}>
                  <input type="checkbox" checked={chosen.includes(o.id)} onChange={() => toggle(o.id)} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.title}</span>
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
                update({ ...plan, devotionals: [...(plan.devotionals ?? []), w.id] });
              }}
            />
          </div>
        </Popover>
      )}
    </div>
  );
}

/** In the devotionals list: a website of the user's own, by name and address. Checked as it's
 *  added: a site that won't be shown inside the app is marked to open in its own window. */
function AddWebsite({ onAdd }: { onAdd: (w: WebDevotional) => void }) {
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

/** Worship songs in Quiet time: whether to have them, and how many before the reading and after it. */
function WorshipCard({ plan, update }: { plan: Plan; update: (p: Plan) => void }) {
  const w = plan.worship;
  const set = (x: Plan["worship"]) => update({ ...plan, worship: x });
  const counts = worshipCounts(w);
  /** Sets one side's count (0 for none); with neither side left, worship is off. */
  const setSide = (side: "before" | "after", n: number) => {
    const c = { ...counts, [side]: n };
    set(c.before || c.after ? c : undefined);
  };
  return (
    <div className="card" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className="label">Worship music</span>
        <span style={{ marginLeft: "auto" }}>
          <Switch on={!!w} onChange={(on) => set(on ? { before: 3 } : undefined)} />
        </span>
      </div>
      <div className="hint">
        {w
          ? "Songs from your Music library, chosen by the AI assistant to suit each day's reading, play in Quiet time."
          : "Play a few worship songs from your Music library in Quiet time, chosen to suit each day's reading."}
      </div>
      {w &&
        (["before", "after"] as const).map((side) => (
          <div key={side} style={{ display: "flex", alignItems: "center", gap: 14, minHeight: 28 }}>
            <Switch on={counts[side] > 0} onChange={(on) => setSide(side, on ? 3 : 0)}>
              {side === "before" ? "Songs before the reading" : "Songs after the reading"}
            </Switch>
            {counts[side] > 0 && (
              <select
                className="btn small"
                style={{ marginLeft: "auto" }}
                value={counts[side]}
                onChange={(e) => setSide(side, +e.target.value)}
                aria-label={side === "before" ? "Songs before the reading" : "Songs after the reading"}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            )}
          </div>
        ))}
    </div>
  );
}

/** The closing verse in Quiet time: whether to end with one; and a favourite passage read every day before it. */
function ClosingSetting({ plan, update }: { plan: Plan; update: (p: Plan) => void }) {
  return (
    <div className="card" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className="label">Closing verse</span>
        <span style={{ marginLeft: "auto" }}>
          <Switch on={!!plan.closing} onChange={(on) => update({ ...plan, closing: on || undefined })} />
        </span>
      </div>
      <div className="hint">
        End Quiet time with a verse or short passage, chosen by the AI assistant to gather up what the day's reading taught.
      </div>
      <FinaleSetting plan={plan} update={update} />
    </div>
  );
}

/** A favourite passage read at the end of every day's Quiet time. */
function FinaleSetting({ plan, update }: { plan: Plan; update: (p: Plan) => void }) {
  const [text, setText] = useState("");
  const ref = parseRef(text);
  const save = () => {
    if (!ref) return;
    update({ ...plan, finale: refPart(ref) });
    setText("");
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid var(--border)", paddingTop: 12, marginTop: 2 }}>
      <span className="label">Every day</span>
      {plan.finale ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <b>{psalmLabel(partLabel(plan.finale))}</b>
          <button
            className="btn small"
            type="button"
            style={{ marginLeft: "auto" }}
            title="Stop reading it each day"
            onClick={() => update({ ...plan, finale: undefined })}
          >
            Remove
          </button>
        </div>
      ) : (
        <form
          style={{ display: "flex", gap: 8, alignItems: "center" }}
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label className="field" style={{ flex: 1 }}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Pro 3:5-6" aria-label="Favourite passage" />
          </label>
          <button className="btn small" type="submit" disabled={!ref}>
            Add
          </button>
        </form>
      )}
      <div className="hint">
        {text && !ref ? "Not a passage: try Proverbs 3:5-6 or Psalm 23." : "A favourite passage, read every day at the end of Quiet time."}
      </div>
    </div>
  );
}

/** Under the worship and closing verse settings: today's Quiet time run through with them, to try. */
function TryQuietTime({ plan }: { plan: Plan }) {
  const startQuiet = useStartQuietTime();
  const t = todayIfOngoing(plan);
  if (!plan.worship && !plan.closing) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, marginTop: -4 }}>
      <span className="n" style={{ marginRight: "auto" }}>
        Try today's Quiet time with these, without ticking anything off or marking the day read.
      </span>
      <button
        className="btn small"
        type="button"
        disabled={!t?.parts.length}
        title="Go through today's Quiet time, without ticking anything off or marking the day read"
        onClick={() => t && startQuiet(plan, t.parts, false, true)}
      >
        <Play size={11} />
        Try it now
      </button>
      <button
        className="btn small"
        type="button"
        disabled={!t?.parts.length}
        title="The same, with the readings read aloud and the songs starting by themselves"
        onClick={() => t && startQuiet(plan, t.parts, true, true)}
      >
        <Icon name="speaker" size={12} />
        Try it with audio
      </button>
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
      <span title={st.today || !st.current ? undefined : "Read today to keep it going"}>
        <b style={{ color: st.current ? "var(--text)" : undefined }}>{days(st.current)}</b> in a row
        {st.current && !st.today ? " · read today to keep it going" : ""}
      </span>
      <span>
        Best <b style={{ color: "var(--text)" }}>{days(st.best)}</b>
      </span>
      <span>
        <b style={{ color: "var(--text)" }}>{st.week}</b> of the last 7 {unit}s
      </span>
    </div>
  );
}

/** Today's reading: its parts to open, Read and Read with audio, marking it read, and questions to ask before reading. */
function TodayCard({ plan, update }: { plan: Plan; update: (p: Plan) => void }) {
  const app = useApp();
  const canAsk = useAssistant().available;
  const startQuiet = useStartQuietTime();
  const partsDone = doneToday(plan, progressKey(plan, today()));
  const t = todayFor(plan);
  const seq = plan.kind === "sequence" ? plan : null;
  const tk = ymd(today());
  // Today as it is when clicked; said only when it changed something.
  const markRead = () => {
    if (!plan) return;
    const p = plan.kind === "ppo" ? markPpoRead(plan, today()) : markDayRead(plan, today());
    if (p === plan) return;
    update(p);
    app.toast("Marked as read");
  };
  const unmarkRead = () => {
    if (!plan) return;
    const p = unmarkDayRead(plan, today());
    if (p === plan) return;
    update(p);
    app.toast("Marked as unread");
  };
  const toPlanBible = () => readInPlanBible(app, plan);
  const openPart = (i = 0) => {
    const x = t.parts[i];
    if (x) {
      toPlanBible();
      app.open({ book: x.b, chapter: x.c, verse: x.v, to: x.v2 }, "read");
    }
  };
  return (
    <div
      className="card"
      style={{
        padding: "22px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        background: "var(--accentsoft)",
        borderColor: "var(--ring)",
      }}
    >
      <div className="label" style={{ color: "var(--accent)" }}>
        {plan.kind === "ppo" ? `Today · ${fmtLong(today())}` : t?.label === "Finished" ? "Finished" : `Next · day ${firstUndone(seq!) + 1}`}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {t?.parts.map((x, i) => {
          const read = Array.from({ length: (x.c2 ?? x.c) - x.c + 1 }, (_, k) => `${x.b}.${x.c + k}`).every((k) => partsDone.includes(k));
          return (
            <button
              key={i}
              type="button"
              className="partlink"
              title={`Open ${psalmLabel(fmtRef(partRef(x)))} in the ${app.mod("bible", plan.bible)?.abbrev ?? "plan's Bible"}`}
              onClick={() => openPart(i)}
              style={{
                alignSelf: "flex-start",
                border: 0,
                padding: "2px 8px",
                margin: "0 -8px",
                borderRadius: 8,
                textAlign: "left",
                cursor: "pointer",
                font: `500 ${t.parts.length > 1 ? 30 : 44}px/1.1 var(--display)`,
                color: read ? "var(--muted)" : "var(--text)",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              {psalmLabel(fmtRef(partRef(x)))}
              {read && <Icon name="check" size={20} style={{ color: "var(--good)" }} />}
            </button>
          );
        })}
      </div>
      {plan.kind === "ppo" && plan.doneDates.includes(tk) && (
        <div style={{ color: "var(--good)", display: "flex", gap: 6, alignItems: "center" }}>
          <Icon name="check" />
          Read today
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: "auto", flexWrap: "wrap" }}>
        <button
          className="btn primary"
          type="button"
          style={{ height: 34, padding: "0 16px" }}
          title="Step through today's readings and devotionals"
          onClick={() => t && startQuiet(plan, t.parts, false)}
        >
          <Icon name="read" />
          Read
        </button>
        <button
          className="btn"
          type="button"
          style={{ height: 34 }}
          title="Read today's readings and devotionals aloud, one after another"
          onClick={() => t && startQuiet(plan, t.parts, true)}
        >
          <Play size={12} />
          Read with audio
        </button>
        {/* Once today is marked, the button undoes it. A sequence plan can still mark another
            day read (catching up), so it keeps both. */}
        {readOn(plan, today()) && (
          <button
            className="btn"
            type="button"
            style={{ height: 34, marginLeft: "auto" }}
            title="Undo today's mark: the plan goes back to where it was"
            onClick={unmarkRead}
          >
            <Icon name="x" />
            Mark as unread
          </button>
        )}
        {!(plan.kind === "ppo" && plan.doneDates.includes(tk)) && (
          <button
            className="btn"
            type="button"
            style={{ height: 34, marginLeft: readOn(plan, today()) ? undefined : "auto" }}
            onClick={markRead}
          >
            <Icon name="check" />
            Mark as read
          </button>
        )}
      </div>
      {canAsk && t?.parts[0] && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <span style={{ color: "var(--accent)", display: "inline-flex" }}>
            <Icon name="chat" />
          </span>
          {[
            `Background before I read ${fmtRef(partRef(t.parts[t.parts.length - 1]))}`,
            `What to look for in ${fmtRef(partRef(t.parts[t.parts.length - 1]))}`,
          ].map((s) => (
            <button
              key={s}
              type="button"
              className="chip"
              onClick={() => {
                const x = t.parts[t.parts.length - 1];
                toPlanBible();
                app.open({ book: x.b, chapter: x.c });
                app.setPending({ ask: s });
              }}
            >
              {s.replace(/ (Psalms?|Proverbs) .*$/, "")}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A month of the plan: the days read marked, each day's reading in its tooltip, opened by a click. */
function PlanCalendar({ plan }: { plan: Plan }) {
  const app = useApp();
  const [month, setMonth] = useState(() => {
    const d = today();
    d.setDate(1);
    return d;
  });
  const toPlanBible = () => readInPlanBible(app, plan);
  // Days to mark on the calendar.
  const doneDays = useMemo(() => {
    const s = new Set<string>();
    if (plan.kind === "ppo") plan.doneDates.forEach((d) => s.add(d));
    else plan.done.forEach((i) => s.add(ymd(dateOf(plan, i))));
    return s;
  }, [plan]);
  // What a Psalm-and-Proverb plan read on each day it was read, for the calendar's tooltips.
  const ppoRead = useMemo(() => (plan.kind === "ppo" ? ppoHistory(plan) : null), [plan]);
  const first = new Date(month);
  const lead = (first.getDay() + 6) % 7;
  const dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array(lead).fill(null),
    ...Array.from({ length: dim }, (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1)),
  ];
  const tk = ymd(today());
  const readingFor = (d: Date) => {
    if (plan.kind === "ppo") return null;
    const i = indexOn(plan, d);
    return i >= 0 && i < plan.days.length && ymd(dateOf(plan, i)) === ymd(d) ? plan.days[i] : null;
  };
  return (
    <div className="card" style={{ padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <b>{month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</b>
        <button
          className="ibtn"
          type="button"
          aria-label="Previous month"
          style={{ marginLeft: "auto" }}
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
        >
          <Icon name="back" />
        </button>
        <button
          className="ibtn"
          type="button"
          aria-label="Next month"
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
        >
          <Icon name="fwd" />
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0,1fr))", gap: 4 }}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <span key={d} style={{ fontSize: 11, color: "var(--muted)", textAlign: "center" }}>
            {d}
          </span>
        ))}
        {cells.map((d, k) => {
          if (!d) return <span key={k} />;
          const key = ymd(d),
            done = doneDays.has(key),
            isToday = key === tk;
          const r = readingFor(d) ?? ppoRead?.get(key) ?? null;
          return (
            <button
              key={k}
              type="button"
              title={r ? `${done ? "Read: " : ""}${dayLabel(r)}` : undefined}
              disabled={!r && plan.kind !== "ppo"}
              onClick={() => {
                if (r) {
                  toPlanBible();
                  app.open({ book: r[0].b, chapter: r[0].c }, "read");
                }
              }}
              style={{
                height: 38,
                borderRadius: 8,
                border: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                fontSize: 12,
                fontVariantNumeric: "tabular-nums",
                cursor: r ? "pointer" : "default",
                color: isToday ? "var(--accent)" : done ? "var(--text)" : "var(--muted)",
                fontWeight: isToday ? 700 : 400,
                background: isToday ? "var(--accentsoft)" : "transparent",
                boxShadow: isToday ? "inset 0 0 0 1.5px var(--accent)" : undefined,
              }}
            >
              {d.getDate()}
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: done ? "var(--accent)" : "transparent" }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The next week's readings. */
function ComingUp({ plan }: { plan: Plan }) {
  // From the reading day it is now, so a screen left open moves on with it.
  const day = useReadingDay();
  const upcoming = useMemo(() => {
    if (plan.kind === "ppo")
      return ppoUpcoming(plan, parseYmd(day), 6).map((x) => ({
        date: x.date,
        label: x.parts.map((p) => psalmLabel(fmtRef(partRef(p)))).join(" · "),
      }));
    const i = firstUndone(plan);
    if (i < 0) return [];
    return plan.days.slice(i + 1, i + 7).map((d, k) => ({ date: dateOf(plan, i + 1 + k), label: dayLabel(d) }));
  }, [plan, day]);
  return (
    <div className="card" style={{ padding: "12px 18px" }}>
      <div className="label" style={{ padding: "4px 4px 6px" }}>
        Coming up
      </div>
      {upcoming.map((u) => (
        <div
          key={u.date.toISOString()}
          style={{
            display: "grid",
            gridTemplateColumns: "120px minmax(0,1fr)",
            gap: 12,
            alignItems: "center",
            minHeight: 40,
            padding: "0 4px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <span style={{ color: "var(--muted)" }}>{fmtDay(u.date)}</span>
          <b style={{ font: "600 16px var(--display)" }}>{u.label}</b>
        </div>
      ))}
      {!upcoming.length && (
        <div className="n" style={{ padding: 4 }}>
          Nothing more: the plan is finished.
        </div>
      )}
    </div>
  );
}

/** One of a few choices, as a radio button with its name and what it means. */
function ChoiceCard({ on, title, meta, onClick }: { on: boolean; title: string; meta: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      style={{
        display: "grid",
        gridTemplateColumns: "18px minmax(0,1fr)",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 9,
        border: `1px solid ${on ? "var(--ring)" : "transparent"}`,
        background: on ? "var(--accentsoft)" : "transparent",
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
      }}
    >
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: "50%",
          border: on ? "4px solid var(--accent)" : "1.5px solid var(--track)",
          marginTop: 2,
        }}
      />
      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <b style={{ fontSize: 13 }}>{title}</b>
        <span className="hint" style={{ fontSize: 12 }}>
          {meta}
        </span>
      </span>
    </button>
  );
}
