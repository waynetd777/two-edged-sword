// Reading aloud with the voices macOS provides, through the native synthesiser (src-tauri/src/tts.rs;
// WebKit's speech API hides downloaded Premium voices). One verse is one utterance; word events
// drive the highlight in the text; at the end of a chapter it carries on into the next one when
// Settings says so.

import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api, TtsEvent, Verse, Voice } from "./api";
import { book, nextChapter, Ref } from "./bible";
import { docSegments, plainText, tokenize } from "./esword";
import { findRefs } from "./md";
import { useApp } from "./state";
import { Icon } from "./icons";

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
  /** English voices, for the reading voice. */
  voices: Voice[];
  /** Every voice installed, for the Hebrew and Greek ones. */
  allVoices: Voice[];
  play: (bible: string, book: number, chapter: number, fromVerse?: number, opts?: PlayOpts) => void;
  /** Reads a reference book's chapter, paragraph by paragraph (from docSegments). */
  playDoc: (module: string, title: string, paragraphs: string[], from?: number, kind?: "reference" | "devotional", opts?: PlayOpts) => void;
  toggle: () => void;
  stop: () => void;
  skip: (d: number) => void;
  sleep: (minutes: number | "chapter" | null) => void;
  /** Pronounces a Greek or Hebrew word (Strong's `num` says which), pausing any reading. */
  say: (word: string, num: string, pron?: string) => void;
  /** Screenshot mode: show the player at a given place without speaking. */
  still: (s: Partial<PlayerState>) => void;
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

/** A reference as it should be heard: "Exo 31:18" is "Exodus 31 18", "1 Cor 13" "First Corinthians 13". */
function sayRef(r: Ref): string {
  const name = book(r.book).name.replace(/^Psalms$/, "Psalm").replace(/^1 /, "First ").replace(/^2 /, "Second ").replace(/^3 /, "Third ");
  if (!r.verse) return `${name} ${r.chapter}`;
  if (book(r.book).chapters === 1) return `${name} ${r.verse}${r.to && r.to !== r.verse ? ` to ${r.to}` : ""}`;
  if (r.toChapter && r.toChapter !== r.chapter) return `${name} ${r.chapter} ${r.verse} to ${r.toChapter} ${r.to}`;
  return `${name} ${r.chapter} ${r.verse}${r.to && r.to !== r.verse ? ` to ${r.to}` : ""}`;
}

/**
 * The text to speak, with its references said in full, and for each character of it the
 * character of `text` it stands for, so the word highlight still lands on the page's words.
 */
// Apple's character voices, in every language: last when Automatic picks one.
const NOVELTY = /^(Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley|Bahh|Bells|Boing|Bubbles|Cellos|Jester|Organ|Trinoids|Whisper|Zarvox|Wobble|Bad News|Good News|Superstar|Albert|Fred|Junior|Kathy|Ralph)\b/;

/** Voices best first: Premium, then Enhanced, then the rest, character voices last. */
export const rankVoices = (vs: Voice[]) => [...vs].sort((a, b) => Number(NOVELTY.test(a.name)) - Number(NOVELTY.test(b.name)) || b.quality - a.quality);

/** A Latin Bible: the Vulgates (Latin, Latin+, Vulg-C, Vulg-C+). */
export const isLatin = (m?: { title: string; abbrev: string }) => !!m && /\b(latin|vulg)/i.test(`${m.title} ${m.abbrev}`);

/** "he" for a text mostly in Hebrew letters, "el" for Greek, else null. */
export function scriptOf(text: string): "he" | "el" | null {
  const he = (text.match(/[\u0590-\u05FF]/g) ?? []).length, el = (text.match(/[\u0370-\u03FF\u1F00-\u1FFF]/g) ?? []).length;
  const en = (text.match(/[A-Za-z]/g) ?? []).length;
  if (he > en && he >= el) return "he";
  if (el > en) return "el";
  return null;
}

/**
 * A verse as it is read aloud: its words as the reader shows them (tokenize), so a word-by-word
 * Bible is read in its own language without the English and grammar beneath each word, and the
 * character positions match the tokens' for the highlight. Another edition's reading (⟨ ⟩) is
 * blanked out, the same length.
 */
export function speechText(html: string): string {
  return tokenize(html).map((t) => (t.variant ? " ".repeat(t.text.length) : t.text)).join("");
}

export function speakable(text: string): { spoken: string; at: number[] } {
  // e-Sword writes references "Psa_82:1"; the same length with a space, so positions hold.
  const t = text.replace(/([A-Za-z])_(\d)/g, "$1 $2");
  let spoken = "", last = 0;
  const at: number[] = [];
  const copy = (to: number) => { for (let k = last; k < to; k++) at.push(k); spoken += t.slice(last, to); };
  for (const h of findRefs(t, true)) {
    copy(h.index);
    const say = sayRef(h.ref);
    // Each spoken character of the reference points into the written one, in proportion.
    for (let k = 0; k < say.length; k++) at.push(h.index + Math.min(h.length - 1, Math.floor((k * h.length) / say.length)));
    spoken += say;
    last = h.index + h.length;
  }
  copy(t.length);
  return { spoken, at };
}

const IDLE: PlayerState = { on: false, paused: false, bible: "", book: 0, chapter: 0, verse: 0, count: 0, char: -1, sleepAt: null, sleepEndOfChapter: false, sleepChoice: null, doc: null };

export function PlayerProvider({ children }: { children: ReactNode }) {
  const app = useApp();
  const [state, setState] = useState<PlayerState>(IDLE);
  const [allVoices, setAllVoices] = useState<Voice[]>([]);
  const voices = allVoices.filter((v) => v.lang.startsWith("en"));
  const voicesRef = useRef<Voice[]>([]);
  voicesRef.current = allVoices;
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

  // Reloaded when the window regains focus, so voices downloaded in System Settings appear.
  useEffect(() => {
    const load = () => api.ttsVoices().then(setAllVoices).catch(() => {});
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, []);

  // The utterance being spoken: its id (the generation), how much of it is the spoken heading,
  // and what to do when it ends. Events for any other id are stale and ignored.
  const utt = useRef<{ id: number; prefix: number; at: number[]; onEnd: () => void } | null>(null);
  useEffect(() => {
    const un = listen<TtsEvent>("tts", ({ payload: e }) => {
      const u = utt.current;
      if (!u || e.id !== u.id || e.id !== gen.current) return;
      if (e.kind === "word") { const k = e.char - u.prefix; setState((p) => ({ ...p, char: k < 0 ? k : u.at[k] ?? k })); }
      else { utt.current = null; u.onEnd(); }
    });
    return () => { un.then((f) => f()); };
  }, []);

  // Settings keep the voice's identifier; a name (or an old WebKit voiceURI) still matches.
  // A verse in Hebrew letters (the Hebrew Bibles, the Targums) or in Greek is read in the Hebrew or
  // Greek voice from Settings, or the best installed; with none installed, in the reading voice.
  // A Latin Bible (told by its name: Latin looks like any text) is read in the Latin voice, an
  // Italian one unless Settings says otherwise.
  const voiceFor = useCallback((text = "", latin = false) => {
    const lang = latin ? "la" : scriptOf(text);
    if (lang) {
      const s = settings.current;
      const want = lang === "he" ? s.voiceHebrew : lang === "el" ? s.voiceGreek : s.voiceLatin;
      const mine = voicesRef.current.filter((v) => v.lang.startsWith(lang === "la" ? "it" : lang) || (lang === "la" && v.lang.startsWith("la")));
      const v = mine.find((x) => x.id === want) ?? rankVoices(mine)[0];
      if (v) return v.id;
    }
    const all = voicesRef.current.filter((v) => v.lang.startsWith("en")), want = settings.current.voice;
    return (all.find((v) => v.id === want) ?? voicesRef.current.find((v) => v.id === want) ?? all.find((v) => v.name === want) ?? all.find((v) => v.default) ?? all[0])?.id;
  }, []);

  const stop = useCallback(() => {
    opts.current = {};
    gen.current++;
    api.ttsStop();
    setState(IDLE);
  }, []);

  const speakFrom = useCallback((i: number) => {
    const g = ++gen.current;
    api.ttsStop();
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
        window.setTimeout(() => { if (g === gen.current) speakFrom(0); }, 600);
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
          window.setTimeout(() => { if (g === gen.current) speakFrom(0); }, 600);
        }).catch((e) => { console.error(e); if (g === gen.current) stop(); });
      } else stop();
      return;
    }
    const verse = vs[i];
    const text = s.doc ? plainText(verse.text) : speechText(verse.text);
    if (!text) { setState((p) => ({ ...p, verse: verse.v, char: -1 })); speakFrom(i + 1); return; }
    const heading = announce.current ? `${announce.current}. ` : "";
    announce.current = null;
    // The heading and verse number are English: not said in a Hebrew, Greek or Latin voice.
    const latin = !s.doc && isLatin(appRef.current.mod("bible", s.bible));
    const prefix = scriptOf(text) || latin ? "" : heading + (settings.current.readNumbers && !s.doc ? `Verse ${verse.v}. ` : "");
    const { spoken, at } = speakable(text);
    utt.current = { id: g, prefix: prefix.length, at, onEnd: () => speakFrom(i + 1) };
    setState((p) => ({ ...p, verse: verse.v, char: -1 }));
    api.ttsSpeak(g, prefix + spoken, voiceFor(text, latin), settings.current.rate).catch(() => { if (g === gen.current) stop(); });
  }, [stop, voiceFor]);

  const play = useCallback((bible: string, b: number, c: number, fromVerse?: number, o: PlayOpts = {}) => {
    // A Stop, or another Play, while the chapter loads wins over this one.
    const g = ++gen.current;
    api.chapter(bible, b, c).then((v) => {
      if (g !== gen.current) return;
      opts.current = o;
      verses.current = v;
      announce.current = spokenChapter(b, c, fromVerse);
      const i = Math.max(0, fromVerse ? v.findIndex((x) => x.v === fromVerse) : 0);
      const next = { ...st.current, on: true, paused: false, bible, book: b, chapter: c, verse: v[i]?.v ?? 1, count: v.length, char: -1, doc: null };
      st.current = next;
      setState(next);
      speakFrom(i);
    }).catch((e) => { console.error(e); if (g === gen.current) stop(); });
  }, [speakFrom, stop]);

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
      // Resume by restarting the verse.
      setState((p) => ({ ...p, paused: false }));
      speakFrom(Math.max(0, verses.current.findIndex((v) => v.v === s.verse)));
    } else {
      gen.current++;
      api.ttsStop();
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
  const rate = app.settings.rate, voice = app.settings.voice, voiceHe = app.settings.voiceHebrew, voiceEl = app.settings.voiceGreek, voiceLa = app.settings.voiceLatin;
  useEffect(() => {
    const s = st.current;
    if (s.on && !s.paused) speakFrom(Math.max(0, verses.current.findIndex((v) => v.v === s.verse)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rate, voice, voiceHe, voiceEl, voiceLa]);

  // Another translation chosen while a chapter is being read: stop, rather than read on in the one
  // no longer showing. (Not a Quiet time's reading, which has its own Bible, nor a book.)
  const shownBible = app.settings.bible;
  useEffect(() => {
    const s = st.current;
    if (s.on && !s.doc && !opts.current.onEnd && s.bible && s.bible !== shownBible) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownBible]);

  useEffect(() => () => { api.ttsStop(); }, []);

  // In a Greek or Hebrew voice when one is installed (macOS has Melina and Carmit; both speak the
  // modern language), otherwise Strong's pronunciation guide ("ag-ah'-pay") in the reading voice.
  // Utterance id 0 is never a reading's, so its events are ignored.
  const say = useCallback(async (word: string, num: string, pron?: string) => {
    const s = st.current;
    if (s.on && !s.paused) { gen.current++; st.current = { ...s, paused: true }; setState((p) => ({ ...p, paused: true })); }
    const lang = num.startsWith("H") ? "he" : "el";
    const v = (await api.ttsVoices().catch(() => [])).filter((x) => x.lang.startsWith(lang)).sort((a, b) => b.quality - a.quality)[0];
    if (v) api.ttsSpeak(0, word, v.id, 0.8);
    else if (pron) api.ttsSpeak(0, pron.replace(/[-'ʼ]/g, " "), voiceFor(), 0.9);
  }, [voiceFor]);

  const still = useCallback((s: Partial<PlayerState>) => { const next = { ...IDLE, on: true, ...s }; st.current = next; setState(next); }, []);

  // Reading aloud anywhere keeps the screen from sleeping and locking; pausing or stopping lets it.
  const awake = state.on && !state.paused;
  useEffect(() => { api.keepAwake(awake).catch(() => {}); }, [awake]);

  return <Ctx.Provider value={{ state, voices, allVoices, play, playDoc, toggle, stop, skip, sleep, say, still }}>{children}</Ctx.Provider>;
}

/** A speaker button that pronounces an original-language word. A span, not a button, so it can sit
 *  inside a row that is itself a button; it stops the click reaching the row. */
export function SayButton({ word, num, pron, size = 14 }: { word: string; num: string; pron?: string; size?: number }) {
  const { say } = usePlayer();
  const go = (e: React.SyntheticEvent) => { e.stopPropagation(); e.preventDefault(); say(word, num, pron); };
  return (
    <span role="button" tabIndex={0} className="ibtn say" aria-label={`Pronounce ${word}`} title="Pronounce" onClick={go}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") go(e); }} style={{ width: size + 12, height: size + 12, alignSelf: "center" }}>
      <Icon name="speaker" size={size} />
    </span>
  );
}
