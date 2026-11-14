// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// KJV History on the phone: the desktop's family tree (src/KjvHistory.tsx) as a list, with the same
// content (src/kjvSources.ts). In place of the tree's lines and hover, a card opens to say what it is,
// what it came from and what came from it, each a tap away.

import { useEffect, useRef, useState } from "react";
import { BookSizes } from "../../src/bible";
import {
  ALL,
  apocryphaIn,
  comparable,
  EDGES,
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
    setOpen(id);
    setTimeout(() => document.getElementById(`ks-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const card = (s: Source) => {
    const { have, near } = matches(s, bibles);
    const status = have.length ? "have" : near.length ? "near" : "none";
    const isOpen = open === s.id;
    const cameFrom = edges.filter(([, b]) => b === s.id).map(([a]) => byId(a)!);
    const ledTo = edges.filter(([a]) => a === s.id).map(([, b]) => byId(b)!);
    const cmp = comparable(s, bibles);
    return (
      <div key={s.id} id={`ks-${s.id}`} className={`ks-card ks-${status} ${s.id === "kjv" ? "ks-main" : ""}`}>
        <button className="ks-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : s.id)}>
          <span className="grow">
            <b>{s.name}</b>
            <span className="m ks-date">
              {s.date}
              {s.nt && (
                <span className="ks-nt" aria-label={`New Testament: ${NT_TEXT[s.nt]}`}>
                  {s.nt}
                </span>
              )}
            </span>
          </span>
          <span className={`ks-more ${isOpen ? "on" : ""}`} aria-hidden="true">
            <Icon name="down" size={18} />
          </span>
        </button>
        {/* One Bible to a line, but a Bible and its + edition (KJV, KJV+) side by side. */}
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
        {isOpen && (
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
        )}
      </div>
    );
  };

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
      <div className="results ks" ref={list}>
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
          Tap a card for what it is and where it came from, a label to read it, or “vs” to compare.
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
        {view === "before" ? (
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
    </>
  );
}
