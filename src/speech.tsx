// Reading aloud with the voices macOS provides, through the web speech API. One verse is one
// utterance; word boundaries drive the highlight in the text; at the end of a chapter it
// carries on into the next one when Settings says so.

import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, Verse } from "./api";
import { book, nextChapter } from "./bible";
import { docSegments, plainText } from "./esword";
import { useApp } from "./state";

export interface PlayerState {
  on: boolean;
  paused: boolean;
  bible: string;
  book: number;
  chapter: number;
  /** Verse number being read. */
  verse: number;
  count: number;
  /** Character offset of the current word in the verse's plain text (-1 before the first). */
  char: number;
  sleepAt: number | null;
  sleepEndOfChapter: boolean;
  /** Which sleep option was chosen, so the menu can tick it. */
  sleepChoice: number | "chapter" | null;
  /** Reading a reference book instead of the Bible: "verse" is then the paragraph number. */
  doc: { module: string; title: string; kind?: "reference" | "devotional" } | null;
}

/** For a guided session (Quiet time): stop at `toVerse`, and call `onEnd` when the reading finishes by itself. */
export interface PlayOpts { toVerse?: number; onEnd?: () => void }

interface PlayerCtx {
  state: PlayerState;
  voices: SpeechSynthesisVoice[];
  play: (bible: string, book: number, chapter: number, fromVerse?: number, opts?: PlayOpts) => void;
  /** Reads a reference book's chapter, paragraph by paragraph (from docSegments). */
  playDoc: (module: string, title: string, paragraphs: string[], from?: number, kind?: "reference" | "devotional", opts?: PlayOpts) => void;
  toggle: () => void;
  stop: () => void;
  skip: (d: number) => void;
  sleep: (minutes: number | "chapter" | null) => void;
}

const Ctx = createContext<PlayerCtx | null>(null);
export const usePlayer = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("no player");
  return c;
};

/** How a chapter is announced: "Psalm 23", "First Samuel, chapter 3", "John, chapter 3, from verse 16". */
export function spokenChapter(b: number, c: number, fromVerse?: number): string {
  const name = book(b).name.replace(/^1 /, "First ").replace(/^2 /, "Second ").replace(/^3 /, "Third ");
  const ch = b === 19 ? `Psalm ${c}` : book(b).chapters === 1 ? name : `${name}, chapter ${c}`;
  return fromVerse && fromVerse > 1 ? `${ch}, from verse ${fromVerse}` : ch;
}

const IDLE: PlayerState = { on: false, paused: false, bible: "", book: 0, chapter: 0, verse: 0, count: 0, char: -1, sleepAt: null, sleepEndOfChapter: false, sleepChoice: null, doc: null };

export function PlayerProvider({ children }: { children: ReactNode }) {
  const app = useApp();
  const [state, setState] = useState<PlayerState>(IDLE);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const verses = useRef<Verse[]>([]);
  const st = useRef(state);
  st.current = state;
  const settings = useRef(app.settings);
  settings.current = app.settings;
  const appRef = useRef(app);
  appRef.current = app;
  const gen = useRef(0);
  const opts = useRef<PlayOpts>({}); // this reading's stopping point and what to do after it
  const announce = useRef<string | null>(null); // said before the next verse: the chapter just begun // bumps on every restart, so stale utterance callbacks do nothing

  useEffect(() => {
    const load = () => setVoices(window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en")));
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  const voiceFor = useCallback(() => {
    const all = window.speechSynthesis.getVoices();
    return all.find((v) => v.voiceURI === settings.current.voice) ?? all.find((v) => v.name === settings.current.voice) ?? all.find((v) => v.default && v.lang.startsWith("en")) ?? all.find((v) => v.lang.startsWith("en"));
  }, []);

  const stop = useCallback(() => {
    opts.current = {};
    gen.current++;
    window.speechSynthesis.cancel();
    setState(IDLE);
  }, []);

  const speakFrom = useCallback((i: number) => {
    const g = ++gen.current;
    window.speechSynthesis.cancel();
    const vs = verses.current;
    const s = st.current;
    if (s.sleepAt && Date.now() > s.sleepAt) { stop(); return; }
    // Finished by itself in a guided session: hand over rather than carry on (a sleep timer set for
    // the end of the chapter ends the session too).
    const to = opts.current.toVerse;
    if (opts.current.onEnd && (i >= vs.length || (to && vs[i].v > to))) {
      const next = s.sleepEndOfChapter ? undefined : opts.current.onEnd;
      stop();
      next?.();
      return;
    }
    if (i >= vs.length && s.doc) {
      const { module, title, kind } = s.doc;
      // A devotional is one day's reading; only a book carries on into its next chapter.
      if (kind === "devotional" || !settings.current.continueChapter || s.sleepEndOfChapter) { stop(); return; }
      api.referenceTitles(module).then(async (ts) => {
        const next = ts[ts.indexOf(title) + 1];
        if (!next) { if (g === gen.current) stop(); return; }
        const art = await api.article("reference", module, next);
        if (g !== gen.current) return;
        const segs = docSegments(art?.html ?? "");
        verses.current = segs.map((text, k) => ({ v: k + 1, text }));
        const doc = { module, title: next, kind };
        announce.current = next;
        st.current = { ...st.current, doc };
        setState((p) => ({ ...p, doc, verse: 1, count: segs.length, char: -1 }));
        // Turn the page too, if the book is open.
        if (appRef.current.doc?.module === module && appRef.current.doc.title === title) appRef.current.openDoc(module, next, kind);
        window.setTimeout(() => speakFrom(0), 600);
      }).catch(() => { if (g === gen.current) stop(); });
      return;
    }
    if (i >= vs.length) {
      const nx = nextChapter(s.book, s.chapter);
      if (settings.current.continueChapter && nx && !s.sleepEndOfChapter) {
        api.chapter(s.bible, nx[0], nx[1]).then((v) => {
          if (g !== gen.current) return;
          verses.current = v;
          announce.current = spokenChapter(nx[0], nx[1]);
          setState((p) => ({ ...p, book: nx[0], chapter: nx[1], verse: v[0]?.v ?? 1, count: v.length, char: -1 }));
          st.current = { ...st.current, book: nx[0], chapter: nx[1] };
          window.setTimeout(() => speakFrom(0), 600);
        });
      } else stop();
      return;
    }
    const verse = vs[i];
    const text = plainText(verse.text);
    if (!text) { setState((p) => ({ ...p, verse: verse.v, char: -1 })); speakFrom(i + 1); return; }
    const heading = announce.current ? `${announce.current}. ` : "";
    announce.current = null;
    const prefix = heading + (settings.current.readNumbers && !s.doc ? `Verse ${verse.v}. ` : "");
    const u = new SpeechSynthesisUtterance(prefix + text);
    const voice = voiceFor();
    if (voice) u.voice = voice;
    u.rate = settings.current.rate;
    u.onboundary = (e) => { if (g === gen.current && e.name === "word") setState((p) => ({ ...p, char: e.charIndex - prefix.length })); };
    u.onend = () => { if (g === gen.current) speakFrom(i + 1); };
    u.onerror = (e) => { if (g === gen.current && e.error !== "interrupted" && e.error !== "canceled") stop(); };
    setState((p) => ({ ...p, verse: verse.v, char: -1 }));
    window.speechSynthesis.speak(u);
  }, [stop, voiceFor]);

  const play = useCallback((bible: string, b: number, c: number, fromVerse?: number, o: PlayOpts = {}) => {
    api.chapter(bible, b, c).then((v) => {
      opts.current = o;
      verses.current = v;
      announce.current = spokenChapter(b, c, fromVerse);
      const i = Math.max(0, fromVerse ? v.findIndex((x) => x.v === fromVerse) : 0);
      const next = { ...st.current, on: true, paused: false, bible, book: b, chapter: c, verse: v[i]?.v ?? 1, count: v.length, char: -1, doc: null };
      st.current = next;
      setState(next);
      speakFrom(i);
    });
  }, [speakFrom]);

  const playDoc = useCallback((module: string, title: string, paragraphs: string[], from = 0, kind: "reference" | "devotional" = "reference", o: PlayOpts = {}) => {
    opts.current = o;
    // A devotional is announced by name and day ("Morning & Evening, September 24"), a book by its chapter.
    announce.current = from > 0 ? null : kind === "devotional" ? `${appRef.current.mod("devotional", module)?.abbrev || module}, ${title}` : title;
    verses.current = paragraphs.map((text, k) => ({ v: k + 1, text }));
    const i = Math.max(0, Math.min(from, paragraphs.length - 1));
    const next = { ...st.current, on: true, paused: false, doc: { module, title, kind }, verse: i + 1, count: paragraphs.length, char: -1 };
    st.current = next;
    setState(next);
    speakFrom(i);
  }, [speakFrom]);

  const toggle = useCallback(() => {
    const s = st.current;
    if (!s.on) return;
    if (s.paused) {
      // Resume by restarting the verse: pause/resume in WebKit's synthesiser is unreliable.
      setState((p) => ({ ...p, paused: false }));
      speakFrom(Math.max(0, verses.current.findIndex((v) => v.v === s.verse)));
    } else {
      gen.current++;
      window.speechSynthesis.cancel();
      setState((p) => ({ ...p, paused: true }));
    }
  }, [speakFrom]);

  const skip = useCallback((d: number) => {
    const s = st.current;
    if (!s.on) return;
    const i = verses.current.findIndex((v) => v.v === s.verse) + d;
    setState((p) => ({ ...p, paused: false }));
    speakFrom(Math.max(0, i));
  }, [speakFrom]);

  const sleep = useCallback((m: number | "chapter" | null) => {
    const next = { sleepAt: typeof m === "number" ? Date.now() + m * 60000 : null, sleepEndOfChapter: m === "chapter", sleepChoice: m };
    st.current = { ...st.current, ...next };
    setState((p) => ({ ...p, ...next }));
  }, []);

  // A change of speed or voice takes effect from the current verse.
  const rate = app.settings.rate, voice = app.settings.voice;
  useEffect(() => {
    const s = st.current;
    if (s.on && !s.paused) speakFrom(Math.max(0, verses.current.findIndex((v) => v.v === s.verse)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rate, voice]);

  useEffect(() => () => window.speechSynthesis.cancel(), []);

  return <Ctx.Provider value={{ state, voices, play, playDoc, toggle, stop, skip, sleep }}>{children}</Ctx.Provider>;
}

export const chapterName = (b: number, c: number) => `${book(b).name} ${c}`;
