// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, Verse, Voice } from "./api";
import { apocryphaName, book, BookSizes, fmtRef, isApocrypha, parseRef, Ref, sectionOf, stepChapter, testament } from "./bible";
import { alignStrongs, EDITIONS, isOriginal, kjvGloss, plainText, Token, tokenize, variantSource } from "./esword";
import { SongsButton } from "./ChapterSongs";
import { Icon, Pause, Play } from "./icons";
import { BibleSelect, RefButton, SearchField, Topbar } from "./Shell";
import { rankVoices, useListenKey, usePlayer } from "./speech";
import { DictAt, HL_COLOURS, HlColor, hlName, useApp, vkey } from "./state";
import { StudyPane, StudyTab } from "./StudyPane";
import { ApoPill, Popover, RefPicker, scrollToThird, Seg, SideNav, useBibleBooks, useBibleSizes, useDrag } from "./ui";
import { WordLookup } from "./WordLookup";
import { BooksButton } from "./DocReader";
import { useAssistant } from "./assistant";
import { useVariances, Variance, VariancePopover } from "./variances";

export interface WordPick {
  token: Token;
  verse: number;
  rect: DOMRect;
  /** Set for a word in a commentary: which one, and on what. */ where?: string;
}
/** A clicked word outside a verse (commentary, a book) as a token: no Strong's numbers of its own. */
export const textToken = (text: string): Token => ({ text, word: true, red: false, italic: false, strongs: [], at: 0, wi: -1 });

export const HL: HlColor[] = HL_COLOURS;
export const HL_DOT: Record<HlColor, string> = {
  red: "#e59a92",
  orange: "#efb97e",
  yellow: "#e9d271",
  green: "#a9cf9f",
  teal: "#8fcfc6",
  blue: "#9fc0e6",
  purple: "#c1a9e3",
  grey: "#aab3bf",
};
/** A highlight colour's name in the pickers: the user's name for it (Settings › Highlights), or the colour. */
export const hlLabel = (c: HlColor, names: Partial<Record<HlColor, string>> | undefined) =>
  names?.[c]?.trim() || c[0].toUpperCase() + c.slice(1);

/** Journal entries that mention a verse, by "b.c.v". */
export function useNotesByVerse() {
  const { journal } = useApp();
  return useMemo(() => {
    const m = new Map<string, string[]>();
    for (const e of journal)
      for (const v of e.verses) {
        const r = parseRef(v);
        if (!r) continue;
        const from = r.verse ?? 1,
          to = r.to ?? r.verse ?? 200;
        for (let i = from; i <= Math.min(to, 200); i++) {
          const k = vkey(r.book, r.chapter, i);
          m.set(k, [...(m.get(k) ?? []), e.id]);
        }
      }
    return m;
  }, [journal]);
}

export function VerseText({
  tokens,
  red,
  speakingChar,
  onWord,
  activeWi,
  showNums,
  variantFrom = "another edition",
}: {
  tokens: Token[];
  red: boolean;
  speakingChar?: number;
  onWord?: (t: Token, el: HTMLElement) => void;
  activeWi?: number;
  showNums: boolean;
  /** Whose readings a Greek NT's ⟨variants⟩ are. */ variantFrom?: string;
}) {
  const vtitle = `${variantFrom} reads`;
  const tip = (t: Token) =>
    [t.variant && vtitle, t.lemma, t.parse, t.editions && `Only in: ${[...t.editions].map((c) => EDITIONS[c] ?? c).join(", ")}`]
      .filter(Boolean)
      .join(" · ") || undefined;
  // An interlinear Bible: each original word stacked over its English, Strong's number and grammar.
  // One with grammar but no English reads inline, like any Strong's Bible, the grammar in the word's tooltip.
  if (tokens.some((t) => t.gloss !== undefined)) {
    const marked = tokens.some((t) => t.editions);
    const boxed = (t?: Token) => !!t?.word && (t.gloss !== undefined || t.parse !== undefined || t.strongs.length > 0);
    // Punctuation straight after a word goes in its box, or the box's margin puts a space before it ("ἔσται .").
    const trailing = (i: number) =>
      !tokens[i].word && !tokens[i].variant && /^[^\s\p{L}\p{N}]+$/u.test(tokens[i].text) && boxed(tokens[i - 1]) ? tokens[i].text : "";
    return (
      <>
        {tokens.map((t, i) => {
          if (trailing(i)) return null;
          if (!boxed(t))
            return t.text.trim() ? (
              <span key={i} className={`il-p ${t.variant ? "var" : ""}`} title={t.variant ? vtitle : undefined}>
                {t.text}
              </span>
            ) : (
              <Fragment key={i}> </Fragment>
            );
          const speaking = speakingChar !== undefined && speakingChar >= t.at && speakingChar < t.at + t.text.length;
          const after = i + 1 < tokens.length ? trailing(i + 1) : "";
          return (
            <span key={i} className={`il ${t.variant ? "var" : ""}`} title={tip(t)}>
              <span>
                <span
                  className={`w ${activeWi === t.wi ? "on" : ""} ${speaking ? "speaking" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onWord?.(t, e.currentTarget);
                  }}
                >
                  {t.text}
                </span>
                {after}
              </span>
              <span className="il-g">{t.gloss ?? "\u00a0"}</span>
              {showNums && (
                <span className="il-n">
                  {t.strongs.length
                    ? t.strongs.map((n, k) => (
                        <Fragment key={n}>
                          {k ? " " : ""}
                          <span className="strongs" data-num={n}>
                            {n}
                          </span>
                        </Fragment>
                      ))
                    : "\u00a0"}
                </span>
              )}
              {marked && <span className="il-e">{t.editions || "\u00a0"}</span>}
            </span>
          );
        })}
      </>
    );
  }
  return (
    <>
      {tokens.map((t, i) => {
        const cls = [t.red && red ? "red" : "", t.variant ? "var" : ""].join(" ").trim();
        const inner = t.italic ? <i className="added">{t.text}</i> : t.text;
        if (!t.word)
          return (
            <span key={i} className={cls || undefined}>
              {inner}
            </span>
          );
        const speaking = speakingChar !== undefined && speakingChar >= t.at && speakingChar < t.at + t.text.length;
        return (
          <Fragment key={i}>
            <span
              className={`w ${cls} ${activeWi === t.wi ? "on" : ""} ${speaking ? "speaking" : ""}`}
              title={tip(t)}
              onClick={(e) => {
                e.stopPropagation();
                onWord?.(t, e.currentTarget);
              }}
            >
              {inner}
            </span>
            {showNums &&
              t.showNums?.map((n) => (
                <span
                  key={n}
                  className="strongs"
                  data-num={n}
                  style={{ font: "500 10px var(--ui)", color: "var(--accent)", verticalAlign: "super", marginInlineStart: 1 }}
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

/** The chapter's verses, with a placeholder for each verse the translation leaves out that has a variance record. */
function withMissing(verses: Verse[], byVerse: Map<number, Variance>): (Verse & { missing?: true })[] {
  if (!byVerse.size) return verses;
  const have = new Set(verses.map((v) => v.v));
  const gaps = [...byVerse.keys()].filter((n) => !have.has(n)).map((n) => ({ v: n, text: "" }));
  return [...verses, ...gaps]
    .sort((a, b) => a.v - b.v)
    .map((v) => (byVerse.has(v.v) && !plainText(v.text).trim() ? { ...v, missing: true as const } : v));
}

function VarianceButton({ v, base, onPick }: { v: Variance; base: string; onPick: (rect: DOMRect) => void }) {
  const title = `Differs from the ${base.toUpperCase()}: ${v.change}`;
  return (
    <button
      className="ibtn"
      style={{ width: 16, height: 16, opacity: v.weight === "major" ? 1 : 0.55 }}
      aria-label={title}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onPick(e.currentTarget.getBoundingClientRect());
      }}
    >
      <Icon name="variance" style={{ color: "var(--accent)" }} />
    </button>
  );
}

export function ReadScreen({ focus, setFocus, openPalette }: { focus: boolean; setFocus: (f: boolean) => void; openPalette: () => void }) {
  const app = useApp();
  const canAsk = useAssistant().available;
  const { loc, settings } = app;
  const player = usePlayer();
  const bible = settings.bible;
  const bmod = app.mod("bible", bible);
  const [verses, setVerses] = useState<Verse[]>([]);
  /** The chapter `verses` holds ("bible/book/chapter"), so an empty one can be told from one still loading. */
  const [loadedAt, setLoadedAt] = useState("");
  const [strongVerses, setStrongVerses] = useState<Map<number, string>>(new Map());
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<{ from: number; to: number } | null>(null);
  const [word, setWord] = useState<WordPick | null>(null);
  const [picker, setPicker] = useState<DOMRect | null>(null);
  // The study pane's choices are remembered between sessions.
  const tab = settings.studyTab,
    dict = settings.studyDict,
    commentary = settings.studyCommentary,
    follow = settings.studyFollow;
  const setTab = (t: StudyTab) => app.set({ studyTab: t });
  const setDict = (d: DictAt | null) => app.set({ studyDict: d });
  const setCommentary = (m: string | null) => app.set({ studyCommentary: m });
  const setFollow = (f: boolean) => app.set({ studyFollow: f });
  const [askSeed, setAskSeed] = useState<string | null>(null);
  const [studyVerse, setStudyVerse] = useState<number>(loc.verse ?? 1);
  const scroller = useRef<HTMLDivElement>(null);
  const notes = useNotesByVerse();
  const variances = useVariances(bible, loc.book, loc.chapter);
  const [varPick, setVarPick] = useState<{ v: Variance; rect: DOMRect } | null>(null);

  // Another screen asked for a dictionary article, a commentary or a question here.
  useEffect(() => {
    const x = app.pending;
    if (!x) return;
    if (x.article) {
      setDict(x.article);
      setTab("dictionary");
    }
    if (x.commentary) {
      setCommentary(x.commentary);
      setTab("commentary");
    }
    if (x.ask !== undefined) {
      setAskSeed(x.ask || null);
      setTab("ask");
    }
    if (!settings.studyPane) app.set({ studyPane: true });
    app.setPending(null);
  }, [app.pending]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let dead = false;
    setErr(null);
    setStrongVerses(new Map()); // the old chapter's numbers must not align against the new text
    api
      .chapter(bible, loc.book, loc.chapter)
      .then((v) => {
        if (!dead) {
          setVerses(v);
          setLoadedAt(`${bible}/${loc.book}/${loc.chapter}`);
        }
      })
      .catch((e) => !dead && setErr(String(e)));
    // A Bible without Strong's numbers borrows them from its Strong's edition when the text is the same (KJV from KJV+).
    const sb = app.strongsBible;
    if (sb && bmod && !bmod.strongs && /^kjv/i.test(bmod.abbrev)) {
      api
        .chapter(sb, loc.book, loc.chapter)
        .then((v) => !dead && setStrongVerses(new Map(v.map((x) => [x.v, x.text]))))
        .catch(() => {});
    }
    return () => {
      dead = true;
    };
  }, [bible, loc.book, loc.chapter, app.strongsBible, bmod]);

  useEffect(() => {
    if (loc.verse) {
      setSel({ from: loc.verse, to: loc.to ?? loc.verse });
      setStudyVerse(loc.verse);
    } else {
      setSel(null);
      setStudyVerse(1);
    }
  }, [loc.book, loc.chapter, loc.verse, loc.to]);

  // Scroll the chosen verse into view once the chapter is on screen.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (loc.verse) el.querySelector(`[data-v="${loc.verse}"]`)?.scrollIntoView({ block: "center" });
    else el.scrollTop = 0;
  }, [verses, loc.verse]);

  // Follow the verse being read aloud.
  const reading = player.state.on && player.state.bible === bible && player.state.book === loc.book && player.state.chapter === loc.chapter;
  useEffect(() => {
    if (reading) scrollToThird(scroller.current?.querySelector(`[data-v="${player.state.verse}"]`));
  }, [reading, player.state.verse]);
  // When reading carries on into the next chapter, turn the page, if it was showing the one just finished.
  const lastPlayed = useRef<[number, number] | null>(null);
  useEffect(() => {
    const prev = lastPlayed.current;
    lastPlayed.current = [player.state.book, player.state.chapter];
    if (
      player.state.on &&
      player.state.bible === bible &&
      (player.state.book !== loc.book || player.state.chapter !== loc.chapter) &&
      player.state.verse === 1 &&
      prev?.[0] === loc.book &&
      prev[1] === loc.chapter
    )
      app.open({ book: player.state.book, chapter: player.state.chapter });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.state.book, player.state.chapter]);

  const parsed = useMemo(() => {
    const m = new Map<number, Token[]>();
    for (const v of verses) {
      let t = tokenize(v.text);
      const s = strongVerses.get(v.v);
      if (s) t = alignStrongs(t, tokenize(s));
      m.set(v.v, t);
    }
    return m;
  }, [verses, strongVerses]);

  // A Greek or Hebrew Strong's Bible with no English of its own gets each number's commonest KJV
  // rendering under its word (settings.kjvGlosses).
  const glossable = useMemo(() => {
    if (!settings.kjvGlosses || !app.concordance) return null;
    const all = [...parsed.values()].flat();
    if (all.some((t) => t.gloss !== undefined) || !all.some((t) => t.word && t.strongs.length && isOriginal(t.text))) return null;
    return [...new Set(all.flatMap((t) => (t.word && isOriginal(t.text) ? t.strongs : [])))];
  }, [parsed, settings.kjvGlosses, app.concordance]);
  const [kjv, setKjv] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!glossable?.length || !app.concordance) return;
    let dead = false;
    const conc = app.concordance;
    Promise.all(glossable.map((n) => kjvGloss(conc, n).then((g) => [n, g] as const))).then((r) => {
      if (!dead) setKjv((old) => new Map([...old, ...r.filter((x): x is readonly [string, string] => !!x[1])]));
    });
    return () => {
      dead = true;
    };
  }, [glossable, app.concordance]);
  const tokens = useMemo(() => {
    if (!glossable || !kjv.size) return parsed;
    const m = new Map<number, Token[]>();
    for (const [v, ts] of parsed)
      m.set(
        v,
        ts.map((t) => {
          if (!t.word || !isOriginal(t.text) || !t.strongs.length) return t;
          const g = t.strongs
            .map((n) => kjv.get(n))
            .filter(Boolean)
            .join(" ");
          return { ...t, gloss: g || "\u00a0" };
        }),
      );
    return m;
  }, [parsed, glossable, kjv]);

  const selRef: Ref | null = useMemo(
    () => (sel ? { book: loc.book, chapter: loc.chapter, verse: sel.from, to: sel.to !== sel.from ? sel.to : undefined } : null),
    [sel, loc.book, loc.chapter],
  );

  const clickVerse = (v: number, e: React.MouseEvent) => {
    // The reading area behind clears the selection on click; this click must not reach it.
    e.stopPropagation();
    if (e.shiftKey && sel) setSel({ from: Math.min(sel.from, v), to: Math.max(sel.to, v) });
    else if (sel && sel.from === v && sel.to === v) {
      setSel(null);
      return;
    } else setSel({ from: v, to: v });
    if (follow) setStudyVerse(v);
  };

  const books = useBibleBooks(bible);
  const sizes = useBibleSizes(bible);
  const go = useCallback(
    (d: 1 | -1) => {
      const n = stepChapter(loc.book, loc.chapter, d, sizes);
      if (n) app.open({ book: n[0], chapter: n[1] });
    },
    [app, loc.book, loc.chapter, sizes],
  );
  // A Bible chosen (or opened with) where it has no such book, an Old or New Testament alone:
  // open it where it starts, in place of the empty chapter, so back doesn't stop there.
  const shownIn = useRef<string | null>(null);
  useEffect(() => {
    if (!books || shownIn.current === bible) return;
    shownIn.current = bible;
    if (!books.has(loc.book)) app.open({ book: Math.min(...books), chapter: 1 }, undefined, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [books, bible]);

  useListenKey(() => player.play(bible, loc.book, loc.chapter, sel?.from));
  // Arrow keys turn the page; N adds a note; Space plays or pauses.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable='true'], select") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight") {
        go(1);
        e.preventDefault();
      } else if (e.key === "ArrowLeft") {
        go(-1);
        e.preventDefault();
      } else if (e.key === "Escape" && focus) setFocus(false);
      else if (e.key.toLowerCase() === "n" && selRef) {
        app.startEntry({ verses: [fmtRef(selRef)] });
        e.preventDefault();
      } else if (e.key === " ") {
        e.preventDefault();
        if (player.state.on) player.toggle();
        else player.play(bible, loc.book, loc.chapter, sel?.from);
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [go, focus, setFocus, selRef, app, player, bible, loc.book, loc.chapter, sel]);

  const copy = () => {
    const c = copyText();
    if (!c) return;
    navigator.clipboard.writeText(c.text);
    app.toast(c.label);
  };

  const copyText = useCallback(() => {
    if (!sel) return null;
    const vs = verses.filter((v) => v.v >= sel.from && v.v <= sel.to);
    const nums = settings.copyNumbers;
    const r = { book: loc.book, chapter: loc.chapter, verse: sel.from, to: sel.to !== sel.from ? sel.to : undefined };
    return {
      text: `${vs.map((v) => (nums ? `${v.v} ` : "") + plainText(v.text)).join(" ")}\n${fmtRef(r)} ${bmod?.abbrev ?? ""}`.trim(),
      label: `Copied ${fmtRef(r)}${nums ? " with verse numbers" : ""}`,
    };
  }, [sel, verses, settings.copyNumbers, loc.book, loc.chapter, bmod]);

  // ⌘C (which the Edit menu turns into a copy event) copies the selected verses, unless some
  // text has been selected with the mouse or the focus is in a text field.
  useEffect(() => {
    const onCopy = (e: ClipboardEvent) => {
      const t = document.activeElement as HTMLElement | null;
      if (t?.closest("input, textarea, [contenteditable='true']")) return;
      const s = window.getSelection();
      if (s && !s.isCollapsed && s.toString().trim()) return;
      const c = copyText();
      if (!c || !e.clipboardData) return;
      e.preventDefault();
      e.clipboardData.setData("text/plain", c.text);
      app.toast(c.label);
    };
    document.addEventListener("copy", onCopy);
    return () => document.removeEventListener("copy", onCopy);
  }, [copyText, app]);

  const isBookmarked = (v: number) =>
    app.bookmarks.some(
      (b) => b.ref.book === loc.book && b.ref.chapter === loc.chapter && (b.ref.verse ?? 0) <= v && v <= (b.ref.to ?? b.ref.verse ?? 0),
    );
  const selBookmarked =
    !!sel &&
    app.bookmarks.some(
      (b) => b.ref.book === loc.book && b.ref.chapter === loc.chapter && b.ref.verse === sel.from && (b.ref.to ?? b.ref.verse) === sel.to,
    );
  const setHl = (c: HlColor | null) => {
    if (!sel) return;
    for (let v = sel.from; v <= sel.to; v++) app.setHighlight(vkey(loc.book, loc.chapter, v), c);
  };
  const saved = sel ? app.highlights[vkey(loc.book, loc.chapter, sel.from)] : undefined;
  const curHl = saved ? hlName(saved) : undefined;

  const pickWord = (t: Token, v: number, el: HTMLElement) => {
    setWord({ token: t, verse: v, rect: el.getBoundingClientRect() });
    if (follow) setStudyVerse(v);
  };

  const toolbar = sel && (
    <div
      className="vtool fold-bible"
      dir="ltr"
      role="toolbar"
      aria-label="Verse actions"
      style={{ top: -44, left: 44 }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ display: "flex", gap: 6, padding: "0 6px 0 4px" }}>
        {HL.map((c) => (
          <button
            key={c}
            type="button"
            className="dot"
            aria-label={`Highlight: ${hlLabel(c, settings.hlNames)}`}
            title={hlLabel(c, settings.hlNames)}
            aria-pressed={curHl === c}
            style={{ background: HL_DOT[c], outline: curHl === c ? "2px solid var(--vt-ring)" : undefined }}
            onClick={() => setHl(curHl === c ? null : c)}
          />
        ))}
        {curHl && settings.hlNames?.[curHl]?.trim() && (
          <span
            style={{ fontSize: 12, alignSelf: "center", whiteSpace: "nowrap", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}
          >
            {hlLabel(curHl, settings.hlNames)}
          </span>
        )}
      </div>
      <span className="sep" />
      <button
        type="button"
        className="tb"
        title={selBookmarked ? "Remove the bookmark" : "Bookmark these verses"}
        onClick={() => app.toggleBookmark(selRef!, bible)}
      >
        <Icon name="bookmark" style={{ fill: selBookmarked ? "currentColor" : "none" }} />
        <span className="lbl">{selBookmarked ? "Bookmarked" : "Bookmark"}</span>
      </button>
      <button
        type="button"
        className="tb"
        title="Note: a journal entry on these verses (N)"
        onClick={() => app.startEntry({ verses: [fmtRef(selRef!)] })}
      >
        <Icon name="note" />
        <span className="lbl">
          Note<span style={{ opacity: 0.6 }}> N</span>
        </span>
      </button>
      <button
        type="button"
        className="tb"
        title="Compare these verses in other translations"
        onClick={() => app.open({ ...loc, verse: sel.from, to: sel.to }, "compare")}
      >
        <Icon name="compare" />
        <span className="lbl">Compare</span>
      </button>
      <button type="button" className="tb" title="Listen from here" onClick={() => player.play(bible, loc.book, loc.chapter, sel.from)}>
        <Icon name="speaker" />
        <span className="lbl">Listen from here</span>
      </button>
      {canAsk && (
        <button
          type="button"
          className="tb"
          title="Ask about these verses"
          onClick={() => {
            setTab("ask");
            setAskSeed(null);
          }}
        >
          <Icon name="chat" />
          <span className="lbl">Ask</span>
        </button>
      )}
      <button
        type="button"
        className="tb"
        title={settings.copyNumbers ? "Copy with verse numbers (⌘C)" : "Copy without verse numbers (⌘C)"}
        onClick={copy}
      >
        <Icon name="copy" />
        <span className="lbl">
          Copy<span style={{ opacity: 0.6 }}> ⌘C</span>
        </span>
      </button>
      <button
        type="button"
        className="tb"
        aria-pressed={settings.copyNumbers}
        title="Include verse numbers when copying"
        onClick={() => app.set({ copyNumbers: !settings.copyNumbers })}
        style={{
          padding: "0 7px",
          opacity: settings.copyNumbers ? 1 : 0.5,
          textDecoration: settings.copyNumbers ? undefined : "line-through",
        }}
      >
        #
      </button>
    </div>
  );

  const favs = (settings.favBibles ?? []).map((id) => app.mod("bible", id)).filter((m): m is NonNullable<typeof m> => !!m);
  // Apocrypha: a book of it, or a chapter a canonical book has only in some Bibles (Daniel 13, Susanna).
  const apo = isApocrypha(loc.book, loc.chapter);
  const apoName = apocryphaName(loc.book, loc.chapter);
  const pill = apo && <ApoPill title={apoName ? `${apoName}: Apocrypha, not in the Protestant canon` : undefined} />;
  // The chapter's name stays at the top of the column as it scrolls.
  const header = (
    <div
      className="readhead"
      style={{
        minHeight: 64,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: focus ? "24px 0 8px" : "4px 0",
      }}
    >
      {focus ? (
        <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <div className="label">
            {apoName ?? sectionOf(loc.book)} · {apo ? "Apocrypha" : testament(loc.book)}
          </div>
          <h1
            data-quiet-anchor
            style={{
              margin: 0,
              font: "400 46px/1 var(--display)",
              letterSpacing: "0.02em",
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <span>
              {book(loc.book).name} <span style={{ color: "var(--muted)" }}>{loc.chapter}</span>
            </span>
            {pill}
          </h1>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, minWidth: 0 }}>
            <h1 data-quiet-anchor style={{ margin: 0, font: "500 30px/1 var(--display)", whiteSpace: "nowrap" }}>
              {book(loc.book).name} {loc.chapter}
            </h1>
            {pill && <span style={{ alignSelf: "center" }}>{pill}</span>}
            <span style={{ color: "var(--muted)" }}>
              {bmod?.title ?? bible} · {verses.length} verses
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* The favourite translations from Settings, one click away (for this session, like the Bible picker). */}
            {favs.length > 0 && (
              <div className="seg" role="group" aria-label="Favourite translations">
                {favs.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={m.id === bible ? "on" : ""}
                    title={m.id === bible ? m.title : `Read in ${m.title}`}
                    onClick={() => app.openBible(m.id)}
                  >
                    {m.abbrev}
                  </button>
                ))}
              </div>
            )}
            <Seg
              value={settings.layout}
              options={[
                ["paragraph", "Paragraph"],
                ["verse", "Verse"],
              ]}
              onChange={(v) => app.set({ layout: v })}
            />
          </div>
        </>
      )}
    </div>
  );

  const dir = bmod?.rtl ? "rtl" : undefined;
  // A chapter, or the verse asked for, that this Bible doesn't have: say so, and why if it can be told.
  const loaded = loadedAt === `${bible}/${loc.book}/${loc.chapter}`;
  const place = `${book(loc.book).name} ${loc.chapter}`;
  const name = bmod?.title ?? bible;
  const other = app.defaultBible !== bible ? app.mod("bible", app.defaultBible) : undefined;
  const why =
    !books || books.has(loc.book)
      ? apo && loaded && !verses.length
        ? " It doesn't have the Apocrypha."
        : ""
      : loc.book > 66
        ? " It doesn't have the Apocrypha."
        : [...books].every((b) => b <= 39)
          ? " It has only the Old Testament."
          : [...books].every((b) => b >= 40 && b <= 66)
            ? " It has only the New Testament."
            : ` It doesn't include ${book(loc.book).name}.`;
  const noChapter = loaded && !verses.length && !err;
  const noVerse = loaded && !!verses.length && !!loc.verse && !verses.some((v) => v.v === loc.verse) && !variances.byVerse.has(loc.verse);
  const hint = (text: string) => (
    <div className="missing" role="status">
      <Icon name="info" />
      <span>{text}</span>
      {other && noChapter && (
        <button className="btn" type="button" onClick={() => app.set({ bible: other.id })}>
          Read it in {other.abbrev}
        </button>
      )}
    </div>
  );

  const body = noChapter ? (
    hint(`The ${name} has no ${place}.${why}`)
  ) : settings.layout === "verse" && !focus ? (
    <div className="verses" dir={dir}>
      {withMissing(verses, variances.byVerse).map((v) => {
        const variance = variances.byVerse.get(v.v);
        if (v.missing)
          return (
            <div key={v.v} className="v" style={{ cursor: "default" }}>
              <div className="vn" style={{ color: "var(--muted)" }}>
                <span>{v.v}</span>
              </div>
              <div className="vt" style={{ color: "var(--muted)", fontStyle: "italic" }}>
                Not in this translation.
              </div>
              <div className="gut">
                {variance && (
                  <VarianceButton v={variance} base={variances.base ?? "kjv"} onPick={(rect) => setVarPick({ v: variance, rect })} />
                )}
              </div>
            </div>
          );
        const k = vkey(loc.book, loc.chapter, v.v);
        const isSel = !!sel && v.v >= sel.from && v.v <= sel.to;
        const hl = app.highlights[k];
        const hasNote = settings.showNotes && notes.has(k);
        return (
          <div
            key={v.v}
            data-v={v.v}
            className={`v ${isSel ? "sel" : ""}`}
            style={isSel && sel!.from === v.v && toolbar ? { marginTop: 46 } : undefined}
            onClick={(e) => clickVerse(v.v, e)}
          >
            {isSel && sel!.from === v.v && toolbar}
            <div className="vn">
              <span title="Click the verse (not a word) to select it · ⇧-click for a range">{v.v}</span>
            </div>
            <div className="vt selectable">
              <span className={hl ? `hl-${hlName(hl)}` : undefined}>
                <VerseText
                  tokens={tokens.get(v.v) ?? []}
                  red={settings.redLetters}
                  speakingChar={reading && player.state.verse === v.v && settings.highlightWords ? player.state.char : undefined}
                  onWord={(t, el) => pickWord(t, v.v, el)}
                  activeWi={word?.verse === v.v ? word.token.wi : undefined}
                  showNums={!!bmod?.strongs}
                  variantFrom={variantSource(bmod?.info ?? "")}
                />
              </span>
            </div>
            <div className="gut">
              {isBookmarked(v.v) && <Icon name="bookmark" style={{ fill: "var(--accent)" }} />}
              {variance && (
                <VarianceButton v={variance} base={variances.base ?? "kjv"} onPick={(rect) => setVarPick({ v: variance, rect })} />
              )}
              {hasNote && (
                <button
                  className="ibtn"
                  style={{ width: 16, height: 16 }}
                  aria-label="Journal notes on this verse"
                  title="Journal notes on this verse"
                  onClick={(e) => {
                    e.stopPropagation();
                    setStudyVerse(v.v);
                    setTab("notes");
                  }}
                >
                  <Icon name="note" style={{ color: "var(--accent)" }} />
                </button>
              )}
              {reading && player.state.verse === v.v && <Icon name="speaker" />}
            </div>
          </div>
        );
      })}
    </div>
  ) : (
    <div style={{ position: "relative", paddingTop: sel && !focus ? 46 : 0 }}>
      {!focus && sel && (
        <div style={{ position: "sticky", top: 64, zIndex: 20, height: 0 }}>
          <div style={{ position: "relative", top: -44 }}>{toolbar}</div>
        </div>
      )}
      <p
        className="para selectable"
        dir={dir}
        style={{ margin: 0, fontSize: focus ? "calc(var(--read-size) + 2px)" : undefined, lineHeight: focus ? 1.85 : undefined }}
      >
        {verses.map((v) => {
          const k = vkey(loc.book, loc.chapter, v.v);
          const isSel = !!sel && v.v >= sel.from && v.v <= sel.to;
          const hl = app.highlights[k];
          return (
            <span key={v.v} data-v={v.v} className={`pv ${isSel ? "sel" : ""}`} onClick={(e) => clickVerse(v.v, e)}>
              <span className="vnum">{v.v}</span>
              <span className={hl ? `hl-${hlName(hl)}` : undefined}>
                <VerseText
                  tokens={tokens.get(v.v) ?? []}
                  red={settings.redLetters}
                  speakingChar={reading && player.state.verse === v.v && settings.highlightWords ? player.state.char : undefined}
                  onWord={(t, el) => pickWord(t, v.v, el)}
                  activeWi={word?.verse === v.v ? word.token.wi : undefined}
                  showNums={!!bmod?.strongs && !focus}
                  variantFrom={variantSource(bmod?.info ?? "")}
                />
              </span>{" "}
            </span>
          );
        })}
      </p>
    </div>
  );

  const wordRef: Ref | null = word ? { book: loc.book, chapter: loc.chapter, verse: word.verse } : null;

  return (
    <div className="main" style={{ minHeight: 0 }}>
      {focus ? (
        <header className="topbar drag" style={{ borderBottom: 0, paddingLeft: 84 }}>
          <button className="ibtn" type="button" aria-label="Previous chapter" title="Previous chapter (←)" onClick={() => go(-1)}>
            <Icon name="back" />
          </button>
          <div className="spacer" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>
            {book(loc.book).name} {loc.chapter} · {bmod?.title}
          </div>
          <button
            className={`ibtn ${player.state.on ? "on" : ""}`}
            type="button"
            aria-label="Listen"
            title="Listen (Space · ⌘P)"
            onClick={() => (player.state.on ? player.toggle() : player.play(bible, loc.book, loc.chapter))}
          >
            <Icon name="speaker" />
          </button>
          <HighlightsButton />
          <TextSizeButton />
          <button className="btn" type="button" onClick={() => setFocus(false)}>
            Exit focus<span className="kbd">esc</span>
          </button>
          <button className="ibtn" type="button" aria-label="Next chapter" title="Next chapter (→)" onClick={() => go(1)}>
            <Icon name="fwd" />
          </button>
        </header>
      ) : (
        <Topbar
          right={
            <div style={{ display: "flex", gap: 2 }}>
              <button
                className={`ibtn ${player.state.on ? "on" : ""}`}
                type="button"
                aria-label="Listen"
                title="Listen (Space · ⌘P)"
                onClick={() => (player.state.on ? player.toggle() : player.play(bible, loc.book, loc.chapter, sel?.from))}
              >
                <Icon name="speaker" />
              </button>
              <SongsButton about={fmtRef({ book: loc.book, chapter: loc.chapter })} />
              <HighlightsButton />
              <TextSizeButton />
              <button className="ibtn" type="button" aria-label="Focus mode" title="Focus mode (⌘.)" onClick={() => setFocus(true)}>
                <Icon name="focus" />
              </button>
              <button
                className={`ibtn ${settings.studyPane ? "on" : ""}`}
                type="button"
                aria-label="Study pane"
                title="Study pane (⌘\\)"
                onClick={() => app.set({ studyPane: !settings.studyPane })}
              >
                <Icon name="pane" />
              </button>
            </div>
          }
        >
          <RefButton onClick={() => setPicker(document.activeElement?.getBoundingClientRect() ?? new DOMRect(300, 40, 100, 20))} />
          <BibleSelect value={bible} onChange={(id) => app.set({ bible: id })} />
          {(() => {
            // Back to the default translation from Settings; there all along, greyed out when it's the one showing.
            const def = app.mod("bible", app.defaultBible);
            const here = bible === app.defaultBible;
            const tip = here
              ? `Reading your default translation${def ? `, ${def.abbrev}` : ""}`
              : `Back to your default translation${def ? `, ${def.abbrev}` : ""} (set in Settings)`;
            return (
              <button
                className="ibtn"
                type="button"
                aria-label={tip}
                title={tip}
                disabled={here || !def}
                style={{ opacity: here || !def ? 0.35 : 1 }}
                onClick={() => app.set({ bible: app.defaultBible })}
              >
                <Icon name="refresh" />
              </button>
            );
          })()}
          <BooksButton />
          <SearchField onOpen={openPalette} />
        </Topbar>
      )}
      <div
        style={{
          flexGrow: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: !focus && settings.studyPane ? "minmax(0,1fr) 520px" : "minmax(0,1fr)",
        }}
      >
        <div className="sidenav-wrap">
          <main
            ref={scroller}
            className="scroll readcol"
            style={{ position: "relative", padding: focus ? "0 10% 120px" : "0 40px 120px 36px" }}
            onClick={() => setSel(null)}
          >
            {header}
            {err ? (
              <div className="err" style={{ padding: 20 }}>
                {err}
              </div>
            ) : (
              <>
                {noVerse && hint(`The ${name} has no verse ${loc.verse} in ${place}.`)}
                {body}
              </>
            )}
          </main>
          <ChapterNav onGo={go} sizes={sizes} />
        </div>
        {!focus && settings.studyPane && (
          <StudyPane
            tab={tab}
            setTab={setTab}
            book={loc.book}
            chapter={loc.chapter}
            verse={studyVerse}
            selRef={selRef}
            verses={verses}
            follow={follow}
            setFollow={setFollow}
            dict={dict}
            setDict={setDict}
            askSeed={askSeed}
            clearAskSeed={() => setAskSeed(null)}
            commentary={commentary}
            setCommentary={setCommentary}
            onWord={(w, rect, v, where) => {
              setWord({ token: textToken(w), verse: v.verse ?? studyVerse, rect, where });
            }}
          />
        )}
      </div>
      <PlayerBar focus={focus} />
      {word && wordRef && (
        <WordLookup
          pick={word}
          vref={wordRef}
          context={word.where}
          bible={bible}
          onClose={() => setWord(null)}
          onDictionary={(module, topic, search) => {
            setDict({ module, topic, search });
            setTab("dictionary");
            setWord(null);
            if (!settings.studyPane) app.set({ studyPane: true });
          }}
          onCommentary={(m) => {
            setCommentary(m);
            setTab("commentary");
            setStudyVerse(word.verse);
            setWord(null);
            if (!settings.studyPane) app.set({ studyPane: true });
          }}
          onAsk={(q) => {
            setAskSeed(q);
            setTab("ask");
            setWord(null);
            if (focus) setFocus(false);
            if (!settings.studyPane) app.set({ studyPane: true });
          }}
        />
      )}
      {varPick && variances.base && (
        <VariancePopover
          v={varPick.v}
          anchor={varPick.rect}
          base={variances.base}
          module={bible}
          moduleTitle={bmod?.title ?? bible}
          text={verses.find((x) => x.v === varPick.v.verse)?.text ?? null}
          onClose={() => setVarPick(null)}
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
      {focus && (
        <div
          style={{
            position: "fixed",
            bottom: 18,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            gap: 18,
            color: "var(--muted)",
            fontSize: 12,
            pointerEvents: "none",
          }}
        >
          <span>Click any word to look it up</span>
          <span>·</span>
          <span>
            <span className="kbd">space</span> listen
          </span>
          <span>·</span>
          <span>
            <span className="kbd">←</span> <span className="kbd">→</span> chapters
          </span>
        </div>
      )}
    </div>
  );
}

/** Previous and next chapter, at the sides of the reading column. */
function ChapterNav({ onGo, sizes }: { onGo: (d: 1 | -1) => void; sizes: BookSizes | null }) {
  const { loc } = useApp();
  const p = stepChapter(loc.book, loc.chapter, -1, sizes),
    n = stepChapter(loc.book, loc.chapter, 1, sizes);
  return (
    <SideNav
      prev={p && { label: `Previous chapter: ${book(p[0]).name} ${p[1]} (←)`, go: () => onGo(-1) }}
      next={n && { label: `Next chapter: ${book(n[0]).name} ${n[1]} (→)`, go: () => onGo(1) }}
    />
  );
}

/** Shows or hides highlights in the readers and the journal; highlighting something shows them again. */
export function HighlightsButton() {
  const app = useApp();
  const on = app.settings.showHighlights !== false;
  return (
    <button
      className={`ibtn ${on ? "on" : ""}`}
      type="button"
      aria-label="Show highlights"
      aria-pressed={on}
      title={on ? "Hide highlights" : "Show highlights"}
      onClick={() => app.set({ showHighlights: !on })}
    >
      <Icon name="highlight" />
    </button>
  );
}

export function TextSizeButton() {
  const app = useApp();
  const [a, setA] = useState<DOMRect | null>(null);
  return (
    <>
      <button
        className="ibtn"
        type="button"
        aria-label="Text size"
        title="Reading font and text size"
        onClick={(e) => setA(e.currentTarget.getBoundingClientRect())}
      >
        <Icon name="textsize" />
      </button>
      {a && (
        <Popover anchor={a} onClose={() => setA(null)} width={260}>
          <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="label">Text size · {app.settings.readSize}px</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12 }}>A</span>
              <input
                type="range"
                min={14}
                max={28}
                value={app.settings.readSize}
                onChange={(e) => app.set({ readSize: +e.target.value })}
                style={{ flexGrow: 1 }}
                aria-label="Text size"
              />
              <span style={{ fontSize: 18 }}>A</span>
            </div>
            <label className="opt">
              <input type="checkbox" checked={app.settings.redLetters} onChange={(e) => app.set({ redLetters: e.target.checked })} />
              Words of Jesus in red
            </label>
          </div>
        </Popover>
      )}
    </>
  );
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

/** The player floats over the reading column: clear of the sidebar and the study pane. */
export function PlayerBar({ focus = false }: { focus?: boolean }) {
  const app = useApp();
  const p = usePlayer();
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const [sleepMenu, setSleepMenu] = useState<DOMRect | null>(null);
  const drag = useDrag(p.state.on);
  // Tick while a sleep timer runs, so the countdown stays current.
  const [, tick] = useState(0);
  // Esc closes the player, once nothing nearer has used it: a menu, the palette, a search box, focus mode.
  useEffect(() => {
    if (!p.state.on) return;
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || focus || menu || sleepMenu) return;
      if ((e.target as HTMLElement)?.closest?.("input, textarea, select, [contenteditable='true']")) return;
      p.stop();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [p, focus, menu, sleepMenu]);
  useEffect(() => {
    if (!p.state.sleepAt) return;
    const t = window.setInterval(() => tick((x) => x + 1), 15000);
    return () => window.clearInterval(t);
  }, [p.state.sleepAt]);
  if (!p.state.on) return null;
  const s = p.state;
  // Through the chapter by verse, and through the verse by the word being read.
  // Space plays and pauses in the readers, and in the journal while it's reading (it can't be edited then).
  const space = app.screen === "read" || (app.screen === "journal" && s.doc?.module === "journal");
  const pct = s.count ? Math.min(100, ((s.verse - 1 + (s.char > 0 && s.len ? Math.min(1, s.char / s.len) : 0)) / s.count) * 100) : 0;
  const minsLeft = s.sleepAt ? Math.max(1, Math.ceil((s.sleepAt - Date.now()) / 60000)) : 0;
  const sleepLabel = s.sleepAt ? `${minsLeft} min` : s.sleepEndOfChapter ? "end of ch." : "";
  const SLEEP: [number | "chapter" | null, string][] = [
    [15, "In 15 minutes"],
    [30, "In 30 minutes"],
    [60, "In an hour"],
    ["chapter", "At the end of this chapter"],
    [null, "Off"],
  ];
  return (
    <div
      role="region"
      aria-label="Listen"
      style={{
        position: "fixed",
        left: focus ? 0 : 200,
        right: app.screen === "read" && !focus && app.settings.studyPane ? 520 : 0,
        bottom: 18,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 40,
      }}
    >
      <div
        {...drag.bind}
        style={{
          ...drag.style,
          pointerEvents: "auto",
          width: "min(600px, calc(100% - 48px))",
          height: 56,
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "0 10px 0 8px",
          borderRadius: 28,
          background: "var(--panel)",
          border: "1px solid var(--border)",
          boxShadow: "0 10px 30px var(--shadow)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <button
            className="ibtn"
            type="button"
            aria-label={s.doc ? "Previous paragraph" : "Previous verse"}
            title={`${s.doc ? "Previous paragraph" : "Previous verse"} · F7: previous ${s.doc?.module === "journal" ? "entry" : "chapter"}`}
            onClick={() => p.skip(-1)}
          >
            <Icon name="prev" />
          </button>
          <button
            type="button"
            aria-label={s.paused ? "Play" : "Pause"}
            title={`${s.paused ? "Play" : "Pause"} (${space ? "Space · " : ""}⌘P)`}
            onClick={p.toggle}
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              border: 0,
              background: "var(--accent)",
              color: "var(--onaccent)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            {s.paused ? <Play /> : <Pause />}
          </button>
          <button
            className="ibtn"
            type="button"
            aria-label={s.doc ? "Next paragraph" : "Next verse"}
            title={`${s.doc ? "Next paragraph" : "Next verse"} · F9: next ${s.doc?.module === "journal" ? "entry" : "chapter"}`}
            onClick={() => p.skip(1)}
          >
            <Icon name="next" />
          </button>
        </div>
        <button
          type="button"
          title={
            s.doc?.module === "journal"
              ? "Show this entry"
              : s.doc
                ? `Open ${s.doc.title}`
                : `Go to ${book(s.book).name} ${s.chapter}:${s.verse}`
          }
          onClick={() =>
            s.doc?.module === "journal"
              ? app.startEntry({ openId: s.doc.id })
              : s.doc?.url
                ? app.openWebDoc(s.doc.module, s.doc.url, s.doc.title)
                : s.doc
                  ? app.openDoc(s.doc.module, s.doc.title, s.doc.kind)
                  : app.open({ book: s.book, chapter: s.chapter, verse: s.verse }, "read")
          }
          style={{
            flexGrow: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 7,
            border: 0,
            background: "transparent",
            cursor: "pointer",
            textAlign: "left",
            padding: 0,
          }}
        >
          <span style={{ display: "flex", alignItems: "baseline", gap: 8, whiteSpace: "nowrap", width: "100%" }}>
            {s.doc ? (
              <>
                <b style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis" }}>{s.doc.title}</b>
                <span className="n" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                  {app.mod(s.doc.kind ?? "reference", s.doc.module)?.abbrev}
                </span>
              </>
            ) : (
              <>
                <b style={{ fontSize: 13 }}>
                  {book(s.book).name} {s.chapter}:{s.verse}
                </b>
                {isApocrypha(s.book, s.chapter) && <ApoPill small />}
                <span className="n">{app.mod("bible", s.bible)?.abbrev}</span>
              </>
            )}
            <span className="n" style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>
              {s.verse} of {s.count}
            </span>
          </span>
          <span style={{ position: "relative", height: 3, borderRadius: 999, background: "var(--border)", width: "100%" }}>
            <span
              style={{ position: "absolute", left: 0, top: 0, width: `${pct}%`, height: 3, borderRadius: 999, background: "var(--accent)" }}
            />
            <span
              style={{
                position: "absolute",
                left: `${pct}%`,
                top: -3,
                width: 9,
                height: 9,
                marginLeft: -4,
                borderRadius: "50%",
                background: "var(--accent)",
              }}
            />
          </span>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <button
            type="button"
            aria-label="Speed and voice"
            title="Speed and voice"
            onClick={(e) => setMenu(e.currentTarget.getBoundingClientRect())}
            style={{
              height: 28,
              padding: "0 10px",
              borderRadius: 999,
              border: 0,
              background: "var(--accentsoft)",
              color: "var(--accent)",
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
              cursor: "pointer",
            }}
          >
            {app.settings.rate}×
          </button>
          <button
            className={`ibtn ${sleepLabel ? "on" : ""}`}
            type="button"
            aria-label={sleepLabel ? `Sleep timer: ${sleepLabel}` : "Sleep timer"}
            title={sleepLabel ? `Stops ${s.sleepAt ? "in " + sleepLabel : "at the end of the chapter"}` : "Sleep timer"}
            onClick={(e) => setSleepMenu(e.currentTarget.getBoundingClientRect())}
            style={
              sleepLabel
                ? { width: "auto", padding: "0 8px", gap: 5, fontSize: 11.5, fontWeight: 600, fontVariantNumeric: "tabular-nums" }
                : undefined
            }
          >
            <Icon name="moon" />
            {sleepLabel}
          </button>
          <button className="ibtn" type="button" aria-label="Stop and close" title="Stop and close (Esc)" onClick={p.stop}>
            <Icon name="x" />
          </button>
        </div>
      </div>
      {menu && (
        <Popover anchor={menu} onClose={() => setMenu(null)} width={300} place="above" style={{ pointerEvents: "auto" }}>
          <div style={{ padding: "14px 16px 12px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="label">Speed</span>
                <b>{app.settings.rate}×</b>
              </div>
              <div className="seg" style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))" }}>
                {SPEEDS.map((r) => (
                  <button key={r} type="button" className={app.settings.rate === r ? "on" : ""} onClick={() => app.set({ rate: r })}>
                    {r}
                  </button>
                ))}
              </div>
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.05}
                value={app.settings.rate}
                onChange={(e) => app.set({ rate: Math.round(+e.target.value * 100) / 100 })}
                aria-label="Fine speed"
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="label">Voice</span>
              <VoiceSelect />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
              {s.doc?.module === "journal" ? (
                <label className="opt">
                  <input
                    type="checkbox"
                    checked={app.settings.continueEntry}
                    onChange={(e) => app.set({ continueEntry: e.target.checked })}
                  />
                  Continue into the next entry
                </label>
              ) : (
                <label className="opt">
                  <input
                    type="checkbox"
                    checked={app.settings.continueChapter}
                    onChange={(e) => app.set({ continueChapter: e.target.checked })}
                  />
                  Continue into the next chapter
                </label>
              )}
              <label className="opt">
                <input type="checkbox" checked={app.settings.readNumbers} onChange={(e) => app.set({ readNumbers: e.target.checked })} />
                Read verse numbers aloud
              </label>
            </div>
          </div>
        </Popover>
      )}
      {sleepMenu && (
        <Popover anchor={sleepMenu} onClose={() => setSleepMenu(null)} width={250} place="above" style={{ pointerEvents: "auto" }}>
          <div style={{ padding: 6, display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "6px 10px 6px", display: "flex", flexDirection: "column", gap: 2 }}>
              <span className="label">Sleep timer</span>
              <span className="hint">
                {s.sleepAt
                  ? `Stops in ${minsLeft} minute${minsLeft === 1 ? "" : "s"}, at the end of the verse it is reading.`
                  : s.sleepEndOfChapter
                    ? `Stops at the end of ${book(s.book).name} ${s.chapter}.`
                    : "Off. Reading carries on until you stop it."}
              </span>
            </div>
            {SLEEP.map(([m, l]) => {
              const on = s.sleepChoice === m;
              return (
                <button
                  key={String(m)}
                  type="button"
                  className="bm"
                  aria-pressed={on}
                  style={{
                    minHeight: 30,
                    background: on ? "var(--accentsoft)" : undefined,
                    color: on ? "var(--accent)" : undefined,
                    fontWeight: on ? 600 : undefined,
                  }}
                  onClick={() => {
                    p.sleep(m);
                    setSleepMenu(null);
                    app.toast(
                      m === null
                        ? "Sleep timer off"
                        : m === "chapter"
                          ? `Stops at the end of ${book(s.book).name} ${s.chapter}`
                          : `Stops in ${m} minutes`,
                    );
                  }}
                >
                  <span className="t">{l}</span>
                  {on && (
                    <span className="r">
                      <Icon name="check" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </Popover>
      )}
    </div>
  );
}

/** The reading voice, or with `lang` the voice for Bibles in Hebrew ("he") or Greek ("el"), whose
 *  first choice, Automatic, is the best one installed. */
export function VoiceSelect({ lang }: { lang?: "he" | "el" | "la" } = {}) {
  const app = useApp();
  const { voices: english, allVoices } = usePlayer();
  const key = lang === "he" ? "voiceHebrew" : lang === "el" ? "voiceGreek" : lang === "la" ? "voiceLatin" : "voice";
  // Latin has no voices of its own: an Italian one says Church Latin as it's said.
  const voices = lang
    ? rankVoices(allVoices.filter((v) => v.lang.startsWith(lang === "la" ? "it" : lang) || (lang === "la" && v.lang.startsWith("la"))))
    : english;
  const want = app.settings[key];
  const label = (v: Voice) =>
    `${v.name} · ${new Intl.DisplayNames(["en"], { type: "language" }).of(v.lang) ?? v.lang}${v.quality > 1 && !v.name.includes("(") ? (v.quality > 2 ? " (Premium)" : " (Enhanced)") : ""}`;
  const cur = lang
    ? voices.find((v) => v.id === want)
    : (voices.find((v) => v.id === want) ?? voices.find((v) => v.name === want) ?? voices.find((v) => v.default) ?? voices[0]);
  const shown = cur
    ? label(cur)
    : lang
      ? voices[0]
        ? `Automatic (${voices[0].name})`
        : "None installed: the reading voice"
      : "System voice";
  return (
    <label className="btn" style={{ position: "relative", justifyContent: "space-between", width: "100%" }}>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{shown}</span>
      <Icon name="down" className="sm" style={{ color: "var(--muted)" }} />
      <select
        aria-label={lang === "he" ? "Hebrew voice" : lang === "el" ? "Greek voice" : lang === "la" ? "Latin voice" : "Voice"}
        value={cur?.id ?? ""}
        onChange={(e) => app.set({ [key]: e.target.value })}
        style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
      >
        {lang && <option value="">{voices[0] ? `Automatic (${voices[0].name})` : "None installed: the reading voice"}</option>}
        {voices.map((v) => (
          <option key={v.id} value={v.id}>
            {label(v)}
          </option>
        ))}
      </select>
    </label>
  );
}
