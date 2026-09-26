// App-wide state: the library, settings, bookmarks and highlights, the journal, and where the
// reader is. Everything the user makes is saved through the Rust store (one JSON file each)
// or, for the journal, as Markdown in the journal folder.

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Song } from "./worship";
import { listen } from "@tauri-apps/api/event";
import { api, JournalEntry, LibraryInfo, ModuleInfo } from "./api";
import { Ref } from "./bible";
import { Plan } from "./plans";
import type { StudyTab } from "./StudyPane";

export type Theme = "auto" | "light" | "dark";
/** A model id; which CLI answers follows from it (see assistant.ts). */
export type Model = string;

export interface Settings {
  theme: Theme;
  readSize: number;
  readFont: ReadFont;
  redLetters: boolean;
  /** Strong's Bibles in Greek or Hebrew without English of their own: each word's commonest KJV rendering under it. */
  kjvGlosses: boolean;
  layout: "verse" | "paragraph";
  bible: string;
  compare: string[];
  hiddenBibles: string[];
  commentaryOrder: string[];
  dictionaryOrder: string[];
  voice: string;
  rate: number;
  continueChapter: boolean;
  readNumbers: boolean;
  highlightWords: boolean;
  journalDir: string;
  showNotes: boolean;
  /** The journal highlighter's colour, kept until another is picked. */
  journalHighlight: HlColor;
  /** Grammar checking in the journal, with spelling. */
  journalGrammar: boolean;
  model: Model;
  includeCommentaries: boolean;
  /** Passage chats also get the user's journal entries on the passage. */
  askJournal: boolean;
  allowLicensed: boolean;
  reminder: boolean;
  reminderTime: string;
  whenBehind: "ask" | "move" | "catchup" | "skip";
  studyPane: boolean;
  /** Copying verses puts the verse numbers in front of each verse. */
  copyNumbers: boolean;
  /** The study pane as it was left: its tab, the commentary and dictionary entry chosen, and whether it follows the reading. */
  studyTab: StudyTab;
  /** The study pane beside a book: its tab. */
  docTab: "notes" | "dictionary" | "ask";
  studyCommentary: string | null;
  studyDict: DictAt | null;
  dictModule: string | null;
  studyFollow: boolean;
}

const DEFAULTS: Settings = {
  theme: "auto", readSize: 19, readFont: "literata", studyTab: "commentary", docTab: "ask", studyCommentary: null, studyDict: null, dictModule: null, studyFollow: true, redLetters: true, kjvGlosses: true, layout: "verse", bible: "kjv", compare: ["kjv", "asv", "kjv+"], hiddenBibles: [],
  commentaryOrder: ["barnes", "henry", "clarke", "gill", "jfb", "wesley", "darby", "meyer"], dictionaryOrder: ["isbe", "smith", "nave", "cyclopedia"],
  voice: "", rate: 1, continueChapter: true, readNumbers: false, highlightWords: true, journalDir: "", showNotes: true, journalHighlight: "yellow", journalGrammar: true,
  model: "claude-sonnet-5", includeCommentaries: true, askJournal: false, allowLicensed: true, reminder: false, reminderTime: "06:30", whenBehind: "ask", studyPane: true, copyNumbers: true,
};

/** Faces for Scripture, commentary and notes. Greek and Hebrew stay in --display. */
export const READ_FONTS = {
  literata: { label: "Literata", stack: '"Literata Variable", Georgia, serif' },
  source: { label: "Source Serif", stack: '"Source Serif 4 Variable", "Source Serif 4", Georgia, serif' },
  inter: { label: "Inter", stack: '"Inter Variable", -apple-system, sans-serif' },
  atkinson: { label: "Atkinson", stack: '"Atkinson Hyperlegible Next Variable", -apple-system, sans-serif' },
};
export type ReadFont = keyof typeof READ_FONTS;

/** A bookmarked passage, or (with `doc`) a paragraph of a reference book or devotional; `ref` is
 *  then unused ({ book: 0, chapter: 0 }). */
export interface Bookmark { id: string; ref: Ref; bible: string; created: string; doc?: DocSpot }
/** A paragraph in a book: its chapter, and the paragraph's number there (from 1). */
export interface DocSpot { module: string; title: string; kind?: DocKind; para: number }
export type HlColor = "red" | "orange" | "yellow" | "green" | "blue" | "purple";
/** Highlights saved before there were six colours. */
export const hlName = (c: string): HlColor => (c === "gold" ? "yellow" : c === "rose" ? "red" : (c as HlColor));

export interface ChatMsg { role: "user" | "assistant"; text: string; error?: boolean }
export interface Chat {
  id: string;
  title: string;
  /** What it was about, shown in Recent: "John 3:14–16", "G25 agapaō". */
  about: string;
  /** Where it was asked from: "Read", "Compare", "Word study"… */
  source: string;
  created: string;
  updated: string;
  model: Model;
  session?: string;
  /** A chat about a reference book runs in the book's exported folder (api.docExport). */
  bookDir?: string;
  /** A chat about a Bible passage searches the library's material on it here (api.studyExport). */
  studyDir?: string;
  /** The passage it was asked about, which Add to journal links. */
  verses?: string[];
  /** What was open when it started, so the chat can reopen it. */
  opened?: Opened;
  messages: ChatMsg[];
  journaled?: boolean;
}

export interface JournalSeed { verses?: string[]; title?: string; body?: string; tags?: string[]; /** Open this entry instead of starting one. */ openId?: string }

/** A dictionary entry to show, or (with search) a word to look up in the dictionary search, in the current dictionary when module is "". */
export interface DictAt { module: string; topic: string; search?: boolean }
export interface Pending { article?: DictAt; ask?: string; commentary?: string }

export type Screen = "read" | "compare" | "search" | "word" | "journal" | "plans" | "library" | "history" | "settings";

/** A chapter read lately: of the Bible, or (with `doc`) of a reference book or devotional. */
/** A passage or book chapter opened. `verse`/`to` are the verses it was opened at, if any; one entry per chapter, the latest open. */
export interface Recent { book: number; chapter: number; verse?: number; to?: number; at: string; doc?: Doc }

/** One entry in the back/forward history. `word` is a Strong's number or an English word looked
 *  up in Word Study; `search` is the last search run. */
export interface Place { screen: Screen; loc: Loc; doc: Doc | null; word: string | null; search: string | null }
/** A place with what was open in it: a book's paragraph (from 1), a journal entry. */
export interface Opened extends Place { para?: number; entry?: string }

export interface Loc { book: number; chapter: number; verse?: number; to?: number }
/** A reference book open in the reading column, and the chapter being read. */
export interface Doc { module: string; title: string; kind?: DocKind }
export type DocKind = "reference" | "devotional";

/** One part of a Quiet time: a chapter (or part of one), a devotional's reading, or an online devotional. */
export type QuietStep = { key: string; label: string } & (
  | { kind: "bible"; bible: string; b: number; c: number; v?: number; v2?: number }
  | { kind: "devotional"; module: string; title: string }
  | { kind: "online"; id: string; url: string }
  /** Songs for the day's reading; `picked` once they are chosen (worship.ts), with why when it had to guess. */
  | { kind: "worship"; songs: number; when: "before" | "after"; picked?: Song[]; intro?: string; note?: string }
);
export interface Session {
  planId: string; dayKey: string; steps: QuietStep[]; i: number; audio: boolean; started: number;
  /** A try-out: everything works, but nothing is ticked off or marked read. */
  preview?: boolean;
}

interface Ctx {
  lib: LibraryInfo | null;
  bibles: ModuleInfo[];
  mod: (kind: ModuleInfo["kind"], id: string) => ModuleInfo | undefined;
  /** The Bible with Strong's numbers to borrow from (KJV+ when present). */
  strongsBible: string | null;
  lexicon: string | null;
  concordance: string | null;
  tsk: string | null;
  rescan: () => Promise<void>;

  /** The settings, with `bible` the Bible being read this session (see set). */
  settings: Settings;
  /** Saves settings. `bible` alone changes only this session's Bible: the saved default, set in
   *  Settings or the Library, comes back when the window is reopened or the app restarted. */
  set: (patch: Partial<Settings>) => void;
  defaultBible: string;
  /** Saves the default Bible, and reads it now. */
  setDefaultBible: (id: string) => void;

  screen: Screen;
  go: (s: Screen) => void;
  loc: Loc;
  /** `replace`: in place of the current history entry, for a step that corrects where the user already is. */
  open: (l: Loc, screen?: Screen, replace?: boolean) => void;
  back: () => void;
  forward: () => void;
  canBack: boolean;
  canForward: boolean;

  bookmarks: Bookmark[];
  toggleBookmark: (ref: Ref, bible: string) => void;
  toggleDocBookmark: (spot: DocSpot) => void;
  /** A paragraph to scroll to once DocReader has the chapter (set by openDoc's `para`). */
  docPara: DocSpot | null;
  clearDocPara: () => void;
  highlights: Record<string, HlColor>;
  setHighlight: (key: string, c: HlColor | null) => void;
  recent: Recent[];

  /** A Quiet time session being stepped through (QuietTime.tsx). */
  session: Session | null;
  setSession: (s: Session | null | ((s: Session | null) => Session | null)) => void;

  /** The reference book in the reading column; null while reading the Bible. */
  doc: Doc | null;
  /** Opens a reference book, at the given chapter or wherever it was last left. */
  openDoc: (module: string, title?: string, kind?: DocKind, para?: number) => void;
  closeDoc: () => void;
  /** The chapter last read in each reference book. */
  docAt: Record<string, string>;

  journal: JournalEntry[];
  journalDir: string;
  saveEntry: (e: JournalEntry) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;

  plans: Plan[];
  /** Settings and plans have been read from the store, so they are the user's and not the defaults. */
  plansReady: boolean;
  setPlans: (f: (p: Plan[]) => Plan[]) => void;
  chats: Chat[];
  setChats: (f: (c: Chat[]) => Chat[]) => void;

  /** A new journal entry waiting to be opened in the Journal screen. */
  journalSeed: JournalSeed | null;
  startEntry: (seed: JournalSeed) => void;
  /** Where the user is now, and going back there (a chat's `opened`). */
  here: () => Place;
  reopen: (o: Opened) => void;
  clearSeed: () => void;

  /** Something another screen wants the Read screen's study pane to show. */
  pending: Pending | null;
  setPending: (p: Pending | null) => void;

  wordStudy: string | null;
  studyWord: (num: string) => void;
  searchFor: string | null;
  searchText: (q: string) => void;
  /** A brief message; with `undo`, it offers an Undo button that runs it. */
  toast: (msg: string, undo?: () => void) => void;
  toastMsg: string | null;
  toastUndo: (() => void) | null;
  removeBookmark: (id: string) => void;
  removeRecent: (r: Recent) => void;
  clearRecent: () => void;
}

const C = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(C);
  if (!c) throw new Error("no app context");
  return c;
};

// Saves waiting on their debounce, written at once when the window hides, loses focus or unloads
// (closing only hides it, and Quit exits without warning the page).
const flushers = new Set<() => void>();
const flushAll = () => flushers.forEach((f) => f());
/** Adds a pending save to those written at once; returns its removal. */
export const onFlush = (f: () => void) => { flushers.add(f); return () => { flushers.delete(f); }; };
window.addEventListener("beforeunload", flushAll);
window.addEventListener("blur", flushAll);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushAll(); });

/** A JSON document in the store, loaded once and written back (debounced) on change. Nothing is
 *  written until the read has succeeded, so a failed read never overwrites the file with defaults;
 *  changes made before it finishes are replayed onto what was read. */
function useStored<T>(name: string, initial: T): [T, (f: (v: T) => T) => void, boolean, boolean] {
  const [v, setV] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const ok = useRef(false);
  const early = useRef<((v: T) => T)[] | null>([]);
  const due = useRef<{ v: T } | null>(null);
  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    const d = due.current;
    due.current = null;
    if (d) api.storeWrite(name, d.v).catch((e) => console.error(name, e));
  }, [name]);
  const save = useCallback((next: T) => { due.current = { v: next }; window.clearTimeout(timer.current); timer.current = window.setTimeout(flush, 250); }, [flush]);
  useEffect(() => { flushers.add(flush); return () => { flushers.delete(flush); flush(); }; }, [flush]);
  useEffect(() => {
    api.storeRead<T>(name).then((x) => {
      if (ok.current) return;
      const base = x !== null && x !== undefined ? (typeof initial === "object" && !Array.isArray(initial) && initial ? { ...initial, ...x } : x) : initial;
      const q = early.current ?? [];
      const next = q.reduce((a, f) => f(a), base);
      ok.current = true;
      early.current = null;
      setV(next);
      if (q.length) save(next);
      setLoaded(true);
    }).catch((e) => { console.error(`couldn't read ${name}; changes won't be saved`, e); early.current = null; setFailed(true); setLoaded(true); });
  }, [name]); // eslint-disable-line react-hooks/exhaustive-deps
  const update = useCallback((f: (v: T) => T) => {
    // Before the read, the change is only replayed onto what it returns (which then saves).
    const pre = !ok.current;
    if (early.current) early.current.push(f);
    setV((cur) => {
      const next = f(cur);
      if (!pre) save(next);
      return next;
    });
  }, [save]);
  return [v, update, loaded, failed];
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const nowLocal = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const vkey = (b: number, c: number, v: number) => `${b}.${c}.${v}`;

export function AppProvider({ children }: { children: ReactNode }) {
  const [lib, setLib] = useState<LibraryInfo | null>(null);
  const [settings, setSettings, settingsLoaded, f1] = useStored<Settings>("settings", DEFAULTS);
  const [bookmarks, setBookmarks, , f2] = useStored<Bookmark[]>("bookmarks", []);
  const [highlights, setHighlights, , f3] = useStored<Record<string, HlColor>>("highlights", {});
  // The last word studied is kept with the place, so Word Study reopens on it.
  const [nav, setNav, navLoaded, f4] = useStored<{ loc: Loc; recent: Recent[]; doc: Doc | null; docAt: Record<string, string>; word?: string | null }>("place", { loc: { book: 43, chapter: 1 }, recent: [], doc: null, docAt: {}, word: null });
  const [plans, setPlans, plansLoaded, f5] = useStored<Plan[]>("plans", []);
  const [chats, setChats, , f6] = useStored<Chat[]>("chats", []);
  const [screen, setScreen] = useState<Screen>("read");
  // Back and forward: every place the user goes (a screen, a passage, a book's chapter, a word
  // studied, a search) is pushed here, and back/forward restore one.
  const hist = useRef<{ stack: Place[]; i: number }>({ stack: [], i: -1 });
  // Where the user is as of the last move, ahead of React's state, so two moves in one handler
  // (close the book, then open a dictionary entry) build on each other.
  const curPlace = useRef<Place | null>(null);
  const [, bump] = useState(0);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [defaultDir, setDefaultDir] = useState("");
  const wordStudy = nav.word ?? null;
  const [journalSeed, setJournalSeed] = useState<JournalSeed | null>(null);
  const [pending, setPendingState] = useState<Pending | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [searchFor, setSearchFor] = useState<string | null>(null);
  const [docPara, setDocPara] = useState<DocSpot | null>(null);
  const [toastMsg, setToast] = useState<string | null>(null);
  const [toastUndo, setToastUndo] = useState<(() => void) | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => { api.library().then(setLib); api.journalDefaultDir().then(setDefaultDir); }, []);

  useEffect(() => {
    // "midnight" was a trial of the GitHub palette that became Dark; a setting saved then still means dark.
    const t = (settings.theme as string) === "midnight" ? "dark" : settings.theme;
    if (t === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
    document.documentElement.style.setProperty("--read-size", `${settings.readSize}px`);
    // Headings (--display) follow the reading font too, so the whole app changes with it.
    const stack = READ_FONTS[settings.readFont]?.stack ?? READ_FONTS.literata.stack;
    document.documentElement.style.setProperty("--serif", stack);
    document.documentElement.style.setProperty("--display", stack);
  }, [settings.theme, settings.readSize, settings.readFont]);

  const journalDir = settings.journalDir || defaultDir;
  // Only the latest listing is kept: at startup the default folder's can arrive after the chosen one's.
  const journalSeq = useRef(0);
  /** The journal files' fingerprint as last seen, so a save made here isn't mistaken for an edit elsewhere. */
  const journalStamp = useRef<string | null>(null);
  const reloadJournal = useCallback(async () => {
    if (!journalDir) return;
    const n = ++journalSeq.current;
    try { const js = await api.journalList(journalDir); if (n === journalSeq.current) setJournal(js); } catch (e) { console.error(e); }
  }, [journalDir]);
  useEffect(() => { reloadJournal(); }, [reloadJournal]);
  // Edits made elsewhere (Obsidian) are picked up: the files are checked every few seconds while
  // the window is showing, and at once when it comes back to the front.
  useEffect(() => {
    if (!journalDir) return;
    let dead = false;
    journalStamp.current = null;
    const check = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const s = await api.journalStamp(journalDir);
        if (dead) return;
        if (journalStamp.current !== null && s !== journalStamp.current) reloadJournal();
        journalStamp.current = s;
      } catch { /* the folder isn't there; saving says so */ }
    };
    check();
    const t = window.setInterval(check, 3000);
    window.addEventListener("focus", check);
    return () => { dead = true; window.clearInterval(t); window.removeEventListener("focus", check); };
  }, [journalDir, reloadJournal]);

  const bibles = useMemo(() => (lib?.modules ?? []).filter((m) => m.kind === "bible"), [lib]);
  const mod = useCallback((kind: ModuleInfo["kind"], id: string) => lib?.modules.find((m) => m.kind === kind && m.id === id), [lib]);
  const find = (kind: ModuleInfo["kind"], pref: string[], pred?: (m: ModuleInfo) => boolean) => {
    const ms = (lib?.modules ?? []).filter((m) => m.kind === kind);
    return pref.map((p) => ms.find((m) => m.id === p)).find(Boolean)?.id ?? ms.find((m) => pred?.(m))?.id ?? null;
  };
  const strongsBible = find("bible", ["kjv+"], (m) => m.strongs);
  const lexicon = find("lexicon", ["strong"], (m) => /strong/i.test(m.title));
  const concordance = find("lexicon", ["kjc"], (m) => /concordance/i.test(m.title));
  const tsk = find("commentary", ["tsk"], (m) => /treasury/i.test(m.title));

  // Fall back to the first Bible if the saved one is gone.
  useEffect(() => {
    if (settingsLoaded && bibles.length && !bibles.some((b) => b.id === settings.bible)) setSettings((s) => ({ ...s, bible: bibles[0].id }));
  }, [settingsLoaded, bibles, settings.bible, setSettings]);

  // The Bible being read this session, when it isn't the saved default (settings.bible). Closing
  // the window (the app stays in the menu bar) goes back to the default for next time.
  const [sessionBible, setSessionBible] = useState<string | null>(null);
  useEffect(() => { if (sessionBible && bibles.length && !bibles.some((b) => b.id === sessionBible)) setSessionBible(null); }, [sessionBible, bibles]);
  useEffect(() => {
    const off = listen("main-window-closed", () => setSessionBible(null));
    return () => { off.then((f) => f()).catch(() => {}); };
  }, []);
  const view = useMemo(() => (sessionBible && sessionBible !== settings.bible ? { ...settings, bible: sessionBible } : settings), [settings, sessionBible]);

  const here = (): Place => ({ screen, loc: nav.loc, doc: nav.doc, word: wordStudy, search: searchFor });
  const show = (pl: Place) => {
    curPlace.current = pl;
    setScreen(pl.screen);
    setSearchFor(pl.search);
    setNav((n) => ({ ...n, loc: pl.loc, doc: pl.doc, word: pl.word }));
  };
  /** Goes somewhere new: the current place with `patch` applied, pushed onto the history (or
   *  replacing the current entry, for a step that only fills in where the user already is). */
  const navigate = (patch: Partial<Place>, replace = false) => {
    const h = hist.current;
    const cur = curPlace.current ?? here();
    const next = { ...cur, ...patch };
    if (JSON.stringify(next) === JSON.stringify(h.stack[h.i] ?? cur) && JSON.stringify(next) === JSON.stringify(cur)) return;
    if (replace && h.i >= 0) h.stack[h.i] = next;
    else {
      h.stack = h.stack.slice(0, h.i + 1);
      h.stack.push(next);
      if (h.stack.length > 200) h.stack.shift();
      h.i = h.stack.length - 1;
    }
    show(next);
    bump((x) => x + 1);
  };

  const sameRecent = (a: Recent, b: Recent) => (a.doc || b.doc ? a.doc?.module === b.doc?.module && a.doc?.title === b.doc?.title : a.book === b.book && a.chapter === b.chapter);
  const addRecent = (r: Recent) => setNav((n) => ({ ...n, recent: [r, ...n.recent.filter((x) => !sameRecent(x, r))].slice(0, 50) }));

  const open = (l: Loc, s?: Screen, replace = false) => {
    addRecent({ book: l.book, chapter: l.chapter, ...(l.verse ? { verse: l.verse, to: l.to } : {}), at: new Date().toISOString() });
    navigate({ loc: l, doc: null, ...(s ? { screen: s } : {}) }, replace);
  };

  // Seed the history with where the reader was last time, once the saved place has loaded.
  useEffect(() => {
    if (navLoaded && hist.current.i < 0) { const pl = here(); hist.current = { stack: [pl], i: 0 }; curPlace.current = pl; bump((x) => x + 1); }
  }, [navLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const moveHist = (d: number) => {
    const h = hist.current;
    const j = h.i + d;
    if (j < 0 || j >= h.stack.length) return;
    h.i = j;
    show(h.stack[j]);
    bump((x) => x + 1);
  };

  const toast = useCallback((m: string, undo?: () => void) => {
    setToast(m);
    setToastUndo(() => (undo ? () => { undo(); setToast(null); setToastUndo(null); } : null));
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => { setToast(null); setToastUndo(null); }, undo ? 6000 : 2600);
  }, []);
  const readFailed = [f1, f2, f3, f4, f5, f6].some(Boolean);
  useEffect(() => { if (readFailed) toast("Couldn't read your saved data — changes this session won't be saved"); }, [readFailed, toast]);

  const value: Ctx = {
    lib, bibles, mod, strongsBible, lexicon, concordance, tsk,
    rescan: async () => { setLib(await api.rescan()); },
    settings: view,
    set: ({ bible, ...rest }) => {
      if (bible !== undefined) setSessionBible(bible);
      if (Object.keys(rest).length) setSettings((s) => ({ ...s, ...rest }));
    },
    defaultBible: settings.bible,
    setDefaultBible: (id) => { setSessionBible(null); setSettings((s) => ({ ...s, bible: id })); },
    screen, go: (s) => navigate({ screen: s }),
    loc: nav.loc, open,
    back: () => moveHist(-1), forward: () => moveHist(1),
    canBack: hist.current.i > 0, canForward: hist.current.i < hist.current.stack.length - 1,
    bookmarks,
    toggleBookmark: (ref, bible) => setBookmarks((bs) => {
      const same = (b: Bookmark) => b.ref.book === ref.book && b.ref.chapter === ref.chapter && b.ref.verse === ref.verse && (b.ref.to ?? b.ref.verse) === (ref.to ?? ref.verse);
      return bs.some(same) ? bs.filter((b) => !same(b)) : [{ id: uid(), ref, bible, created: new Date().toISOString() }, ...bs];
    }),
    toggleDocBookmark: (spot) => setBookmarks((bs) => {
      const same = (b: Bookmark) => b.doc?.module === spot.module && b.doc.title === spot.title && b.doc.para === spot.para;
      return bs.some(same) ? bs.filter((b) => !same(b)) : [{ id: uid(), ref: { book: 0, chapter: 0 }, bible: "", created: new Date().toISOString(), doc: spot }, ...bs];
    }),
    docPara, clearDocPara: () => setDocPara(null),
    highlights,
    setHighlight: (k, c) => setHighlights((h) => { const n = { ...h }; if (c) n[k] = c; else delete n[k]; return n; }),
    recent: nav.recent,
    session, setSession,
    doc: nav.doc, docAt: nav.docAt ?? {},
    openDoc: (module, title, kind = "reference", para) => {
      setDocPara(para && title ? { module, title, kind, para } : null);
      // A devotional opens on today's reading (DocReader picks it); a book where it was left.
      const t = kind === "devotional" ? title ?? "" : title ?? nav.docAt?.[module] ?? "";
      if (kind !== "devotional" && t) setNav((n) => ({ ...n, docAt: { ...n.docAt, [module]: t } }));
      // DocReader fills in the chapter of a book opened without one: that replaces the entry, so
      // back doesn't land on the empty book and open it again.
      const d = (curPlace.current ?? here()).doc;
      const filling = d?.module === module && !d.title;
      navigate({ doc: { module, title: t, kind }, screen: "read" }, filling);
      if (t) addRecent({ book: 0, chapter: 0, at: new Date().toISOString(), doc: { module, title: t, kind } });
    },
    closeDoc: () => navigate({ doc: null }),
    journal, journalDir,
    // A save or delete updates the one entry here rather than reading the whole journal again
    // (thousands of entries, on every pause in typing), and notes the files' new fingerprint.
    saveEntry: async (e) => {
      await api.journalSave(journalDir, e);
      ++journalSeq.current; // a reload already under way would bring back the old copy
      setJournal((js) => [e, ...js.filter((x) => x.id !== e.id)].sort((a, b) => b.created.localeCompare(a.created)));
      journalStamp.current = await api.journalStamp(journalDir).catch(() => journalStamp.current);
    },
    deleteEntry: async (id) => {
      await api.journalDelete(journalDir, id);
      ++journalSeq.current;
      setJournal((js) => js.filter((x) => x.id !== id));
      journalStamp.current = await api.journalStamp(journalDir).catch(() => journalStamp.current);
    },
    plans, setPlans, plansReady: settingsLoaded && plansLoaded, chats, setChats,
    // An article, a commentary or a question is shown beside the Bible, so a book open in Read is
    // closed for it (back returns to the book).
    pending, setPending: (x) => { setPendingState(x); if (x) navigate({ screen: "read", doc: null }); },
    journalSeed, startEntry: (seed) => { setJournalSeed(seed); navigate({ screen: "journal" }); }, clearSeed: () => setJournalSeed(null),
    here: () => curPlace.current ?? here(),
    reopen: ({ para, entry, ...pl }) => {
      if (entry) { setJournalSeed({ openId: entry }); navigate({ screen: "journal" }); return; }
      navigate(pl);
      if (pl.doc && para) setDocPara({ ...pl.doc, para });
    },
    wordStudy, studyWord: (n) => navigate({ screen: "word", word: n }),
    searchFor, searchText: (q) => navigate({ screen: "search", search: q }),
    toast, toastMsg, toastUndo,
    // Single rows go straight away with an Undo in the toast; clearing Recent asks first (Shell).
    // Undo puts back just the removed row, where it was, keeping anything added since.
    removeBookmark: (id) => {
      const i = bookmarks.findIndex((b) => b.id === id), gone = bookmarks[i];
      setBookmarks((bs) => bs.filter((b) => b.id !== id));
      if (gone) toast("Bookmark removed", () => setBookmarks((bs) => (bs.some((b) => b.id === id) ? bs : [...bs.slice(0, i), gone, ...bs.slice(i)])));
    },
    removeRecent: (r) => {
      const i = nav.recent.findIndex((x) => sameRecent(x, r)), gone = nav.recent[i];
      setNav((n) => ({ ...n, recent: n.recent.filter((x) => !sameRecent(x, r)) }));
      if (gone) toast("Removed from Recent", () => setNav((n) => ({ ...n, recent: n.recent.some((x) => sameRecent(x, gone)) ? n.recent : [...n.recent.slice(0, i), gone, ...n.recent.slice(i)] })));
    },
    clearRecent: () => setNav((n) => ({ ...n, recent: [] })),
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}
