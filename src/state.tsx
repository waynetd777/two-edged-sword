// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// App-wide state: the library, settings, bookmarks and highlights, the journal, and where the
// reader is. Everything the user makes is saved through the Rust store (one JSON file each)
// or, for the journal, as Markdown in the journal folder.

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Song } from "./worship";
import type { Closing } from "./closing";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import {
  checkPayload,
  clamp,
  entryKey,
  forget,
  keepBoth,
  Ledger,
  merge,
  payload as syncPayload,
  Payload,
  refuseMassRemoval,
  removedKeys,
  settle,
  SYNC_LIMIT,
  stable,
  stamp,
  vanished,
  withoutJournal,
} from "./sync";

/** The most journal entries one sync may delete; a phone that removes more is refused. */
const MAX_SYNC_DELETES = SYNC_LIMIT;

/** Bookmarks, highlights or plans empty here though the ledger knew many: their ledger entries are
 *  forgotten, so nothing is taken for removed and a phone sends them back. (The journal is stricter:
 *  journalVanished stops sync, rather than refill a journal folder.) */
const forgetVanished = (l: Ledger, now: Record<string, unknown>) => {
  const gone = vanished(l, now);
  gone.delete("j");
  if (gone.size) console.error(`sync: ${[...gone].join(", ")} empty here but known before; taken from the phone`);
  return forget(l, gone);
};

/** The journal is empty but the ledger knows many entries in it: taken for unreadable rather than
 *  emptied, so nothing is stamped and nothing syncs until it reads again. */
const journalVanished = (l: Ledger, journal: unknown[]) =>
  journal.length === 0 && Object.entries(l).filter(([k, e]) => k.startsWith("j|") && !e.del).length > MAX_SYNC_DELETES;
import { fromItems, itemsOf, placesOf, Synced } from "./syncHub";
import { api, JournalEntry, LibraryInfo, ModuleInfo } from "./api";
import { claudeAlias } from "./assistant";
import { Ref } from "./bible";
import { Plan, WebDevotional, ymd } from "./plans";
import { forgetSizes } from "./sizes";
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
  /** Read e-Sword X's library as well as the app's own modules (skipped quietly if it isn't there). */
  readEsword: boolean;
  /** Modules ("commentary:wesley") read from e-Sword X where the app has its own copy too: the app's, otherwise. */
  eswordCopies: string[];
  layout: "verse" | "paragraph";
  bible: string;
  compare: string[];
  /** KJV History: where the KJV came from, or the English Bibles since. */
  historyView: "before" | "after";
  /** Up to three Bibles, for the buttons left of Paragraph and Verse in the reader. */
  favBibles: string[];
  hiddenBibles: string[];
  commentaryOrder: string[];
  /** The cross-references shown under the commentary (a module in `xrefs`): "" for the first. */
  crossRefs: string;
  dictionaryOrder: string[];
  voice: string;
  /** Voices for Bibles in Hebrew (and Aramaic) and in Greek: "" for the best one installed. */
  voiceHebrew: string;
  voiceGreek: string;
  /** For the Latin Bibles: "" for the best Italian voice installed (Church Latin is said the Italian way). */
  voiceLatin: string;
  rate: number;
  continueChapter: boolean;
  /** At the end of a journal entry read aloud, go on to the next one in the list. */
  continueEntry: boolean;
  readNumbers: boolean;
  highlightWords: boolean;
  /** Faint pictures (a cross, a dove, stars…) behind a playing song's words (Visions). */
  songVisions: boolean;
  /** A verse beneath each of those pictures, from `songVerseBible` ("" for the default translation). */
  songVerses: boolean;
  songVerseBible: string;
  journalDir: string;
  showNotes: boolean;
  /** The journal highlighter's colour, kept until another is picked. */
  journalHighlight: HlColor;
  /** What each highlight colour stands for, e.g. a theme; shown in the pickers. Blank is the colour's own name. */
  hlNames: Partial<Record<HlColor, string>>;
  /** Highlights shown in the readers and the journal; adding one turns them back on. */
  showHighlights: boolean;
  /** Grammar checking in the journal, with spelling. */
  journalGrammar: boolean;
  model: Model;
  includeCommentaries: boolean;
  /** Passage chats also get the user's journal entries on the passage. */
  askJournal: boolean;
  /** After each answer, a second call suggests the next question, offered in the empty box. */
  askSuggest: boolean;
  allowLicensed: boolean;
  /** When the app opens, offer the Getting started guide (Welcome.tsx); "Don't ask me again" turns it off. */
  offerGuide: boolean;
  /** Getting started walk-throughs finished, by id (Help.tsx). */
  guidesDone: Record<string, boolean>;
  reminder: boolean;
  reminderTime: string;
  whenBehind: "ask" | "move" | "catchup" | "skip";
  studyPane: boolean;
  /** Copying verses puts the verse numbers in front of each verse. */
  copyNumbers: boolean;
  /** The study pane as it was left: its tab, the commentary and dictionary entry chosen, and whether it follows the reading. */
  studyTab: StudyTab;
  /** The study pane beside a book: its tab. */
  docTab: "notes" | "dictionary" | "ask" | "about";
  studyCommentary: string | null;
  studyDict: DictAt | null;
  dictModule: string | null;
  studyFollow: boolean;
  /** Devotional websites the user has added, for any plan (plans.ts onlineDevotionals). */
  webDevotionals: WebDevotional[];
  /** Online devotionals, by id, whose pages are left as they are in the dark theme rather than
   *  inverted to look dark (a site that is dark already): false. Absent is inverted. */
  webInvert: Record<string, boolean>;
  /** Online devotionals' pages, by id, shown larger or smaller (⌘+ ⌘−): 1 is as the site made it. */
  webZoom: Record<string, number>;
}

const DEFAULTS: Settings = {
  theme: "auto",
  readSize: 19,
  readFont: "atkinson",
  studyTab: "commentary",
  docTab: "ask",
  studyCommentary: null,
  studyDict: null,
  dictModule: null,
  studyFollow: true,
  redLetters: true,
  kjvGlosses: true,
  readEsword: true,
  eswordCopies: [],
  layout: "verse",
  bible: "kjv",
  compare: ["kjv", "asv", "kjv+"],
  historyView: "before",
  favBibles: [],
  hiddenBibles: [],
  commentaryOrder: ["barnes", "henry", "clarke", "gill", "jfb", "wesley", "darby", "meyer"],
  crossRefs: "",
  dictionaryOrder: ["isbe", "smith", "nave", "cyclopedia"],
  voice: "",
  voiceHebrew: "",
  voiceGreek: "",
  voiceLatin: "",
  rate: 1,
  continueChapter: true,
  continueEntry: false,
  readNumbers: false,
  highlightWords: true,
  songVisions: true,
  songVerses: true,
  songVerseBible: "",
  journalDir: "",
  showNotes: true,
  journalHighlight: "yellow",
  hlNames: {},
  showHighlights: true,
  journalGrammar: true,
  model: "claude:sonnet",
  includeCommentaries: true,
  askJournal: false,
  askSuggest: true,
  offerGuide: true,
  guidesDone: {},
  allowLicensed: true,
  reminder: false,
  reminderTime: "06:30",
  whenBehind: "ask",
  studyPane: true,
  copyNumbers: true,
  webDevotionals: [],
  webInvert: {},
  webZoom: {},
};

/** Faces for Scripture, commentary and notes. Greek and Hebrew stay in --display. */
// In the order Settings lists them, the default first, as the phone app does.
export const READ_FONTS = {
  atkinson: { label: "Atkinson", stack: '"Atkinson Hyperlegible Next Variable", -apple-system, sans-serif' },
  literata: { label: "Literata", stack: '"Literata Variable", Georgia, serif' },
  source: { label: "Source Serif", stack: '"Source Serif 4 Variable", "Source Serif 4", Georgia, serif' },
  inter: { label: "Inter", stack: '"Inter Variable", -apple-system, sans-serif' },
};
export type ReadFont = keyof typeof READ_FONTS;

/** A bookmarked passage, or (with `doc`) a paragraph of a reference book or devotional; `ref` is
 *  then unused ({ book: 0, chapter: 0 }). */
export interface Bookmark {
  id: string;
  ref: Ref;
  bible: string;
  created: string;
  doc?: DocSpot;
}
/** A paragraph in a book: its chapter, and the paragraph's number there (from 1). */
interface DocSpot {
  module: string;
  title: string;
  kind?: DocKind;
  para: number;
}
export type HlColor = "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "purple" | "grey";
export const HL_COLOURS: HlColor[] = ["red", "orange", "yellow", "green", "teal", "blue", "purple", "grey"];
/** A theme's journal tag: its name as a tag, "Grace and the cross" → grace-and-the-cross. */
const themeTag = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
export type HlTheme = { colour: HlColor; name: string; tag: string };
/** The highlight colours that have names (Settings › Highlights), as themes with their tags. */
export const themesOf = (names: Partial<Record<HlColor, string>> | undefined): HlTheme[] =>
  HL_COLOURS.flatMap((colour) => {
    const name = names?.[colour]?.trim();
    return name ? [{ colour, name, tag: themeTag(name) }] : [];
  });
/** Highlights saved before there were six colours. */
export const hlName = (c: string): HlColor => (c === "gold" ? "yellow" : c === "rose" ? "red" : (c as HlColor));

interface ChatMsg {
  role: "user" | "assistant";
  text: string;
  error?: boolean;
}
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

interface JournalSeed {
  verses?: string[];
  title?: string;
  body?: string;
  tags?: string[];
  /** Open this entry instead of starting one. */ openId?: string;
}

/** A dictionary entry to show, or (with search) a word to look up in the dictionary search, in the current dictionary when module is "". */
export interface DictAt {
  module: string;
  topic: string;
  search?: boolean;
}
export interface Pending {
  article?: DictAt;
  ask?: string;
  commentary?: string;
}

export type Screen = "read" | "compare" | "search" | "word" | "journal" | "plans" | "library" | "history" | "settings";

/** A passage or book chapter opened lately: of the Bible, or (with `doc`) of a reference book or devotional. `verse`/`to` are the verses it was opened at, if any; one entry per chapter, the latest open. */
export interface Recent {
  book: number;
  chapter: number;
  verse?: number;
  to?: number;
  at: string;
  doc?: Doc;
}

/** One entry in the back/forward history. `word` is a Strong's number or an English word looked
 *  up in Word Study; `search` is the last search run. */
export interface Place {
  screen: Screen;
  loc: Loc;
  doc: Doc | null;
  word: string | null;
  search: string | null;
  /** The Bible being read there. */ bible?: string;
  /** Compare's columns there, when they aren't the saved ones (Settings › compare): a pair opened from KJV History. */
  compare?: string[];
  /** Where each scrolling area was when the user moved on (scrollsNow). */ scroll?: number[];
}
/** A place with what was open in it: a book's paragraph (from 1), a journal entry. */
export interface Opened extends Place {
  para?: number;
  entry?: string;
}

export interface Loc {
  book: number;
  chapter: number;
  verse?: number;
  to?: number;
}

const samePlace = (a: Place, b: Place) => JSON.stringify({ ...a, scroll: undefined }) === JSON.stringify({ ...b, scroll: undefined });

/** How far each scrolling area on screen (.scroll: the reading column, the study pane, lists) is scrolled. */
const scrollsNow = () => Array.from(document.querySelectorAll<HTMLElement>(".scroll")).map((e) => Math.round(e.scrollTop));

/** The verse at the top of the reading column, and how far below the column's top it starts. */
function topVerse(): { v: string; off: number } | null {
  const col = document.querySelector<HTMLElement>(".readcol");
  if (!col) return null;
  const top = col.getBoundingClientRect().top + 72; // under the chapter's name, which stays put
  const el = Array.from(col.querySelectorAll<HTMLElement>("[data-v]")).find((e) => e.getBoundingClientRect().bottom > top);
  return el ? { v: el.dataset.v!, off: el.getBoundingClientRect().top - col.getBoundingClientRect().top } : null;
}
/**
 * Runs `step` every 60ms for a couple of seconds, while the page fills in as its text loads,
 * until it says it is done (returns true) or the user scrolls, types or clicks. `step` is given
 * how many times it has run before.
 */
function whileUntouched(step: (tries: number) => boolean | void) {
  const EVENTS = ["wheel", "keydown", "mousedown", "touchstart"];
  let tries = 0,
    stopped = false;
  const stop = () => {
    stopped = true;
    EVENTS.forEach((e) => window.removeEventListener(e, stop, true));
  };
  EVENTS.forEach((e) => window.addEventListener(e, stop, true));
  const run = () => {
    if (stopped) return;
    if (step(tries) === true) stop();
    else if (++tries < 30) window.setTimeout(run, 60);
    else stop();
  };
  window.setTimeout(run, 30);
}

/** Scrolls the reading column so verse `at.v` is where it was, once the new translation has loaded. */
function keepVerse(at: { v: string; off: number }) {
  whileUntouched(() => {
    const col = document.querySelector<HTMLElement>(".readcol");
    const el = col?.querySelector<HTMLElement>(`[data-v="${at.v}"]`);
    if (col && el) {
      const d = el.getBoundingClientRect().top - col.getBoundingClientRect().top - at.off;
      if (Math.abs(d) > 2) col.scrollTop += d;
    }
  });
}

/** Puts the scrolling areas back where a history step left them. */
function restoreScrolls(want: number[]) {
  whileUntouched((tries) => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".scroll"));
    let done = els.length === want.length;
    if (done)
      els.forEach((el, k) => {
        if (Math.abs(el.scrollTop - want[k]) > 2) {
          el.scrollTop = want[k];
          if (Math.abs(el.scrollTop - want[k]) > 2) done = false;
        }
      });
    return done && tries > 6; // settled, and past the page's own first scroll
  });
}
/** A reference book open in the reading column, and the chapter being read. With `url`, an online
 *  devotional's page instead (WebPage): `module` is its id and `title` its name. */
interface Doc {
  module: string;
  title: string;
  kind?: DocKind;
  url?: string;
  /** "lyrics": the words of the song playing in Music (LyricsPage) instead. */
  view?: "lyrics";
}
type DocKind = "reference" | "devotional";

/** One part of a Quiet time: a chapter (or part of one), a devotional's reading, or an online devotional. */
export type QuietStep = { key: string; label: string } & (
  | { kind: "bible"; bible: string; b: number; c: number; v?: number; v2?: number }
  | { kind: "devotional"; module: string; title: string }
  /** `window`: the site won't be shown inside the app, so it opens in a window of its own. */
  | { kind: "online"; id: string; url: string; window?: boolean }
  /** Songs for the day's reading; `picked` once they are chosen (worship.ts), with why when it had to guess. */
  | { kind: "worship"; songs: number; when: "before" | "after"; picked?: Song[]; intro?: string; note?: string }
  /** The last part: a verse or passage chosen to wrap up the day (closing.ts); `picked` once it is. */
  | { kind: "closing"; bible: string; picked?: Closing }
);
export interface Session {
  planId: string;
  dayKey: string;
  steps: QuietStep[];
  i: number;
  audio: boolean;
  started: number;
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
  /** The cross-reference modules, shown under the commentary rather than among the commentaries: the TSK, then OpenBible's. */
  xrefs: string[];
  /** Looks for modules again; `esword` says whether to read e-Sword X's library (the setting if left out). */
  rescan: (esword?: boolean, eswordCopies?: string[]) => Promise<void>;

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
  /** Reads on in another Bible, as a step back can undo (the favourite translations). */
  openBible: (id: string) => void;
  /** Compare with just these columns, without changing the saved ones; back returns to where the user was. */
  compareWith: (ids: string[]) => void;
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
  /** Shows an online devotional's page in the reading column. */
  openWebDoc: (id: string, url: string, title: string) => void;
  /** Shows the words of the song playing in Music in the reading column. */
  openLyrics: () => void;
  /** The chapter last read in each reference book. */
  docAt: Record<string, string>;

  journal: JournalEntry[];
  journalDir: string;
  /** Why the journal can't be read or saved (Settings or its folder unreadable); null when it can. */
  journalError: string | null;
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
  /** Replaces the Recent list (screenshot scenes, which save nothing). */
  setRecent: (r: Recent[]) => void;
}

const C = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(C);
  if (!c) throw new Error("no app context");
  return c;
};

// Saves waiting on their debounce, written at once when the window hides, loses focus or unloads
// (closing only hides it, and Quit exits without warning the page), or before the app restarts
// into an update (the "flush" event, from updates.rs). A flusher may answer its write's promise, which
// flushAll waits for, and then for the journal's writes queued by them.
const flushers = new Set<() => unknown>();
/** The journal's writes queued so far (the provider's journalWrite), finished. */
let journalWritten: () => Promise<unknown> = () => Promise.resolve();
const flushAll = async () => {
  await Promise.allSettled([...flushers].map((f) => f()));
  await journalWritten().catch(() => {});
};
/** Adds a pending save to those written at once; returns its removal. */
export const onFlush = (f: () => unknown) => {
  flushers.add(f);
  return () => {
    flushers.delete(f);
  };
};
window.addEventListener("beforeunload", flushAll);
window.addEventListener("blur", flushAll);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushAll();
});
// Before a restart into an update: updates.rs waits for flush_done (a few seconds at most).
void listen("flush", () => flushAll().finally(() => invoke("flush_done").catch(() => {})));

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
    return d ? api.storeWrite(name, d.v).catch((e) => console.error(name, e)) : undefined;
  }, [name]);
  const save = useCallback(
    (next: T) => {
      due.current = { v: next };
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, 250);
    },
    [flush],
  );
  useEffect(() => {
    flushers.add(flush);
    return () => {
      flushers.delete(flush);
      flush();
    };
  }, [flush]);
  useEffect(() => {
    api
      .storeRead<T>(name)
      .then((x) => {
        if (ok.current) return;
        const base =
          x !== null && x !== undefined
            ? typeof initial === "object" && !Array.isArray(initial) && initial
              ? { ...initial, ...x }
              : x
            : initial;
        const q = early.current ?? [];
        const next = q.reduce((a, f) => f(a), base);
        ok.current = true;
        early.current = null;
        setV(next);
        if (q.length) save(next);
        setLoaded(true);
      })
      .catch((e) => {
        console.error(`couldn't read ${name}; changes won't be saved`, e);
        early.current = null;
        setFailed(true);
        setLoaded(true);
      });
  }, [name]); // eslint-disable-line react-hooks/exhaustive-deps
  const update = useCallback(
    (f: (v: T) => T) => {
      // Before the read, the change is only replayed onto what it returns (which then saves).
      const pre = !ok.current;
      if (early.current) early.current.push(f);
      setV((cur) => {
        const next = f(cur);
        if (!pre) save(next);
        return next;
      });
    },
    [save],
  );
  return [v, update, loaded, failed];
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const nowLocal = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${ymd(d)}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const vkey = (b: number, c: number, v: number) => `${b}.${c}.${v}`;

export function AppProvider({ children }: { children: ReactNode }) {
  const [lib, setLib] = useState<LibraryInfo | null>(null);
  const [settings, setSettings, settingsLoaded, f1] = useStored<Settings>("settings", DEFAULTS);
  const [bookmarks, setBookmarks, bookmarksLoaded, f2] = useStored<Bookmark[]>("bookmarks", []);
  const [highlights, setHighlights, highlightsLoaded, f3] = useStored<Record<string, HlColor>>("highlights", {});
  // The last word studied is kept with the place, so Word Study reopens on it.
  const [nav, setNav, navLoaded, f4] = useStored<{
    loc: Loc;
    recent: Recent[];
    doc: Doc | null;
    docAt: Record<string, string>;
    word?: string | null;
  }>("place", { loc: { book: 43, chapter: 1 }, recent: [], doc: null, docAt: {}, word: null });
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
  /** The folder whose journal has been read. Sync waits until it is the folder Settings names: before
   *  that the journal is empty only because it hasn't been read, and an empty journal would be taken for
   *  every entry deleted (which happened once, on a hot reload in development). */
  const [journalLoadedFor, setJournalLoadedFor] = useState<string | null>(null);
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

  useEffect(() => {
    api.library().then(setLib);
    api.journalDefaultDir().then(setDefaultDir);
  }, []);

  useEffect(() => {
    // "midnight" was a trial of the GitHub palette that became Dark; a setting saved then still means dark.
    const t = (settings.theme as string) === "midnight" ? "dark" : settings.theme;
    if (t === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
    document.documentElement.style.setProperty("--read-size", `${settings.readSize}px`);
    // Headings (--display) follow the reading font too, so the whole app changes with it.
    const stack = READ_FONTS[settings.readFont]?.stack ?? READ_FONTS.atkinson.stack;
    document.documentElement.style.setProperty("--serif", stack);
    document.documentElement.style.setProperty("--display", stack);
  }, [settings.theme, settings.readSize, settings.readFont]);
  useEffect(() => {
    document.documentElement.classList.toggle("hide-hl", settings.showHighlights === false);
  }, [settings.showHighlights]);

  // Settings couldn't be read: the folder it names isn't known, so the journal is neither read nor
  // written (the default folder would be the wrong one, and a journal there would start afresh).
  const settingsFailed = f1;
  const journalDir = settingsFailed ? "" : settings.journalDir || defaultDir;
  const [journalReadError, setJournalReadError] = useState<string | null>(null);
  const journalError = settingsFailed
    ? "Couldn't read Settings, so the journal's folder isn't known. The journal isn't shown or saved until the app is restarted."
    : journalReadError;
  /** The journal as it is now, ahead of React's state: a save changes it at once, and sync reads it. */
  const journalNow = useRef<JournalEntry[]>([]);
  const putJournal = useCallback((f: (js: JournalEntry[]) => JournalEntry[]) => {
    journalNow.current = f(journalNow.current);
    setJournal(journalNow.current);
  }, []);
  // Only the latest listing is kept: at startup the default folder's can arrive after the chosen one's.
  const journalSeq = useRef(0);
  /** The journal files' fingerprint as last seen, so a save made here isn't mistaken for an edit elsewhere. */
  const journalStamp = useRef<string | null>(null);
  /** Bumped when a write here notes the new fingerprint, so a check begun before it can't put back an older one. */
  const stampSeq = useRef(0);
  /** Journal writes waiting or under way (saves, deletes, a sync's): the files aren't read back meanwhile. */
  const journalWriting = useRef(0);
  const reloadAfter = useRef(false);
  const journalQueue = useRef<Promise<unknown>>(Promise.resolve());
  const reloadJournal = useCallback(async () => {
    if (!journalDir) return;
    // Not while writing: the listing could miss a write under way. Once, after.
    if (journalWriting.current) {
      reloadAfter.current = true;
      return;
    }
    const n = ++journalSeq.current;
    try {
      const js = await api.journalList(journalDir);
      if (journalWriting.current) reloadAfter.current = true;
      else if (n === journalSeq.current) {
        putJournal(() => js);
        setJournalLoadedFor(journalDir);
        setJournalReadError(null);
      }
    } catch (e) {
      console.error(e);
      if (n === journalSeq.current) setJournalReadError(`Couldn't read the journal: ${String(e).replace(/^Error: /, "")}`);
    }
  }, [journalDir, putJournal]);
  const reloadRef = useRef(reloadJournal);
  reloadRef.current = reloadJournal;
  /** Runs a journal write after those before it, so a save and a sync's writes never cross. */
  const journalWrite = useCallback(<T,>(f: () => Promise<T>): Promise<T> => {
    journalWriting.current++;
    const run = journalQueue.current.then(f).finally(() => {
      if (--journalWriting.current === 0 && reloadAfter.current) {
        reloadAfter.current = false;
        reloadRef.current();
      }
    });
    journalQueue.current = run.catch(() => {});
    return run;
  }, []);
  journalWritten = () => journalQueue.current;
  /** Before a write here: if the files changed elsewhere since last seen (the window was hidden, so they
   *  weren't checked), they're read again once the writes are done, as the write's own fingerprint would
   *  otherwise hide that change. */
  const changedElsewhere = async (dir: string) => {
    const st = await api.journalStamp(dir).catch(() => null);
    if (st !== null && journalStamp.current !== null && st !== journalStamp.current) reloadAfter.current = true;
  };
  /** The files' fingerprint after a write here, so it isn't taken for an edit elsewhere. */
  const noteStamp = async (dir: string) => {
    const n = ++stampSeq.current;
    const st = await api.journalStamp(dir).catch(() => null);
    if (st !== null && n === stampSeq.current) journalStamp.current = st;
  };
  useEffect(() => {
    reloadJournal();
  }, [reloadJournal]);
  // Edits made elsewhere (in a notes app) are picked up: the files are checked every few seconds while
  // the window is showing, and at once when it comes back to the front.
  useEffect(() => {
    if (!journalDir) return;
    let dead = false;
    journalStamp.current = null;
    const check = async () => {
      if (document.visibilityState === "hidden" || journalWriting.current) return;
      const n = stampSeq.current;
      try {
        const s = await api.journalStamp(journalDir);
        // A write here since began: its own fingerprint is the newer one.
        if (dead || n !== stampSeq.current || journalWriting.current) return;
        if (journalStamp.current !== null && s !== journalStamp.current) reloadJournal();
        journalStamp.current = s;
      } catch {
        /* the folder isn't there; saving says so */
      }
    };
    check();
    const t = window.setInterval(check, 3000);
    window.addEventListener("focus", check);
    return () => {
      dead = true;
      window.clearInterval(t);
      window.removeEventListener("focus", check);
    };
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
  const openbible = find("commentary", ["openbible_xref"], (m) => /cross-ref/i.test(m.title));
  const xrefs = useMemo(() => [tsk, openbible].filter((x): x is string => !!x), [tsk, openbible]);

  // Fall back to the first Bible if the saved one is gone.
  useEffect(() => {
    if (settingsLoaded && bibles.length && !bibles.some((b) => b.id === settings.bible))
      setSettings((s) => ({ ...s, bible: bibles[0].id }));
  }, [settingsLoaded, bibles, settings.bible, setSettings]);

  // A Claude model saved before the aliases ("claude-sonnet-5") becomes its family's ("claude:sonnet").
  useEffect(() => {
    if (settingsLoaded && claudeAlias(settings.model) !== settings.model) setSettings((s) => ({ ...s, model: claudeAlias(s.model) }));
  }, [settingsLoaded, settings.model, setSettings]);

  // The Bible being read this session, when it isn't the saved default (settings.bible). Closing
  // the window (the app stays in the menu bar) goes back to the default for next time.
  const [sessionBible, setSessionBible] = useState<string | null>(null);
  useEffect(() => {
    if (sessionBible && bibles.length && !bibles.some((b) => b.id === sessionBible)) setSessionBible(null);
  }, [sessionBible, bibles]);
  useEffect(() => {
    const off = listen("main-window-closed", () => setSessionBible(null));
    return () => {
      off.then((f) => f()).catch(() => {});
    };
  }, []);
  // Compare's columns for the current place when they aren't the saved ones (Place.compare).
  const [placeCompare, setPlaceCompare] = useState<string[] | null>(null);
  const view = useMemo(
    () => ({
      ...settings,
      ...(sessionBible && sessionBible !== settings.bible ? { bible: sessionBible } : {}),
      ...(placeCompare ? { compare: placeCompare } : {}),
    }),
    [settings, sessionBible, placeCompare],
  );

  // Each place remembers its Bible, so back after switching to a favourite translation returns to
  // the one before (the Bible picker changes the current place's instead of adding one).
  const bibleNow = useRef(view.bible);
  bibleNow.current = view.bible;
  const here = (): Place => ({ screen, loc: nav.loc, doc: nav.doc, word: wordStudy, search: searchFor, bible: bibleNow.current });
  const show = (pl: Place) => {
    curPlace.current = pl;
    setPlaceCompare(pl.compare ?? null);
    if (pl.bible && pl.bible !== bibleNow.current && bibles.some((b) => b.id === pl.bible)) {
      bibleNow.current = pl.bible;
      setSessionBible(pl.bible === settings.bible ? null : pl.bible);
    }
    setScreen(pl.screen);
    setSearchFor(pl.search);
    setNav((n) => ({ ...n, loc: pl.loc, doc: pl.doc, word: pl.word }));
  };
  /** Goes somewhere new: the current place with `patch` applied, pushed onto the history (or
   *  replacing the current entry, for a step that only fills in where the user already is). */
  const navigate = (patch: Partial<Place>, replace = false) => {
    const h = hist.current;
    const cur = curPlace.current ?? here();
    // A one-off set of Compare columns lasts while the user stays in Compare (turning pages), not beyond.
    const keep = cur.compare && (patch.screen ?? cur.screen) === "compare" && cur.screen === "compare";
    const next: Place = { ...cur, bible: bibleNow.current, scroll: undefined, compare: keep ? cur.compare : undefined, ...patch };
    if (samePlace(next, h.stack[h.i] ?? cur) && samePlace(next, cur)) return;
    if (replace && h.i >= 0) h.stack[h.i] = next;
    else {
      // Leaving: remember how far down everything was, for back to restore.
      if (h.i >= 0) h.stack[h.i] = { ...h.stack[h.i], scroll: scrollsNow() };
      h.stack = h.stack.slice(0, h.i + 1);
      h.stack.push(next);
      if (h.stack.length > 200) h.stack.shift();
      h.i = h.stack.length - 1;
    }
    show(next);
    bump((x) => x + 1);
  };

  const sameRecent = (a: Recent, b: Recent) =>
    a.doc || b.doc ? a.doc?.module === b.doc?.module && a.doc?.title === b.doc?.title : a.book === b.book && a.chapter === b.chapter;
  const addRecent = (r: Recent) => setNav((n) => ({ ...n, recent: [r, ...n.recent.filter((x) => !sameRecent(x, r))].slice(0, 50) }));

  const open = (l: Loc, s?: Screen, replace = false) => {
    addRecent({ book: l.book, chapter: l.chapter, ...(l.verse ? { verse: l.verse, to: l.to } : {}), at: new Date().toISOString() });
    navigate({ loc: l, doc: null, ...(s ? { screen: s } : {}) }, replace);
  };

  // Seed the history with where the reader was last time, once the saved place has loaded.
  useEffect(() => {
    if (navLoaded && hist.current.i < 0) {
      const pl = here();
      hist.current = { stack: [pl], i: 0 };
      curPlace.current = pl;
      bump((x) => x + 1);
    }
  }, [navLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const moveHist = (d: number) => {
    const h = hist.current;
    const j = h.i + d;
    if (j < 0 || j >= h.stack.length) return;
    h.stack[h.i] = { ...h.stack[h.i], scroll: scrollsNow() };
    h.i = j;
    show(h.stack[j]);
    bump((x) => x + 1);
    if (h.stack[j].scroll) restoreScrolls(h.stack[j].scroll!);
  };

  const toast = useCallback((m: string, undo?: () => void) => {
    setToast(m);
    setToastUndo(() =>
      undo
        ? () => {
            undo();
            setToast(null);
            setToastUndo(null);
          }
        : null,
    );
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(
      () => {
        setToast(null);
        setToastUndo(null);
      },
      undo ? 6000 : 2600,
    );
  }, []);
  const readFailed = [f1, f2, f3, f4, f5, f6].some(Boolean);
  useEffect(() => {
    if (readFailed) toast("Couldn't read your saved data — changes this session won't be saved");
  }, [readFailed, toast]);

  // Sync with the phone app (syncHub.ts, sync.ts; the server is sync.rs). The ledger notes when each
  // synced thing last changed here, so a newer change on a phone wins and an older one doesn't.
  const ledger = useRef<Ledger | null>(null);
  const ledgerLoading = useRef(false);
  /** The ledger couldn't be read: nothing syncs until it can, rather than start afresh over it. */
  const ledgerFailed = useRef(false);
  /** The journal folder the ledger's journal entries are from; they're forgotten when it changes. */
  const ledgerDir = useRef<string | null>(null);
  /** What was here at the last stamp: something gone since was removed here (a sync's own changes reset it). */
  const seen = useRef<Record<string, unknown> | null>(null);
  /** Removed here on purpose since the last stamp; only these are synced as removed (the journal's from
   *  deleteEntry alone, as an entry missing from the files may only be unread). */
  const removedHere = useRef(new Set<string>());
  const synced = useRef<Synced>({ bookmarks, highlights, docAt: nav.docAt, plans, recent: nav.recent, journal });
  synced.current = { bookmarks, highlights, docAt: nav.docAt, plans, recent: nav.recent, journal };
  const syncedNow = (): Synced => ({ ...synced.current, journal: journalNow.current });
  const journalLoaded = settingsLoaded && !!journalDir && journalLoadedFor === journalDir;
  // Not when saved data couldn't be read: what's here would be taken for everything removed.
  const syncReady = bookmarksLoaded && highlightsLoaded && navLoaded && plansLoaded && journalLoaded && !readFailed;
  const syncReadyRef = useRef(false);
  syncReadyRef.current = syncReady;
  const readFailedRef = useRef(readFailed);
  readFailedRef.current = readFailed;
  const journalDirRef = useRef(journalDir);
  journalDirRef.current = journalDir;
  const ledgerTimer = useRef<number | undefined>(undefined);
  const writeLedger = useCallback(async () => {
    window.clearTimeout(ledgerTimer.current);
    ledgerTimer.current = undefined;
    if (ledger.current) await api.storeWrite("sync-ledger", ledger.current).catch((e) => console.error("sync ledger", e));
  }, []);
  const saveLedger = () => {
    window.clearTimeout(ledgerTimer.current);
    ledgerTimer.current = window.setTimeout(writeLedger, 500);
  };
  useEffect(() => onFlush(() => (ledgerTimer.current !== undefined ? writeLedger() : undefined)), [writeLedger]);
  /** Brings the ledger up to date with what's here; false if it can't be (not read, or the journal unread). */
  const stampNow = (): boolean => {
    const l = ledger.current;
    if (!l || ledgerFailed.current) return false;
    const cur = syncedNow();
    const now = itemsOf(cur);
    let base = l;
    const dir = journalDirRef.current;
    if (ledgerDir.current !== dir) {
      // Another journal folder: the entries the ledger knew are another journal's, so they're forgotten
      // (neither removed here nor sent), and this folder's are new.
      if (ledgerDir.current !== null) {
        base = Object.fromEntries(Object.entries(l).filter(([k]) => !k.startsWith("j|")));
        console.error("sync: the journal's folder changed; its entries are taken as new");
      }
      ledgerDir.current = dir;
      api.storeWrite("sync-ledger-dir", dir).catch((e) => console.error("sync ledger", e));
    }
    if (journalVanished(base, cur.journal)) return false;
    if (seen.current) for (const k of removedKeys(seen.current, now, (k) => k.startsWith("j|"))) removedHere.current.add(k);
    seen.current = now;
    ledger.current = stamp(forgetVanished(base, now), now, removedHere.current);
    removedHere.current.clear();
    saveLedger();
    return true;
  };
  const stampRef = useRef(stampNow);
  stampRef.current = stampNow;
  useEffect(() => {
    if (!syncReady) return;
    if (ledger.current || ledgerFailed.current) {
      stampNow();
      return;
    }
    if (ledgerLoading.current) return;
    ledgerLoading.current = true;
    Promise.all([api.storeRead<Ledger>("sync-ledger"), api.storeRead<string>("sync-ledger-dir").catch(() => null)]).then(
      ([l, d]) => {
        ledgerDir.current = typeof d === "string" ? d : null;
        if (l && typeof l === "object") ledger.current = l;
        else {
          // Never synced: what's here is stamped as of long ago, so a phone's own values win the first sync.
          const now = itemsOf(syncedNow());
          seen.current = now;
          ledger.current = stamp({}, now, new Set(), 0);
        }
        stampRef.current();
      },
      (e) => {
        // Not taken for empty: that would send everything here as new and lose nothing, but a ledger that
        // can't be read may be one a retry reads, and its removals would be lost.
        ledgerFailed.current = true;
        console.error("sync: couldn't read the sync ledger; not syncing", e);
      },
    );
  }, [syncReady, bookmarks, highlights, nav.docAt, plans, journal]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    /** A sync that didn't happen, and why; `red` when it needs the user rather than another try (shown so in
     *  Settings and on the phone). */
    const fail = (rid: number, error: string, red = false) => invoke("sync_reply", { rid, merged: { error, red } }).catch(() => {});
    // One at a time, and in turn with the journal's saves: a copy of the bookmarks, highlights and plans
    // files first (once a day), then the answer.
    const un = listen<{ rid: number; payload: unknown }>("sync-request", ({ payload: { rid, payload: theirs } }) => {
      journalWrite(() =>
        api
          .dataBackup()
          .catch((e) => console.error("sync backup", e))
          .then(() => answer(rid, theirs)),
      ).catch((e) => {
        console.error("sync", e);
        fail(rid, "The computer couldn't sync.");
      });
    });
    const answer = async (rid: number, raw: unknown) => {
      const checked = checkPayload(raw);
      if (!checked) return fail(rid, "The computer couldn't read what the phone sent.");
      if (checked.dropped.length)
        console.error(`sync: dropped ${checked.dropped.length} malformed items from a phone (${checked.dropped.slice(0, 5).join(", ")})`);
      // A phone whose clock is ahead can't stamp its changes later than now.
      const at = Date.now();
      const theirs: Payload = {
        ...checked.payload,
        items: clamp(checked.payload.items, at),
        recent: checked.payload.recent.map((p) => (p.at > at ? { ...p, at } : p)),
      };
      if (ledgerFailed.current) return fail(rid, "The computer couldn't read its sync records, so nothing was synced.", true);
      if (readFailedRef.current) return fail(rid, "The computer couldn't read its saved data, so nothing was synced.", true);
      if (!ledger.current || !syncReadyRef.current)
        return fail(rid, "Two-edged Sword on the computer is still starting. Try again in a moment.");
      // Changed in another app while the window was hidden (and so not checked): read again first, so the
      // sync goes from what's in the files.
      const jdir = journalDirRef.current;
      const st = jdir ? await api.journalStamp(jdir).catch(() => null) : null;
      if (jdir && st !== null && journalStamp.current !== null && st !== journalStamp.current) {
        try {
          const js = await api.journalList(jdir);
          ++journalSeq.current;
          putJournal(() => js);
          journalStamp.current = st;
        } catch (e) {
          console.error("sync: reading the journal", e);
          return fail(rid, "The computer couldn't read its journal, so nothing was synced.", true);
        }
      }
      if (!stampRef.current() || !ledger.current) return fail(rid, "The computer couldn't read its journal, so nothing was synced.", true);
      const cur = syncedNow();
      const now = itemsOf(cur);
      const mine = syncPayload(ledger.current, now, placesOf(cur.recent));
      // A phone without the journal neither sends entries nor gets them; the computer's stay as they are.
      // A result that would remove many of one kind (a phone that lost them) is refused, and they go back.
      const { merged, refused } = refuseMassRemoval(
        now,
        merge(mine, { ...theirs, items: theirs.journal ? keepBoth(mine.items, theirs) : withoutJournal(theirs.items) }),
      );
      if (refused.size) console.error(`sync: a phone would have removed many ${[...refused].join(", ")}; kept`);
      const done = settle(merged);
      const next = fromItems(done.now, merged.recent, cur, uid);
      // Journal entries the phone added, changed or removed, written to the journal's files. Only an entry
      // the phone itself removed is deleted here, never one this computer's own ledger had down as
      // removed, and never more than a few in one sync: anything else is kept, and syncs back as it is.
      const dir = journalDirRef.current;
      const was = new Map(cur.journal.map((e) => [e.id, e]));
      const writes: { id: string; run: () => Promise<void> }[] = [];
      if (dir) {
        const ids = new Set(next.journal.map((e) => e.id));
        const gone = cur.journal.filter((e) => !ids.has(e.id));
        const theyRemoved = gone.filter((e) => theirs.journal && theirs.items[entryKey(e.id)]?.del);
        const removing = theyRemoved.length <= MAX_SYNC_DELETES ? theyRemoved : [];
        if (theyRemoved.length > MAX_SYNC_DELETES)
          console.error(`sync: a phone removed ${theyRemoved.length} journal entries; none were deleted`);
        const kept = gone.filter((e) => !removing.includes(e));
        next.journal = [...next.journal, ...kept].sort((a, b) => b.created.localeCompare(a.created));
        for (const e of next.journal)
          if (stable(was.get(e.id)) !== stable(e)) writes.push({ id: e.id, run: () => api.journalSave(dir, e) });
        for (const e of removing) writes.push({ id: e.id, run: () => api.journalDelete(dir, e.id) });
      }
      // Only if sync.rs is still waiting for this answer: once it has told the phone the sync failed,
      // nothing here changes (the phone tries again, and would otherwise get a second copy of its edits).
      if (!(await invoke<boolean>("sync_claim", { rid }).catch(() => false))) return;
      // The files first, then what's kept here: if a write fails, the ledger stays as it was and the phone
      // is told, so it tries again rather than take the sync for done.
      const skipped = new Set<string>();
      if (writes.length) {
        ++journalSeq.current;
        try {
          // A copy of the files first (journal-backups in the app's data folder): once a day, and always
          // before a sync that changes many entries. If it can't be made, nothing is written.
          await changedElsewhere(dir);
          await api.journalBackup(dir, writes.length > 20);
          for (const w of writes) {
            // Changed here since this sync began (a save can't be under way, but a reload can have landed):
            // what's here now is kept, and syncs as the newer.
            if (journalNow.current.find((e) => e.id === w.id) !== was.get(w.id)) skipped.add(w.id);
            else await w.run();
          }
        } catch (e) {
          console.error("sync: writing the journal", e);
          reloadAfter.current = true;
          await noteStamp(dir);
          return fail(
            rid,
            `The computer couldn't save its journal, so the sync wasn't finished: ${String(e).replace(/^Error: /, "")}`,
            true,
          );
        }
        ++journalSeq.current;
        await noteStamp(dir);
      }
      if (skipped.size)
        next.journal = [...next.journal.filter((e) => !skipped.has(e.id)), ...journalNow.current.filter((e) => skipped.has(e.id))].sort(
          (a, b) => b.created.localeCompare(a.created),
        );
      ledger.current = done.ledger;
      seen.current = itemsOf(next);
      await writeLedger();
      setBookmarks(() => next.bookmarks);
      setHighlights(() => next.highlights);
      setNav((n) => ({ ...n, docAt: next.docAt, recent: next.recent }));
      setPlans(() => next.plans);
      putJournal(() => next.journal);
      // Seen by the next answer at once, before React renders.
      synced.current = { ...next };
      // What changed each way, for Settings (sync.rs keeps it) and the phone's own line.
      const differ = (a: Record<string, unknown>, b: Record<string, unknown>) =>
        new Set([...Object.keys(a), ...Object.keys(b)].filter((k) => stable(a[k]) !== stable(b[k]))).size;
      const theyHad = Object.fromEntries(Object.entries(theirs.items).flatMap(([k, e]): [string, unknown][] => (e.del ? [] : [[k, e.v]])));
      const theyGet = theirs.journal ? done.now : Object.fromEntries(Object.entries(done.now).filter(([k]) => !k.startsWith("j|")));
      const stats = { sent: differ(theyHad, theyGet), received: differ(now, seen.current) };
      const out: Payload = { ...merged, serverNow: Date.now() + 1, stats };
      const reply: Payload = theirs.journal ? { ...out, journal: true } : { ...out, items: withoutJournal(out.items) };
      invoke("sync_reply", { rid, merged: reply }).catch(() => {});
    };
    return () => {
      un.then((u) => u());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const value: Ctx = {
    lib,
    bibles,
    mod,
    strongsBible,
    lexicon,
    concordance,
    tsk,
    xrefs,
    rescan: async (esword, eswordCopies) => {
      const l = await api.rescan(typeof esword === "boolean" ? esword : settings.readEsword, eswordCopies ?? settings.eswordCopies);
      forgetSizes(); // a Bible's chapters are read again: it may be another copy now
      setLib(l);
    },
    settings: view,
    set: ({ bible, compare, ...other }) => {
      const rest: Partial<Settings> = other;
      // In a one-off Compare, its columns change, not the saved ones.
      if (compare !== undefined && curPlace.current?.compare) {
        setPlaceCompare(compare);
        const h = hist.current;
        if (h.i >= 0) h.stack[h.i] = { ...h.stack[h.i], compare };
        curPlace.current = { ...curPlace.current, compare };
      } else if (compare !== undefined) rest.compare = compare;
      if (bible !== undefined) {
        setSessionBible(bible);
        bibleNow.current = bible;
        const h = hist.current;
        if (h.i >= 0) h.stack[h.i] = { ...h.stack[h.i], bible };
        if (curPlace.current) curPlace.current = { ...curPlace.current, bible };
      }
      if (Object.keys(rest).length) setSettings((s) => ({ ...s, ...rest }));
    },
    defaultBible: settings.bible,
    setDefaultBible: (id) => {
      setSessionBible(null);
      setSettings((s) => ({ ...s, bible: id }));
    },
    screen,
    go: (s) => navigate({ screen: s }),
    // Same passage in another translation: the verse at the top of the column stays at the top.
    compareWith: (ids) => navigate({ screen: "compare", compare: ids }),
    openBible: (id) => {
      const at = topVerse();
      navigate({ bible: id });
      if (at) keepVerse(at);
    },
    loc: nav.loc,
    open,
    back: () => moveHist(-1),
    forward: () => moveHist(1),
    canBack: hist.current.i > 0,
    canForward: hist.current.i < hist.current.stack.length - 1,
    bookmarks,
    toggleBookmark: (ref, bible) =>
      setBookmarks((bs) => {
        const same = (b: Bookmark) =>
          b.ref.book === ref.book &&
          b.ref.chapter === ref.chapter &&
          b.ref.verse === ref.verse &&
          (b.ref.to ?? b.ref.verse) === (ref.to ?? ref.verse);
        return bs.some(same) ? bs.filter((b) => !same(b)) : [{ id: uid(), ref, bible, created: new Date().toISOString() }, ...bs];
      }),
    toggleDocBookmark: (spot) =>
      setBookmarks((bs) => {
        const same = (b: Bookmark) => b.doc?.module === spot.module && b.doc.title === spot.title && b.doc.para === spot.para;
        return bs.some(same)
          ? bs.filter((b) => !same(b))
          : [{ id: uid(), ref: { book: 0, chapter: 0 }, bible: "", created: new Date().toISOString(), doc: spot }, ...bs];
      }),
    docPara,
    clearDocPara: () => setDocPara(null),
    highlights,
    setHighlight: (k, c) => {
      setHighlights((h) => {
        const n = { ...h };
        if (c) n[k] = c;
        else delete n[k];
        return n;
      });
      if (c) setSettings((s) => (s.showHighlights === false ? { ...s, showHighlights: true } : s));
    },
    recent: nav.recent,
    session,
    setSession,
    doc: nav.doc,
    docAt: nav.docAt ?? {},
    openDoc: (module, title, kind = "reference", para) => {
      setDocPara(para && title ? { module, title, kind, para } : null);
      // A devotional opens on today's reading (DocReader picks it); a book where it was left.
      const t = kind === "devotional" ? (title ?? "") : (title ?? nav.docAt?.[module] ?? "");
      if (kind !== "devotional" && t) setNav((n) => ({ ...n, docAt: { ...n.docAt, [module]: t } }));
      // DocReader fills in the chapter of a book opened without one: that replaces the entry, so
      // back doesn't land on the empty book and open it again.
      const d = (curPlace.current ?? here()).doc;
      const filling = d?.module === module && !d.title;
      navigate({ doc: { module, title: t, kind }, screen: "read" }, filling);
      if (t) addRecent({ book: 0, chapter: 0, at: new Date().toISOString(), doc: { module, title: t, kind } });
    },
    closeDoc: () => navigate({ doc: null }),
    openWebDoc: (id, url, title) => navigate({ doc: { module: id, title, kind: "devotional", url }, screen: "read" }),
    openLyrics: () => {
      if (nav.doc?.view !== "lyrics" || screen !== "read")
        navigate({ doc: { module: "music:lyrics", title: "Lyrics", kind: "devotional", view: "lyrics" }, screen: "read" });
    },
    journal,
    journalDir,
    journalError,
    // A save or delete updates the one entry here rather than reading the whole journal again
    // (thousands of entries, on every pause in typing), and notes the files' new fingerprint. Both wait
    // their turn with the other journal writes (journalWrite).
    saveEntry: (e) => {
      const dir = journalDir;
      if (!dir) return Promise.reject(new Error(journalError ?? "The journal's folder isn't known yet."));
      return journalWrite(async () => {
        ++journalSeq.current; // a reload already under way would bring back the old copy
        await changedElsewhere(dir);
        await api.journalSave(dir, e);
        ++journalSeq.current;
        putJournal((js) => [e, ...js.filter((x) => x.id !== e.id)].sort((a, b) => b.created.localeCompare(a.created)));
        await noteStamp(dir);
      });
    },
    deleteEntry: (id) => {
      const dir = journalDir;
      if (!dir) return Promise.reject(new Error(journalError ?? "The journal's folder isn't known yet."));
      return journalWrite(async () => {
        ++journalSeq.current;
        await changedElsewhere(dir);
        await api.journalDelete(dir, id);
        ++journalSeq.current;
        // Deleted on purpose: the one way a journal entry is synced as removed.
        removedHere.current.add(entryKey(id));
        putJournal((js) => js.filter((x) => x.id !== id));
        await noteStamp(dir);
      });
    },
    plans,
    setPlans,
    plansReady: settingsLoaded && plansLoaded,
    chats,
    setChats,
    // An article, a commentary or a question is shown beside the Bible, so a book open in Read is
    // closed for it (back returns to the book).
    pending,
    setPending: (x) => {
      setPendingState(x);
      if (x) navigate({ screen: "read", doc: null });
    },
    journalSeed,
    startEntry: (seed) => {
      setJournalSeed(seed);
      navigate({ screen: "journal" });
    },
    clearSeed: () => setJournalSeed(null),
    here: () => curPlace.current ?? here(),
    reopen: ({ para, entry, ...pl }) => {
      if (entry) {
        setJournalSeed({ openId: entry });
        navigate({ screen: "journal" });
        return;
      }
      navigate(pl);
      if (pl.doc && para) setDocPara({ ...pl.doc, para });
    },
    wordStudy,
    studyWord: (n) => navigate({ screen: "word", word: n }),
    searchFor,
    searchText: (q) => navigate({ screen: "search", search: q }),
    toast,
    toastMsg,
    toastUndo,
    // Single rows go straight away with an Undo in the toast; clearing Recent asks first (Shell).
    // Undo puts back just the removed row, where it was, keeping anything added since.
    removeBookmark: (id) => {
      const i = bookmarks.findIndex((b) => b.id === id),
        gone = bookmarks[i];
      setBookmarks((bs) => bs.filter((b) => b.id !== id));
      if (gone)
        toast("Bookmark removed", () =>
          setBookmarks((bs) => (bs.some((b) => b.id === id) ? bs : [...bs.slice(0, i), gone, ...bs.slice(i)])),
        );
    },
    removeRecent: (r) => {
      const i = nav.recent.findIndex((x) => sameRecent(x, r)),
        gone = nav.recent[i];
      setNav((n) => ({ ...n, recent: n.recent.filter((x) => !sameRecent(x, r)) }));
      if (gone)
        toast("Removed from Recent", () =>
          setNav((n) => ({
            ...n,
            recent: n.recent.some((x) => sameRecent(x, gone)) ? n.recent : [...n.recent.slice(0, i), gone, ...n.recent.slice(i)],
          })),
        );
    },
    clearRecent: () => setNav((n) => ({ ...n, recent: [] })),
    setRecent: (r) => setNav((n) => ({ ...n, recent: r })),
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}
