// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { useState } from "react";
import { book, BOOKS, BookSizes, parseRef, Ref } from "../../src/bible";
import { Icon } from "./icons";

/** Book, then chapter, then verse; or type a reference ("rom 8 28"). */
export function GoTo({
  at,
  sizes,
  verseCount,
  onGo,
  onClose,
}: {
  at: { book: number; chapter: number };
  sizes: BookSizes | null;
  /** Verses in a chapter, for the verse step (asked of the Bible). */
  verseCount: (book: number, chapter: number) => number;
  onGo: (r: Ref) => void;
  onClose: () => void;
}) {
  const [b, setB] = useState<number | null>(null);
  const [c, setC] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const parsed = typed.trim() ? parseRef(typed) : undefined;
  const books = BOOKS.filter((x) => !sizes || sizes.has(x.n));
  const chapters = b ? (sizes?.get(b) ?? book(b).chapters) : 0;
  const verses = b && c ? verseCount(b, c) : 0;

  const grid = (n: number, on: (i: number) => void, current?: number) => (
    <div className="grid">
      {Array.from({ length: n }, (_, i) => i + 1).map((i) => (
        <button key={i} className={i === current ? "on" : undefined} onClick={() => on(i)}>
          {i}
        </button>
      ))}
    </div>
  );

  const title = c && b ? `${book(b).name} ${c}` : b ? book(b).name : "Go to";
  const back = () => (c ? setC(null) : setB(null));

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <section className="sheet tall" aria-label="Go to a passage">
        <div className="grab" onClick={onClose}>
          <span />
        </div>
        <div className="shead">
          {b ? (
            <button className="done" onClick={back} aria-label="Back">
              ‹
            </button>
          ) : null}
          <h2 style={{ flex: 1 }}>{title}</h2>
          <button className="done" onClick={onClose}>
            Done
          </button>
        </div>
        {!b && (
          <label className="filter">
            <Icon name="search" size={15} />
            <input
              placeholder="Type a reference, like rom 8 28"
              aria-label="Type a reference"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && parsed && onGo(parsed)}
              autoCorrect="off"
              autoCapitalize="off"
            />
          </label>
        )}
        <div className="sbody" style={{ userSelect: "none", WebkitUserSelect: "none" }}>
          {parsed && !b ? (
            <div className="list">
              <button className="row" onClick={() => onGo(parsed)}>
                <span className="grow">
                  {book(parsed.book).name} {parsed.chapter}
                  {parsed.verse ? `:${parsed.verse}` : ""}
                </span>
                <span className="m">Go ›</span>
              </button>
            </div>
          ) : !b ? (
            [
              ["Old Testament", books.filter((x) => x.n <= 39)],
              ["New Testament", books.filter((x) => x.n >= 40 && x.n <= 66)],
            ].map(([label, list]) =>
              (list as typeof books).length ? (
                <div key={label as string} style={{ marginBottom: 16 }}>
                  <p className="label">{label as string}</p>
                  <div className="grid books">
                    {(list as typeof books).map((x) => (
                      <button key={x.n} className={x.n === at.book ? "on" : undefined} onClick={() => setB(x.n)}>
                        {x.abbr}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null,
            )
          ) : !c ? (
            <>
              <p className="label">Chapter</p>
              {grid(chapters, (i) => (chapters === 1 ? onGo({ book: b, chapter: 1 }) : setC(i)), b === at.book ? at.chapter : undefined)}
            </>
          ) : (
            <>
              <p className="label">Verse</p>
              {verses ? grid(verses, (i) => onGo({ book: b, chapter: c, verse: i })) : null}
              <button className="fold" onClick={() => onGo({ book: b, chapter: c })}>
                Whole chapter ›
              </button>
            </>
          )}
        </div>
      </section>
    </>
  );
}
