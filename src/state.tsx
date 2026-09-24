// App-wide state: the library, settings, bookmarks and highlights, the journal, and where the
// reader is. Everything the user makes is saved through the Rust store (one JSON file each)
// or, for the journal, as Markdown in the journal folder.

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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
  model: Model;
  includeCommentaries: boolean;
  allowLicensed: boolean;
  reminder: boolean;
  reminderTime: string;
  whenBehind: "ask" | "move" | "catchup" | "skip";
  studyPane: boolean;
  /** Copying verses puts the verse numbers in front of each verse. */
  copyNumbers: boolean;
  /** The study pane as it was left: its tab, the commentary and dictionary entry chosen, and whether it follows the reading. */
  studyTab: StudyTab;
  studyCommentary: string | null;
  studyDict: { module: string; topic: string } | null;
  dictModule: string | null;
  studyFollow: boolean;
}

const DEFAULTS: Settings = {
  theme: "auto", readSize: 19, readFont: "literata", studyTab: "commentary", studyCommentary: null, studyDict: null, dictModule: null, studyFollow: true, redLetters: true, layout: "verse", bible: "kjv", compare: ["kjv", "asv", "kjv+"], hiddenBibles: [],
  commentaryOrder: ["barnes", "henry", "clarke", "gill", "jfb", "wesley", "darby", "meyer"], dictionaryOrder: ["isbe", "smith", "nave", "cyclopedia"],
  voice: "", rate: 1, continueChapter: true, readNumbers: false, highlightWords: true, journalDir: "", showNotes: true,
  model: "claude-sonnet-5", includeCommentaries: true, allowLicensed: true, reminder: false, reminderTime: "06:30", whenBehind: "ask", studyPane: true, copyNumbers: true,
};

/** Faces for Scripture, commentary and notes. Greek and Hebrew stay in --display. */
export const READ_FONTS = {
  literata: { label: "Literata", stack: '"Literata Variable", Georgia, serif' },
  source: { label: "Source Serif", stack: '"Source Serif 4 Variable", "Source Serif 4", Georgia, serif' },
  inter: { label: "Inter", stack: '"Inter Variable", -apple-system, sans-serif' },
  atkinson: { label: "Atkinson", stack: '"Atkinson Hyperlegible Next Variable", -apple-system, sans-serif' },
};
export type ReadFont = keyof typeof READ_FONTS;

export interface Bookmark { id: string; ref: Ref; bible: string; created: string }
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
  messages: ChatMsg[];
  journaled?: boolean;
}

export interface JournalSeed { verses?: string[]; title?: string; body?: string; tags?: string[]; /** Open this entry instead of starting one. */ openId?: string; chatId?: string }

export interface Pending { article?: { module: string; topic: string }; ask?: string; commentary?: string }

export type Screen = "read" | "compare" | "search" | "word" | "journal" | "plans" | "library" | "settings";

/** A chapter read lately: of the Bible, or (with `doc`) of a reference book or devotional. */
export interface Recent { book: number; chapter: number; at: string; doc?: Doc }

/** One entry in the back/forward history. `word` is a Strong's number or an English word looked
 *  up in Word Study; `search` is the last search run. */
interface Place { screen: Screen; loc: Loc; doc: Doc | null; word: string | null; search: string | null }

export interface Loc { book: number; chapter: number; verse?: number; to?: number }
/** A reference book open in the reading column, and the chapter being read. */
export interface Doc { module: string; title: string; kind?: DocKind }
export type DocKind = "reference" | "devotional";

/** One part of a Quiet time: a chapter (or part of one), a devotional's reading, or an online devotional. */
export type QuietStep = { key: string; label: string } & (
  | { kind: "bible"; bible: string; b: number; c: number; v?: number; v2?: number }
  | { kind: "devotional"; module: string; title: string }
  | { kind: "online"; id: string; url: string }
);
export interface Session { planId: string; dayKey: string; steps: QuietStep[]; i: number; audio: boolean; started: number }

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

  settings: Settings;
  set: (patch: Partial<Settings>) => void;

  screen: Screen;
  go: (s: Screen) => void;
  loc: Loc;
  open: (l: Loc, screen?: Screen) => void;
  back: () => void;
  forward: () => void;
  canBack: boolean;
  canForward: boolean;

  bookmarks: Bookmark[];
  toggleBookmark: (ref: Ref, bible: string) => void;
  highlights: Record<string, HlColor>;
  setHighlight: (key: string, c: HlColor | null) => void;
  recent: Recent[];

  /** A Quiet time session being stepped through (QuietTime.tsx). */
  session: Session | null;
  setSession: (s: Session | null | ((s: Session | null) => Session | null)) => void;

  /** The reference book in the reading column; null while reading the Bible. */
  doc: Doc | null;
  /** Opens a reference book, at the given chapter or wherever it was last left. */
  openDoc: (module: string, title?: string, kind?: DocKind) => void;
  closeDoc: () => void;
  /** The chapter last read in each reference book. */
  docAt: Record<string, string>;

  journal: JournalEntry[];
  journalDir: string;
  saveEntry: (e: JournalEntry) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  reloadJournal: () => Promise<void>;

  plans: Plan[];
  setPlans: (f: (p: Plan[]) => Plan[]) => void;
  chats: Chat[];
  setChats: (f: (c: Chat[]) => Chat[]) => void;

  /** A new journal entry waiting to be opened in the Journal screen. */
  journalSeed: JournalSeed | null;
  startEntry: (seed: JournalSeed) => void;
  clearSeed: () => void;

  /** Something another screen wants the Read screen's study pane to show. */
  pending: Pending | null;
  setPending: (p: Pending | null) => void;

  wordStudy: string | null;
  studyWord: (num: string) => void;
  searchFor: string | null;
  searchText: (q: string) => void;
  toast: (msg: string) => void;
  toastMsg: string | null;
}

const C = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(C);
  if (!c) throw new Error("no app context");
  return c;
};

/** A JSON document in the store, loaded once and written back (debounced) on change. */
function useStored<T>(name: string, initial: T): [T, (f: (v: T) => T) => void, boolean] {
  const [v, setV] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    api.storeRead<T>(name).then((x) => {
      if (x !== null && x !== undefined) setV((cur) => (typeof cur === "object" && !Array.isArray(cur) && cur ? { ...cur, ...x } : x));
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [name]);
  const update = useCallback((f: (v: T) => T) => {
    setV((cur) => {
      const next = f(cur);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => { api.storeWrite(name, next).catch((e) => console.error(name, e)); }, 250);
      return next;
    });
  }, [name]);
  return [v, update, loaded];
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
  const [settings, setSettings, settingsLoaded] = useStored<Settings>("settings", DEFAULTS);
  const [bookmarks, setBookmarks] = useStored<Bookmark[]>("bookmarks", []);
  const [highlights, setHighlights] = useStored<Record<string, HlColor>>("highlights", {});
  const [nav, setNav, navLoaded] = useStored<{ loc: Loc; recent: Recent[]; doc: Doc | null; docAt: Record<string, string> }>("place", { loc: { book: 43, chapter: 1 }, recent: [], doc: null, docAt: {} });
  const [plans, setPlans] = useStored<Plan[]>("plans", []);
  const [chats, setChats] = useStored<Chat[]>("chats", []);
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
  const [wordStudy, setWordStudy] = useState<string | null>(null);
  const [journalSeed, setJournalSeed] = useState<JournalSeed | null>(null);
  const [pending, setPendingState] = useState<Pending | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [searchFor, setSearchFor] = useState<string | null>(null);
  const [toastMsg, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => { api.library().then(setLib); api.journalDefaultDir().then(setDefaultDir); }, []);

  useEffect(() => {
    // "midnight" was a trial of the GitHub palette that became Dark; a setting saved then still means dark.
    const t = (settings.theme as string) === "midnight" ? "dark" : settings.theme;
    if (t === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
    document.documentElement.style.setProperty("--read-size", `${settings.readSize}px`);
    document.documentElement.style.setProperty("--serif", READ_FONTS[settings.readFont]?.stack ?? READ_FONTS.literata.stack);
  }, [settings.theme, settings.readSize, settings.readFont]);

  const journalDir = settings.journalDir || defaultDir;
  const reloadJournal = useCallback(async () => {
    if (!journalDir) return;
    try { setJournal(await api.journalList(journalDir)); } catch (e) { console.error(e); }
  }, [journalDir]);
  useEffect(() => { reloadJournal(); }, [reloadJournal]);

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

  const here = (): Place => ({ screen, loc: nav.loc, doc: nav.doc, word: wordStudy, search: searchFor });
  const show = (pl: Place) => {
    curPlace.current = pl;
    setScreen(pl.screen);
    setWordStudy(pl.word);
    setSearchFor(pl.search);
    setNav((n) => ({ ...n, loc: pl.loc, doc: pl.doc }));
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
  const addRecent = (r: Recent) => setNav((n) => ({ ...n, recent: [r, ...n.recent.filter((x) => !sameRecent(x, r))].slice(0, 12) }));

  const open = (l: Loc, s?: Screen) => {
    addRecent({ book: l.book, chapter: l.chapter, at: new Date().toISOString() });
    navigate({ loc: l, doc: null, ...(s ? { screen: s } : {}) });
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

  const toast = useCallback((m: string) => {
    setToast(m);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const value: Ctx = {
    lib, bibles, mod, strongsBible, lexicon, concordance, tsk,
    rescan: async () => { setLib(await api.rescan()); },
    settings, set: (p) => setSettings((s) => ({ ...s, ...p })),
    screen, go: (s) => navigate({ screen: s }),
    loc: nav.loc, open,
    back: () => moveHist(-1), forward: () => moveHist(1),
    canBack: hist.current.i > 0, canForward: hist.current.i < hist.current.stack.length - 1,
    bookmarks,
    toggleBookmark: (ref, bible) => setBookmarks((bs) => {
      const same = (b: Bookmark) => b.ref.book === ref.book && b.ref.chapter === ref.chapter && b.ref.verse === ref.verse && (b.ref.to ?? b.ref.verse) === (ref.to ?? ref.verse);
      return bs.some(same) ? bs.filter((b) => !same(b)) : [{ id: uid(), ref, bible, created: new Date().toISOString() }, ...bs];
    }),
    highlights,
    setHighlight: (k, c) => setHighlights((h) => { const n = { ...h }; if (c) n[k] = c; else delete n[k]; return n; }),
    recent: nav.recent,
    session, setSession,
    doc: nav.doc, docAt: nav.docAt ?? {},
    openDoc: (module, title, kind = "reference") => {
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
    saveEntry: async (e) => { await api.journalSave(journalDir, e); await reloadJournal(); },
    deleteEntry: async (id) => { await api.journalDelete(journalDir, id); await reloadJournal(); },
    reloadJournal,
    plans, setPlans, chats, setChats,
    // An article, a commentary or a question is shown beside the Bible, so a book open in Read is
    // closed for it (back returns to the book).
    pending, setPending: (x) => { setPendingState(x); if (x) navigate({ screen: "read", doc: null }); },
    journalSeed, startEntry: (seed) => { setJournalSeed(seed); navigate({ screen: "journal" }); }, clearSeed: () => setJournalSeed(null),
    wordStudy, studyWord: (n) => navigate({ screen: "word", word: n }),
    searchFor, searchText: (q) => navigate({ screen: "search", search: q }),
    toast, toastMsg,
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}
