// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { useEffect, useRef, useState } from "react";
import { api, Coverage, TopicHit } from "./api";
import { fmtRef, Ref } from "./bible";
import { concordanceRenderings, headwords, lexiconParts, plainText, renderHtml } from "./esword";
import { Icon } from "./icons";
import { WordPick } from "./Read";
import { useApp } from "./state";
import { orderModules, short } from "./StudyPane";
import { Popover } from "./ui";
import { useAssistant } from "./assistant";
import { SayButton } from "./speech";

interface Lex {
  num: string;
  word: string;
  translit: string;
  pron: string;
  rest: string;
  renderings: [string, number][];
}

export function useLexicon(nums: string[]) {
  const app = useApp();
  const [lex, setLex] = useState<Lex[]>([]);
  const key = nums.join(",");
  useEffect(() => {
    let dead = false;
    if (!app.lexicon || !nums.length) {
      setLex([]);
      return;
    }
    Promise.all(
      nums.map(async (num) => {
        const a = await api.article("lexicon", app.lexicon!, num);
        const c = app.concordance ? await api.article("lexicon", app.concordance, num).catch(() => null) : null;
        const parts = a ? lexiconParts(a.html) : { word: "", translit: "", pron: "", rest: "" };
        return { num, ...parts, renderings: c ? concordanceRenderings(c.html) : [] };
      }),
    ).then((x) => !dead && setLex(x));
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, app.lexicon, app.concordance]);
  return lex;
}

export function WordLookup({
  pick,
  vref,
  context,
  bible,
  onClose,
  onDictionary,
  onCommentary,
  onAsk,
}: {
  pick: WordPick;
  bible: string;
  onClose: () => void;
  /** The verse the word is in, or near (a commentary's verse); none in a book. */
  vref?: Ref;
  /** Where the word is, when not in a verse: "Easton's Bible Dictionary", a book's chapter. */
  context?: string;
  /** With search, the word goes into the dictionary search box rather than opening an entry. */
  onDictionary: (module: string, topic: string, search?: boolean) => void;
  onCommentary?: (module: string) => void;
  onAsk: (q: string) => void;
}) {
  const app = useApp();
  const canAsk = useAssistant().available;
  const word = pick.token.text;
  // A word with no Strong's numbers of its own (a Bible without them, a commentary, a book): the
  // Greek and Hebrew words the KJV+ most often translates with it.
  const [guess, setGuess] = useState<string[]>([]);
  useEffect(() => {
    let dead = false;
    setGuess([]);
    if (pick.token.strongs.length || !app.strongsBible || word.length < 3) return;
    (async () => {
      for (const h of headwords(word)) {
        const ns = await api.strongsForWord(app.strongsBible!, h).catch(() => []);
        if (ns.length) {
          if (!dead)
            setGuess(
              ns
                .slice()
                .sort((a, b) => b.count - a.count)
                .slice(0, 2)
                .map((n) => n.num),
            );
          return;
        }
      }
    })();
    return () => {
      dead = true;
    };
  }, [word, pick.token.strongs.length, app.strongsBible]);
  const guessed = !pick.token.strongs.length && guess.length > 0;
  const lex = useLexicon(pick.token.strongs.length ? pick.token.strongs : guess);
  const [topics, setTopics] = useState<TopicHit[]>([]);
  const [head, setHead] = useState(word.toLowerCase()); // the form of the word the dictionaries have
  const [cov, setCov] = useState<Coverage[]>([]);
  useEffect(() => {
    let dead = false;
    (async () => {
      for (const h of headwords(word)) {
        const t = await api.findTopics(h);
        if (t.length) {
          if (!dead) setHead(h);
          if (!dead)
            setTopics(
              orderModules(
                t.map((x) => ({ ...x, id: x.module })),
                app.settings.dictionaryOrder,
              ).slice(0, 6),
            );
          return;
        }
      }
      if (!dead) {
        setTopics([]);
        setHead(word.toLowerCase());
      }
    })();
    if (vref?.verse && onCommentary)
      api.coverage(vref.book, vref.chapter, vref.verse).then(
        (c) =>
          !dead &&
          setCov(
            orderModules(
              c.filter((x) => x.range && x.id !== app.tsk),
              app.settings.commentaryOrder,
            ),
          ),
      );
    else setCov([]);
    return () => {
      dead = true;
    };
  }, [word, vref?.book, vref?.chapter, vref?.verse, app.tsk, app.settings.dictionaryOrder, app.settings.commentaryOrder]); // eslint-disable-line react-hooks/exhaustive-deps

  const range = (c: Coverage) =>
    c.range && (c.range[1] !== c.range[3] || c.range[0] !== c.range[2])
      ? ` ${c.range[0]}:${c.range[1]}–${c.range[2] !== c.range[0] ? c.range[2] + ":" : ""}${c.range[3]}`
      : "";
  const lang = (n: string) => (n.startsWith("H") ? "Hebrew" : "Greek");
  return (
    <Popover anchor={pick.rect} onClose={onClose} width={420}>
      <div role="dialog" aria-label={`Look up: ${word}`}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 12px 10px 16px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <span style={{ font: "600 19px/1 var(--serif)" }}>{word}</span>
          <span className="n">{vref ? `${fmtRef(vref)} · ${app.mod("bible", bible)?.abbrev ?? ""}` : context}</span>
          <button className="ibtn" type="button" aria-label="Close" style={{ marginLeft: "auto" }} onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        {guessed && lex.length > 0 && (
          <div className="hint" style={{ padding: "10px 16px 0" }}>
            The Greek and Hebrew words the KJV most often translates “{word.toLowerCase()}”:
          </div>
        )}
        {lex.map((l) => (
          <div
            key={l.num}
            style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6, borderBottom: "1px solid var(--border)" }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span className="label">{lang(l.num)}</span>
              <span style={{ font: "400 26px/1 var(--orig)" }} lang={l.num.startsWith("H") ? "he" : "grc"}>
                {l.word}
              </span>
              {l.word && <SayButton word={l.word} num={l.num} pron={l.pron} />}
              <i style={{ fontFamily: "var(--serif)", fontSize: 15 }}>{l.translit}</i>
              <a
                style={{ marginLeft: "auto", fontSize: 12 }}
                onClick={() => {
                  app.studyWord(l.num);
                  onClose();
                }}
              >
                {l.num}
              </a>
            </div>
            {l.pron && <div className="n">{l.pron}</div>}
            <div className="es" style={{ font: "400 14.5px/1.5 var(--serif)" }}>
              {renderHtml(l.rest, {
                onStrongs: (n) => {
                  app.studyWord(n);
                  onClose();
                },
                inlineNums: true,
              })}
            </div>
            {l.renderings.length > 0 && (
              <div className="n" style={{ fontWeight: 400 }}>
                KJV translates it{" "}
                {l.renderings.slice(0, 7).map(([w, n], i) => (
                  <span key={w}>
                    {i > 0 && " · "}
                    <b style={{ color: w.toLowerCase() === word.toLowerCase() ? "var(--text)" : undefined }}>{w}</b> {n}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {!lex.length && pick.token.strongs.length === 0 && !guess.length && app.strongsBible && vref && !context && (
          <div className="hint" style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
            No Greek or Hebrew word found for “{word}”.
          </div>
        )}
        {topics.length > 0 && (
          <div style={{ padding: "10px 8px 6px", borderBottom: "1px solid var(--border)" }}>
            <div className="label" style={{ padding: "0 8px 4px" }}>
              Dictionaries
            </div>
            {topics.map((t) => (
              <button
                key={t.module + t.topic}
                type="button"
                className="bm"
                style={{ minHeight: 30 }}
                onClick={() => onDictionary(t.module, t.topic)}
              >
                <span className="t">{t.topic}</span>
                <span className="r">{t.title}</span>
              </button>
            ))}
          </div>
        )}
        {cov.length > 0 && (
          <div
            style={{ padding: "10px 16px 12px", display: "flex", flexDirection: "column", gap: 8, borderBottom: "1px solid var(--border)" }}
          >
            <div className="label">Commentary on this verse</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {cov.map((c) => (
                <button key={c.id} type="button" className="rchip" onClick={() => onCommentary?.(c.id)}>
                  {short(c)}
                  {range(c)}
                </button>
              ))}
            </div>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${3 + (canAsk ? 1 : 0)}, minmax(0,1fr))` }}>
          <button
            type="button"
            style={{
              height: 40,
              border: 0,
              background: "transparent",
              cursor: "pointer",
              color: "var(--accent)",
              borderRight: "1px solid var(--border)",
            }}
            onClick={() => {
              app.searchText(word);
              onClose();
            }}
          >
            Search
          </button>
          {/* A word with its own Strong's number studies that number; any other word (a commentary's,
              a book's) looks up the Greek and Hebrew words the KJV translates it with. */}
          <button
            type="button"
            style={{
              height: 40,
              border: 0,
              background: "transparent",
              cursor: "pointer",
              color: "var(--accent)",
              borderRight: "1px solid var(--border)",
            }}
            onClick={() => {
              app.studyWord(pick.token.strongs.length && lex.length ? lex[0].num : word.toLowerCase());
              onClose();
            }}
          >
            Word study
          </button>
          <button
            type="button"
            style={{
              height: 40,
              border: 0,
              background: "transparent",
              cursor: "pointer",
              color: "var(--accent)",
              borderRight: canAsk ? "1px solid var(--border)" : 0,
            }}
            onClick={() => onDictionary("", head, true)}
          >
            Dictionary
          </button>
          {canAsk && (
            <button
              type="button"
              style={{ height: 40, border: 0, background: "transparent", cursor: "pointer", color: "var(--accent)" }}
              onClick={() => onAsk(`What does “${word}” mean in ${context ?? (vref ? fmtRef(vref) : "this passage")}?`)}
            >
              Ask
            </button>
          )}
        </div>
      </div>
    </Popover>
  );
}

/**
 * Hovering a Strong's number anywhere (the superscripts in the KJV+ and in commentaries) shows its
 * lexicon entry. One listener for the whole window, so every screen gets it without wiring.
 */
export function StrongsHover() {
  const app = useApp();
  const [show, setShow] = useState<{ num: string; rect: DOMRect; lex: Lex | null } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const cache = useRef(new Map<string, Promise<Lex | null>>());
  const gen = useRef(0); // bumped on every hover change, so a lookup that lands after the mouse left is dropped
  useEffect(() => {
    cache.current.clear(); // entries from the previous lexicon or concordance
    const load = (num: string) => {
      let p = cache.current.get(num);
      if (!p) {
        p = (async () => {
          if (!app.lexicon) return null;
          const a = await api.article("lexicon", app.lexicon, num);
          if (!a) return null;
          const c = app.concordance ? await api.article("lexicon", app.concordance, num).catch(() => null) : null;
          return { num, ...lexiconParts(a.html), renderings: c ? concordanceRenderings(c.html) : [] };
        })().catch(() => null);
        cache.current.set(num, p);
        p.then((l) => {
          if (!l && cache.current.get(num) === p) cache.current.delete(num);
        }); // a miss may be a failure: retry next time
      }
      return p;
    };
    const over = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest?.(".strongs") as HTMLElement | null;
      if (!el || el.contains(e.relatedTarget as Node)) return;
      // The full number is in data-num where the text shows it shortened ("25" for G25 on Compare).
      const num = (el.dataset.num || el.textContent || "").trim();
      if (!/^[GH]\d+[a-z]?$/i.test(num)) return;
      window.clearTimeout(timer.current);
      const rect = el.getBoundingClientRect();
      const g = ++gen.current;
      timer.current = window.setTimeout(async () => {
        const n = num[0].toUpperCase() + num.slice(1);
        const lex = await load(n);
        if (g !== gen.current) return;
        setShow({ num: n, rect, lex });
      }, 300);
    };
    const out = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest?.(".strongs");
      if (!el || el.contains(e.relatedTarget as Node)) return;
      window.clearTimeout(timer.current);
      gen.current++;
      timer.current = window.setTimeout(() => setShow(null), 120);
    };
    const hide = () => {
      window.clearTimeout(timer.current);
      gen.current++;
      setShow(null);
    };
    document.addEventListener("mouseover", over);
    document.addEventListener("mouseout", out);
    document.addEventListener("scroll", hide, true);
    document.addEventListener("mousedown", hide);
    return () => {
      document.removeEventListener("mouseover", over);
      document.removeEventListener("mouseout", out);
      document.removeEventListener("scroll", hide, true);
      document.removeEventListener("mousedown", hide);
    };
  }, [app.lexicon, app.concordance]);
  if (!show) return null;
  const { rect, lex } = show;
  const above = rect.top > 280;
  const def = lex ? plainText(lex.rest) : "";
  return (
    <div
      className="popover"
      style={{
        left: Math.max(12, Math.min(rect.left - 40, window.innerWidth - 340)),
        top: above ? rect.top - 8 : rect.bottom + 8,
        transform: above ? "translateY(-100%)" : undefined,
        width: 320,
        padding: "12px 14px",
        pointerEvents: "none",
        zIndex: 90,
      }}
    >
      {lex ? (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <span style={{ font: "500 20px var(--orig)" }} lang={show.num.startsWith("H") ? "he" : "grc"}>
              {lex.word}
            </span>
            <i style={{ fontFamily: "var(--serif)", fontSize: 15 }}>{lex.translit}</i>
            <span className="n" style={{ marginLeft: "auto" }}>
              {show.num}
            </span>
          </div>
          <div style={{ font: "400 14px/1.5 var(--serif)", marginTop: 6, maxHeight: 150, overflow: "hidden" }}>
            {def.length > 320 ? def.slice(0, 317) + "…" : def}
          </div>
          {lex.renderings.length > 0 && (
            <div className="n" style={{ marginTop: 8 }}>
              KJV:{" "}
              {lex.renderings
                .slice(0, 5)
                .map(([w, n]) => `${w} (${n})`)
                .join(", ")}
            </div>
          )}
        </>
      ) : (
        <div className="n">{show.num}: not in your lexicon.</div>
      )}
    </div>
  );
}
