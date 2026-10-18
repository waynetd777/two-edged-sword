// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// A Bible's own notes (the ESV+'s cross-references and footnotes): the chapter's notes, and the
// popover a marker in the text opens.

import { useEffect, useState } from "react";
import { api } from "./api";
import { book as bookOf, fmtRef, Ref } from "./bible";
import { renderHtml } from "./esword";
import { useApp } from "./state";
import { useRefPreview } from "./StudyPane";
import { Popover } from "./ui";

/** The chapter's notes by verse, then by marker id; empty for a Bible without notes. */
export function useBibleNotes(bible: string, has: boolean, book: number, chapter: number) {
  const [notes, setNotes] = useState<Map<number, Map<string, string>>>(new Map());
  useEffect(() => {
    setNotes(new Map());
    if (!has) return;
    let live = true;
    api
      .bibleNotes(bible, book, chapter)
      .then((ns) => {
        if (!live) return;
        const m = new Map<number, Map<string, string>>();
        for (const n of ns) {
          if (!m.has(n.v)) m.set(n.v, new Map());
          m.get(n.v)!.set(n.id, n.html);
        }
        setNotes(m);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [bible, has, book, chapter]);
  return notes;
}

/** How a marker shows in the text: cross-references as letters (a, b, …), footnotes as numbers, each counted through the verse. */
export function noteLabels(ids: string[]): Map<string, string> {
  const out = new Map<string, string>();
  let r = 0,
    n = 0;
  for (const id of ids) {
    if (/^R/i.test(id)) {
      let k = r++,
        s = "";
      do {
        s = String.fromCharCode(97 + (k % 26)) + s;
        k = Math.floor(k / 26) - 1;
      } while (k >= 0);
      out.set(id, s);
    } else out.set(id, String(++n));
  }
  return out;
}

const VERSES = String.raw`\d+(?:[-–]\d+)?(?:,\s*\d+(?:[-–]\d+)?)*`;
const CH = new RegExp(String.raw`(\bch\.\s+)(\d+(?::${VERSES})?(?:;\s*\d+(?::${VERSES})?)*)`, "g");
const CH_ITEM = new RegExp(String.raw`(\d+)(?::(${VERSES}))?`, "g");
const VER = new RegExp(String.raw`(\bver\.\s+)(${VERSES})`, "g");

/** The note's own references to this book ("ch. 7:50; 19:39", "ver. 6, 10") as links, each showing the
 *  note's text and carrying the whole reference (<ref v="Joh 19:39">19:39</ref>); its leading tags ("[alternative]") dropped. */
export function linkNoteRefs(html: string, b: number, chapter: number): string {
  const abbr = bookOf(b).abbr;
  const ref = (c: string | number, v: string | undefined, shown: string) =>
    `<ref v="${abbr} ${c}${v ? ":" + v.replace("–", "-") : ""}">${shown}</ref>`;
  const verses = (c: string | number, list: string, lead = "") => {
    let first = true;
    return list.replace(/\d+(?:[-–]\d+)?/g, (v) => {
      const shown = first ? lead + v : v;
      first = false;
      return ref(c, v, shown);
    });
  };
  return html
    .replace(/^(<p>)?(\s*\[[a-z-]+\])+\s*/i, "$1")
    .replace(
      CH,
      (_, cue: string, list: string) =>
        cue + list.replace(CH_ITEM, (_m, c: string, vs?: string) => (vs ? verses(c, vs, `${c}:`) : ref(c, undefined, c))),
    )
    .replace(VER, (_, cue: string, list: string) => cue + verses(chapter, list));
}

/** "[alternative]" → "Alternative"; a cross-reference has none. */
const kindOf = (id: string, html: string) =>
  /^R/i.test(id) ? "Cross-references" : (html.match(/^(?:<p>)?\s*\[([a-z-]+)\]/i)?.[1].replace(/^./, (c) => c.toUpperCase()) ?? "Footnote");

export function BibleNotePopover({
  book,
  chapter,
  verse,
  id,
  html,
  anchor,
  onClose,
}: {
  book: number;
  chapter: number;
  verse: number;
  id: string;
  html: string;
  anchor: DOMRect;
  onClose: () => void;
}) {
  const app = useApp();
  const { onRefHover, preview, hide } = useRefPreview(app.settings.bible);
  // Scrolling the reader moves the verse away from it: close (not for a scroll inside the popover).
  useEffect(() => {
    const onScroll = (e: Event) => {
      if (e.target instanceof Element && e.target.closest(".popover")) return;
      hide();
      onClose();
    };
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [hide, onClose]);
  const open = (r: Ref) => {
    hide();
    onClose();
    app.open({ book: r.book, chapter: r.chapter, verse: r.verse, to: r.to }, "read");
  };
  return (
    <>
      <Popover anchor={anchor} onClose={onClose} width={360}>
        <div style={{ padding: "10px 14px 12px" }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
            <strong style={{ font: "600 13px var(--ui)" }}>{fmtRef({ book, chapter, verse })}</strong>
            <span style={{ font: "500 12px var(--ui)", color: "var(--muted)" }}>{kindOf(id, html)}</span>
          </div>
          <div className="bnote">{renderHtml(linkNoteRefs(html, book, chapter), { onRef: open, onRefHover })}</div>
        </div>
      </Popover>
      {preview}
    </>
  );
}
