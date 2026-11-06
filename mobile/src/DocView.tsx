// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { useEffect, useState } from "react";
import { Ref } from "../../src/bible";
import { renderHtml } from "../../src/esword";
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

/** A chapter of a book (Josephus, Larkin…) in the reading page, its pictures opening full screen. */
export function DocView({
  module,
  title,
  chapter,
  onRef,
  onImage,
  onChapter,
}: {
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
        <div className="prose doc">{renderHtml(a.html, { onRef, onImage })}</div>
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
