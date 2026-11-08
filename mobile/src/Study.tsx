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
import { Picker } from "./Picker";
import type { Module } from "./api";

/** Cross-references are commentary modules (the Treasury, OpenBible's), found as the desktop finds
 *  them (state.tsx xrefs); they have their own tab rather than being among the commentaries. */
// Not "treasury" alone: Spurgeon's Treasury of David is a commentary.
const isXref = (c: { id: string; title: string }) =>
  c.id === "tsk" || c.id === "openbible_xref" || /treasury of scripture|cross-ref/i.test(c.title);

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
  screen,
  actions,
  tray,
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
  /** Docked: what the buttons in the header open (the highlighter's colours), under them. */
  tray?: ReactNode;
  /** The Bible being read, for a bookmark. */
  bible: string;
  /** The verse's words, for the dictionary entries it has. */
  verseText: string;
  /** Beside the text (an iPad in landscape), as the desktop's study pane, rather than a sheet. */
  docked?: boolean;
  /** In place of the text (a phone): a screen of its own, shown and hidden by the Study button. */
  screen?: boolean;
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
  const [xrefs, setXrefs] = useState<Coverage[]>([]);
  const [xref, setXref] = useState<string>(() => saved("crossRefs", "tsk"));
  useEffect(() => save("crossRefs", xref), [xref]);
  const curX = xrefs.find((c) => c.id === xref) ?? xrefs[0];
  const commentary = useCommentary(tab === "xrefs" ? (curX?.id ?? "tsk") : module, at);

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
    // Only the verse still shown: an answer for one swiped past is dropped.
    let live = true;
    api
      .coverage(at.book, at.chapter, at.verse)
      .then((c) => {
        if (!live) return;
        setCoverage(c.filter((x) => !isXref(x)));
        setXrefs(c.filter(isXref).sort((a, b) => Number(b.id === "tsk") - Number(a.id === "tsk")));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [at.book, at.chapter, at.verse, lib]);

  const current = coverage.find((c) => c.id === module);
  // A commentary that's gone (removed, or no longer bundled): the first with notes here instead.
  useEffect(() => {
    if (coverage.length && !current) setModule((coverage.find((c) => c.range) ?? coverage[0]).id);
  }, [coverage, current]);
  const withNotes = coverage.filter((c) => c.range).length;

  // Swipe the heading left or right for the next or previous verse.
  // Swipe anywhere in Study left or right for the next or previous verse: a mostly sideways move, not
  // one that starts on something that scrolls sideways itself (a row of chips) or on a map.
  const t0 = useRef<{ x: number; y: number } | null>(null);
  const start = (e: TouchEvent) => {
    const el = e.target as HTMLElement;
    t0.current = el.closest(".chips, .mapstab, input, textarea") ? null : { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const end = (e: TouchEvent) => {
    if (!t0.current) return;
    const dx = e.changedTouches[0].clientX - t0.current.x;
    const dy = e.changedTouches[0].clientY - t0.current.y;
    t0.current = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 2) return;
    if (dx < 0 && at.verse < count) onVerse(at.verse + 1);
    if (dx > 0 && at.verse > 1) onVerse(at.verse - 1);
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
          {tab === "xrefs" ? (curX?.title ?? "Cross-references") : (current?.title ?? module)} · {span(e, at.book)}
        </p>
        <div className="prose">{renderHtml(e.html, { onRef: go })}</div>
      </div>
    ));
  };

  return (
    <>
      {!docked && !screen && <div className="scrim" onClick={onClose} />}
      <section className={screen ? "dock screen" : docked ? "dock" : "sheet tall"} aria-label="Study" onTouchStart={start} onTouchEnd={end}>
        {!docked && !screen && (
          <div className="grab" onTouchStart={gStart} onTouchEnd={gEnd} onClick={onClose}>
            <span />
          </div>
        )}
        <div className="shead">
          <h2>{fmtRef(at)}</h2>
          {actions ? (
            // Docked: the highlighter, bookmark, note and Compare on the right (in the phone's order), without the hint.
            <span className="dockacts">{actions}</span>
          ) : (
            <>
              {/* On a phone the bookmark is in the row of buttons below. */}
              {!screen && <BookmarkButton at={at} bible={bible} />}
              <span className="m" style={{ flex: 1 }}>
                {docked ? "Tap a verse to study it" : "Swipe for the next verse"}
              </span>
            </>
          )}
          {!docked && !screen && (
            <button className="done" onClick={onClose}>
              Done
            </button>
          )}
        </div>
        {tray && <div className="docktray">{tray}</div>}
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
        {tab === "xrefs" && xrefs.length > 1 && (
          // A pill each, as the desktop has them; the one chosen is kept.
          <div className="chooser" role="radiogroup" aria-label="Cross-references from">
            {xrefs.map((c) => (
              <button
                key={c.id}
                role="radio"
                aria-checked={c.id === curX?.id}
                className={`pill ${c.id === curX?.id ? "on" : ""}`}
                onClick={() => setXref(c.id)}
              >
                {c.id === "tsk" ? "TSK" : /openbible/i.test(c.id + c.title) ? "OpenBible" : c.abbrev || c.title}
              </button>
            ))}
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
          heading="Commentaries"
          noun="commentaries"
          starsKey="stars"
          starred={["jfb"]}
          items={coverage.map((c) => ({
            id: c.id,
            title: c.title,
            abbrev: c.abbrev,
            has: !!c.range,
            note: c.range
              ? c.range[1] === c.range[3] && c.range[0] === c.range[2]
                ? `v. ${c.range[1]}`
                : `vv. ${c.range[1]}–${c.range[3]}`
              : undefined,
          }))}
          module={module}
          hasLabel={`Notes on ${fmtRef(at)}`}
          noneLabel="Nothing on this verse"
          emptyLabel="None of your commentaries has notes here."
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

/** Bookmarks the verse, or takes the bookmark off. */
function BookmarkButton({ at, bible }: { at: { book: number; chapter: number; verse: number }; bible: string }) {
  const b = useBookmarks();
  const mark = { ref: { book: at.book, chapter: at.chapter, verse: at.verse }, bible };
  const on = b.has(mark);
  return (
    <button
      className={`bmk ${on ? "on" : ""}`}
      aria-label={on ? `Remove the bookmark on ${fmtRef(at)}` : `Bookmark ${fmtRef(at)}`}
      aria-pressed={on}
      onClick={() => b.toggle(mark)}
    >
      <Icon name="bookmark" size={20} fill={on ? "currentColor" : undefined} />
    </button>
  );
}
