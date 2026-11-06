// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Reading aloud with the voices macOS provides, through the native synthesiser (src-tauri/src/tts.rs;
// WebKit's speech API hides downloaded Premium voices). One verse is one utterance; word events
// drive the highlight in the text; at the end of a chapter it carries on into the next one when
// Settings says so.

import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api, TtsEvent, Verse, Voice } from "./api";
import { useKeepAwake } from "./awake";
import { book, stepChapter } from "./bible";
import { BLOCKS, escHtml } from "./dom";
import { docSegments, plainText } from "./esword";
import { mdToHtml } from "./md";
import { bibleSizes } from "./sizes";
import { useApp } from "./state";
import { Icon } from "./icons";
import { cmdKey } from "./keys";
import { isLatin, scriptOf, speakable, speechText, spokenChapter, voicesFor } from "./spoken";
export { voicesFor } from "./spoken";

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
  /** Length of the verse's plain text, for how far through it `char` is. */
  len: number;
  sleepAt: number | null;
  sleepEndOfChapter: boolean;
  /** Which sleep option was chosen, so the menu can tick it. */
  sleepChoice: number | "chapter" | null;
  /** Reading a reference book instead of the Bible: "verse" is then the paragraph number. */
  doc: { module: string; title: string; kind?: "reference" | "devotional"; id?: string; url?: string } | null;
}

/** For a guided session (Quiet time): stop at `toVerse`, and call `onEnd` when the reading finishes by itself. */
interface PlayOpts {
  toVerse?: number;
  onEnd?: () => void;
  /** The journal entry being read (module "journal"). */ id?: string;
  /** An online devotional's page being read (WebPage). */ url?: string;
}

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
  /** The next (1) or previous (-1) chapter, book chapter or journal entry, read from its start. */
  jump: (d: 1 | -1) => void;
  /** What ⌘P and F8 do when nothing is being read: set by the screen showing (useListenKey). */
  starter: React.MutableRefObject<(() => void) | null>;
  /** Set during a Quiet time: F7 and F9 step through its parts, and F8 reads the part shown. */
  quiet: React.MutableRefObject<{ step: (d: 1 | -1) => void; start: () => void } | null>;
  sleep: (minutes: number | "chapter" | null) => void;
  /** Pronounces a Greek or Hebrew word (Strong's `num` says which), pausing any reading. */
  say: (word: string, num: string, pron?: string) => void;
  /** Screenshot mode: show the player at a given place without speaking. */
  still: (s: Partial<PlayerState>) => void;
}

const Ctx = createContext<PlayerCtx | null>(null);

/** What ⌘P and F8 start when nothing is being read: this screen's text. */
export function useListenKey(start: () => void) {
  const { starter } = usePlayer();
  const fn = useRef(start);
  fn.current = start;
  useEffect(() => {
    const me = () => fn.current();
    starter.current = me;
    return () => {
      if (starter.current === me) starter.current = null;
    };
  }, [starter]);
}

/**
 * The blocks of a journal entry as it is read aloud, one paragraph (line, list item, heading or
 * quote) each, in order: the editor's own, so the highlight finds the words on the page.
 */
export function speechBlocks(root: Element): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(BLOCKS)].filter((b) => !b.querySelector(BLOCKS) && (b.textContent || "").trim());
}
/** An entry's paragraphs to read (speakFrom reads a book's paragraphs as HTML). */
export function journalParas(body: string): string[] {
  const d = document.createElement("div");
  d.innerHTML = mdToHtml(body);
  return speechBlocks(d).map((b) => escHtml(b.textContent || ""));
}
export const usePlayer = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("no player");
  return c;
};

const IDLE: PlayerState = {
  on: false,
  paused: false,
  bible: "",
  book: 0,
  chapter: 0,
  verse: 0,
  count: 0,
  char: -1,
  len: 0,
  sleepAt: null,
  sleepEndOfChapter: false,
  sleepChoice: null,
  doc: null,
};

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
  const gen = useRef(0); // bumps on every restart, so stale utterance callbacks do nothing
  const opts = useRef<PlayOpts>({}); // this reading's stopping point and what to do after it
  const held = useRef(false); // paused mid-utterance, so play carries on with it
  const resumeAt = useRef<number | null>(null); // paused as a verse ended: play starts the next
  const announce = useRef<string | null>(null); // said before the next verse: the chapter just begun

  // Reloaded when the window regains focus, so voices downloaded in System Settings appear.
  useEffect(() => {
    const load = () =>
      api
        .ttsVoices()
        .then(setAllVoices)
        .catch(() => {});
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
      if (e.kind === "word") {
        const k = e.char - u.prefix;
        setState((p) => ({ ...p, char: k < 0 ? k : (u.at[k] ?? k) }));
      } else {
        utt.current = null;
        u.onEnd();
      }
    });
    return () => {
      un.then((f) => f());
    };
  }, []);

  // Settings keep the voice's identifier; a name (or an old WebKit voiceURI) still matches.
  // A verse in Hebrew letters (the Hebrew Bibles, the Targums) or in Greek is read in the Hebrew or
  // Greek voice from Settings, or the best installed; with none installed, in the reading voice.
  // A Latin Bible (told by its name: Latin looks like any text) is read in the Latin voice, an
  // Italian one unless Settings says otherwise.
  const langVoice = useCallback((lang: "he" | "el" | "la") => {
    const s = settings.current;
    const want = lang === "he" ? s.voiceHebrew : lang === "el" ? s.voiceGreek : s.voiceLatin;
    const mine = voicesFor(voicesRef.current, lang);
    return (mine.find((x) => x.id === want) ?? mine[0])?.id;
  }, []);
  const voiceFor = useCallback(
    (text = "", latin = false) => {
      const lang = latin ? "la" : scriptOf(text);
      const v = lang && langVoice(lang);
      if (v) return v;
      const all = voicesRef.current.filter((v) => v.lang.startsWith("en")),
        want = settings.current.voice;
      return (
        all.find((v) => v.id === want) ??
        voicesRef.current.find((v) => v.id === want) ??
        all.find((v) => v.name === want) ??
        all.find((v) => v.default) ??
        all[0]
      )?.id;
    },
    [langVoice],
  );

  const stop = useCallback(() => {
    opts.current = {};
    gen.current++;
    api.ttsStop().catch(() => {});
    setState(IDLE);
  }, []);

  // The journal entry after (1) or before (-1) this one in the list, skipping empty ones.
  const nextEntry = (id: string | undefined, d: 1 | -1) => {
    const all = appRef.current.journal;
    for (let k = all.findIndex((e) => e.id === id) + d; k >= 0 && k < all.length; k += d) {
      const paras = journalParas(all[k].body);
      if (paras.length) return { entry: all[k], paras };
    }
    return null;
  };
  const jumpRef = useRef<(d: 1 | -1) => void>(() => {});

  // A book's next or previous chapter, from its start, after `wait` ms; `g` is the reading's generation.
  const turnDoc = (d: 1 | -1, g: number, wait: number) => {
    const { module, title, kind } = st.current.doc!;
    api
      .referenceTitles(module)
      .then(async (ts) => {
        const next = ts[ts.indexOf(title) + d];
        // Past the last chapter the reading ends; before the first, this one starts again.
        if (!next) {
          if (g === gen.current) {
            if (d > 0) stop();
            else speakFrom(0);
          }
          return;
        }
        const art = await api.article("reference", module, next);
        if (g !== gen.current) return;
        const segs = docSegments(art?.html ?? "");
        verses.current = segs.map((text, k) => ({ v: k + 1, text }));
        const doc = { module, title: next, kind };
        announce.current = next;
        st.current = { ...st.current, doc, paused: false };
        setState((p) => ({ ...p, doc, paused: false, verse: 1, count: segs.length, char: -1 }));
        // Turn the page too, if the book is open.
        if (appRef.current.doc?.module === module && appRef.current.doc.title === title) appRef.current.openDoc(module, next, kind);
        window.setTimeout(() => {
          if (g === gen.current) speakFrom(0);
        }, wait);
      })
      .catch(() => {
        if (g === gen.current) stop();
      });
  };

  const speakFrom = useCallback(
    (i: number) => {
      held.current = false;
      resumeAt.current = null;
      const g = ++gen.current;
      api.ttsStop().catch(() => {});
      const vs = verses.current;
      const s = st.current;
      if (s.sleepAt && Date.now() > s.sleepAt) {
        stop();
        return;
      }
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
        // A journal entry goes on to the next one in the list, when Settings says so.
        if (s.doc.module === "journal") {
          if (!settings.current.continueEntry || s.sleepEndOfChapter || !nextEntry(s.doc.id, 1)) {
            stop();
            return;
          }
          window.setTimeout(() => {
            if (g === gen.current) jumpRef.current(1);
          }, 600);
          return;
        }
        // A devotional is one day's reading; only a book carries on into its next chapter.
        if (s.doc.kind === "devotional" || !settings.current.continueChapter || s.sleepEndOfChapter) {
          stop();
          return;
        }
        turnDoc(1, g, 600);
        return;
      }
      if (i >= vs.length) {
        if (settings.current.continueChapter && !s.sleepEndOfChapter) {
          // On in reading order, the Bible's own: into its Apocrypha after Malachi, if it has them.
          bibleSizes(s.bible)
            .then((sizes) => {
              const nx = stepChapter(s.book, s.chapter, 1, sizes.size ? sizes : null);
              if (!nx) {
                if (g === gen.current) stop();
                return null;
              }
              return api.chapter(s.bible, nx[0], nx[1]).then((v) => [nx, v] as const);
            })
            .then((got) => {
              if (!got) return;
              const [nx, v] = got;
              if (g !== gen.current) return;
              verses.current = v;
              announce.current = spokenChapter(nx[0], nx[1]);
              setState((p) => ({ ...p, book: nx[0], chapter: nx[1], verse: v[0]?.v ?? 1, count: v.length, char: -1 }));
              st.current = { ...st.current, book: nx[0], chapter: nx[1] };
              window.setTimeout(() => {
                if (g === gen.current) speakFrom(0);
              }, 600);
            })
            .catch((e) => {
              console.error(e);
              if (g === gen.current) stop();
            });
        } else stop();
        return;
      }
      const verse = vs[i];
      const text = s.doc ? plainText(verse.text) : speechText(verse.text);
      if (!text) {
        setState((p) => ({ ...p, verse: verse.v, char: -1, len: 0 }));
        speakFrom(i + 1);
        return;
      }
      const heading = announce.current ? `${announce.current}. ` : "";
      announce.current = null;
      // The heading and verse number are English: not said in a Hebrew, Greek or Latin voice.
      const latin = !s.doc && isLatin(appRef.current.mod("bible", s.bible));
      const prefix = scriptOf(text) || latin ? "" : heading + (settings.current.readNumbers && !s.doc ? `Verse ${verse.v}. ` : "");
      const { spoken, at } = speakable(text);
      // Paused just as the verse ended: play goes on from the next one.
      utt.current = {
        id: g,
        prefix: prefix.length,
        at,
        onEnd: () => {
          if (st.current.paused) {
            held.current = false;
            resumeAt.current = i + 1;
          } else speakFrom(i + 1);
        },
      };
      held.current = false;
      setState((p) => ({ ...p, verse: verse.v, char: -1, len: text.length }));
      api.ttsSpeak(g, prefix + spoken, voiceFor(text, latin), settings.current.rate).catch(() => {
        if (g === gen.current) stop();
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stop, voiceFor],
  );

  const play = useCallback(
    (bible: string, b: number, c: number, fromVerse?: number, o: PlayOpts = {}) => {
      // A Stop, or another Play, while the chapter loads wins over this one.
      const g = ++gen.current;
      api
        .chapter(bible, b, c)
        .then((v) => {
          if (g !== gen.current) return;
          opts.current = o;
          verses.current = v;
          announce.current = spokenChapter(b, c, fromVerse);
          const i = Math.max(0, fromVerse ? v.findIndex((x) => x.v === fromVerse) : 0);
          const next = {
            ...st.current,
            on: true,
            paused: false,
            bible,
            book: b,
            chapter: c,
            verse: v[i]?.v ?? 1,
            count: v.length,
            char: -1,
            doc: null,
          };
          st.current = next;
          setState(next);
          speakFrom(i);
        })
        .catch((e) => {
          console.error(e);
          if (g === gen.current) stop();
        });
    },
    [speakFrom, stop],
  );

  const playDoc = useCallback(
    (module: string, title: string, paragraphs: string[], from = 0, kind: "reference" | "devotional" = "reference", o: PlayOpts = {}) => {
      opts.current = o;
      // A devotional is announced by name and day ("Morning & Evening, September 24"), a book by its chapter.
      announce.current =
        from > 0
          ? null
          : o.url
            ? title
            : kind === "devotional"
              ? `${appRef.current.mod("devotional", module)?.abbrev || module}, ${title}`
              : title;
      verses.current = paragraphs.map((text, k) => ({ v: k + 1, text }));
      const i = Math.max(0, Math.min(from, paragraphs.length - 1));
      const next = {
        ...st.current,
        on: true,
        paused: false,
        doc: { module, title, kind, id: o.id, url: o.url },
        verse: i + 1,
        count: paragraphs.length,
        char: -1,
      };
      st.current = next;
      setState(next);
      speakFrom(i);
    },
    [speakFrom],
  );

  // Pause holds the utterance mid-word and play carries on from there. Only when something else
  // has been said in between (a word pronounced, a new speed or voice) is the verse begun again.
  const toggle = useCallback(() => {
    const s = st.current;
    if (!s.on) return;
    if (s.paused) {
      st.current = { ...s, paused: false };
      setState((p) => ({ ...p, paused: false }));
      if (held.current && utt.current?.id === gen.current) {
        held.current = false;
        api.ttsPause(false).catch(() => {});
      } else
        speakFrom(
          resumeAt.current ??
            Math.max(
              0,
              verses.current.findIndex((v) => v.v === s.verse),
            ),
        );
    } else {
      st.current = { ...s, paused: true };
      if (utt.current?.id === gen.current) {
        held.current = true;
        api.ttsPause(true).catch(() => {});
      } else {
        gen.current++;
        api.ttsStop().catch(() => {});
      } // between verses, or a chapter still loading
      setState((p) => ({ ...p, paused: true }));
    }
  }, [speakFrom]);

  const skip = useCallback(
    (d: number) => {
      const s = st.current;
      if (!s.on) return;
      const i = verses.current.findIndex((v) => v.v === s.verse) + d;
      setState((p) => ({ ...p, paused: false }));
      speakFrom(Math.max(0, i));
    },
    [speakFrom],
  );

  // F7 and F9: the previous or next chapter of the Bible or book, or journal entry (in the
  // journal's order, skipping empty ones). Not in a Quiet time's reading, which has its own steps.
  const jump = useCallback(
    (d: 1 | -1) => {
      const s = st.current;
      if (!s.on || opts.current.onEnd) return;
      if (s.doc?.module === "journal") {
        const n = nextEntry(s.doc.id, d);
        if (n) playDoc("journal", n.entry.title || "Untitled entry", n.paras, 0, "reference", { id: n.entry.id });
        return;
      }
      if (s.doc) {
        if (s.doc.kind === "devotional") return;
        const g = ++gen.current;
        api.ttsStop().catch(() => {});
        turnDoc(d, g, 0);
        return;
      }
      bibleSizes(s.bible).then((sizes) => {
        const n = stepChapter(s.book, s.chapter, d, sizes.size ? sizes : null);
        if (n && st.current.bible === s.bible && st.current.book === s.book && st.current.chapter === s.chapter) play(s.bible, n[0], n[1]);
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [play, playDoc],
  );

  jumpRef.current = jump;

  // ⌘P and F8 play or pause, anywhere (Space does in the readers, but types a space in the
  // journal); F7 and F9 go back or on. With fn held, or with standard function keys set, the
  // F keys arrive here; otherwise macOS sends them as media keys, through media.rs.
  const starter = useRef<(() => void) | null>(null);
  const quiet = useRef<{ step: (d: 1 | -1) => void; start: () => void } | null>(null);
  const playPause = useCallback(() => {
    if (st.current.on) toggle();
    else (quiet.current?.start ?? starter.current)?.();
  }, [toggle]);
  const step = useCallback(
    (d: 1 | -1) => {
      if (quiet.current) quiet.current.step(d);
      else jump(d);
    },
    [jump],
  );
  // In a Quiet time's Worship part the F keys stay the music's.
  const worship = () => {
    const q = appRef.current.session;
    return q?.steps[q.i]?.kind === "worship";
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (/^F[789]$/.test(e.key) && worship()) return;
      if ((cmdKey(e) && !e.shiftKey && !e.altKey && !(e.metaKey && e.ctrlKey) && e.key.toLowerCase() === "p") || e.key === "F8") {
        e.preventDefault();
        playPause();
      } else if ((e.key === "F7" || e.key === "F9") && (st.current.on || quiet.current)) {
        e.preventDefault();
        step(e.key === "F9" ? 1 : -1);
      }
    };
    window.addEventListener("keydown", k);
    const un = listen<string>("media", ({ payload: m }) => {
      const s = st.current;
      if (worship()) return;
      if (m === "toggle" || (m === "play" && (!s.on || s.paused)) || (m === "pause" && s.on && !s.paused)) playPause();
      else if (m === "next" || m === "previous") step(m === "next" ? 1 : -1);
    });
    return () => {
      window.removeEventListener("keydown", k);
      un.then((f) => f());
    };
  }, [playPause, step]);

  // Tell macOS what is being read, so the media keys and Control Centre come here.
  const npTitle = !state.on ? null : state.doc ? state.doc.title : state.book ? `${book(state.book).name} ${state.chapter}` : null;
  useEffect(() => {
    api.mediaState(npTitle, state.on && !state.paused).catch(() => {});
  }, [npTitle, state.on, state.paused]);

  const sleep = useCallback((m: number | "chapter" | null) => {
    const next = { sleepAt: typeof m === "number" ? Date.now() + m * 60000 : null, sleepEndOfChapter: m === "chapter", sleepChoice: m };
    st.current = { ...st.current, ...next };
    setState((p) => ({ ...p, ...next }));
  }, []);

  // A change of speed or voice takes effect from the current verse.
  const rate = app.settings.rate,
    voice = app.settings.voice,
    voiceHe = app.settings.voiceHebrew,
    voiceEl = app.settings.voiceGreek,
    voiceLa = app.settings.voiceLatin;
  useEffect(() => {
    const s = st.current;
    if (s.on && !s.paused)
      speakFrom(
        Math.max(
          0,
          verses.current.findIndex((v) => v.v === s.verse),
        ),
      );
    else held.current = false; // paused: play begins the verse again, in the new speed or voice
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rate, voice, voiceHe, voiceEl, voiceLa]);

  // Reading aloud belongs to the readers (Read, with its books and Quiet time) and the journal:
  // going anywhere else, or from one of those to the other, stops it and closes the player.
  const screen = app.screen;
  useEffect(() => {
    const s = st.current;
    if (s.on && (!(screen === "read" || screen === "journal") || (s.doc?.module === "journal") !== (screen === "journal"))) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  // Another translation chosen while a chapter is being read: stop, rather than read on in the one
  // no longer showing. (Not a Quiet time's reading, which has its own Bible, nor a book.)
  const shownBible = app.settings.bible;
  useEffect(() => {
    const s = st.current;
    if (s.on && !s.doc && !opts.current.onEnd && s.bible && s.bible !== shownBible) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownBible]);

  useEffect(
    () => () => {
      api.ttsStop().catch(() => {});
    },
    [],
  );

  // In the Greek or Hebrew voice (Settings', else the best installed: macOS has Melina and Carmit,
  // both speaking the modern language), otherwise Strong's pronunciation guide ("ag-ah'-pay") in
  // the reading voice. Utterance id 0 is never a reading's, so its events are ignored.
  const say = useCallback(
    async (word: string, num: string, pron?: string) => {
      const s = st.current;
      if (s.on && !s.paused) {
        gen.current++;
        st.current = { ...s, paused: true };
        setState((p) => ({ ...p, paused: true }));
      }
      held.current = false;
      // Voices downloaded since the window last came to the front count too.
      voicesRef.current = await api.ttsVoices().catch(() => voicesRef.current);
      const v = langVoice(num.startsWith("H") ? "he" : "el");
      const said = v ? api.ttsSpeak(0, word, v, 0.8) : pron ? api.ttsSpeak(0, pron.replace(/[-'ʼ]/g, " "), voiceFor(), 0.9) : null;
      said?.catch(() => {});
    },
    [voiceFor, langVoice],
  );

  const still = useCallback((s: Partial<PlayerState>) => {
    const next = { ...IDLE, on: true, ...s };
    st.current = next;
    setState(next);
  }, []);

  // Reading aloud anywhere keeps the screen from sleeping and locking; pausing or stopping lets it.
  const awake = state.on && !state.paused;
  useKeepAwake("reading aloud", awake);

  return (
    <Ctx.Provider value={{ state, voices, allVoices, play, playDoc, toggle, stop, skip, jump, starter, quiet, sleep, say, still }}>
      {children}
    </Ctx.Provider>
  );
}

/** A speaker button that pronounces an original-language word. A span, not a button, so it can sit
 *  inside a row that is itself a button; it stops the click reaching the row. */
export function SayButton({ word, num, pron, size = 14 }: { word: string; num: string; pron?: string; size?: number }) {
  const { say } = usePlayer();
  const go = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
    say(word, num, pron);
  };
  return (
    <span
      role="button"
      tabIndex={0}
      className="ibtn say"
      aria-label={`Pronounce ${word}`}
      title="Pronounce"
      onClick={go}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") go(e);
      }}
      style={{ width: size + 12, height: size + 12, alignSelf: "center" }}
    >
      <Icon name="speaker" size={size} />
    </span>
  );
}
