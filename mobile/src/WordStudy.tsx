// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { useEffect, useMemo, useRef, useState } from "react";
import { book, fmtRef, Ref, SHORT } from "../../src/bible";
import { headwords, plainText, renderHtml, tokenize } from "../../src/esword";
import { Lex, lexEntry, loadLex } from "../../src/lexicon";
import { api, Module, TopicHit, TranslitHit, VerseHit, WordNumber } from "./api";
import { Icon } from "./icons";
import { NavButtons } from "./NavButtons";
import type { Jump } from "./Search";
import { Entry } from "./Search";
import { say } from "./WordSheet";

type Named = WordNumber & { word?: string; translit?: string };
interface Other {
  id: string;
  title: string;
  html: string;
}

/** A Strong's number's study: its entry, how the KJV renders it, where it's used, and what the library has
 *  on it, as the desktop's Word Study; or, for an English word, the Greek and Hebrew words it translates. */
export function WordStudy({
  modules,
  target,
  onTarget,
  onJump,
}: {
  modules: Module[];
  /** A Strong's number ("G26"), or an English word or transliteration to look up. */
  target: string;
  onTarget: (t: string) => void;
  onJump: (j: Jump) => void;
}) {
  const isNum = /^[GH]\d+$/i.test(target);
  const lexicon = modules.find((m) => m.kind === "lexicon" && m.id === "strong")?.id ?? modules.find((m) => m.kind === "lexicon")?.id;
  const concordance = modules.find((m) => m.kind === "lexicon" && (m.id === "kjc" || /concordance/i.test(m.title)))?.id;
  const sb = modules.find((m) => m.kind === "bible" && m.strongs && m.id.startsWith("kjv"))?.id ?? modules.find((m) => m.kind === "bible" && m.strongs)?.id;
  const [num, setNum] = useState(isNum ? target.toUpperCase() : "G26");
  const [q, setQ] = useState(target);
  const [lookup, setLookup] = useState<{ q: string; words: Named[]; translit: TranslitHit[] } | null>(null);
  const [finding, setFinding] = useState(false);
  const [e, setE] = useState<Lex | null | undefined>(undefined);
  const [dist, setDist] = useState<[number, number][]>([]);
  const [onlyBook, setOnlyBook] = useState<number | null>(null);
  const [verses, setVerses] = useState<VerseHit[] | null>(null);
  const [others, setOthers] = useState<Other[]>([]);
  const [topics, setTopics] = useState<TopicHit[]>([]);
  const [entry, setEntry] = useState<{ module: string; topic: string } | null>(null);
  const [allBooks, setAllBooks] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  // A number shows its study; a word is looked up.
  useEffect(() => {
    setQ(target);
    if (isNum) {
      setNum(target.toUpperCase());
      setLookup(null);
      setOnlyBook(null);
      setAllBooks(false);
      scroller.current?.scrollTo(0, 0);
    } else if (target.trim()) lookUp(target);
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps

  const seq = useRef(0);
  const lookUp = async (t: string) => {
    const n = ++seq.current;
    setFinding(true);
    try {
      const [words, translit] = await Promise.all([
        sb ? api.strongsForWord(sb, t).catch(() => []) : [],
        lexicon ? api.translitSearch(lexicon, t).catch(() => []) : [],
      ]);
      const named = await Promise.all(
        words
          .sort((a, b) => b.count - a.count)
          .slice(0, 24)
          .map(async (w) => {
            const p = lexicon ? await lexEntry(lexicon, w.num) : null;
            return { ...w, word: p?.word, translit: p?.translit };
          }),
      );
      if (n !== seq.current) return;
      setLookup({ q: t, words: named, translit: translit.filter((x) => !named.some((w) => w.num === x.num)) });
    } finally {
      if (n === seq.current) setFinding(false);
    }
  };

  useEffect(() => {
    let live = true;
    setE(undefined);
    setDist([]);
    loadLex(lexicon, concordance, num).then((l) => live && setE(l));
    if (sb)
      api
        .strongsByBook(sb, num)
        .then((d) => live && setDist(d))
        .catch(() => {});
    // The number's entries in the other lexicons (Abbott-Smith, …).
    const ms = modules.filter((m) => m.kind === "lexicon" && m.id !== lexicon && m.id !== concordance);
    Promise.all(
      ms.map((m) =>
        api
          .article("lexicon", m.id, num)
          .then((a) => (a && plainText(a.html).trim() ? { id: m.id, title: m.title, html: a.html } : null))
          .catch(() => null),
      ),
    ).then((r) => live && setOthers(r.filter((x): x is Other => !!x)));
    return () => {
      live = false;
    };
  }, [num, lexicon, concordance, sb, modules.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sb) return;
    let live = true;
    setVerses(null);
    api
      .strongsVerses(sb, num, onlyBook, 300)
      .then((v) => live && setVerses(v))
      .catch(() => live && setVerses([]));
    return () => {
      live = false;
    };
  }, [num, onlyBook, sb]);

  // Dictionary articles for the English words the KJV uses for it.
  const renderings = e?.renderings ?? [];
  useEffect(() => {
    let live = true;
    (async () => {
      const words = Array.from(new Set(renderings.slice(0, 3).flatMap(([w]) => headwords(w.split(/[\s(]/)[0]).slice(-1))));
      const found: TopicHit[] = [];
      for (const w of words)
        for (const t of await api.findTopics(w).catch(() => []))
          if (!found.some((f) => f.module === t.module && f.topic === t.topic)) found.push(t);
      if (live) setTopics(found.slice(0, 8));
    })();
    return () => {
      live = false;
    };
  }, [renderings.map((r) => r[0]).join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const verseTotal = dist.reduce((n, d) => n + d[1], 0);
  const kjvTotal = renderings.reduce((n, r) => n + r[1], 0) || e?.total;
  const topBooks = useMemo(() => [...dist].sort((a, b) => b[1] - a[1]), [dist]);
  const max = Math.max(1, ...dist.map((d) => d[1]));
  const showing = isNum ? null : lookup;

  return (
    <>
      <header className="topbar">
        <NavButtons />
        <label className="filter search" style={{ flex: 1, margin: 0 }}>
          <Icon name="search" size={16} />
          <input
            type="search"
            enterKeyHint="search"
            aria-label="A Strong's number, or an English or Greek word"
            placeholder="G26, love, or agape"
            value={q}
            onChange={(ev) => setQ(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key !== "Enter" || !q.trim()) return;
              (ev.target as HTMLInputElement).blur();
              onTarget(/^[GH]\d+$/i.test(q.trim()) ? q.trim().toUpperCase() : q.trim());
            }}
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
        </label>
      </header>

      <div className="results" ref={scroller}>
        {showing ? (
          finding ? (
            <p className="empty">Looking up “{showing.q}”…</p>
          ) : (
            <>
              <p className="label">Words the KJV translates “{showing.q}”</p>
              {showing.words.length ? (
                <div className="list">
                  {showing.words.map((w) => (
                    <button key={w.num} className="row" onClick={() => onTarget(w.num)}>
                      <span className="orig small">{w.word}</span>
                      <span className="grow">
                        {w.translit} <span className="m">{w.forms.slice(0, 3).map(([f, n]) => `${f} ${n}`).join(" · ")}</span>
                      </span>
                      <span className="m">{w.num}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="empty">The KJV doesn't use “{showing.q}”.</p>
              )}
              {showing.translit.length > 0 && (
                <>
                  <p className="label" style={{ marginTop: 16 }}>
                    Spelt like “{showing.q}”
                  </p>
                  <div className="list">
                    {showing.translit.map((w) => (
                      <button key={w.num} className="row" onClick={() => onTarget(w.num)}>
                        <span className="orig small">{w.word}</span>
                        <span className="grow">{w.translit}</span>
                        <span className="m">{w.num}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )
        ) : e === undefined ? (
          <p className="empty">Opening {num}…</p>
        ) : !e ? (
          <p className="empty">{num} isn't in Strong's lexicon.</p>
        ) : (
          <div className="study">
            <div className="head">
              <span className="orig big" lang={num.startsWith("H") ? "he" : "el"}>
                {e.word}
              </span>
              <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <i className="translit">{e.translit}</i>
                <span className="m">{e.pron}</span>
              </span>
              <button className="say" aria-label={`Say ${e.word}`} onClick={() => say(e.word, num, e.pron)}>
                <Icon name="speaker" size={20} />
              </button>
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              <span className="tag">{num.startsWith("H") ? "Hebrew" : "Greek"}</span>
              <span className="tag">Strong's {num}</span>
            </div>

            <div className="card">
              <div className="prose">{renderHtml(e.rest, { inlineNums: true, onStrongs: (n) => onTarget(n), onRef: (r) => onJump({ ref: r }) })}</div>
              {(kjvTotal || verseTotal > 0) && (
                <div className="counts">
                  {kjvTotal ? (
                    <span>
                      <b>{kjvTotal}</b> times
                    </span>
                  ) : null}
                  {verseTotal > 0 && (
                    <span>
                      <b>{verseTotal}</b> verses
                    </span>
                  )}
                </div>
              )}
              {renderings.length > 0 && (
                <p className="m" style={{ margin: "6px 0 0" }}>
                  {renderings
                    .slice(0, 8)
                    .map(([w, n]) => `${w} ${n}`)
                    .join(" · ")}
                </p>
              )}
            </div>

            {others.map((o) => (
              <OtherLexicon key={o.id} l={o} onStrongs={onTarget} onRef={(r) => onJump({ ref: r })} />
            ))}

            {topBooks.length > 0 && (
              <div className="card">
                <p className="label">Most verses, by book</p>
                <div className="bars">
                  {(allBooks ? topBooks : topBooks.slice(0, 5)).map(([b, n]) => (
                    <button key={b} className={onlyBook === b ? "on" : undefined} onClick={() => setOnlyBook(onlyBook === b ? null : b)}>
                      <span className="bk">{SHORT[b - 1] ?? book(b).abbr}</span>
                      <span className="bar">
                        <span style={{ width: `${(n / max) * 100}%` }} />
                      </span>
                      <span className="n">{n}</span>
                    </button>
                  ))}
                </div>
                {topBooks.length > 5 && (
                  <button className="link" style={{ marginTop: 8, fontSize: 13 }} onClick={() => setAllBooks(!allBooks)}>
                    {allBooks ? "Fewer books" : `All ${topBooks.length} books`}
                  </button>
                )}
              </div>
            )}

            {topics.length > 0 && (
              <div className="card flush">
                <p className="label" style={{ padding: "12px 14px 4px", margin: 0 }}>
                  In your library
                </p>
                {topics.map((t) => (
                  <button key={`${t.module}/${t.topic}`} className="row" onClick={() => setEntry({ module: t.module, topic: t.topic })}>
                    <span className="grow">{t.topic}</span>
                    <span className="m">{t.title}</span>
                  </button>
                ))}
              </div>
            )}

            <p className="label" style={{ marginTop: 18 }}>
              {onlyBook ? `${book(onlyBook).name}: ` : ""}
              {verses === null ? "Verses…" : `${verses.length}${verses.length === 300 ? "+" : ""} ${verses.length === 1 ? "verse" : "verses"} with ${num}`}
              {onlyBook && (
                <button className="link" style={{ marginLeft: 8 }} onClick={() => setOnlyBook(null)}>
                  All books
                </button>
              )}
            </p>
            <div className="hits">
              {verses?.map((v) => (
                <button key={`${v.book}.${v.chapter}.${v.verse}`} className="hit" onClick={() => onJump({ ref: v })}>
                  <span className="ref">{fmtRef(v)}</span>
                  <span className="txt">
                    {tokenize(v.text)
                      .filter((t) => !t.note)
                      .map((t, i) => (t.strongs.includes(num) ? <mark key={i}>{t.text}</mark> : <span key={i}>{t.text}</span>))}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {entry && <Entry module={entry.module} topic={entry.topic} onJump={(j) => (setEntry(null), onJump(j))} onClose={() => setEntry(null)} />}
    </>
  );
}

function OtherLexicon({ l, onStrongs, onRef }: { l: Other; onStrongs: (n: string) => void; onRef: (r: Ref) => void }) {
  const [open, setOpen] = useState(false);
  const paras = useMemo(() => l.html.match(/<p>[\s\S]*?<\/p>/g) ?? [l.html], [l.html]);
  const long = paras.length > 3 || l.html.length > 900;
  return (
    <div className="card">
      <p className="label">{l.title}</p>
      <div className={`prose ${long && !open ? "fade" : ""}`}>
        {renderHtml(open || !long ? l.html : paras.slice(0, 3).join(""), { inlineNums: true, onStrongs, onRef })}
      </div>
      {long && (
        <button className="link" style={{ marginTop: 6, fontSize: 13 }} onClick={() => setOpen(!open)}>
          {open ? "Show less" : "Show all"}
        </button>
      )}
    </div>
  );
}
