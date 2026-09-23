// Reading aloud with the voices macOS provides, through the web speech API. One verse is one
// utterance; word boundaries drive the highlight in the text; at the end of a chapter it
// carries on into the next one when Settings says so.

import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, Verse } from "./api";
import { book, nextChapter } from "./bible";
import { plainText } from "./esword";
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
}

interface PlayerCtx {
  state: PlayerState;
  voices: SpeechSynthesisVoice[];
  play: (bible: string, book: number, chapter: number, fromVerse?: number) => void;
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

const IDLE: PlayerState = { on: false, paused: false, bible: "", book: 0, chapter: 0, verse: 0, count: 0, char: -1, sleepAt: null, sleepEndOfChapter: false, sleepChoice: null };

export function PlayerProvider({ children }: { children: ReactNode }) {
  const app = useApp();
  const [state, setState] = useState<PlayerState>(IDLE);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const verses = useRef<Verse[]>([]);
  const st = useRef(state);
  st.current = state;
  const settings = useRef(app.settings);
  settings.current = app.settings;
  const gen = useRef(0); // bumps on every restart, so stale utterance callbacks do nothing

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
    if (i >= vs.length) {
      const nx = nextChapter(s.book, s.chapter);
      if (settings.current.continueChapter && nx && !s.sleepEndOfChapter) {
        api.chapter(s.bible, nx[0], nx[1]).then((v) => {
          if (g !== gen.current) return;
          verses.current = v;
          setState((p) => ({ ...p, book: nx[0], chapter: nx[1], verse: v[0]?.v ?? 1, count: v.length, char: -1 }));
          st.current = { ...st.current, book: nx[0], chapter: nx[1] };
          window.setTimeout(() => speakFrom(0), 600);
        });
      } else stop();
      return;
    }
    const verse = vs[i];
    const text = plainText(verse.text);
    const prefix = settings.current.readNumbers ? `Verse ${verse.v}. ` : "";
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

  const play = useCallback((bible: string, b: number, c: number, fromVerse?: number) => {
    api.chapter(bible, b, c).then((v) => {
      verses.current = v;
      const i = Math.max(0, fromVerse ? v.findIndex((x) => x.v === fromVerse) : 0);
      const next = { ...st.current, on: true, paused: false, bible, book: b, chapter: c, verse: v[i]?.v ?? 1, count: v.length, char: -1 };
      st.current = next;
      setState(next);
      speakFrom(i);
    });
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

  return <Ctx.Provider value={{ state, voices, play, toggle, stop, skip, sleep }}>{children}</Ctx.Provider>;
}

export const chapterName = (b: number, c: number) => `${book(b).name} ${c}`;
