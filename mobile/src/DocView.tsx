// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { useEffect, useRef, useState } from "react";
import { Ref } from "../../src/bible";
import { docSegments, plainText, renderHtml, wordRangeAt } from "../../src/esword";
import { api, Article } from "./api";
import { useBookmarks } from "./bookmarks";
import { Icon } from "./icons";

/** Which books are devotionals (their "chapters" are days), told by Read from the module list. */
const devotionals = new Set<string>();
export const setDevotionals = (ids: string[]) => {
  devotionals.clear();
  ids.forEach((i) => devotionals.add(i));
};
export const isDevotional = (module: string) => devotionals.has(module);

/** Today as a devotional's day title: "November 6". */
export const todayTitle = () => new Date().toLocaleDateString("en-GB", { month: "long", day: "numeric" }).split(" ").reverse().join(" ");

/** A book's chapters (a devotional's days), asked once per book. */
const titles = new Map<string, Promise<string[]>>();
export const bookTitles = (module: string) => {
  let p = titles.get(module);
  if (!p) {
    p = (isDevotional(module) ? api.devotionTitles(module) : api.referenceTitles(module)).catch(() => {
      titles.delete(module);
      return [] as string[];
    });
    titles.set(module, p);
  }
  return p;
};

/** A book's chapter (a devotional's day) as HTML; null when it has none. */
export const docHtml = (module: string, chapter: string): Promise<string | null> =>
  isDevotional(module) ? api.devotion(module, chapter) : api.article("reference", module, chapter).then((a) => a?.html ?? null);

/** A chapter's paragraphs as they're shown and read: the first left out when it's only the chapter's own
 *  title ("1. The Prophetic Word"), which the page shows above it and Listen announces. */
export function docParas(html: string, chapter: string): string[] {
  const segs = docSegments(html);
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return segs.length > 1 && norm(plainText(segs[0])) === norm(chapter) ? segs.slice(1) : segs;
}

/** A chapter of a book (Josephus, Larkin…) in the reading page, its pictures opening full screen. */
export function DocView({
  module,
  title,
  chapter,
  onRef,
  onImage,
  onChapter,
  reading,
  readingAt,
}: {
  /** The paragraph being read aloud (from 1), to mark. */
  reading?: number;
  /** ...and the word in it: its character in the paragraph's plain text. */
  readingAt?: number;
  module: string;
  title: string;
  chapter: string;
  onRef: (r: Ref) => void;
  onImage: (src: string) => void;
  onChapter: (c: string) => void;
}) {
  const [a, setA] = useState<Article | null | undefined>(undefined);
  const [list, setList] = useState<string[]>([]);
  const b = useBookmarks();
  const mark = { doc: { module, chapter, title } };
  const marked = b.has(mark);
  useEffect(() => {
    let live = true;
    setA(undefined);
    (isDevotional(module)
      ? api.devotion(module, chapter).then((html) => (html ? { module, title, topic: chapter, html } : null))
      : api.article("reference", module, chapter)
    )
      .then((x) => live && setA(x))
      .catch(() => live && setA(null));
    bookTitles(module).then((t) => live && setList(t));
    return () => {
      live = false;
    };
  }, [module, chapter]);
  const at = list.indexOf(chapter);
  // The word being read: found on the page (wordRangeAt, as the desktop finds it), and marked by a copy of
  // it laid over it, drawn as the Bible's marked word is (.said), so the two look the same.
  const body = useRef<HTMLDivElement>(null);
  const [said, setSaid] = useState<{ left: number; top: number; width: number; height: number; text: string; font: string } | null>(null);
  useEffect(() => {
    const box = body.current;
    const el = reading ? box?.querySelector(`[data-para="${reading}"]`) : null;
    const r = el && readingAt !== undefined && readingAt >= 0 ? wordRangeAt(el, readingAt) : null;
    const rect = r?.getClientRects()[0];
    if (!box || !r || !rect) return setSaid(null);
    const outer = box.getBoundingClientRect();
    const cs = getComputedStyle(r.startContainer.parentElement ?? box);
    setSaid({ left: rect.left - outer.left, top: rect.top - outer.top, width: rect.width, height: rect.height, text: r.toString(), font: cs.font });
  }, [reading, readingAt, a]);
  const next = at >= 0 ? list[at + 1] : undefined;

  return (
    <>
      <p className="sub" style={{ margin: "0 0 4px" }}>
        {title}
      </p>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 16 }}>
        <h1 className="title" style={{ flex: 1 }}>
          {chapter}
        </h1>
        <button className={`bmk ${marked ? "on" : ""}`} aria-label={marked ? "Remove the bookmark" : "Bookmark this chapter"} aria-pressed={marked} onClick={() => b.toggle(mark)}>
          <Icon name="bookmark" size={22} fill={marked ? "currentColor" : undefined} />
        </button>
      </div>
      {a === undefined ? (
        <p className="loading">Opening…</p>
      ) : !a ? (
        <p className="loading">This chapter couldn't be read.</p>
      ) : (
        // In paragraphs, as Listen reads it, so the one being read can be marked and followed.
        <div className="prose doc" ref={body}>
          {said && (
            <span className="said saidbox" aria-hidden="true" style={{ left: said.left, top: said.top, minWidth: said.width, height: said.height, font: said.font }}>
              {said.text}
            </span>
          )}
          {docParas(a.html, chapter).map((seg, i) => (
            <div key={i} data-para={i + 1} className={reading === i + 1 ? "speaking" : undefined}>
              {renderHtml(seg, { onRef, onImage })}
            </div>
          ))}
        </div>
      )}
      {next && a && (
        <button className="next" onClick={() => onChapter(next)}>
          <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="lab">Next chapter</span>
            <span className="ref">{next}</span>
          </span>
          <span className="go" aria-hidden="true">
            ›
          </span>
        </button>
      )}
    </>
  );
}
