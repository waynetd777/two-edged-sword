// App-wide state: the library, settings, bookmarks and highlights, the journal, and where the
// reader is. Everything the user makes is saved through the Rust store (one JSON file each)
// or, for the journal, as Markdown in the journal folder.

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, JournalEntry, LibraryInfo, ModuleInfo } from "./api";
import { Ref } from "./bible";
import { Plan } from "./plans";

export type Theme = "auto" | "light" | "dark";
export type Model = "claude-opus-5-5" | "claude-sonnet-5" | "claude-haiku-4-5-20251001";
export const MODELS: { id: Model; name: string }[] = [
  { id: "claude-opus-5-5", name: "Opus 5.5" },
  { id: "claude-sonnet-5", name: "Sonnet 5" },
  { id: "claude-haiku-4-5-20251001", name: "Haiku 4.5" },
];

export interface Settings {
  theme: Theme;
  readSize: number;
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
}

const DEFAULTS: Settings = {
  theme: "auto", readSize: 19, redLetters: true, layout: "verse", bible: "kjv", compare: ["kjv", "asv", "kjv+"], hiddenBibles: [],
  commentaryOrder: ["barnes", "henry", "clarke", "gill", "jfb", "wesley", "darby", "meyer"], dictionaryOrder: ["isbe", "smith", "nave", "cyclopedia"],
  voice: "", rate: 1, continueChapter: true, readNumbers: false, highlightWords: true, journalDir: "", showNotes: true,
  model: "claude-sonnet-5", includeCommentaries: true, allowLicensed: true, reminder: false, reminderTime: "06:30", whenBehind: "ask", studyPane: true, copyNumbers: true,
};

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
  messages: ChatMsg[];
  journaled?: boolean;
}

export interface JournalSeed { verses?: string[]; title?: string; body?: string; tags?: string[]; /** Open this entry instead of starting one. */ openId?: string; chatId?: string }

export interface Pending { article?: { module: string; topic: string }; ask?: string; commentary?: string }

export type Screen = "read" | "compare" | "search" | "word" | "journal" | "plans" | "library" | "settings";

export interface Loc { book: number; chapter: number; verse?: number; to?: number }

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
  recent: { book: number; chapter: number; at: string }[];

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
  const [nav, setNav] = useStored<{ loc: Loc; recent: { book: number; chapter: number; at: string }[] }>("place", { loc: { book: 43, chapter: 1 }, recent: [] });
  const [plans, setPlans] = useStored<Plan[]>("plans", []);
  const [chats, setChats] = useStored<Chat[]>("chats", []);
  const [screen, setScreen] = useState<Screen>("read");
  const hist = useRef<{ stack: Loc[]; i: number }>({ stack: [], i: -1 });
  const [, bump] = useState(0);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [defaultDir, setDefaultDir] = useState("");
  const [wordStudy, setWordStudy] = useState<string | null>(null);
  const [journalSeed, setJournalSeed] = useState<JournalSeed | null>(null);
  const [pending, setPendingState] = useState<Pending | null>(null);
  const [searchFor, setSearchFor] = useState<string | null>(null);
  const [toastMsg, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => { api.library().then(setLib); api.journalDefaultDir().then(setDefaultDir); }, []);

  useEffect(() => {
    const t = settings.theme;
    if (t === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
    document.documentElement.style.setProperty("--read-size", `${settings.readSize}px`);
  }, [settings.theme, settings.readSize]);

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

  const open = useCallback((l: Loc, s?: Screen) => {
    const h = hist.current;
    h.stack = h.stack.slice(0, h.i + 1);
    h.stack.push(l);
    if (h.stack.length > 200) h.stack.shift();
    h.i = h.stack.length - 1;
    setNav((n) => {
      const recent = [{ book: l.book, chapter: l.chapter, at: new Date().toISOString() }, ...n.recent.filter((r) => !(r.book === l.book && r.chapter === l.chapter))].slice(0, 12);
      return { loc: l, recent };
    });
    if (s) setScreen(s);
    bump((x) => x + 1);
  }, [setNav]);

  // Seed the history with where the reader was last time.
  useEffect(() => {
    if (hist.current.i < 0 && nav.loc) { hist.current = { stack: [nav.loc], i: 0 }; bump((x) => x + 1); }
  }, [nav.loc]);

  const moveHist = (d: number) => {
    const h = hist.current;
    const j = h.i + d;
    if (j < 0 || j >= h.stack.length) return;
    h.i = j;
    setNav((n) => ({ ...n, loc: h.stack[j] }));
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
    screen, go: setScreen,
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
    journal, journalDir,
    saveEntry: async (e) => { await api.journalSave(journalDir, e); await reloadJournal(); },
    deleteEntry: async (id) => { await api.journalDelete(journalDir, id); await reloadJournal(); },
    reloadJournal,
    plans, setPlans, chats, setChats,
    pending, setPending: (x) => { setPendingState(x); if (x) setScreen("read"); },
    journalSeed, startEntry: (seed) => { setJournalSeed(seed); setScreen("journal"); }, clearSeed: () => setJournalSeed(null),
    wordStudy, studyWord: (n) => { setWordStudy(n); setScreen("word"); },
    searchFor, searchText: (q) => { setSearchFor(q); setScreen("search"); },
    toast, toastMsg,
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}
