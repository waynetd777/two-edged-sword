// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { CSSProperties, Fragment, TouchEvent, useEffect, useMemo, useRef, useState } from "react";
import { book, BookSizes, fmtRef, parseRef, Ref, stepChapter } from "../../src/bible";
import { alignStrongs, tokenize, Token } from "../../src/esword";
import { api, Module, save, saved, scene, useLibraryKey, Verse } from "./api";
import { Icon } from "./icons";
import { COMPARE_DEFAULT, CompareEdit, CompareView, useChapters } from "./Compare";
import { bookTitles, DocView, isDevotional, setDevotionals, todayTitle } from "./DocView";
import { GoTo } from "./GoTo";
import { bookmarks, useBookmarks } from "./bookmarks";
import { HL_COLORS, HL_DOT, highlights, useHighlights, vkey } from "./highlights";
import { player, usePlayer } from "./player";
import { ImageViewer } from "./ImageViewer";
import type { Spot } from "./MapsTab";
import { history } from "./history";
import { NavButtons } from "./NavButtons";
import { WordSheet } from "./WordSheet";
import type { Jump } from "./Search";
import { Study } from "./Study";
import { entriesOn, useJournal } from "./journal";
import { newEntry, VerseNotes } from "./JournalEdit";

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
  const lib = useLibraryKey();
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
  }, [bible, l.book, l.chapter, lib]); // eslint-disable-line react-hooks/exhaustive-deps -- l's fields, not the object made anew each render
  return [verses.vs, verses.key];
}

function Words({
  tokens,
  nums,
  active,
  onWord,
  said,
}: {
  /** The word being read aloud: its offset in the verse's text. */
  said?: number;
  tokens: Token[];
  nums: boolean;
  /** The token whose word sheet is open. */
  active?: number;
  onWord: (i: number, num?: string) => void;
}) {
  // An interlinear Bible: each original word over its English and Strong's number, as the desktop's.
  if (tokens.some((t) => t.gloss !== undefined)) {
    const boxed = (t?: Token) => !!t?.word && (t.gloss !== undefined || t.strongs.length > 0);
    // Punctuation straight after a word goes in its box, or the box's margin puts a space before it.
    const trailing = (i: number) =>
      !tokens[i].word && !tokens[i].note && /^[^\s\p{L}\p{N}]+$/u.test(tokens[i].text) && boxed(tokens[i - 1]) ? tokens[i].text : "";
    return (
      <>
        {tokens.map((t, i) => {
          if (t.note || trailing(i)) return null;
          if (!boxed(t))
            return t.text.trim() ? (
              <span key={i} className="il-p">
                {t.text}
              </span>
            ) : (
              <Fragment key={i}> </Fragment>
            );
          const reading = said !== undefined && said >= t.at && said < t.at + t.text.length;
          return (
            <span
              key={i}
              className="il"
              onClick={(e) => {
                e.stopPropagation();
                onWord(i);
              }}
            >
              <span className={["w", i === active ? "on" : "", reading ? "said" : ""].join(" ").trim()}>
                {t.text}
                {i + 1 < tokens.length ? trailing(i + 1) : ""}
              </span>
              <span className="il-g">{t.gloss ?? "\u00a0"}</span>
              {nums && (
                <span className="il-n">
                  {t.strongs.length
                    ? t.strongs.map((n, k) => (
                        <Fragment key={n}>
                          {k ? " " : ""}
                          <span
                            className="sn"
                            onClick={(e) => {
                              e.stopPropagation();
                              onWord(i, n);
                            }}
                          >
                            {n}
                          </span>
                        </Fragment>
                      ))
                    : "\u00a0"}
                </span>
              )}
            </span>
          );
        })}
      </>
    );
  }
  return (
    <>
      {tokens.map((t, i) => {
        if (t.note) return null;
        const tagged = t.word;
        const reading = said !== undefined && t.word && said >= t.at && said < t.at + t.text.length;
        const cls = [t.red ? "red" : "", tagged ? "w" : "", i === active ? "on" : "", reading ? "said" : ""].join(" ").trim() || undefined;
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

/** An iPad in landscape: wide enough for the study pane beside the text. */
const WIDE = "(orientation: landscape) and (min-width: 900px)";
function useWide(force: boolean) {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches);
  useEffect(() => {
    const m = window.matchMedia(WIDE);
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide || force;
}

export function Read({
  modules,
  jump,
  onWordStudy,
  onLibrary,
  onModulesChanged,
}: {
  onLibrary: () => void;
  onModulesChanged: () => void;
  modules: Module[];
  jump: (Jump & { n: number }) | null;
  onWordStudy: (num: string) => void;
}) {
  const bibles = modules.filter((m) => m.kind === "bible");
  const [bible, setBible] = useState<string>(() => saved("bible", "kjv+"));
  const [loc, setLoc] = useState<Loc>(() => saved("loc", { book: 62, chapter: 1 }));
  const [layout, setLayout] = useState<Layout>(() => saved("layout", "verse"));
  const [sel, setSel] = useState<number>(() => saved("verse", 1));
  const [study, setStudy] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [sizes, setSizes] = useState<BookSizes | null>(null);
  const locNow = useRef(loc);
  locNow.current = loc;
  const libKey = useLibraryKey();
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [going, setGoing] = useState(false);
  /** A tapped word: in the chapter, or (bible) in one of Compare's translations. */
  const [word, setWord] = useState<{ v: number; i: number; num?: string; bible?: string } | null>(null);
  const [comparing, setComparing] = useState(false);
  // An empty list (saved by an older build that let every Bible be unticked) is the default again.
  const savedCompare = () => {
    const ids = saved<string[]>("compare", COMPARE_DEFAULT);
    return ids.length ? ids : COMPARE_DEFAULT;
  };
  const [cmpIds, setCmpIds] = useState<string[]>(savedCompare);
  /** Compare's columns when KJV History set a pair ("kjv,asv"), not the saved ones; "" otherwise. */
  const [pair, setPair] = useState("");
  const [diff, setDiff] = useState<boolean>(() => saved("compareDiff", true));
  const [editing, setEditing] = useState(false);
  const [wideScene, setWideScene] = useState(false);
  /** A book open instead of the Bible. */
  const [doc, setDoc] = useState<{ module: string; chapter: string } | null>(() => saved("doc", null));
  const [image, setImage] = useState<{ src: string; ring?: Spot[]; spots?: Spot[] } | null>(null);
  const [docList, setDocList] = useState<string[]>([]);
  const [goBooks, setGoBooks] = useState(false);
  const bookMods = modules.filter((m) => m.kind === "reference" || m.kind === "devotional");
  setDevotionals(modules.filter((m) => m.kind === "devotional").map((m) => m.id));
  const docMod = doc ? bookMods.find((m) => m.id === doc.module) : undefined;
  useEffect(() => {
    save("doc", doc);
    // Where each book was left, for opening it again from the Library.
    if (doc && saved<string | null>(`docAt.${doc.module}`, null) !== doc.chapter) {
      save(`docAt.${doc.module}`, doc.chapter);
      window.dispatchEvent(new Event("tes-docat")); // synced (phoneSync.ts)
    }
  }, [doc]);
  useEffect(() => {
    let live = true;
    setDocList([]);
    if (doc)
      bookTitles(doc.module)
        .then((t) => live && setDocList(t))
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [doc?.module]); // eslint-disable-line react-hooks/exhaustive-deps
  const docKey = (d: { module: string; chapter: string } | null) => (d ? `${d.module}|${d.chapter}` : "");
  const pl = usePlayer();
  const bm = useBookmarks();
  const hls = useHighlights();
  /** The highlighter's colours, open above the study bar for the verse it names. */
  const [hlOpen, setHlOpenRaw] = useState(false);
  /** The verse's journal entries, open in the same place. One of the two at a time. */
  const [notesOpen, setNotesOpenRaw] = useState(false);
  const setHlOpen = (o: boolean) => {
    setHlOpenRaw(o);
    if (o) setNotesOpenRaw(false);
  };
  const setNotesOpen = (o: boolean) => {
    setNotesOpenRaw(o);
    if (o) setHlOpenRaw(false);
  };
  useEffect(() => {
    setHlOpenRaw(false);
    setNotesOpenRaw(false);
  }, [sel, loc.book, loc.chapter]);
  const marked = (v: number) => bm.has({ ref: { book: loc.book, chapter: loc.chapter, verse: v }, bible });
  // The chapter's verses that journal entries are on, for their note marks.
  const jes = useJournal();
  const onChapter = useMemo(() => entriesOn(jes, { book: loc.book, chapter: loc.chapter }), [jes, loc.book, loc.chapter]);
  const noted = (v: number) => onChapter.length > 0 && entriesOn(onChapter, { book: loc.book, chapter: loc.chapter, verse: v }).length > 0;
  // Recent: each chapter read, once.
  useEffect(() => {
    if (doc) bookmarks.visited({ doc: { ...doc, title: docMod?.title ?? doc.module } });
    else bookmarks.visited({ ref: { book: loc.book, chapter: loc.chapter, verse: sel }, bible });
  }, [loc.book, loc.chapter, doc?.module, doc?.chapter]); // eslint-disable-line react-hooks/exhaustive-deps
  const playingHere = pl.on && !pl.doc && pl.bible === bible && pl.book === loc.book && pl.chapter === loc.chapter && !doc;
  const readingDoc = pl.on && pl.doc && doc && pl.doc.module === doc.module && pl.doc.chapter === doc.chapter ? pl.verse : undefined;
  const docked = useWide(wideScene);
  const [wordScene, setWordScene] = useState(false);
  /** A verse to bring into view once its chapter has drawn. */
  const [scrollTo, setScrollTo] = useState<number | null>(null);
  /** Back and forward, as on the desktop: every move is a step, and a step back returns to how far down the page was. */
  const [restore, setRestore] = useState<{ key: string; top: number } | null>(null);
  const page = useRef<HTMLDivElement>(null);
  const [verses, versesOf] = useChapter(bible, loc);
  const bmod = bibles.find((b) => b.id === bible);
  // A Bible without Strong's numbers borrows them from its Strong's edition when it has one
  // (the KJV from the KJV+), as on the desktop: the words line up one for one.
  const strongEdition = !bmod?.strongs && bibles.some((b) => b.id === `${bible}+`) ? `${bible}+` : "";
  const [strongVerses, strongOf] = useChapter(strongEdition || bible, loc);
  const tokens = useMemo(() => {
    const borrowed = strongEdition && strongOf === versesOf ? new Map(strongVerses.map((v) => [v.v, v.text])) : null;
    return new Map(
      verses.map((v) => {
        const t = tokenize(v.text);
        const s = borrowed?.get(v.v);
        return [v.v, s ? alignStrongs(t, tokenize(s)) : t];
      }),
    );
  }, [verses, strongVerses, strongEdition, strongOf, versesOf]);
  /** The Strong's Bible to guess a word's number from, in a Bible that has none of its own. */
  const guessFrom = bibles.find((b) => b.strongs && b.id.startsWith("kjv"))?.id ?? bibles.find((b) => b.strongs)?.id;
  // ...and its text of this chapter, so a word can first be looked for in the same verse there.
  const [guessVerses, guessOf] = useChapter(!bmod?.strongs && guessFrom ? guessFrom : bible, loc);

  // ---- Compare ----
  useEffect(() => save("compareDiff", diff), [diff]);
  const shownIds = cmpIds.filter((id) => bibles.some((b) => b.id === id));
  const cmpChapters = useChapters(comparing ? [...new Set([...shownIds, ...(guessFrom ? [guessFrom] : [])])] : [], loc);
  /** A Bible's tokens for the selected verse in Compare, the KJV's with the KJV+'s numbers. */
  const cmpTokens = useMemo(() => {
    const out = new Map<string, Token[]>();
    for (const id of shownIds) {
      const vs = cmpChapters.get(id);
      if (!vs?.length) continue;
      const v = vs.find((x) => x.v === sel);
      const t = v ? tokenize(v.text) : [];
      const strong = cmpChapters.get(`${id}+`)?.find((x) => x.v === sel);
      out.set(id, strong && v ? alignStrongs(t, tokenize(strong.text)) : t);
    }
    return out;
  }, [cmpChapters, sel, shownIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scene.then((sc) => {
      if (sc.includes("verse")) setLayout("verse");
      if (sc.includes("study")) setStudy(true);
      if (sc.includes("goto")) {
        setGoBooks(sc.some((x) => x.startsWith("doc=")));
        setGoing(true);
      }
      if (sc.includes("compare")) setComparing(true);
      // hldemo: John 3:1–8 highlighted in the eight colours, in order (the Simulator's own highlights).
      // hldemo2: the last four colours on verses 1–4, to see them without scrolling.
      if (sc.includes("hldemo2")) HL_COLORS.slice(4).forEach((c, i) => highlights.set(vkey(43, 3, i + 1), c));
      else if (sc.includes("hldemo")) HL_COLORS.forEach((c, i) => highlights.set(vkey(43, 3, i + 1), c));
      // hlopen: the highlighter's colours open.
      if (sc.includes("hlopen")) setTimeout(() => setHlOpen(true), 1500);
      // Debug: Compare's › a few seconds into reading.
      if (sc.includes("stepnext")) setTimeout(() => document.querySelector<HTMLButtonElement>('[aria-label="Next verse"]')?.click(), 7000);
      // Debug: hop to the next chapter a few seconds into reading, as a swipe would.
      if (sc.includes("hop"))
        setTimeout(() => {
          const l = saved("loc", { book: 62, chapter: 1 });
          visit({ book: l.book, chapter: l.chapter + 1 }, 1);
        }, 7000);
      if (sc.includes("listendoc"))
        setTimeout(() => {
          const d = saved<{ module: string; chapter: string } | null>("doc", null);
          if (d) player.playDoc({ ...d, title: d.module });
        }, 2000);
      if (sc.includes("mark"))
        setTimeout(() => {
          const l = saved("loc", { book: 62, chapter: 1 });
          bookmarks.toggle({ ref: { book: l.book, chapter: l.chapter, verse: saved("verse", 1) }, bible: saved("bible", "kjv+") });
        }, 800);
      if (sc.includes("listen"))
        setTimeout(
          () =>
            player.play(
              saved("bible", "kjv+"),
              saved("loc", { book: 62, chapter: 1 }).book,
              saved("loc", { book: 62, chapter: 1 }).chapter,
              1,
            ),
          1500,
        );
      if (sc.includes("wide")) setWideScene(true);
      const r = sc.find((x) => x.startsWith("at="));
      const ref = r ? parseRef(r.slice(3)) : undefined;
      if (ref) {
        setDoc(null);
        setLoc({ book: ref.book, chapter: ref.chapter });
        setSel(ref.verse ?? 1);
      }
      const d = sc.find((x) => x.startsWith("doc="))?.slice(4);
      if (d) {
        const [m, c] = d.split("|");
        if (c) setDoc({ module: m, chapter: c });
        else bookTitles(m).then((t) => t[0] && setDoc({ module: m, chapter: t[0] }));
      }
      if (sc.includes("image"))
        setTimeout(() => {
          const img = page.current?.querySelector("img.zoomable") as HTMLImageElement | null;
          if (img) setImage({ src: img.src });
        }, 2500);
      if (sc.includes("word")) setWordScene(true);
      const b = sc.find((x) => x.startsWith("bible="));
      if (b) setBible(b.slice(6));
      if (sc.includes("end")) setTimeout(() => page.current?.scrollTo(0, page.current.scrollHeight), 400);
    });
  }, []);
  useEffect(() => save("bible", bible), [bible]);
  // Android: the Bibles in the app couldn't be copied out of it (the phone full, say). Said in place of
  // "Opening…", which would otherwise wait for ever.
  const [bundledError, setBundledError] = useState<string | null>(null);
  useEffect(() => {
    const on = (e: Event) => setBundledError(String((e as CustomEvent).detail ?? "unknown error"));
    window.addEventListener("tes-bundled-error", on);
    return () => window.removeEventListener("tes-bundled-error", on);
  }, []);
  // A Bible that isn't here (removed, or saved on another phone): the KJV+, the KJV or the first there is,
  // once the library's list is in, rather than a blank page. (Android lists the bundled modules only once
  // they're copied out of the APK: until then the list isn't the whole library.)
  useEffect(() => {
    if (!bibles.length || bibles.some((b) => b.id === bible) || !modules.some((m) => m.source === "bundled")) return;
    setBible((["kjv+", "kjv"].find((id) => bibles.some((b) => b.id === id)) ?? bibles[0].id) as string);
  }, [modules.map((m) => m.id).join("|"), bible]); // eslint-disable-line react-hooks/exhaustive-deps -- the ids, not the array made anew each render
  useEffect(() => save("loc", loc), [loc]);
  useEffect(() => save("layout", layout), [layout]);
  useEffect(() => save("verse", sel), [sel]);
  useEffect(() => {
    // Only the Bible still chosen: a slow answer for the one before it is dropped.
    let live = true;
    api
      .chapterSizes(bible)
      .then((rows) => {
        if (!live) return;
        const m: BookSizes = new Map();
        const n = new Map<string, number>();
        for (const [b, c, v] of rows) {
          m.set(b, Math.max(m.get(b) ?? 0, c));
          n.set(`${b}.${c}`, v);
        }
        setSizes(m);
        setCounts(n);
        // A Bible without this book (an Old or New Testament alone): open it where it starts, in place
        // of an empty chapter, without a step back to it (as the desktop does).
        if (m.size && !m.has(locNow.current.book)) {
          setLoc({ book: Math.min(...m.keys()), chapter: 1 });
          setSel(1);
        }
      })
      .catch(() => live && setSizes(null));
    return () => {
      live = false;
    };
  }, [bible, libKey]);

  // Back and forward are the app's (history.ts): Read's moves are steps in it, and a step back
  // here puts the passage, the verse, Compare and the scroll back.
  const live = useRef({ loc, sel, comparing, doc, bible, pair });
  live.current = { loc, sel, comparing, doc, bible, pair };
  useEffect(() => {
    history.start({
      tab: "read",
      book: loc.book,
      chapter: loc.chapter,
      verse: sel,
      comparing,
      word: "",
      doc: docKey(doc),
      top: 0,
      bible,
      compare: "",
    });
    history.setSnapshot(() => ({
      book: live.current.loc.book,
      chapter: live.current.loc.chapter,
      verse: live.current.sel,
      comparing: live.current.comparing,
      doc: docKey(live.current.doc),
      top: page.current?.scrollTop ?? 0,
      bible: live.current.bible,
      compare: live.current.pair,
    }));
    return history.onRestore((p) => {
      setWord(null);
      setStudy(false);
      if (p.bible) setBible(p.bible);
      // A pair from KJV History there, or the saved columns.
      setPair(p.compare);
      setCmpIds(p.compare ? p.compare.split(",") : savedCompare());
      setLoc({ book: p.book, chapter: p.chapter });
      setSel(p.verse);
      setComparing(p.comparing);
      const [m, ...c] = p.doc ? p.doc.split("|") : [];
      setDoc(m ? { module: m, chapter: c.join("|") } : null);
      setRestore({ key: `${p.book}.${p.chapter}`, top: p.top });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Moves to `to`, as a new step in the history. */
  const visit = (to: Loc, verse: number) => {
    history.push({ tab: "read", book: to.book, chapter: to.chapter, verse, doc: "" });
    setDoc(null);
    setLoc(to);
    setSel(verse);
  };
  useEffect(() => {
    if (restore?.key === "doc") {
      page.current?.scrollTo(0, 0);
      setRestore(null);
      return;
    }
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
  /** A book's chapter, as a new step. */
  const openDoc = (module: string, chapter: string) => {
    const d = { module, chapter };
    history.push({ tab: "read", doc: docKey(d) });
    setGoing(false);
    setWord(null);
    setComparing(false);
    setDoc(d);
    setRestore({ key: "doc", top: 0 });
  };
  const go = (to: Loc, d: 1 | -1 = 1) => slide(d, () => visit(to, 1));
  /** Slides the page out, does `act` (the next chapter), and slides the new one in. */
  const slide = (d: 1 | -1, act: () => void) => {
    const w = page.current?.clientWidth ?? 390;
    setAnim(true);
    setDx(-d * w);
    setTimeout(() => {
      act();
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
  // A tap that stops the page still moving after a flick, or a touch that drags a little or scrolls the
  // page, isn't a tap on a word: Android sends a click for these, which made scrolling open words.
  const scrolledAt = useRef(0);
  const tapOk = useRef({ x: 0, y: 0, stillAt: true, scroll: 0, at: 0 });
  const onScrollPage = () => {
    scrolledAt.current = Date.now();
  };
  const onStart = (e: TouchEvent) => {
    const t = e.touches[0];
    tapOk.current = {
      x: t.clientX,
      y: t.clientY,
      stillAt: Date.now() - scrolledAt.current > 400,
      scroll: page.current?.scrollTop ?? 0,
      at: Date.now(),
    };
    // Away from the edges: Android's back gesture lives there.
    if (t.clientX < 24 || t.clientX > window.innerWidth - 24) return;
    touch.current = { x: t.clientX, y: t.clientY, dx: 0, horiz: null };
    setAnim(false);
  };
  const onMove = (e: TouchEvent) => {
    const m = e.touches[0];
    if (Math.hypot(m.clientX - tapOk.current.x, m.clientY - tapOk.current.y) > 4) tapOk.current.stillAt = false;
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
    const di = doc ? docList.indexOf(doc.chapter) : -1;
    if (doc && Math.abs(s.dx) > 70 && di >= 0 && docList[di + (s.dx < 0 ? 1 : -1)]) {
      const to = docList[di + (s.dx < 0 ? 1 : -1)];
      slide(s.dx < 0 ? 1 : -1, () => openDoc(doc.module, to));
    } else if (doc) {
      setAnim(true);
      setDx(0);
    } else if (comparing && Math.abs(s.dx) > 70) {
      setAnim(true);
      setDx(0);
      stepVerse(s.dx < 0 ? 1 : -1);
    } else if (s.dx < -70 && next) go(next, 1);
    else if (s.dx > 70 && prev) go(prev, -1);
    else {
      setAnim(true);
      setDx(0);
    }
  };

  const pick = (v: number) => setSel(v);
  // ---- Listening ----
  // The player moves on by itself (the next chapter, a book's next chapter): the reader follows. `following`
  // tells that move from one you make yourself, which starts reading the new page from the top.
  const following = useRef(false);
  const where = doc ? `doc:${doc.module}|${doc.chapter}` : `bible:${bible}|${loc.book}.${loc.chapter}`;
  const reading = pl.on ? (pl.doc ? `doc:${pl.doc.module}|${pl.doc.chapter}` : `bible:${pl.bible}|${pl.book}.${pl.chapter}`) : "";
  useEffect(() => {
    if (!pl.on || reading === where) return;
    // The player went on: follow it, if it's still reading what this page was reading.
    following.current = true;
    if (pl.doc) setDoc({ module: pl.doc.module, chapter: pl.doc.chapter });
    else {
      setDoc(null);
      setLoc({ book: pl.book, chapter: pl.chapter });
    }
  }, [reading]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (following.current) {
      following.current = false;
      return;
    }
    // You moved while it was reading: carry on from the top of the new page.
    if (!pl.on || reading === where) return;
    if (doc) player.playDoc({ module: doc.module, chapter: doc.chapter, title: docMod?.title ?? doc.module });
    else player.play(bible, loc.book, loc.chapter, 1, versesOf === `${loc.book}.${loc.chapter}` ? verses : undefined);
  }, [where]); // eslint-disable-line react-hooks/exhaustive-deps
  // The verse (or a book's paragraph) being read, a third of the way down.
  useEffect(() => {
    if (!pl.on || reading !== where) return;
    if (!pl.doc) setSel(pl.verse);
    // Compare shows the verse being read; there's no page to scroll.
    if (comparing) return;
    const el = page.current?.querySelector(pl.doc ? `[data-para="${pl.verse}"]` : `[data-v="${pl.verse}"]`) as HTMLElement | null;
    const pg = page.current;
    if (el && pg) {
      const top = el.getBoundingClientRect().top - pg.getBoundingClientRect().top + pg.scrollTop;
      pg.scrollTo({ top: Math.max(0, top - pg.clientHeight / 3), behavior: "smooth" });
    }
  }, [pl.on, pl.verse, reading, versesOf]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Compare's next or previous verse, on into the next or previous chapter. */
  const stepVerse = (d: 1 | -1) => {
    setWord(null);
    // Reading aloud: it moves with you, from the verse you step to.
    const reading = pl.on && !pl.doc && playingHere;
    if ((d > 0 && sel < verses.length) || (d < 0 && sel > 1)) {
      const v = sel + d;
      setSel(v);
      if (reading) player.play(bible, loc.book, loc.chapter, v, verses);
      return;
    }
    const to = d > 0 ? next : prev;
    if (!to) return;
    const v = d > 0 ? 1 : (counts.get(`${to.book}.${to.chapter}`) ?? 1);
    // Not "you moved, so read the new page from the top": from this verse.
    if (reading) following.current = true;
    visit(to, v);
    if (reading) player.play(bible, to.book, to.chapter, v);
  };
  useEffect(() => {
    // The word scene: the selected verse's first tagged word with a meaning worth showing.
    const ts = tokens.get(sel);
    if (!wordScene || !ts) return;
    const i = ts.findIndex((t) => t.word && t.text.length > 5);
    if (i >= 0) setWord({ v: sel, i });
    setWordScene(false);
  }, [wordScene, tokens, sel]);
  useEffect(() => {
    if (scrollTo === null || !verses.length || versesOf !== `${loc.book}.${loc.chapter}`) return;
    const el = page.current?.querySelector(`[data-v="${scrollTo}"]`);
    if (el) el.scrollIntoView({ block: scrollTo === 1 ? "end" : "start" });
    if (scrollTo === 1) page.current?.scrollTo(0, 0);
    setScrollTo(null);
  }, [scrollTo, verses, versesOf, loc.book, loc.chapter]);
  const goTo = (r: Ref) => {
    setGoing(false);
    visit({ book: r.book, chapter: r.chapter }, r.verse ?? 1);
    setScrollTo(r.verse ?? 1);
  };
  // Opened from another tab (a search result): go there, with the commentary's notes when it came from one.
  useEffect(() => {
    if (!jump) return;
    setWord(null);
    setStudy(false);
    // From KJV History: a Bible to read, or two side by side in Compare, where Read is; one step back
    // returns to the history, with the Bible and Compare's columns as they were.
    if (jump.bible || jump.compare) {
      const p = jump.compare?.join(",") ?? "";
      history.push({
        tab: "read",
        doc: "",
        bible: jump.bible ?? bible,
        compare: jump.compare ? p : pair,
        comparing: !!jump.compare || comparing,
      });
      setDoc(null);
      if (jump.bible) setBible(jump.bible);
      if (jump.compare) {
        setPair(p);
        setCmpIds(jump.compare);
        setComparing(true);
      }
      return;
    }
    if (jump.book) {
      const m = jump.book;
      // A devotional opens at today's reading; a book where it was left.
      const last = isDevotional(m) ? todayTitle() : saved<string | null>(`docAt.${m}`, null);
      bookTitles(m)
        .then((t) => {
          const c = last && t.includes(last) ? last : t[0];
          if (c) openDoc(m, c);
        })
        .catch(() => {});
      return;
    }
    if (!jump.ref) return;
    goTo(jump.ref);
    if (jump.commentary) {
      save("commentary", jump.commentary);
      setTimeout(() => setStudy(true), 0);
    }
  }, [jump?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  const chooseBible = (id: string) => {
    setBible(id);
    setChoosing(false);
  };

  // The highlighter and Compare: beside the study bar, or (iPad, docked) in the study pane's header.
  // The pen with a bar beneath, as Word's: in the verse's colour, or the pen's own when it has none.
  const hlNow = hls[vkey(loc.book, loc.chapter, sel)];
  const hlButton = (
    <button
      className={`round listen hlbtn ${hlOpen ? "open" : ""}`}
      aria-label={`Highlight ${fmtRef({ ...loc, verse: sel })}`}
      aria-expanded={hlOpen}
      onClick={() => setHlOpen(!hlOpen)}
    >
      <span className="hlpen">
        <Icon name="highlighter" size={22} />
        <span className="hlbar" style={{ background: hlNow ? HL_DOT[hlNow] : "currentColor" }} />
      </span>
    </button>
  );
  const bmkButton = (
    <button
      className={`round listen bmkbar ${marked(sel) ? "on" : ""}`}
      aria-label={marked(sel) ? `Remove the bookmark on ${fmtRef({ ...loc, verse: sel })}` : `Bookmark ${fmtRef({ ...loc, verse: sel })}`}
      aria-pressed={marked(sel)}
      onClick={() => bookmarks.toggle({ ref: { book: loc.book, chapter: loc.chapter, verse: sel }, bible })}
    >
      <Icon name="bookmark" size={20} fill={marked(sel) ? "currentColor" : undefined} />
    </button>
  );
  const hasNotes = noted(sel);
  const noteButton = (
    <button
      className={`round listen notebtn ${notesOpen ? "open" : ""} ${hasNotes ? "has" : ""}`}
      aria-label={
        hasNotes ? `Journal entries on ${fmtRef({ ...loc, verse: sel })}` : `Write in the journal on ${fmtRef({ ...loc, verse: sel })}`
      }
      aria-expanded={hasNotes ? notesOpen : undefined}
      onClick={() => (hasNotes ? setNotesOpen(!notesOpen) : newEntry({ ...loc, verse: sel }))}
    >
      <Icon name="note" size={22} />
    </button>
  );
  // What's shown in place of the text: the chapter, Study (a phone; an iPad has it beside the text) or
  // Compare. One control with the current one lit, so it reads as a choice of view, not three buttons.
  const view = comparing ? "compare" : study && !docked ? "study" : "text";
  const setView = (v: "text" | "study" | "compare") => {
    setWord(null);
    if ((v === "compare") !== comparing) {
      history.push({ comparing: v === "compare" });
      setComparing(v === "compare");
    }
    if (!docked) setStudy(v === "study");
  };
  const views: { id: "text" | "study" | "compare"; icon: "book" | "study" | "compare"; label: string }[] = [
    { id: "text", icon: "book", label: "The chapter" },
    ...(docked ? [] : [{ id: "study" as const, icon: "study" as const, label: `Study ${fmtRef({ ...loc, verse: sel })}` }]),
    { id: "compare", icon: "compare", label: "Compare translations" },
  ];
  const viewSeg = (
    <div className="viewseg" role="radiogroup" aria-label="Show">
      {views.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={view === o.id}
          aria-label={o.label}
          className={view === o.id ? "on" : undefined}
          onClick={() => setView(o.id)}
        >
          <Icon name={o.icon} size={o.id === "text" ? 20 : 22} />
        </button>
      ))}
    </div>
  );

  // The highlighter's colours or the verse's journal entries: above the buttons under the text, or
  // (iPad, docked) under the buttons in the study pane.
  const popup = hlOpen ? (
    <div className="hlstrip" role="group" aria-label={`Highlight ${fmtRef({ ...loc, verse: sel })}`}>
      {HL_COLORS.map((c) => {
        const k = vkey(loc.book, loc.chapter, sel);
        const on = hls[k] === c;
        return (
          <button
            key={c}
            className={`hldot ${on ? "on" : ""}`}
            style={{ background: HL_DOT[c] }}
            aria-label={c}
            aria-pressed={on}
            onClick={() => {
              highlights.set(k, on ? null : c);
              setHlOpen(false);
            }}
          />
        );
      })}
      {hls[vkey(loc.book, loc.chapter, sel)] && (
        <button
          className="hlclear"
          aria-label="Remove the highlight"
          onClick={() => {
            highlights.set(vkey(loc.book, loc.chapter, sel), null);
            setHlOpen(false);
          }}
        >
          ✕
        </button>
      )}
    </div>
  ) : notesOpen ? (
    <VerseNotes at={{ ...loc, verse: sel }} onClose={() => setNotesOpen(false)} />
  ) : null;

  return (
    <>
      <header className="topbar">
        <NavButtons />
        <button
          className="pill strong"
          style={doc ? { maxWidth: "62%", overflow: "hidden" } : undefined}
          onClick={() => {
            setGoBooks(!!doc);
            setGoing(true);
          }}
        >
          {/* Long names shortened ("Song 8"), so the bar keeps to one line. */}
          {doc ? (
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{docMod?.abbrev || docMod?.title || doc.chapter}</span>
          ) : comparing ? (
            book(loc.book).name.length > 8 ? (
              fmtRef({ ...loc, verse: sel }, "short")
            ) : (
              fmtRef({ ...loc, verse: sel })
            )
          ) : book(loc.book).name.length > 10 ? (
            fmtRef(loc, "short")
          ) : (
            `${book(loc.book).name} ${loc.chapter}`
          )}
          <Icon name="down" size={14} />
        </button>
        {!comparing && !doc && (
          <button className="pill" onClick={() => setChoosing(true)}>
            {bmod?.abbrev || bible.toUpperCase()}
            <Icon name="down" size={14} />
          </button>
        )}
        <span className="spacer" />
        {doc ? (
          <>
            <button
              className={`ibtn speak ${pl.on && pl.doc ? "on" : ""}`}
              aria-label={pl.on && pl.doc ? "Stop reading aloud" : "Listen to this chapter"}
              aria-pressed={!!(pl.on && pl.doc)}
              onClick={() =>
                pl.on && pl.doc
                  ? player.stop()
                  : player.playDoc({ module: doc.module, chapter: doc.chapter, title: docMod?.title ?? doc.module })
              }
            >
              <Icon name="speaker" size={22} />
            </button>
            <button className="pill" onClick={() => visit(loc, sel)} aria-label="Back to the Bible">
              Bible
            </button>
          </>
        ) : (
          <>
            <button
              className={`ibtn speak ${pl.on && !pl.doc ? "on" : ""}`}
              aria-label={pl.on && !pl.doc ? "Stop reading aloud" : `Listen to ${fmtRef(loc)} from verse ${sel}`}
              aria-pressed={pl.on && !pl.doc}
              onClick={() =>
                pl.on && !pl.doc
                  ? player.stop()
                  : player.play(bible, loc.book, loc.chapter, sel, versesOf === `${loc.book}.${loc.chapter}` ? verses : undefined)
              }
            >
              {/* Listen is a speaker in the top bar, here and in a book, as the desktop's. */}
              <Icon name="speaker" size={22} />
            </button>
            {comparing ? (
              <>
                <button className="ibtn" aria-label="Previous verse" onClick={() => stepVerse(-1)}>
                  <Icon name="back" size={20} />
                </button>
                <button className="ibtn" aria-label="Next verse" onClick={() => stepVerse(1)}>
                  <Icon name="forward" size={20} />
                </button>
              </>
            ) : (
              <button
                className="ibtn"
                aria-label={layout === "paragraph" ? "Show a verse per line" : "Show as paragraphs"}
                onClick={() => setLayout(layout === "paragraph" ? "verse" : "paragraph")}
              >
                <Icon name={layout === "paragraph" ? "verses" : "paragraph"} size={22} />
              </button>
            )}
          </>
        )}
      </header>

      <div className="readbody">
        <div className="pager">
          <div
            ref={page}
            className={`page ${anim ? "anim" : ""}`}
            style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
            onTouchStart={onStart}
            onTouchMove={onMove}
            onTouchEnd={onEnd}
            onTouchCancel={onEnd}
            onScroll={onScrollPage}
            onClickCapture={(e) => {
              const ok = tapOk.current;
              // Any scroll since the finger went down, however small, makes it a scroll.
              if (!ok.stillAt || scrolledAt.current >= ok.at || (page.current?.scrollTop ?? 0) !== ok.scroll) {
                e.stopPropagation();
                e.preventDefault();
              }
            }}
          >
            {doc ? (
              <DocView
                module={doc.module}
                title={docMod?.title ?? doc.module}
                chapter={doc.chapter}
                onRef={(r) => goTo(r)}
                onImage={(src) => setImage({ src })}
                onChapter={(c) => openDoc(doc.module, c)}
                reading={readingDoc}
                readingAt={readingDoc ? pl.at : undefined}
              />
            ) : comparing ? (
              <CompareView
                bibles={bibles}
                ids={shownIds}
                tokensOf={(id) => (cmpChapters.get(id)?.length ? (cmpTokens.get(id) ?? []) : undefined)}
                diff={diff}
                onDiff={setDiff}
                active={word?.bible ? { bible: word.bible, i: word.i } : undefined}
                onWord={(id, i) => setWord({ v: sel, i, bible: id })}
                said={playingHere && pl.at >= 0 ? { bible: pl.bible, at: pl.at } : undefined}
                onEdit={() => setEditing(true)}
              />
            ) : (
              <>
                <h1 className="title">
                  {book(loc.book).name} {loc.chapter}
                </h1>
                <p className="sub">
                  {bmod?.title ?? "Bible"}
                  {verses.length ? ` · ${verses.length} verses` : ""}
                </p>
                {!verses.length ? (
                  <p className="loading">
                    {bundledError && !bmod
                      ? `The Bibles in the app couldn't be set up (${bundledError}). Free some space and open the app again.`
                      : "Opening…"}
                  </p>
                ) : layout === "verse" ? (
                  <div className="text verses" dir={bmod?.rtl ? "rtl" : undefined}>
                    {verses.map((v) => (
                      <div
                        key={v.v}
                        data-v={v.v}
                        className={`v ${v.v === sel ? "sel" : ""} ${playingHere && pl.verse === v.v ? "speaking" : ""} ${hls[vkey(loc.book, loc.chapter, v.v)] ? "hl" : ""}`}
                        style={
                          hls[vkey(loc.book, loc.chapter, v.v)]
                            ? ({ "--hl": HL_DOT[hls[vkey(loc.book, loc.chapter, v.v)]] } as CSSProperties)
                            : undefined
                        }
                        onClick={() => pick(v.v)}
                      >
                        <span className="vnum">
                          {marked(v.v) && (
                            <span className="ribbon" aria-label="Bookmarked">
                              <Icon name="bookmark" size={11} fill="currentColor" />
                            </span>
                          )}
                          {noted(v.v) && (
                            <span className="ribbon" aria-label="In the journal">
                              <Icon name="note" size={11} />
                            </span>
                          )}
                          {v.v}
                        </span>
                        {/* The words in a run of their own, so a highlight is drawn line by line over them. */}
                        <span className="vt">
                          <Words
                            tokens={tokens.get(v.v) ?? []}
                            nums={!!bmod?.strongs}
                            active={word?.v === v.v ? word.i : undefined}
                            said={playingHere && pl.verse === v.v && pl.at >= 0 ? pl.at : undefined}
                            onWord={(i, num) => {
                              setSel(v.v);
                              setWord({ v: v.v, i, num });
                            }}
                          />
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text para" dir={bmod?.rtl ? "rtl" : undefined}>
                    {verses.map((v) => (
                      <span
                        key={v.v}
                        data-v={v.v}
                        className={`pv ${v.v === sel ? "sel" : ""} ${playingHere && pl.verse === v.v ? "speaking" : ""} ${hls[vkey(loc.book, loc.chapter, v.v)] ? "hl" : ""}`}
                        style={
                          hls[vkey(loc.book, loc.chapter, v.v)]
                            ? ({ "--hl": HL_DOT[hls[vkey(loc.book, loc.chapter, v.v)]] } as CSSProperties)
                            : undefined
                        }
                        onClick={() => pick(v.v)}
                      >
                        <span className="vnum">
                          {marked(v.v) && (
                            <span className="ribbon" aria-label="Bookmarked">
                              <Icon name="bookmark" size={11} fill="currentColor" />
                            </span>
                          )}
                          {noted(v.v) && (
                            <span className="ribbon" aria-label="In the journal">
                              <Icon name="note" size={11} />
                            </span>
                          )}
                          {v.v}
                        </span>
                        <Words
                          tokens={tokens.get(v.v) ?? []}
                          nums={!!bmod?.strongs}
                          active={word?.v === v.v ? word.i : undefined}
                          said={playingHere && pl.verse === v.v && pl.at >= 0 ? pl.at : undefined}
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
                        {nextVerses[0] && (
                          <span className="peek">
                            {tokenize(nextVerses[0].text)
                              .map((t) => t.text)
                              .join("")}
                          </span>
                        )}
                      </span>
                      <span className="go" aria-hidden="true">
                        ›
                      </span>
                    </button>
                    <p className="hint">Or swipe left.{prev ? ` Swipe right for ${fmtRef(prev)}.` : ""}</p>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {study && !docked && !doc && (
          <Study
            bible={bible}
            verseText={(tokens.get(sel) ?? []).map((t) => t.text).join("")}
            modules={modules}
            onChanged={onModulesChanged}
            onImage={(src, ring, spots) => setImage({ src, ring, spots })}
            screen
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
        {docked && !doc && (
          <Study
            bible={bible}
            verseText={(tokens.get(sel) ?? []).map((t) => t.text).join("")}
            modules={modules}
            onChanged={onModulesChanged}
            onImage={(src, ring, spots) => setImage({ src, ring, spots })}
            docked
            actions={
              <>
                {viewSeg}
                {hlButton}
                {bmkButton}
                {noteButton}
              </>
            }
            tray={popup}
            at={{ ...loc, verse: sel }}
            count={verses.length}
            onVerse={setSel}
            onClose={() => {}}
            onGo={(r: Ref) => goTo(r)}
          />
        )}
      </div>

      {pl.on && (
        <div className="miniplayer" role="region" aria-label="Listening">
          <button
            className="round"
            aria-label={pl.paused ? "Play" : "Pause"}
            onClick={() => (pl.paused ? player.resume() : player.pause())}
          >
            <Icon name={pl.paused ? "play" : "pause"} size={20} />
          </button>
          <span style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
            <span className="t">{pl.doc ? pl.doc.chapter : fmtRef({ book: pl.book, chapter: pl.chapter, verse: pl.verse })}</span>
            <span className="s">{pl.paused ? "Paused" : "Listening"}</span>
          </span>
          <button className="mini" aria-label="Speed" onClick={player.faster}>
            {pl.speed}×
          </button>
          <button className="mini" aria-label="Sleep timer" onClick={player.sleeper}>
            {pl.sleep === "off" ? "Sleep" : pl.sleep === "chapter" ? "End of ch." : `${pl.sleep} min`}
          </button>
          <button className="round" aria-label="Stop" onClick={player.stop}>
            <Icon name="stop" size={18} />
          </button>
        </div>
      )}
      {!docked && !doc && !pl.on && popup}
      {!docked && !doc && !pl.on && (
        <div className="studyrow">
          {viewSeg}
          {hlButton}
          {bmkButton}
          {noteButton}
        </div>
      )}

      {word && (
        <WordSheet
          at={{ ...loc, verse: word.v }}
          tokens={word.bible ? (cmpTokens.get(word.bible) ?? []) : (tokens.get(word.v) ?? [])}
          index={word.i}
          num={word.num}
          onIndex={(i) => setWord({ ...word, i, num: undefined })}
          guessFrom={(word.bible ? bibles.find((b) => b.id === word.bible)?.strongs : bmod?.strongs) ? undefined : guessFrom}
          guessVerse={
            word.bible
              ? guessFrom
                ? tokenize(cmpChapters.get(guessFrom)?.find((v) => v.v === word.v)?.text ?? "")
                : undefined
              : !bmod?.strongs && guessOf === versesOf
                ? tokenize(guessVerses.find((v) => v.v === word.v)?.text ?? "")
                : undefined
          }
          onStudy={() => {
            setWord(null);
            setStudy(true);
          }}
          onWordStudy={(n) => {
            setWord(null);
            onWordStudy(n);
          }}
          onClose={() => setWord(null)}
        />
      )}

      {image && (
        <ImageViewer
          src={image.src}
          ring={image.ring}
          spots={image.spots}
          onGo={(r) => {
            setImage(null);
            setStudy(false);
            goTo(r);
          }}
          onClose={() => setImage(null)}
        />
      )}
      {editing && (
        <CompareEdit
          bibles={bibles}
          ids={cmpIds}
          // Chosen here, the columns are the person's own, saved, rather than KJV History's pair.
          onChange={(ids) => {
            setPair("");
            setCmpIds(ids);
          }}
          onClose={() => setEditing(false)}
        />
      )}

      {going && (
        <GoTo
          bookModules={bookMods}
          startOnBooks={goBooks}
          openDoc={doc}
          onDoc={openDoc}
          onLibrary={() => {
            setGoing(false);
            onLibrary();
          }}
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
