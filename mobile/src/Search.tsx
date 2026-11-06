// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { Fragment, ReactNode, useEffect, useRef, useState } from "react";
import { book, fmtRef, parseRef, Ref, SECTIONS } from "../../src/bible";
import { renderHtml, tokenize } from "../../src/esword";
import { api, Article, Module, save, saved, scene, SearchMode, SearchResults } from "./api";
import { Icon } from "./icons";
import { NavButtons } from "./NavButtons";

const RANGES: { name: string; from: number; to: number }[] = [
  { name: "Whole Bible", from: 1, to: 78 },
  { name: "Old Testament", from: 1, to: 39 },
  { name: "New Testament", from: 40, to: 66 },
  ...SECTIONS.filter((s) => ["Gospels", "Letters", "Prophets", "Wisdom"].includes(s.name)),
];

const MODES: { id: SearchMode; name: string }[] = [
  { id: "all", name: "All the words" },
  { id: "phrase", name: "The exact phrase" },
  { id: "any", name: "Any of the words" },
];

type Scope = "bible" | "commentary" | "dictionary";

/** Where something found should open: a verse in Read, with a commentary's notes when it came from one. */
export interface Jump {
  ref: Ref;
  commentary?: string;
}

/** The last search, for the rest of the session: switching tabs and back keeps it. */
let last: { q: string; ran: string; res: SearchResults | null; scope: Scope; scroll: number } | null = null;

/** Finds any of the terms, ignoring case; whole words only when asked (search.rs's rule: an apostrophe is part of a word). */
function termsRe(terms: string[], whole: boolean): RegExp | null {
  const ts = terms.filter(Boolean).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!ts.length) return null;
  return new RegExp(whole ? `(?<![\\p{L}\\p{N}'])(${ts.join("|")})(?![\\p{L}\\p{N}'])` : `(${ts.join("|")})`, "giu");
}

function mark(text: string, terms: string[], whole: boolean): ReactNode {
  const re = termsRe(terms, whole);
  if (!re) return text;
  return text.split(re).map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : <Fragment key={i}>{p}</Fragment>));
}

const plain = (html: string) =>
  tokenize(html)
    .filter((t) => !t.note)
    .map((t) => t.text)
    .join("");

function Choose<T extends string>({
  title,
  options,
  value,
  onPick,
  onClose,
}: {
  title: string;
  options: { id: T; name: string; note?: string }[];
  value: T;
  onPick: (id: T) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <section className="sheet picker" aria-label={title}>
        <div className="grab" onClick={onClose}>
          <span />
        </div>
        <div className="shead">
          <h2 style={{ flex: 1 }}>{title}</h2>
          <button className="done" onClick={onClose}>
            Done
          </button>
        </div>
        <div className="sbody">
          <div className="list">
            {options.map((o) => (
              <button key={o.id} className={`row ${o.id === value ? "on" : ""}`} onClick={() => onPick(o.id)}>
                <span className="grow">{o.name}</span>
                {o.note && <span className="m">{o.note}</span>}
                {o.id === value && (
                  <span style={{ color: "var(--accent)", display: "flex" }}>
                    <Icon name="check" size={18} />
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

/** A dictionary entry found by a search, over the results. */
export function Entry({ module, topic, onJump, onClose }: { module: string; topic: string; onJump: (j: Jump) => void; onClose: () => void }) {
  const [a, setA] = useState<Article | null | undefined>(undefined);
  useEffect(() => {
    api
      .article("dictionary", module, topic)
      .then(setA)
      .catch(() => setA(null));
  }, [module, topic]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <section className="sheet tall" aria-label={topic}>
        <div className="grab" onClick={onClose}>
          <span />
        </div>
        <div className="shead">
          <h2 style={{ flex: 1 }}>{topic}</h2>
          <button className="done" onClick={onClose}>
            Done
          </button>
        </div>
        <div className="sbody">
          {a === undefined ? (
            <p className="empty">Opening…</p>
          ) : !a ? (
            <p className="empty">This entry couldn't be read.</p>
          ) : (
            <>
              <p className="label">{a.title}</p>
              <div className="prose">{renderHtml(a.html, { onRef: (r) => onJump({ ref: r }) })}</div>
            </>
          )}
        </div>
      </section>
    </>
  );
}

export function Search({ modules, active, onJump }: { modules: Module[]; active: boolean; onJump: (j: Jump) => void }) {
  const bibles = modules.filter((m) => m.kind === "bible");
  const [q, setQ] = useState(last?.q ?? "");
  const [ran, setRan] = useState(last?.ran ?? "");
  const [res, setRes] = useState<SearchResults | null>(last?.res ?? null);
  const [scope, setScope] = useState<Scope>(last?.scope ?? "bible");
  const [bible, setBible] = useState<string>(() => saved("searchBible", saved("bible", "kjv+")));
  const [range, setRange] = useState<string>(() => saved("searchRange", "Whole Bible"));
  const [mode, setMode] = useState<SearchMode>(() => saved("searchMode", "all"));
  const [whole, setWhole] = useState<boolean>(() => saved("searchWhole", true));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [choosing, setChoosing] = useState<"bible" | "range" | "mode" | null>(null);
  const [entry, setEntry] = useState<{ module: string; topic: string } | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const runId = useRef(0);

  useEffect(() => save("searchBible", bible), [bible]);
  useEffect(() => save("searchRange", range), [range]);
  useEffect(() => save("searchMode", mode), [mode]);
  useEffect(() => save("searchWhole", whole), [whole]);
  useEffect(() => {
    if (last?.scroll && list.current) list.current.scrollTop = last.scroll;
  }, []);
  // Ready to type when the tab opens, unless there are results to look at.
  useEffect(() => {
    if (active && !ran) input.current?.focus();
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    scene.then((sc) => {
      const t = sc.find((x) => x.startsWith("q="))?.slice(2);
      if (t) {
        setQ(t);
        setTimeout(() => run(t), 300);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    last = { q, ran, res, scope, scroll: list.current?.scrollTop ?? 0 };
  });

  const r = RANGES.find((x) => x.name === range) ?? RANGES[0];
  const strongsBible = bibles.find((b) => b.strongs && b.id.startsWith("kjv"))?.id ?? bibles.find((b) => b.strongs)?.id;
  const run = async (text = q) => {
    const t = text.trim();
    if (!t) return;
    input.current?.blur();
    const id = ++runId.current; // only the latest search shows
    setBusy(true);
    setErr(null);
    try {
      const out = await api.search({ text: t, mode, wholeWords: whole, bible, bookFrom: r.from, bookTo: r.to, strongsBible });
      if (id !== runId.current) return;
      setRes(out);
      setRan(t);
      if (list.current) list.current.scrollTop = 0;
      if (!out.bible.count && out.commentaries.length) setScope("commentary");
      else if (!out.bible.count && !out.commentaries.length && out.dictionaries.length) setScope("dictionary");
      else setScope("bible");
    } catch (e) {
      if (id === runId.current) setErr(String(e));
    } finally {
      if (id === runId.current) setBusy(false);
    }
  };
  // A changed option runs the search again.
  useEffect(() => {
    if (ran) run(ran);
  }, [bible, range, mode, whole]); // eslint-disable-line react-hooks/exhaustive-deps

  const asRef = q.trim() ? parseRef(q.trim()) : undefined;
  const terms = res?.strongs ? [] : mode === "phrase" ? [ran] : ran.split(/\s+/);
  const cCount = res?.commentaries.reduce((n, m) => n + m.count, 0) ?? 0;
  const dCount = res?.dictionaries.reduce((n, m) => n + m.count, 0) ?? 0;
  const bmod = bibles.find((b) => b.id === bible);

  return (
    <>
      <header className="topbar" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <NavButtons />
        <label className="filter search" style={{ flex: 1 }}>
          <Icon name="search" size={16} />
          <input
            ref={input}
            type="search"
            enterKeyHint="search"
            placeholder="Search, or type a reference like rom 8 28"
            aria-label="Search, or type a reference"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              if (asRef && !/\s(and|or)\s/i.test(q)) onJump({ ref: asRef });
              else run();
            }}
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          {q && (
            <button className="clear" aria-label="Clear" onClick={() => (setQ(""), input.current?.focus())}>
              ✕
            </button>
          )}
        </label>
        </div>
        <div className="chips">
          <button className="chip on" onClick={() => setChoosing("bible")}>
            {bmod?.abbrev || bible.toUpperCase()} <Icon name="down" size={12} />
          </button>
          <button className="chip" onClick={() => setChoosing("range")}>
            {range} <Icon name="down" size={12} />
          </button>
          <button className="chip" onClick={() => setChoosing("mode")}>
            {{ all: "All words", phrase: "Phrase", any: "Any word" }[mode]}{" "}
            <Icon name="down" size={12} />
          </button>
          <button className={`chip ${whole ? "on" : ""}`} aria-pressed={whole} onClick={() => setWhole(!whole)}>
            Whole words
          </button>
        </div>
      </header>

      <div className="results" ref={list}>
        {asRef && q.trim() !== ran && (
          <div className="list" style={{ marginBottom: 12 }}>
            <button className="row" onClick={() => onJump({ ref: asRef })}>
              <span className="grow">Go to {fmtRef(asRef)}</span>
              <span className="m">›</span>
            </button>
          </div>
        )}
        {busy && <p className="empty">Searching…</p>}
        {err && <p className="empty">The search failed: {err}</p>}
        {!busy && !res && !asRef && (
          <p className="empty" style={{ textAlign: "center", marginTop: 40 }}>
            Words, a phrase, or a Strong's number like G26.
          </p>
        )}
        {res && !busy && (
          <>
            <div className="seg" role="tablist" style={{ margin: "0 0 12px" }}>
              <button role="tab" aria-selected={scope === "bible"} onClick={() => setScope("bible")}>
                Bible {res.bible.count}
              </button>
              <button role="tab" aria-selected={scope === "commentary"} onClick={() => setScope("commentary")}>
                Commentary {cCount}
              </button>
              <button role="tab" aria-selected={scope === "dictionary"} onClick={() => setScope("dictionary")}>
                Dictionary {dCount}
              </button>
            </div>

            {scope === "bible" &&
              (res.bible.count ? (
                <>
                  <p className="label">
                    {res.bible.count > res.bible.hits.length
                      ? `The first ${res.bible.hits.length} of ${res.bible.count} verses`
                      : `${res.bible.count} ${res.bible.count === 1 ? "verse" : "verses"}`}
                    {res.strongs ? ` with ${ran.toUpperCase()}` : ""} · {res.bible.abbrev || res.bible.title}
                  </p>
                  <div className="hits">
                    {res.bible.hits.map((h) => (
                      <button key={`${h.book}.${h.chapter}.${h.verse}`} className="hit" onClick={() => onJump({ ref: h })}>
                        <span className="ref">{fmtRef(h)}</span>
                        <span className="txt">{mark(plain(h.text), terms, whole)}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="empty">No verses in the {bmod?.title ?? bible}.</p>
              ))}

            {scope === "commentary" &&
              (res.commentaries.length ? (
                res.commentaries.map((m) => (
                  <div key={m.module} style={{ marginBottom: 16 }}>
                    <p className="label">
                      {m.title} · {m.count}
                    </p>
                    <div className="hits">
                      {m.hits.map((h, i) => {
                        const ref = { book: h.book, chapter: h.chapterBegin, verse: h.verseBegin || 1 };
                        return (
                          <button key={i} className="hit" onClick={() => onJump({ ref, commentary: m.module })}>
                            <span className="ref">
                              {book(h.book).name} {h.chapterBegin}
                              {h.verseBegin ? `:${h.verseBegin}` : ""}
                              {h.verseEnd && h.verseEnd !== h.verseBegin ? `–${h.verseEnd}` : ""}
                            </span>
                            <span className="txt small">{mark(h.snippet, terms, whole)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              ) : (
                <p className="empty">No commentary mentions it.</p>
              ))}

            {scope === "dictionary" &&
              (res.dictionaries.length ? (
                res.dictionaries.map((m) => (
                  <div key={m.module} style={{ marginBottom: 16 }}>
                    <p className="label">
                      {m.title} · {m.count}
                    </p>
                    <div className="list">
                      {m.hits.map((t) => (
                        <button key={t} className="row" onClick={() => setEntry({ module: m.module, topic: t })}>
                          <span className="grow">{mark(t, terms, whole)}</span>
                          <span className="m">›</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <p className="empty">No dictionary entry has it.</p>
              ))}
          </>
        )}
      </div>

      {choosing === "bible" && (
        <Choose
          title="Search in"
          options={bibles.map((b) => ({ id: b.id, name: b.title, note: b.abbrev }))}
          value={bible}
          onPick={(id) => (setBible(id), setChoosing(null))}
          onClose={() => setChoosing(null)}
        />
      )}
      {choosing === "range" && (
        <Choose
          title="Books"
          options={RANGES.map((x) => ({ id: x.name, name: x.name }))}
          value={range}
          onPick={(id) => (setRange(id), setChoosing(null))}
          onClose={() => setChoosing(null)}
        />
      )}
      {choosing === "mode" && (
        <Choose
          title="Find"
          options={MODES}
          value={mode}
          onPick={(id) => (setMode(id), setChoosing(null))}
          onClose={() => setChoosing(null)}
        />
      )}
      {entry && <Entry module={entry.module} topic={entry.topic} onJump={(j) => (setEntry(null), onJump(j))} onClose={() => setEntry(null)} />}
    </>
  );
}
