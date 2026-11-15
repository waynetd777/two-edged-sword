// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// KJV History on the phone: the desktop's family tree (src/KjvHistory.tsx) as a list, with the same
// content (src/kjvSources.ts). In place of the tree's lines and hover, a card opens to say what it is,
// what it came from and what came from it, each a tap away. On a tablet in landscape it is the desktop's
// tree, lines and all: a tap on a card lights its line of descent, as hovering does there, and its ⓘ says
// what it is.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BookSizes } from "../../src/bible";
import {
  ALL,
  apocryphaIn,
  comparable,
  EDGES,
  era,
  ERAS,
  FAMILIES,
  KJV,
  LATER,
  matches,
  NT_TEXT,
  pairs,
  Source,
  the,
  TIERS,
  View,
} from "../../src/kjvSources";
import { api, Module, save, saved } from "./api";
import { Icon } from "./icons";
import { NavButtons } from "./NavButtons";

const EVERY = [...ALL, KJV, ...LATER];
const byId = (id: string) => EVERY.find((s) => s.id === id);

/** A Bible's chapters per book, from its chapter sizes, for what of the Apocrypha it has. */
async function bookSizes(bible: string): Promise<BookSizes> {
  const sz: BookSizes = new Map();
  for (const [b, c] of await api.chapterSizes(bible)) sz.set(b, Math.max(sz.get(b) ?? 0, c));
  return sz;
}

/** A tablet in landscape: room for the desktop's tree (as Read's study pane beside the text). */
const WIDE = "(orientation: landscape) and (min-width: 900px)";
function useWide() {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches);
  useEffect(() => {
    const m = window.matchMedia(WIDE);
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

export function KjvHistory({
  modules,
  onRead,
  onCompare,
}: {
  modules: Module[];
  /** Opens a Bible in Read. */
  onRead: (bible: string) => void;
  /** Opens Compare with these Bibles side by side. */
  onCompare: (bibles: string[]) => void;
}) {
  const bibles = modules.filter((m) => m.kind === "bible");
  const [view, setView] = useState<View>(() => saved<View>("historyView", "before"));
  useEffect(() => save("historyView", view), [view]);
  const [open, setOpen] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const wide = useWide();
  // The tree: the card whose line of descent is lit, the one whose ⓘ is open, and the lines between them.
  const [sel, setSel] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLElement>());
  const [lines, setLines] = useState<{ a: string; b: string; d: string }[]>([]);
  // What of the Apocrypha each Bible has, for the A beside it.
  const [apo, setApo] = useState<Record<string, string[]>>({});
  useEffect(() => {
    let live = true;
    Promise.all(bibles.map((b) => bookSizes(b.id).then((sz) => [b.id, apocryphaIn(sz)] as const)))
      .then((r) => live && setApo(Object.fromEntries(r.filter(([, l]) => l.length))))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [modules]); // eslint-disable-line react-hooks/exhaustive-deps

  const edges = EDGES[view];
  /** A card that came from or led to this one: opened, and scrolled to; on the other tab when it's there. */
  const goTo = (id: string) => {
    setView(LATER.some((s) => s.id === id) ? "after" : ALL.some((s) => s.id === id) ? "before" : view);
    if (wide) {
      setSel(id);
      setInfo(null);
      setTimeout(() => document.getElementById(`ks-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" }), 50);
      return;
    }
    setOpen(id);
    setTimeout(() => document.getElementById(`ks-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  // The tree's lines, as the desktop draws them (src/KjvHistory.tsx): again whenever a card changes size,
  // and when the screen is shown (it has no size while hidden).
  useLayoutEffect(() => {
    const el = box.current;
    if (!wide || !el) return;
    const draw = () => {
      const o = el.getBoundingClientRect();
      setLines(
        edges.flatMap(([a, b]) => {
          const ea = cards.current.get(a),
            eb = cards.current.get(b);
          if (!ea || !eb) return [];
          const ra = ea.getBoundingClientRect(),
            rb = eb.getBoundingClientRect();
          // After the KJV the tree runs left to right in time: from a card's right side to the next one's left.
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
          // Same tier (Tyndale → Coverdale): over the top.
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
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    cards.current.forEach((c) => ro.observe(c));
    return () => ro.disconnect();
  }, [wide, view, edges]);

  // The chosen card's ancestors and descendants.
  const lit = new Set<string>();
  if (sel) {
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
    up(sel);
    down(sel);
  }

  /** The date, and the Greek its New Testament follows. */
  const date = (s: Source) => (
    <span className="m ks-date">
      {s.date}
      {s.nt && (
        <span className="ks-nt" aria-label={`New Testament: ${NT_TEXT[s.nt]}`}>
          {s.nt}
        </span>
      )}
    </span>
  );

  /** One Bible to a line, but a Bible and its + edition (KJV, KJV+) side by side; then "vs" to compare. */
  const chips = (s: Source) => {
    const { have, near } = matches(s, bibles);
    const cmp = comparable(s, bibles);
    return (
      <div className="ks-chips">
        {pairs([
          ...have.map((m) => ({ m, kind: "have" as const })),
          ...near.map((m, i) => ({ m, kind: !have.length && i === 0 ? ("closest" as const) : ("rel" as const) })),
        ]).map((row) => (
          <div key={row[0].m.id} className="ks-row">
            {row.map(({ m, kind }, i) => (
              <button
                key={m.id}
                className={`ks-chip ${kind === "have" ? "ks-chip-have" : kind === "closest" ? "ks-chip-near" : "ks-chip-rel"}`}
                aria-label={`Read ${m.title}`}
                onClick={() => onRead(m.id)}
              >
                {kind === "have" && i === 0 && <Icon name="check" size={13} />}
                {i === 0 && kind === "closest" ? "Closest: " : i === 0 && kind === "rel" ? "Related: " : ""}
                {i > 0 ? "+" : m.abbrev}
              </button>
            ))}
            {apo[row[0].m.id] && (
              <span className="ks-apo" aria-label={`Apocrypha in ${row[0].m.abbrev}: ${apo[row[0].m.id].join(", ")}`}>
                A
              </span>
            )}
          </div>
        ))}
        {!have.length && !near.length && <span className="ks-chip">Not in library</span>}
        {cmp.length > 0 && (
          <div className="ks-row wrap">
            {cmp.map(({ x, m, mine }) => (
              <button
                key={x.id}
                className="ks-chip ks-chip-cmp"
                aria-label={`Compare ${mine.abbrev} with ${the(x.name)}`}
                onClick={() => onCompare([m.id, mine.id])}
              >
                <Icon name="compare" size={13} />
                vs {m.abbrev}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  /** What it is, what it gave the KJV, and what it came from and led to. */
  const about = (s: Source) => {
    const { have, near } = matches(s, bibles);
    const cameFrom = edges.filter(([, b]) => b === s.id).map(([a]) => byId(a)!);
    const ledTo = edges.filter(([a]) => a === s.id).map(([, b]) => byId(b)!);
    return (
      <div className="ks-about">
        <p>{s.note}</p>
        <p className="label">{s.id === "kjv" ? "The text" : "For the KJV"}</p>
        <p>{s.kjv}</p>
        {near.length > 0 && s.nearNote && <p className="m">{s.nearNote}</p>}
        {s.id !== "kjv" && apo[(have[0] ?? near[0])?.id ?? ""] && (
          <p className="m">
            Apocrypha in {(have[0] ?? near[0]).abbrev}: {apo[(have[0] ?? near[0]).id].join(", ")}.
          </p>
        )}
        {cameFrom.length > 0 && (
          <div className="ks-links">
            <span className="label">Came from</span>
            {cameFrom.map((x) => (
              <button key={x.id} className="link" onClick={() => goTo(x.id)}>
                {x.name}
              </button>
            ))}
          </div>
        )}
        {ledTo.length > 0 && (
          <div className="ks-links">
            <span className="label">{view === "before" ? "Led to" : "Revised as"}</span>
            {ledTo.map((x) => (
              <button key={x.id} className="link" onClick={() => goTo(x.id)}>
                {x.name}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const card = (s: Source) => {
    const { have, near } = matches(s, bibles);
    const status = have.length ? "have" : near.length ? "near" : "none";
    const isOpen = open === s.id;
    return (
      <div key={s.id} id={`ks-${s.id}`} className={`ks-card ks-${status} ${s.id === "kjv" ? "ks-main" : ""}`}>
        <button className="ks-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : s.id)}>
          <span className="grow">
            <b>{s.name}</b>
            {date(s)}
          </span>
          <span className={`ks-more ${isOpen ? "on" : ""}`} aria-hidden="true">
            <Icon name="down" size={18} />
          </span>
        </button>
        {chips(s)}
        {isOpen && about(s)}
      </div>
    );
  };

  /** A card in the tree: a tap lights its line of descent; its ⓘ opens what it is. `narrow` after the KJV, in columns. */
  const node = (s: Source, narrow = false) => {
    const { have, near } = matches(s, bibles);
    const status = have.length ? "have" : near.length ? "near" : "none";
    return (
      <div
        key={s.id}
        id={`ks-${s.id}`}
        ref={(e) => {
          if (e) cards.current.set(s.id, e);
          else cards.current.delete(s.id);
        }}
        className={`ks-card ks-${status} ${s.id === "kjv" ? "ks-main" : ""} ${narrow ? "narrow" : ""} ${sel === s.id ? "sel" : ""}`}
        style={{ opacity: !sel || lit.has(s.id) ? 1 : 0.35 }}
        onClick={(e) => {
          e.stopPropagation();
          setSel(sel === s.id ? null : s.id);
        }}
      >
        <div className="ks-nodehead">
          <b>{s.name}</b>
          <button
            className="ks-info"
            aria-label={`About ${s.name}`}
            onClick={(e) => {
              e.stopPropagation();
              setSel(s.id);
              setInfo(s.id);
            }}
          >
            <Icon name="info" size={16} />
          </button>
        </div>
        {date(s)}
        {chips(s)}
      </div>
    );
  };

  const tree = (
    <div ref={box} className={`ks-box ${view}`} onClick={() => setSel(null)}>
      <svg className="ks-lines">
        {lines.map((l, i) => {
          const hi = sel && lit.has(l.a) && lit.has(l.b);
          return (
            <path
              key={i}
              d={l.d}
              fill="none"
              stroke={hi ? "var(--accent)" : "var(--border)"}
              strokeWidth={hi ? 2 : 1.2}
              opacity={sel && !hi ? 0.25 : 1}
            />
          );
        })}
      </svg>
      {view === "before" ? (
        <>
          {TIERS.map((t) => (
            <section key={t.name} className="ks-tier">
              <div className="ks-tierhead">
                <span className="label">{t.name}</span>
                <span className="m">{t.hint}</span>
              </div>
              <div className="ks-tierrow">{t.items.map((s) => node(s))}</div>
            </section>
          ))}
          <div className="ks-tierrow">{node(KJV)}</div>
        </>
      ) : (
        // The KJV first, at the head of the families it began; a lane for each family, a column for each era.
        <div className="ks-grid" style={{ gridTemplateColumns: `repeat(${ERAS.length + 1}, 150px)` }}>
          {[["1611"], ...ERAS].map(([name]) => (
            <span key={name} className="label ks-era">
              {name}
            </span>
          ))}
          <div style={{ gridColumn: 1, gridRow: 3 }}>{node(KJV, true)}</div>
          {FAMILIES.flatMap((f, i) => [
            <div key={f.name} className="ks-tierhead lane" style={{ gridColumn: "2 / -1", gridRow: 2 + i * 2 }}>
              <span className="label">{f.name}</span>
              <span className="m">{f.hint}</span>
            </div>,
            ...ERAS.map((_, k) => (
              <div key={`${f.name}${k}`} className="ks-cell" style={{ gridColumn: 2 + k, gridRow: 3 + i * 2 }}>
                {f.items.filter((s) => era(s) === k).map((s) => node(s, true))}
              </div>
            )),
          ])}
        </div>
      )}
    </div>
  );
  const shown = info ? byId(info) : undefined;

  const group = (t: { name: string; hint: string; items: Source[] }, sort = false) => (
    <section key={t.name} className="ks-group">
      <p className="label">{t.name}</p>
      <p className="m ks-hint">{t.hint}</p>
      {(sort ? [...t.items].sort((a, b) => (a.year ?? 0) - (b.year ?? 0)) : t.items).map(card)}
    </section>
  );

  const haveCount = ALL.filter((s) => matches(s, bibles).have.length).length;
  const laterCount = LATER.filter((s) => matches(s, bibles).have.length).length;

  return (
    <>
      <header className="topbar">
        <NavButtons />
        <h1 className="bartitle">KJV History</h1>
      </header>
      <div className={`results ks ${wide ? "wide" : ""}`} ref={list}>
        <div className="seg fit" role="tablist" aria-label="View">
          {(
            [
              ["before", "Before the KJV"],
              ["after", "After the KJV"],
            ] as [View, string][]
          ).map(([v, label]) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => {
                setView(v);
                setOpen(null);
                setSel(null);
                setInfo(null);
                list.current?.scrollTo(0, 0);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <h2 className="ks-title">
          {view === "before" ? "Where the King James Version came from" : "The English Bibles since the King James"}
        </h2>
        <p className="m ks-intro">
          {view === "before"
            ? `The translators worked from printed editions, each resting on manuscript traditions. ${haveCount} of ${ALL.length} are in your library.`
            : `By family, oldest first; each was revised from the one it came from. ${laterCount} of ${LATER.length} are in your library.`}{" "}
          {wide
            ? "Tap a card for its line of descent, ⓘ for what it is, a label to read it, or “vs” to compare."
            : "Tap a card for what it is and where it came from, a label to read it, or “vs” to compare."}
        </p>
        <div className="ks-legend">
          <span className="ks-chip ks-chip-have">In library</span>
          {view === "before" && (
            <>
              <span className="ks-chip ks-chip-near">Closest</span>
              <span className="ks-chip ks-chip-rel">Related</span>
            </>
          )}
          <span className="ks-chip">Not in library</span>
          {view === "before" ? (
            <span className="ks-key">
              <span className="ks-apo">A</span> Has the Apocrypha
            </span>
          ) : (
            (["TR", "MT", "CT"] as const).map((k) => (
              <span key={k} className="ks-key">
                <span className="ks-nt">{k}</span> {{ TR: "Textus Receptus", MT: "Majority Text", CT: "Critical text" }[k]}
              </span>
            ))
          )}
        </div>
        {wide ? (
          tree
        ) : view === "before" ? (
          <>
            {TIERS.map((t) => group(t))}
            <section className="ks-group">
              <p className="label">The King James Version</p>
              {card(KJV)}
            </section>
          </>
        ) : (
          <>
            <section className="ks-group">
              <p className="label">The King James Version</p>
              {card(KJV)}
            </section>
            {FAMILIES.map((f) => group(f, true))}
          </>
        )}
      </div>
      {wide && shown && (
        <>
          <div className="scrim" onClick={() => setInfo(null)} />
          <section className="sheet ks-sheet" aria-label={`About ${shown.name}`}>
            <div className="grab" onClick={() => setInfo(null)}>
              <span />
            </div>
            <div className="shead">
              <h2 style={{ flex: 1 }}>{shown.name}</h2>
              <button className="done" onClick={() => setInfo(null)}>
                Done
              </button>
            </div>
            <div className="sbody">
              {date(shown)}
              {about(shown)}
            </div>
          </section>
        </>
      )}
    </>
  );
}
