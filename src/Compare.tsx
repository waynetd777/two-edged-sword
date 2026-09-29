// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { useEffect, useMemo, useRef, useState } from "react";
import { api, Verse } from "./api";
import { AskPanel, useAskOpener, withheld } from "./Ask";
import { apocryphaName, book, BookSizes, fmtRef, isApocrypha, Ref, stepChapter } from "./bible";
import { plainText, Token, tokenize } from "./esword";
import { Icon } from "./icons";
import { VerseText, WordPick } from "./Read";
import { BibleSelect, RefButton, SearchField, Topbar } from "./Shell";
import { useApp } from "./state";
import { ApoPill, bibleSizes, Popover, RefPicker, SearchList, SideNav, Switch } from "./ui";
import { WordLookup } from "./WordLookup";
import { useAssistant } from "./assistant";

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'");

/** Indices of the words in b that are not part of the longest common run with a. */
function diffWords(a: string[], b: string[]): Set<number> {
  const n = a.length,
    m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const keep = new Set<number>();
  let i = 0,
    j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      keep.add(j);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  const out = new Set<number>();
  for (let k = 0; k < m; k++) if (!keep.has(k)) out.add(k);
  return out;
}

function Marked({
  tokens,
  diff,
  red,
  showNums,
  onWord,
  activeWi,
}: {
  tokens: Token[];
  diff: Set<number> | null;
  red: boolean;
  showNums: boolean;
  onWord: (t: Token, el: HTMLElement) => void;
  activeWi?: number;
}) {
  // Numbers are drawn here, without their G/H, whether or not the verse has differences, so every
  // verse in a column looks the same (VerseText writes them in full).
  if ((!diff || !diff.size) && !showNums)
    return <VerseText tokens={tokens} red={red} showNums={showNums} onWord={onWord} activeWi={activeWi} />;
  return (
    <>
      {tokens.map((t, i) => {
        if (!t.word)
          return (
            <span key={i} className={t.red && red ? "red" : undefined}>
              {t.italic ? <i className="added">{t.text}</i> : t.text}
            </span>
          );
        const d = !!diff?.has(t.wi);
        return (
          <span key={i}>
            <span
              className={`w ${t.red && red ? "red" : ""} ${activeWi === t.wi ? "on" : ""}`}
              style={d ? { background: "var(--hl-gold)", borderRadius: 3, padding: "0 2px" } : undefined}
              onClick={(e) => {
                e.stopPropagation();
                onWord(t, e.currentTarget);
              }}
            >
              {t.italic ? <i className="added">{t.text}</i> : t.text}
            </span>
            {showNums &&
              t.showNums?.map((n) => (
                <span
                  key={n}
                  className="strongs"
                  data-num={n}
                  style={{ font: "500 9.5px var(--ui)", color: "var(--accent)", verticalAlign: "super", marginInlineStart: 1 }}
                >
                  {n.slice(1)}
                </span>
              ))}
          </span>
        );
      })}
    </>
  );
}

export function CompareScreen({ openPalette }: { openPalette: () => void }) {
  const app = useApp();
  const [addMenu, setAddMenu] = useState<DOMRect | null>(null);
  const { loc, settings } = app;
  const cols = settings.compare.filter((c) => app.mod("bible", c));
  const [data, setData] = useState<Record<string, Verse[]>>({});
  const [diff, setDiff] = useState(true);
  const [nums, setNums] = useState(true);
  const [ask, setAsk] = useState(false);
  useAskOpener(() => setAsk(true));
  const canAsk = useAssistant().available;
  const [word, setWord] = useState<(WordPick & { bible: string }) | null>(null);
  const [picker, setPicker] = useState<DOMRect | null>(null);
  const [sel, setSel] = useState<number | null>(loc.verse ?? null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let dead = false;
    Promise.all(
      cols.map((c) =>
        api
          .chapter(c, loc.book, loc.chapter)
          .then((v) => [c, v] as const)
          .catch(() => [c, [] as Verse[]] as const),
      ),
    ).then((x) => {
      if (!dead) setData(Object.fromEntries(x));
    });
    return () => {
      dead = true;
    };
  }, [cols.join(","), loc.book, loc.chapter]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setSel(loc.verse ?? null);
  }, [loc.verse, loc.book, loc.chapter]);
  useEffect(() => {
    if (loc.verse) scroller.current?.querySelector(`[data-v="${loc.verse}"]`)?.scrollIntoView({ block: "start" });
  }, [data, loc.verse]);

  const verseNums = useMemo(() => {
    const s = new Set<number>();
    Object.values(data).forEach((vs) => vs.forEach((v) => s.add(v.v)));
    return Array.from(s).sort((a, b) => a - b);
  }, [data]);
  const toks = useMemo(() => {
    const m: Record<string, Map<number, Token[]>> = {};
    for (const c of cols) m[c] = new Map((data[c] ?? []).map((v) => [v.v, tokenize(v.text)]));
    return m;
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const setCols = (next: string[]) => app.set({ compare: next });
  const addable = app.bibles.filter((b) => !cols.includes(b.id));
  // Chapters any of the columns has, so the page turns into a Bible's Apocrypha when one has them.
  const [sizes, setSizes] = useState<BookSizes | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all(cols.map(bibleSizes)).then((all) => {
      const m: BookSizes = new Map();
      for (const x of all) for (const [b, c] of x) m.set(b, Math.max(m.get(b) ?? 0, c));
      if (live) setSizes(m.size ? m : null);
    });
    return () => {
      live = false;
    };
  }, [cols.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const pc = stepChapter(loc.book, loc.chapter, -1, sizes),
    nc = stepChapter(loc.book, loc.chapter, 1, sizes);
  const go = (d: 1 | -1) => {
    const n = d > 0 ? nc : pc;
    if (n) app.open({ book: n[0], chapter: n[1] });
  };
  const selRef: Ref | null = sel ? { book: loc.book, chapter: loc.chapter, verse: sel } : null;
  const grid = `40px repeat(${cols.length}, minmax(0, 1fr)) 120px`;

  const askContext = () => {
    if (!sel) return "";
    return (
      "The same verse in the translations being compared:\n" +
      cols
        .map((c) => {
          const m = app.mod("bible", c);
          if (withheld(app.settings.allowLicensed, m)) return `${m?.abbrev}: (licensed; the user has chosen not to send its text)`;
          const v = (data[c] ?? []).find((x) => x.v === sel);
          return `${m?.abbrev}: ${v ? plainText(v.text) : "(not in this translation)"}`;
        })
        .join("\n")
    );
  };

  return (
    <div className="main">
      <Topbar>
        <RefButton onClick={() => setPicker(new DOMRect(300, 40, 100, 20))} />
        <SearchField onOpen={openPalette} />
      </Topbar>
      <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "14px 28px 12px" }}>
        <h1 style={{ margin: 0, font: "500 30px/1 var(--display)" }}>
          {book(loc.book).name} {loc.chapter}
        </h1>
        {isApocrypha(loc.book, loc.chapter) && <ApoPill title={apocryphaName(loc.book, loc.chapter)} />}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginLeft: "auto" }}>
          <Switch on={diff} onChange={setDiff}>
            Highlight differences
          </Switch>
          <Switch on={nums} onChange={setNums}>
            Strong's numbers
          </Switch>
          {canAsk && (
            <button className={`btn ${ask ? "on" : ""}`} type="button" onClick={() => setAsk(!ask)}>
              <Icon name="chat" />
              Ask
            </button>
          )}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: grid, gap: "0 24px", padding: "0 28px 10px" }}>
        <div />
        {cols.map((c, i) => {
          const m = app.mod("bible", c)!;
          return (
            <div
              key={c}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                height: 40,
                padding: "0 4px 0 6px",
                border: "1px solid var(--border)",
                borderRadius: 9,
                background: "var(--panel)",
                minWidth: 0,
              }}
            >
              <BibleSelect
                value={c}
                onChange={(id) => setCols(cols.map((x) => (x === c ? id : x)))}
                style={{ border: 0, background: "transparent", fontWeight: 700, padding: "0 6px" }}
              />
              <span style={{ color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>
                {m.title}
              </span>
              {i > 0 && diff && (
                <span className="n" style={{ whiteSpace: "nowrap" }}>
                  vs {app.mod("bible", cols[0])?.abbrev}
                </span>
              )}
              {cols.length > 1 && (
                <button
                  className="ibtn"
                  type="button"
                  aria-label={`Remove ${m.abbrev}`}
                  style={{ marginLeft: "auto" }}
                  onClick={() => setCols(cols.filter((x) => x !== c))}
                >
                  <Icon name="x" />
                </button>
              )}
            </div>
          );
        })}
        <button
          className="btn"
          type="button"
          aria-label="Add a translation"
          style={{
            height: 40,
            border: "1px dashed var(--dash)",
            background: "transparent",
            color: "var(--muted)",
            justifyContent: "center",
          }}
          onClick={(e) => setAddMenu(e.currentTarget.getBoundingClientRect())}
        >
          <Icon name="plus" />
          Add
        </button>
        {addMenu && (
          <Popover anchor={addMenu} onClose={() => setAddMenu(null)} width={380} style={{ padding: 0, overflow: "hidden" }}>
            <SearchList
              placeholder="Find a translation to add"
              onClose={() => setAddMenu(null)}
              onPick={(id) => {
                setAddMenu(null);
                setCols([...cols, id]);
              }}
              items={addable.map((b) => ({ key: b.id, label: b.abbrev, sub: b.title, title: b.title, terms: b.id }))}
            />
          </Popover>
        )}
      </div>
      <div className="sidenav-wrap" style={{ flexGrow: 1 }}>
        <div ref={scroller} className="scroll" style={{ flexGrow: 1, background: "var(--panel)", borderTop: "1px solid var(--border)" }}>
          {verseNums.map((v) => {
            const base = (toks[cols[0]]?.get(v) ?? []).filter((t) => t.word).map((t) => norm(t.text));
            return (
              <div
                key={v}
                data-v={v}
                onClick={() => setSel(v)}
                style={{
                  display: "grid",
                  gridTemplateColumns: grid,
                  gap: "0 24px",
                  padding: "14px 28px",
                  borderBottom: "1px solid var(--border)",
                  background: sel === v ? "var(--accentsoft)" : undefined,
                  cursor: "default",
                }}
              >
                <div className="vn" style={{ textAlign: "left", lineHeight: "26px" }}>
                  {v}
                </div>
                {cols.map((c, i) => {
                  const t = toks[c]?.get(v);
                  if (!t)
                    return (
                      <div key={c} className="n">
                        —
                      </div>
                    );
                  const words = t.filter((x) => x.word).map((x) => norm(x.text));
                  const d =
                    diff && i > 0
                      ? diffWords(base, words)
                      : diff && cols.length > 1
                        ? diffWords(
                            (toks[cols[1]]?.get(v) ?? []).filter((x) => x.word).map((x) => norm(x.text)),
                            words,
                          )
                        : null;
                  const same = i > 0 && diff && d && d.size === 0 && words.length === base.length;
                  return (
                    <div
                      key={c}
                      className="selectable"
                      dir={app.mod("bible", c)?.rtl ? "rtl" : undefined}
                      style={{ font: "400 16px/1.65 var(--serif)", textWrap: "pretty" }}
                    >
                      <Marked
                        tokens={t}
                        diff={d}
                        red={settings.redLetters}
                        showNums={nums && !!app.mod("bible", c)?.strongs}
                        activeWi={word?.bible === c && word.verse === v ? word.token.wi : undefined}
                        onWord={(tok, el) => setWord({ token: tok, verse: v, rect: el.getBoundingClientRect(), bible: c })}
                      />
                      {same && (
                        <div style={{ marginTop: 4 }}>
                          <span className="chip" style={{ minHeight: 20, fontSize: 11, color: "var(--muted)", cursor: "default" }}>
                            Same as {app.mod("bible", cols[0])?.abbrev}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div />
              </div>
            );
          })}
          <div style={{ height: 120 }} />
        </div>
        <SideNav
          prev={pc && { label: `Previous chapter: ${book(pc[0]).name} ${pc[1]} (←)`, go: () => go(-1) }}
          next={nc && { label: `Next chapter: ${book(nc[0]).name} ${nc[1]} (→)`, go: () => go(1) }}
        />
      </div>
      {ask && (
        <div
          style={{
            position: "fixed",
            right: 28,
            bottom: 20,
            width: 460,
            zIndex: 30,
            boxShadow: "0 14px 40px var(--shadow)",
            borderRadius: 12,
          }}
        >
          <AskPanel
            source="Compare"
            passage={selRef ?? { book: loc.book, chapter: loc.chapter }}
            about={selRef ? `${fmtRef(selRef)} in ${cols.map((c) => app.mod("bible", c)?.abbrev).join(", ")}` : undefined}
            context={askContext}
            suggestions={
              selRef
                ? [
                    `What are the main differences between these translations of ${fmtRef(selRef, "short")}?`,
                    "Which difference matters most here?",
                  ]
                : []
            }
            hint={selRef ? undefined : "Click a verse to ask about it in these translations, or ask about the whole chapter."}
          />
        </div>
      )}
      {word && (
        <WordLookup
          pick={word}
          vref={{ book: loc.book, chapter: loc.chapter, verse: word.verse }}
          bible={word.bible}
          onClose={() => setWord(null)}
          onDictionary={(module, topic, search) => {
            app.open({ book: loc.book, chapter: loc.chapter, verse: word.verse });
            app.setPending({ article: { module, topic, search } });
          }}
          onCommentary={(m) => {
            app.open({ book: loc.book, chapter: loc.chapter, verse: word.verse });
            app.setPending({ commentary: m });
          }}
          onAsk={() => {
            setSel(word.verse);
            setAsk(true);
            setWord(null);
          }}
        />
      )}
      {picker && (
        <RefPicker
          anchor={picker}
          initialBook={loc.book}
          onClose={() => setPicker(null)}
          onPick={(b, c, v) => {
            setPicker(null);
            app.open({ book: b, chapter: c, verse: v });
          }}
        />
      )}
    </div>
  );
}
