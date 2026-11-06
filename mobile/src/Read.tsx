// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { Fragment, TouchEvent, useEffect, useMemo, useRef, useState } from "react";
import { book, BookSizes, fmtRef, Ref, stepChapter } from "../../src/bible";
import { tokenize, Token } from "../../src/esword";
import { api, Module, save, saved, scene, Verse } from "./api";
import { Icon } from "./icons";
import { GoTo } from "./GoTo";
import { WordSheet } from "./WordSheet";
import { Study } from "./Study";

type Layout = "paragraph" | "verse";
interface Loc {
  book: number;
  chapter: number;
}

/** A chapter we've read before draws at once from here, while the module is asked again. */
const cached = (bible: string, l: Loc) => saved<Verse[]>(`ch.${bible}.${l.book}.${l.chapter}`, []);
const keep = (bible: string, l: Loc, vs: Verse[]) => {
  // Only the last few chapters: enough to open where you left off.
  const k = `ch.${bible}.${l.book}.${l.chapter}`;
  const recent = saved<string[]>("ch.recent", []).filter((x) => x !== k);
  recent.unshift(k);
  for (const old of recent.splice(6)) localStorage.removeItem(`tes.${old}`);
  save("ch.recent", recent);
  save(k, vs);
};

function useChapter(bible: string, l: Loc): [Verse[], string] {
  const [verses, setVerses] = useState<{ vs: Verse[]; key: string }>(() => ({ vs: cached(bible, l), key: `${l.book}.${l.chapter}` }));
  useEffect(() => {
    let live = true;
    const key = `${l.book}.${l.chapter}`;
    setVerses({ vs: cached(bible, l), key });
    api
      .chapter(bible, l.book, l.chapter)
      .then((vs) => {
        if (!live) return;
        setVerses({ vs, key });
        keep(bible, l, vs);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [bible, l.book, l.chapter]);
  return [verses.vs, verses.key];
}

function Words({
  tokens,
  nums,
  active,
  onWord,
}: {
  tokens: Token[];
  nums: boolean;
  /** The token whose word sheet is open. */
  active?: number;
  onWord: (i: number, num?: string) => void;
}) {
  return (
    <>
      {tokens.map((t, i) => {
        if (t.note) return null;
        const tagged = t.word && t.strongs.length > 0;
        const cls = [t.red ? "red" : "", tagged ? "w" : "", i === active ? "on" : ""].join(" ").trim() || undefined;
        return (
          <Fragment key={i}>
            <span
              className={cls}
              onClick={
                tagged
                  ? (e) => {
                      e.stopPropagation();
                      onWord(i);
                    }
                  : undefined
              }
            >
              {t.italic ? <i>{t.text}</i> : t.text}
            </span>
            {/* As on the desktop: a Strong's number after the last word of its group. */}
            {nums &&
              t.showNums?.map((n) => (
                <span
                  key={n}
                  className="sn"
                  onClick={(e) => {
                    e.stopPropagation();
                    // The number belongs to the last word before it that carries it.
                    let w = i;
                    while (w > 0 && !tokens[w].strongs.includes(n)) w--;
                    onWord(w, n);
                  }}
                >
                  {n}
                </span>
              ))}
          </Fragment>
        );
      })}
    </>
  );
}

export function Read({ modules }: { modules: Module[] }) {
  const bibles = modules.filter((m) => m.kind === "bible");
  const [bible, setBible] = useState<string>(() => saved("bible", "kjv+"));
  const [loc, setLoc] = useState<Loc>(() => saved("loc", { book: 62, chapter: 1 }));
  const [layout, setLayout] = useState<Layout>(() => saved("layout", "paragraph"));
  const [sel, setSel] = useState<number>(() => saved("verse", 1));
  const [study, setStudy] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [sizes, setSizes] = useState<BookSizes | null>(null);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [going, setGoing] = useState(false);
  const [word, setWord] = useState<{ v: number; i: number; num?: string } | null>(null);
  const [wordScene, setWordScene] = useState(false);
  /** A verse to bring into view once its chapter has drawn. */
  const [scrollTo, setScrollTo] = useState<number | null>(null);
  /** Back and forward, as on the desktop: every move is a step, and a step back returns to how far down the page was. */
  const hist = useRef<{ stack: { loc: Loc; verse: number; top: number }[]; i: number }>({ stack: [{ loc, verse: sel, top: 0 }], i: 0 });
  const [, bump] = useState(0);
  const [restore, setRestore] = useState<{ key: string; top: number } | null>(null);
  const page = useRef<HTMLDivElement>(null);
  const [verses, versesOf] = useChapter(bible, loc);
  const tokens = useMemo(() => new Map(verses.map((v) => [v.v, tokenize(v.text)])), [verses]);
  const bmod = bibles.find((b) => b.id === bible);

  useEffect(() => {
    scene.then((sc) => {
      if (sc.includes("verse")) setLayout("verse");
      if (sc.includes("study")) setStudy(true);
      if (sc.includes("goto")) setGoing(true);
      if (sc.includes("word")) setWordScene(true);
      if (sc.includes("end")) setTimeout(() => page.current?.scrollTo(0, page.current.scrollHeight), 400);
    });
  }, []);
  useEffect(() => save("bible", bible), [bible]);
  useEffect(() => save("loc", loc), [loc]);
  useEffect(() => save("layout", layout), [layout]);
  useEffect(() => save("verse", sel), [sel]);
  useEffect(() => {
    api
      .chapterSizes(bible)
      .then((rows) => {
        const m: BookSizes = new Map();
        const n = new Map<string, number>();
        for (const [b, c, v] of rows) {
          m.set(b, Math.max(m.get(b) ?? 0, c));
          n.set(`${b}.${c}`, v);
        }
        setSizes(m);
        setCounts(n);
      })
      .catch(() => setSizes(null));
  }, [bible]);

  /** Moves to `to`, as a new step in the history. */
  const visit = (to: Loc, verse: number) => {
    const h = hist.current;
    h.stack[h.i] = { loc, verse: sel, top: page.current?.scrollTop ?? 0 };
    h.stack = h.stack.slice(0, h.i + 1);
    h.stack.push({ loc: to, verse, top: 0 });
    if (h.stack.length > 100) h.stack.shift();
    h.i = h.stack.length - 1;
    setLoc(to);
    setSel(verse);
    bump((x) => x + 1);
  };
  const travel = (d: 1 | -1) => {
    const h = hist.current;
    const j = h.i + d;
    if (j < 0 || j >= h.stack.length) return;
    h.stack[h.i] = { loc, verse: sel, top: page.current?.scrollTop ?? 0 };
    h.i = j;
    const e = h.stack[j];
    setWord(null);
    setLoc(e.loc);
    setSel(e.verse);
    setRestore({ key: `${e.loc.book}.${e.loc.chapter}`, top: e.top });
    bump((x) => x + 1);
  };
  useEffect(() => {
    if (!restore || restore.key !== versesOf || !verses.length) return;
    requestAnimationFrame(() => page.current?.scrollTo(0, restore.top));
    setRestore(null);
  }, [restore, versesOf, verses]);

  const step = (d: 1 | -1): Loc | undefined => {
    const s = stepChapter(loc.book, loc.chapter, d, sizes);
    return s && { book: s[0], chapter: s[1] };
  };
  const next = step(1);
  const prev = step(-1);
  const [nextVerses] = useChapter(bible, next ?? loc);

  // ---- swiping between chapters ----
  const touch = useRef<{ x: number; y: number; dx: number; horiz: boolean | null } | null>(null);
  const [dx, setDx] = useState(0);
  const [anim, setAnim] = useState(false);
  const go = (to: Loc, d: 1 | -1 = 1) => {
    const w = page.current?.clientWidth ?? 390;
    setAnim(true);
    setDx(-d * w);
    setTimeout(() => {
      visit(to, 1);
      setAnim(false);
      setDx(d * w);
      page.current?.scrollTo(0, 0);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          setAnim(true);
          setDx(0);
        }),
      );
    }, 200);
  };
  const onStart = (e: TouchEvent) => {
    const t = e.touches[0];
    // Away from the edges: Android's back gesture lives there.
    if (t.clientX < 24 || t.clientX > window.innerWidth - 24) return;
    touch.current = { x: t.clientX, y: t.clientY, dx: 0, horiz: null };
    setAnim(false);
  };
  const onMove = (e: TouchEvent) => {
    const s = touch.current;
    if (!s) return;
    const t = e.touches[0];
    const x = t.clientX - s.x;
    const y = t.clientY - s.y;
    if (s.horiz === null && Math.hypot(x, y) > 10) s.horiz = Math.abs(x) > Math.abs(y) * 1.4;
    if (!s.horiz) return;
    // Resist past the first or last chapter.
    s.dx = (x < 0 && !next) || (x > 0 && !prev) ? x / 4 : x;
    setDx(s.dx);
  };
  const onEnd = () => {
    const s = touch.current;
    touch.current = null;
    if (!s?.horiz) return;
    if (s.dx < -70 && next) go(next, 1);
    else if (s.dx > 70 && prev) go(prev, -1);
    else {
      setAnim(true);
      setDx(0);
    }
  };

  const pick = (v: number) => setSel(v);
  useEffect(() => {
    // The word scene: the selected verse's first tagged word with a meaning worth showing.
    const ts = tokens.get(sel);
    if (!wordScene || !ts) return;
    const i = ts.findIndex((t) => t.word && t.strongs.length && t.text.length > 4);
    if (i >= 0) setWord({ v: sel, i });
    setWordScene(false);
  }, [wordScene, tokens, sel]);
  useEffect(() => {
    if (scrollTo === null || !verses.length || versesOf !== `${loc.book}.${loc.chapter}`) return;
    const el = page.current?.querySelector(`[data-v="${scrollTo}"]`);
    if (el) el.scrollIntoView({ block: scrollTo === 1 ? "end" : "start" });
    if (scrollTo === 1) page.current?.scrollTo(0, 0);
    setScrollTo(null);
  }, [scrollTo, verses, versesOf]);
  const goTo = (r: Ref) => {
    setGoing(false);
    visit({ book: r.book, chapter: r.chapter }, r.verse ?? 1);
    setScrollTo(r.verse ?? 1);
  };
  const chooseBible = (id: string) => {
    setBible(id);
    setChoosing(false);
  };

  return (
    <>
      <header className="topbar">
        <button className="nav" aria-label="Back" disabled={hist.current.i <= 0} onClick={() => travel(-1)}>
          <Icon name="back" size={22} />
        </button>
        <button className="nav" aria-label="Forward" disabled={hist.current.i >= hist.current.stack.length - 1} onClick={() => travel(1)}>
          <Icon name="forward" size={22} />
        </button>
        <button className="pill strong" onClick={() => setGoing(true)}>
          {/* Long names shortened ("Song 8"), so the bar keeps to one line. */}
          {book(loc.book).name.length > 10 ? fmtRef(loc, "short") : `${book(loc.book).name} ${loc.chapter}`}
          <Icon name="down" size={14} />
        </button>
        <button className="pill" onClick={() => setChoosing(true)}>
          {bmod?.abbrev || bible.toUpperCase()}
          <Icon name="down" size={14} />
        </button>
        <span className="spacer" />
        <button
          className="ibtn"
          aria-label={layout === "paragraph" ? "Show a verse per line" : "Show as paragraphs"}
          onClick={() => setLayout(layout === "paragraph" ? "verse" : "paragraph")}
        >
          <Icon name={layout === "paragraph" ? "verses" : "paragraph"} size={22} />
        </button>
      </header>

      <div className="pager">
        <div
          ref={page}
          className={`page ${anim ? "anim" : ""}`}
          style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
          onTouchStart={onStart}
          onTouchMove={onMove}
          onTouchEnd={onEnd}
          onTouchCancel={onEnd}
        >
          <h1 className="title">
            {book(loc.book).name} {loc.chapter}
          </h1>
          <p className="sub">
            {bmod?.title ?? "Bible"}
            {verses.length ? ` · ${verses.length} verses` : ""}
          </p>
          {!verses.length ? (
            <p className="loading">Opening…</p>
          ) : layout === "verse" ? (
            <div className="text verses">
              {verses.map((v) => (
                <div key={v.v} data-v={v.v} className={`v ${v.v === sel ? "sel" : ""}`} onClick={() => pick(v.v)}>
                  <span className="vnum">{v.v}</span>
                  <Words
                    tokens={tokens.get(v.v) ?? []}
                    nums={!!bmod?.strongs}
                    active={word?.v === v.v ? word.i : undefined}
                    onWord={(i, num) => {
                      setSel(v.v);
                      setWord({ v: v.v, i, num });
                    }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text para">
              {verses.map((v) => (
                <span key={v.v} data-v={v.v} className={`pv ${v.v === sel ? "sel" : ""}`} onClick={() => pick(v.v)}>
                  <span className="vnum">{v.v}</span>
                  <Words
                    tokens={tokens.get(v.v) ?? []}
                    nums={!!bmod?.strongs}
                    active={word?.v === v.v ? word.i : undefined}
                    onWord={(i, num) => {
                      setSel(v.v);
                      setWord({ v: v.v, i, num });
                    }}
                  />{" "}
                </span>
              ))}
            </p>
          )}
          {next && verses.length > 0 && (
            <>
              <button className="next" onClick={() => go(next, 1)}>
                <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                  <span className="lab">Next chapter</span>
                  <span className="ref">{fmtRef(next)}</span>
                  {nextVerses[0] && <span className="peek">{tokenize(nextVerses[0].text).map((t) => t.text).join("")}</span>}
                </span>
                <span className="go" aria-hidden="true">
                  ›
                </span>
              </button>
              <p className="hint">Or swipe left.{prev ? ` Swipe right for ${fmtRef(prev)}.` : ""}</p>
            </>
          )}
        </div>
      </div>

      <button className="studybar" onClick={() => setStudy(true)}>
        <span style={{ color: "var(--accent)", display: "flex" }}>
          <Icon name="book" size={20} />
        </span>
        <span style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <span className="t">Study {fmtRef({ ...loc, verse: sel })}</span>
          <span className="s">Commentary and cross-references</span>
        </span>
        <span style={{ color: "var(--muted)", display: "flex" }}>
          <Icon name="up" size={16} />
        </span>
      </button>

      {study && (
        <Study
          at={{ ...loc, verse: sel }}
          count={verses.length}
          onVerse={setSel}
          onClose={() => setStudy(false)}
          onGo={(r: Ref) => {
            setStudy(false);
            goTo(r);
          }}
        />
      )}

      {word && (
        <WordSheet
          at={{ ...loc, verse: word.v }}
          tokens={tokens.get(word.v) ?? []}
          index={word.i}
          num={word.num}
          onIndex={(i) => setWord({ v: word.v, i })}
          onStudy={() => {
            setWord(null);
            setStudy(true);
          }}
          onClose={() => setWord(null)}
        />
      )}

      {going && (
        <GoTo
          at={loc}
          sizes={sizes}
          verseCount={(b, c) => counts.get(`${b}.${c}`) ?? 0}
          onGo={goTo}
          onClose={() => setGoing(false)}
        />
      )}

      {choosing && (
        <>
          <div className="scrim" onClick={() => setChoosing(false)} />
          <section className="sheet picker" aria-label="Choose a Bible">
            <div className="grab">
              <span />
            </div>
            <div className="shead">
              <h2 style={{ flex: 1 }}>Bibles</h2>
              <button className="done" onClick={() => setChoosing(false)}>
                Done
              </button>
            </div>
            <div className="sbody">
              <div className="list">
                {bibles.map((b) => (
                  <button key={b.id} className={`row ${b.id === bible ? "on" : ""}`} onClick={() => chooseBible(b.id)}>
                    <span className="grow">{b.title}</span>
                    <span className="m">{b.abbrev}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </>
  );
}
