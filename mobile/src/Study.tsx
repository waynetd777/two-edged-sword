// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { ReactNode, TouchEvent, useEffect, useRef, useState } from "react";
import { fmtRef, Ref } from "../../src/bible";
import { renderHtml } from "../../src/esword";
import { api, Commentary, Coverage, save, saved, scene, useLibraryKey } from "./api";
import { Icon } from "./icons";
import { useBookmarks } from "./bookmarks";
import { MapsTab, Spot } from "./MapsTab";
import { DictionaryPanel } from "./Dictionary";
import type { Module } from "./api";

/** Cross-references come from the Treasury, which is a commentary module; it has its own tab. */
const XREFS = "tsk";

type Tab = "commentary" | "xrefs" | "dict" | "maps";

function useCommentary(module: string, at: Required<Pick<Ref, "book" | "chapter" | "verse">>) {
  const [c, setC] = useState<Commentary | null | undefined>(undefined);
  const lib = useLibraryKey();
  useEffect(() => {
    let live = true;
    setC(undefined);
    api
      .commentary(module, at.book, at.chapter, at.verse)
      .then((r) => live && setC(r))
      .catch(() => live && setC(null));
    return () => {
      live = false;
    };
  }, [module, at.book, at.chapter, at.verse, lib]);
  return c;
}

const span = (e: { chapterBegin: number; verseBegin: number; chapterEnd: number; verseEnd: number }, book: number) =>
  fmtRef({
    book,
    chapter: e.chapterBegin,
    verse: e.verseBegin,
    to: e.verseEnd || undefined,
    toChapter: e.chapterEnd !== e.chapterBegin ? e.chapterEnd : undefined,
  });

export function Study({
  at,
  count,
  onVerse,
  onClose,
  onGo,
  docked,
  actions,
  modules,
  onChanged,
  onImage,
  bible,
  verseText,
}: {
  modules: Module[];
  /** The library changed (the maps were downloaded). */
  onChanged: () => void;
  onImage: (src: string, ring: Spot[]) => void;
  /** More buttons for the verse beside the bookmark (docked: the highlighter and Compare). */
  actions?: ReactNode;
  /** The Bible being read, for a bookmark. */
  bible: string;
  /** The verse's words, for the dictionary entries it has. */
  verseText: string;
  /** Beside the text (an iPad in landscape), as the desktop's study pane, rather than a sheet. */
  docked?: boolean;
  at: { book: number; chapter: number; verse: number };
  count: number;
  onVerse: (v: number) => void;
  onClose: () => void;
  onGo: (r: Ref) => void;
}) {
  const [tab, setTab] = useState<Tab>("commentary");
  const [module, setModule] = useState<string>(() => saved("commentary", "jfb"));
  const [picking, setPicking] = useState(false);
  const [coverage, setCoverage] = useState<Coverage[]>([]);
  const commentary = useCommentary(tab === "xrefs" ? XREFS : module, at);

  useEffect(() => {
    scene.then((sc) => {
      if (sc.includes("xrefs")) setTab("xrefs");
      if (sc.includes("maps")) setTab("maps");
      if (sc.includes("dict")) setTab("dict");
      if (sc.includes("picker")) setPicking(true);
    });
  }, []);
  useEffect(() => save("commentary", module), [module]);
  // Asked again when modules are added or removed, so a new commentary is listed at once.
  const lib = useLibraryKey();
  useEffect(() => {
    api
      .coverage(at.book, at.chapter, at.verse)
      .then((c) => setCoverage(c.filter((x) => x.id !== XREFS)))
      .catch(() => {});
  }, [at.book, at.chapter, at.verse, lib]);

  const current = coverage.find((c) => c.id === module);
  // A commentary that's gone (removed, or no longer bundled): the first with notes here instead.
  useEffect(() => {
    if (coverage.length && !current) setModule((coverage.find((c) => c.range) ?? coverage[0]).id);
  }, [coverage, current]);
  const withNotes = coverage.filter((c) => c.range).length;

  // Swipe the heading left or right for the next or previous verse.
  const t0 = useRef<number | null>(null);
  const start = (e: TouchEvent) => (t0.current = e.touches[0].clientX);
  const end = (e: TouchEvent) => {
    if (t0.current === null) return;
    const dx = e.changedTouches[0].clientX - t0.current;
    t0.current = null;
    if (dx < -50 && at.verse < count) onVerse(at.verse + 1);
    if (dx > 50 && at.verse > 1) onVerse(at.verse - 1);
  };
  // Drag the handle down to close.
  const g0 = useRef<number | null>(null);
  const gStart = (e: TouchEvent) => (g0.current = e.touches[0].clientY);
  const gEnd = (e: TouchEvent) => {
    if (g0.current !== null && e.changedTouches[0].clientY - g0.current > 60) onClose();
    g0.current = null;
  };

  const go = (r: Ref) => onGo(r);
  const body = () => {
    if (commentary === undefined) return <p className="empty">Opening…</p>;
    if (commentary === null) return <p className="empty">This module couldn't be read.</p>;
    if (!commentary.verse.length)
      return (
        <p className="empty">
          {tab === "xrefs" ? "No cross-references for this verse." : `${current?.title ?? "This commentary"} has nothing on this verse.`}
        </p>
      );
    return commentary.verse.map((e, i) => (
      <div key={i} className="entry">
        <p className="label">
          {tab === "xrefs" ? "Treasury of Scripture Knowledge" : (current?.title ?? module)} · {span(e, at.book)}
        </p>
        <div className="prose">{renderHtml(e.html, { onRef: go })}</div>
      </div>
    ));
  };

  return (
    <>
      {!docked && <div className="scrim" onClick={onClose} />}
      <section className={docked ? "dock" : "sheet tall"} aria-label="Study">
        {!docked && (
          <div className="grab" onTouchStart={gStart} onTouchEnd={gEnd} onClick={onClose}>
            <span />
          </div>
        )}
        <div className="shead" onTouchStart={start} onTouchEnd={end}>
          <h2>{fmtRef(at)}</h2>
          {actions ? (
            // Docked: the bookmark, highlighter and Compare together on the right, without the hint.
            <span className="dockacts">
              <BookmarkButton at={at} bible={bible} />
              {actions}
            </span>
          ) : (
            <>
              <BookmarkButton at={at} bible={bible} />
              <span className="m" style={{ flex: 1 }}>
                {docked ? "Tap a verse to study it" : "Swipe for the next verse"}
              </span>
            </>
          )}
          {!docked && (
            <button className="done" onClick={onClose}>
              Done
            </button>
          )}
        </div>
        <div className="seg" role="tablist">
          <button role="tab" aria-selected={tab === "commentary"} onClick={() => setTab("commentary")}>
            Commentary
          </button>
          <button role="tab" aria-selected={tab === "xrefs"} onClick={() => setTab("xrefs")}>
            Cross-refs
          </button>
          <button role="tab" aria-selected={tab === "dict"} onClick={() => setTab("dict")}>
            Dictionary
          </button>
          <button role="tab" aria-selected={tab === "maps"} onClick={() => setTab("maps")}>
            Maps
          </button>
        </div>
        {tab === "commentary" && (
          <div className="chooser">
            <button className="pill" onClick={() => setPicking(true)}>
              {current?.abbrev || current?.title || module}
              <Icon name="down" size={14} />
            </button>
            <span className="m">{withNotes === 1 ? "1 with notes here" : `${withNotes} with notes here`}</span>
          </div>
        )}
        <div className="sbody">
          {tab === "maps" ? (
            <MapsTab at={at} modules={modules} onChanged={onChanged} onGo={go} onOpen={onImage} />
          ) : tab === "dict" ? (
            <DictionaryPanel modules={modules} text={verseText} onGo={go} />
          ) : (
            body()
          )}
        </div>
      </section>
      {picking && (
        <Picker
          at={at}
          coverage={coverage}
          module={module}
          onPick={(id) => {
            setModule(id);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  );
}

function Picker({
  at,
  coverage,
  module,
  onPick,
  onClose,
}: {
  at: Ref;
  coverage: Coverage[];
  module: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [stars, setStars] = useState<string[]>(() => saved("stars", ["jfb"]));
  const [filter, setFilter] = useState("");
  const [showAll, setShowAll] = useState(false);
  useEffect(() => save("stars", stars), [stars]);
  const f = filter.trim().toLowerCase();
  const match = (c: Coverage) => !f || c.title.toLowerCase().includes(f) || c.abbrev.toLowerCase().includes(f);
  const order = (a: Coverage, b: Coverage) => Number(stars.includes(b.id)) - Number(stars.includes(a.id)) || a.title.localeCompare(b.title);
  const has = coverage.filter((c) => c.range && match(c)).sort(order);
  const none = coverage.filter((c) => !c.range && match(c)).sort(order);
  const star = (id: string) => setStars((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const row = (c: Coverage) => (
    <div key={c.id} className={`row ${c.id === module ? "on" : ""}`}>
      <button
        className="star"
        aria-label={stars.includes(c.id) ? `Unstar ${c.title}` : `Star ${c.title}`}
        style={{ color: stars.includes(c.id) ? "#e3b341" : "var(--muted)" }}
        onClick={() => star(c.id)}
      >
        <Icon name="star" size={18} fill={stars.includes(c.id) ? "currentColor" : undefined} />
      </button>
      <button className="grow" style={{ border: "none", background: "none", textAlign: "left", minHeight: 48, padding: 0, fontSize: 16 }} onClick={() => onPick(c.id)}>
        {c.title}
      </button>
      {c.range && (
        <span className="m">{c.range[1] === c.range[3] && c.range[0] === c.range[2] ? `v. ${c.range[1]}` : `vv. ${c.range[1]}–${c.range[3]}`}</span>
      )}
      {c.id === module && (
        <span style={{ color: "var(--accent)", display: "flex" }}>
          <Icon name="check" size={18} />
        </span>
      )}
    </div>
  );

  return (
    <>
      <div className="scrim" style={{ zIndex: 12 }} onClick={onClose} />
      <section className="sheet picker" style={{ zIndex: 13 }} aria-label="Choose a commentary">
        <div className="grab">
          <span />
        </div>
        <div className="shead">
          <h2 style={{ flex: 1 }}>Commentaries</h2>
          <button className="done" onClick={onClose}>
            Done
          </button>
        </div>
        <label className="filter">
          <Icon name="search" size={15} />
          <input placeholder="Filter commentaries" aria-label="Filter commentaries" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </label>
        <div className="sbody">
          <p className="label">Notes on {fmtRef(at)}</p>
          {has.length ? <div className="list">{has.map(row)}</div> : <p className="empty">None of your commentaries has notes here.</p>}
          {none.length > 0 &&
            (showAll ? (
              <>
                <p className="label" style={{ marginTop: 16 }}>
                  Nothing on this verse
                </p>
                <div className="list">{none.map(row)}</div>
              </>
            ) : (
              <button className="fold" onClick={() => setShowAll(true)}>
                {none.length} with nothing on this verse ›
              </button>
            ))}
          <p className="m" style={{ fontSize: 12, color: "var(--muted)", marginTop: 12 }}>
            Starred ones come first.
          </p>
        </div>
      </section>
    </>
  );
}

/** Bookmarks the verse, or takes the bookmark off. */
function BookmarkButton({ at, bible }: { at: { book: number; chapter: number; verse: number }; bible: string }) {
  const b = useBookmarks();
  const mark = { ref: { book: at.book, chapter: at.chapter, verse: at.verse }, bible };
  const on = b.has(mark);
  return (
    <button className={`bmk ${on ? "on" : ""}`} aria-label={on ? `Remove the bookmark on ${fmtRef(at)}` : `Bookmark ${fmtRef(at)}`} aria-pressed={on} onClick={() => b.toggle(mark)}>
      <Icon name="bookmark" size={20} fill={on ? "currentColor" : undefined} />
    </button>
  );
}
