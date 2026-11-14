// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AskPanel } from "./Ask";
import { useAssistant } from "./assistant";
import { Icon } from "./icons";
import { Topbar } from "./Shell";
import { useApp } from "./state";
import { bibleSizes, Popover } from "./ui";
import {
  ALL,
  apocryphaIn,
  Bib,
  comparable,
  compareTargets,
  Coverage,
  coverageOf,
  coverageText,
  EDGES,
  era,
  ERAS,
  FAMILIES,
  historySummary,
  KJV,
  LATER,
  matches,
  NT_TEXT,
  pairs,
  Source,
  the,
  TIERS,
  View,
} from "./kjvSources";

/** Where the King James Version came from: the screen (kjvSources.ts has its content). */

/** "Compare with the RSV": the Bible beside each it came from, and the KJV, in Compare; or what's missing for it. */
function CompareButtons(p: { s: Source; bibles: Bib[]; onCompare: (ids: string[]) => void }) {
  const targets = compareTargets(p.s);
  if (!targets.length) return null;
  const can = comparable(p.s, p.bibles);
  return can.length ? (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
      {can.map(({ x, m, mine }) => (
        <button key={x.id} className="btn primary ks-compare" type="button" onClick={() => p.onCompare([m.id, mine.id])}>
          <Icon name="compare" size={13} />
          Compare with {the(x.name)}
        </button>
      ))}
    </div>
  ) : (
    <p style={{ margin: "4px 0 0", fontSize: 12.5, lineHeight: 1.5, color: "var(--muted)" }}>
      With it and {targets.map((x) => the(x.name)).join(" or ")} in your library, compare them here.
    </p>
  );
}

export function KjvHistoryScreen() {
  const app = useApp();
  const bibles = app.bibles;
  const [asking, setAsking] = useState(false);
  // Ask only with an AI tool installed (its button and panel go otherwise).
  const canAsk = useAssistant().available;
  const box = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLElement>());
  const [lines, setLines] = useState<{ a: string; b: string; d: string }[]>([]);
  const [hover, setHover] = useState<string | null>(null);
  const [about, setAbout] = useState<{ s: Source; near: boolean; rect: DOMRect } | null>(null);
  // Before the KJV (where it came from) or after it (the Bibles since, as a family tree).
  const view = app.settings.historyView;
  const edges = EDGES[view];

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const draw = () => {
      const o = el.getBoundingClientRect();
      setLines(
        edges.flatMap(([a, b]) => {
          const ea = cards.current.get(a),
            eb = cards.current.get(b);
          if (!ea || !eb) return [];
          const ra = ea.getBoundingClientRect(),
            rb = eb.getBoundingClientRect();
          // The tree runs left to right in time: from a card's right side to the next one's left.
          if (view === "after") {
            const x1 = ra.right - o.left,
              y1 = ra.top + 22 - o.top,
              x2 = rb.left - o.left,
              y2 = rb.top + 22 - o.top,
              dx = Math.max(18, (x2 - x1) / 2);
            return [{ a, b, d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}` }];
          }
          const x1 = ra.left + ra.width / 2 - o.left,
            y1 = ra.bottom - o.top,
            x2 = rb.left + rb.width / 2 - o.left,
            y2 = rb.top - o.top;
          // Same tier (Tyndale → Coverdale): from its side, over the top.
          if (Math.abs(ra.top - rb.top) < 4) {
            const ya = ra.top - o.top;
            return [{ a, b, d: `M${x1},${ya} C${x1},${ya - 28} ${x2},${ya - 28} ${x2},${ya}` }];
          }
          const my = (y1 + y2) / 2;
          return [{ a, b, d: `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}` }];
        }),
      );
    };
    draw();
    // Drawn again when the diagram or any card changes size: a card widening (its chips, the
    // Apocrypha's A, arriving) moves the others in its row.
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    cards.current.forEach((c) => ro.observe(c));
    return () => ro.disconnect();
  }, [view, edges]);

  // The hovered card's ancestors and descendants.
  const lit = new Set<string>();
  if (hover) {
    const up = (id: string) => {
      if (lit.has(id + "^")) return;
      lit.add(id + "^");
      lit.add(id);
      edges.filter(([, b]) => b === id).forEach(([a]) => up(a));
    };
    const down = (id: string) => {
      if (lit.has(id + "v")) return;
      lit.add(id + "v");
      lit.add(id);
      edges.filter(([a]) => a === id).forEach(([, b]) => down(b));
    };
    up(hover);
    down(hover);
  }
  const on = (id: string) => !hover || lit.has(id);

  // Closes a book open in Read, which would otherwise stay in front of the Bible (back returns to it).
  const open = (m: Bib) => {
    app.set({ bible: m.id });
    app.open(app.loc, "read");
  };
  // Which parts of the Bible each module covers, for the bars on the chips.
  const [cov, setCov] = useState<Record<string, Coverage>>({});
  // And what of the Apocrypha each has, for the yellow A beside it.
  const [apo, setApo] = useState<Record<string, string[]>>({});
  useEffect(() => {
    let live = true;
    Promise.all(bibles.map((b) => bibleSizes(b.id).then((sz) => [b.id, sz] as const)))
      .then((r) => {
        if (!live) return;
        setCov(Object.fromEntries(r.map(([id, sz]) => [id, coverageOf(new Set(sz.keys()))])));
        setApo(Object.fromEntries(r.map(([id, sz]) => [id, apocryphaIn(sz)]).filter(([, l]) => l.length)));
      })
      // Without them the chips just lack their bars and the A.
      .catch((e) => console.error("kjv-history", e));
    return () => {
      live = false;
    };
  }, [bibles]);
  // Not when the name already says: "Westminster Leningrad Codex (Hebrew OT)", "Rheims New Testament (1582)".
  const covTip = (m: Bib) =>
    cov[m.id] && coverageText(cov[m.id]) && !/\b(OT|NT|Old Testament|New Testament|Tanach)\b/i.test(m.title)
      ? ` (${coverageText(cov[m.id])})`
      : "";
  const haveCount = ALL.filter((s) => matches(s, bibles).have.length).length;
  const laterCount = LATER.filter((s) => matches(s, bibles).have.length).length;
  const nearCount = ALL.filter((s) => {
    const m = matches(s, bibles);
    return !m.have.length && m.near.length;
  }).length;

  // `narrow` for the tree after the KJV, whose columns must fit the window.
  const card = (s: Source, wide = false, narrow = false) => {
    const { have, near } = matches(s, bibles);
    const status = have.length ? "have" : near.length ? "near" : "none";
    return (
      <div
        key={s.id}
        ref={(e) => {
          if (e) cards.current.set(s.id, e);
          else cards.current.delete(s.id);
        }}
        className={`ks-card ks-${status} ${wide ? "ks-main" : ""}`}
        style={{
          ...(narrow ? { width: 146 } : { minWidth: wide ? 300 : 168, width: "max-content", maxWidth: 340 }),
          opacity: on(s.id) ? 1 : 0.35,
        }}
        onMouseEnter={() => setHover(s.id)}
        onMouseLeave={() => setHover(null)}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
          <b style={{ font: wide && !narrow ? "500 19px/1.2 var(--display)" : "600 13px/1.25 var(--ui)", flexGrow: 1 }}>{s.name}</b>
          <button
            className="ibtn"
            type="button"
            aria-label={`About ${s.name}`}
            title="About"
            style={{ width: 20, height: 20, flexShrink: 0, margin: "-2px -6px 0 0" }}
            onClick={(e) => {
              e.stopPropagation();
              setAbout({ s, near: near.length > 0, rect: e.currentTarget.getBoundingClientRect() });
            }}
          >
            <Icon name="info" size={13} />
          </button>
        </div>
        <span className="n" style={{ fontSize: 11.5, display: "flex", alignItems: "center", gap: 6 }}>
          {s.date}
          {s.nt && (
            <span className="ks-nt" title={`New Testament: ${NT_TEXT[s.nt]}`}>
              {s.nt}
            </span>
          )}
        </span>
        {/* One resource to a line, but a Bible and its + edition (WLC, WLC+) side by side. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {pairs([
            ...have.map((m) => ({ m, kind: "have" as const })),
            ...near.map((m, i) => ({ m, kind: !have.length && i === 0 ? ("closest" as const) : ("rel" as const) })),
          ]).map((row) => (
            <div key={row[0].m.id} style={{ display: "flex", gap: 3, alignItems: "center" }}>
              {row.map(({ m, kind }, i) => {
                // Beside its plain edition, a + edition is just "+" (its name is in the tooltip).
                const label = i > 0 ? "+" : m.abbrev;
                return kind === "have" ? (
                  <button
                    key={m.id}
                    type="button"
                    className="ks-chip ks-chip-have"
                    title={`Read ${m.title}${covTip(m)}`}
                    onClick={() => open(m)}
                  >
                    {i === 0 && <Icon name="check" size={11} />}
                    {label}
                  </button>
                ) : (
                  // The closest stands in for a text the library lacks; the rest are related.
                  <button
                    key={m.id}
                    type="button"
                    className={`ks-chip ${kind === "closest" ? "ks-chip-near" : "ks-chip-rel"}`}
                    title={`${kind === "closest" ? "Closest" : "Related"}: ${m.title}${covTip(m)}`}
                    onClick={() => open(m)}
                  >
                    {i === 0 ? (kind === "closest" ? "Closest: " : "Related: ") : ""}
                    {label}
                  </button>
                );
              })}
              {apo[row[0].m.id] && (
                <span className="ks-apo" title={`Apocrypha in ${row[0].m.abbrev}: ${apo[row[0].m.id].join(", ")}`}>
                  A
                </span>
              )}
            </div>
          ))}
          {!have.length && !near.length && <span className="ks-chip">Not in library</span>}
          {/* Side by side in Compare with what it came from, and with the KJV. */}
          {comparable(s, bibles).length > 0 && (
            // As wide as the card the rest makes, wrapping, so the chips don't widen it.
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3, width: 0, minWidth: "100%" }}>
              {comparable(s, bibles).map(({ x, m, mine }) => (
                <button
                  key={x.id}
                  type="button"
                  className="ks-chip ks-chip-cmp"
                  title={`Compare ${mine.abbrev} with ${the(x.name)} (${m.abbrev}), side by side`}
                  onClick={(e) => {
                    e.stopPropagation();
                    app.compareWith([m.id, mine.id]);
                  }}
                >
                  <Icon name="compare" size={11} />
                  vs {m.abbrev}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const tier = (t: { name: string; hint: string; items: Source[] }) => (
    <section key={t.name} style={{ position: "relative", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        <span className="label">{t.name}</span>
        <span className="n" style={{ fontSize: 11.5 }}>
          {t.hint}
        </span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "center" }}>{t.items.map((s) => card(s))}</div>
    </section>
  );

  return (
    <div className="main">
      <Topbar
        right={
          canAsk && (
            <button
              className={`btn ${asking ? "on" : ""}`}
              type="button"
              title="Ask about the KJV's history and sources"
              onClick={() => setAsking(!asking)}
            >
              <Icon name="chat" />
              Ask
            </button>
          )
        }
      />
      <div
        style={{
          flexGrow: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: asking && canAsk ? "minmax(0,1fr) 440px" : "minmax(0,1fr)",
        }}
      >
        <div className="scroll" style={{ overflow: "auto" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 12, padding: "20px 28px 0", flexWrap: "wrap" }}>
            <div style={{ flexGrow: 1, minWidth: 320 }}>
              <div className="seg" role="tablist" aria-label="View" style={{ marginBottom: 12 }}>
                {(
                  [
                    ["before", "Before the KJV"],
                    ["after", "After the KJV"],
                  ] as [View, string][]
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={view === v}
                    className={view === v ? "on" : ""}
                    onClick={() => {
                      setHover(null);
                      setAbout(null);
                      app.set({ historyView: v });
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <h1 style={{ margin: 0, font: "500 30px/1.1 var(--display)" }}>
                {view === "before" ? "Where the King James Version came from" : "The English Bibles since the King James"}
              </h1>
              <div className="hint" style={{ fontSize: 12.5, marginTop: 6 }}>
                {view === "before" ? (
                  <>
                    The translators worked from printed editions, each resting on manuscript traditions. {haveCount} of {ALL.length} are in
                    your library, and the closest equivalent of {nearCount} more. Hover a card for its line of descent; click a chip to read
                    it, or a “vs” chip to compare two side by side.
                  </>
                ) : (
                  <>
                    By family, oldest on the left; each line runs from a Bible to one revised from it. {laterCount} of {LATER.length} are in
                    your library. Hover a card for its line of descent; click a chip to read it, or a “vs” chip to compare two side by side.
                  </>
                )}
              </div>
            </div>
            <span className="ks-chip ks-chip-have" style={{ cursor: "default" }}>
              In library
            </span>
            {view === "before" && (
              <>
                <span className="ks-chip ks-chip-near" style={{ cursor: "default" }}>
                  Closest
                </span>
                <span className="ks-chip ks-chip-rel" style={{ cursor: "default" }}>
                  Related
                </span>
              </>
            )}
            <span className="ks-chip" style={{ cursor: "default" }}>
              Not in library
            </span>
            {view === "before" ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span className="ks-apo" style={{ cursor: "default" }}>
                  A
                </span>
                <span className="n">Has the Apocrypha (hover for which)</span>
              </span>
            ) : (
              (["TR", "MT", "CT"] as const).map((k) => (
                <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5 }} title={NT_TEXT[k]}>
                  <span className="ks-nt">{k}</span>
                  <span className="n">{{ TR: "Textus Receptus", MT: "Majority Text", CT: "Critical text" }[k]}</span>
                </span>
              ))
            )}
          </div>
          <div
            ref={box}
            style={{
              position: "relative",
              padding: view === "after" ? "22px 16px 40px" : "22px 24px 40px",
              display: "flex",
              flexDirection: "column",
              gap: 44,
            }}
          >
            <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }}>
              {lines.map((l, i) => {
                const hi = hover && lit.has(l.a) && lit.has(l.b);
                return (
                  <path
                    key={i}
                    d={l.d}
                    fill="none"
                    stroke={hi ? "var(--accent)" : "var(--border)"}
                    strokeWidth={hi ? 2 : 1.2}
                    opacity={hover && !hi ? 0.25 : 1}
                  />
                );
              })}
            </svg>
            {view === "before" ? (
              <>
                {TIERS.map(tier)}
                <div style={{ display: "flex", justifyContent: "center" }}>{card(KJV, true)}</div>
              </>
            ) : (
              // The KJV first, at the head of the families it began; a lane for each family, a column for each era.
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${ERAS.length + 1}, 146px)`,
                  columnGap: 18,
                  rowGap: 8,
                  alignItems: "start",
                  width: "max-content",
                  margin: "0 auto",
                }}
              >
                {[["1611"], ...ERAS].map(([name]) => (
                  <span
                    key={name}
                    className="label"
                    style={{ textAlign: "center", paddingBottom: 6, borderBottom: "1px solid var(--border)" }}
                  >
                    {name}
                  </span>
                ))}
                <div style={{ gridColumn: 1, gridRow: 3 }}>{card(KJV, true, true)}</div>
                {FAMILIES.flatMap((f, i) => [
                  <div
                    key={f.name}
                    style={{ gridColumn: "2 / -1", gridRow: 2 + i * 2, display: "flex", gap: 10, alignItems: "baseline", marginTop: 14 }}
                  >
                    <span className="label">{f.name}</span>
                    <span className="n" style={{ fontSize: 11.5 }}>
                      {f.hint}
                    </span>
                  </div>,
                  ...ERAS.map((_, k) => (
                    <div
                      key={`${f.name}${k}`}
                      style={{ gridColumn: 2 + k, gridRow: 3 + i * 2, display: "flex", flexDirection: "column", gap: 10 }}
                    >
                      {f.items.filter((s) => era(s) === k).map((s) => card(s, false, true))}
                    </div>
                  )),
                ])}
              </div>
            )}
          </div>
        </div>
        {asking && canAsk && (
          <aside
            aria-label="Ask"
            style={{
              borderLeft: "1px solid var(--border)",
              background: "var(--panel)",
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
            }}
          >
            <AskPanel
              full
              source="KJV history"
              about="Where the KJV came from"
              context={() => historySummary(bibles)}
              hint="The diagram's history and your library's sources go with the question."
              suggestions={[
                "Summarise how the KJV came to be",
                "Why did the translators follow the Bishops' Bible?",
                "Which of these sources should I add to my library next, and why?",
                "How does the Textus Receptus differ from the Greek behind modern translations?",
              ]}
            />
          </aside>
        )}
      </div>
      {about && (
        <Popover anchor={about.rect} onClose={() => setAbout(null)} width={360}>
          <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
            <div>
              <b style={{ font: "500 18px/1.2 var(--display)" }}>{about.s.name}</b>
              <div className="n" style={{ fontSize: 12 }}>
                {about.s.date}
              </div>
            </div>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>{about.s.note}</p>
            <span className="label" style={{ marginTop: 4 }}>
              {about.s.id === "kjv" ? "The text" : "For the KJV"}
            </span>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>{about.s.kjv}</p>
            {about.near && about.s.nearNote && (
              <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: "var(--muted)" }}>{about.s.nearNote}</p>
            )}
            <CompareButtons
              s={about.s}
              bibles={bibles}
              onCompare={(ids) => {
                setAbout(null);
                app.compareWith(ids);
              }}
            />
          </div>
        </Popover>
      )}
    </div>
  );
}
