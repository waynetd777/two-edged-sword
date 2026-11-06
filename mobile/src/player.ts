// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Listen: reading a chapter aloud with iOS's own voices (plugins/tes-native), as the desktop's Listen
// does: verse by verse, the word being read marked, on into the next chapter, with a speed and a sleep
// timer. iOS reads the whole chapter it's given, so it carries on with the screen locked.

import { addPluginListener, invoke } from "@tauri-apps/api/core";
import { useSyncExternalStore } from "react";
import { fmtRef, stepChapter } from "../../src/bible";
import { speakable, speechText, spokenChapter } from "../../src/spoken";
import { plainText } from "../../src/esword";
import { bookTitles, docHtml, docParas, isDevotional } from "./DocView";
import { api, save, saved, Verse } from "./api";

export type Sleep = "off" | "15" | "30" | "60" | "chapter";

export interface PlayerState {
  on: boolean;
  paused: boolean;
  bible: string;
  book: number;
  chapter: number;
  verse: number;
  /** The word being read: its offset and length in the verse's text. */
  at: number;
  len: number;
  speed: number;
  sleep: Sleep;
  /** Reading a book's chapter (a devotional's day) instead of the Bible; `verse` is then the paragraph. */
  doc?: { module: string; chapter: string; title: string };
  error?: string;
}

const IDLE: PlayerState = { on: false, paused: false, bible: "", book: 0, chapter: 0, verse: 0, at: -1, len: 0, speed: 1, sleep: "off" };
let state: PlayerState = { ...IDLE, speed: saved("listenSpeed", 1) };
const watchers = new Set<() => void>();
const set = (patch: Partial<PlayerState>) => {
  state = { ...state, ...patch };
  watchers.forEach((w) => w());
};
let sleepTimer: ReturnType<typeof setTimeout> | null = null;

/** For each verse being read, each spoken character's place in the verse as the page shows it: the
 *  voice reports words in what it says ("Exodus 31 18"), the page marks them in what it shows. */
const pageAt = new Map<number, number[]>();

const call = (cmd: string, args: Record<string, unknown> = {}) => invoke(`plugin:tes-native|${cmd}`, args);

async function speakFrom(bible: string, book: number, chapter: number, verse: number, verses?: Verse[]) {
  const vs = verses ?? (await api.chapter(bible, book, chapter));
  // As the desktop reads (spoken.ts): the chapter announced, then each verse with its references said in
  // full and the words the voice gets wrong respelled.
  pageAt.clear();
  const verseItems = vs
    .filter((v) => v.v >= verse)
    .map((v) => {
      const { spoken, at } = speakable(speechText(v.text));
      pageAt.set(v.v, at);
      return { id: v.v, text: spoken };
    });
  if (!verseItems.length) return stop();
  const items = [{ id: 0, text: spokenChapter(book, chapter, verse) }, ...verseItems];
  set({ on: true, paused: false, doc: undefined, bible, book, chapter, verse, at: -1, len: 0, error: undefined });
  await call("speak", { items, rate: state.speed, title: fmtRef({ book, chapter }), voice: saved<string | null>("listenVoice", null) }).catch((e) => {
    set({ ...IDLE, speed: state.speed, sleep: state.sleep, error: String(e) });
  });
}

/** One stretch of a plan's day as read: a chapter, from a verse, to a verse; `part` is which of the
 *  day's parts it belongs to. */
export interface PlanStretch {
  book: number;
  chapter: number;
  from: number;
  to?: number;
  part: number;
}

/** A day's reading being read: its stretches, and what to do as each part is finished. Its utterances'
 *  ids are (stretch + 1) * 1000 + verse, the stretch's announcement being verse 0. */
let plan: { stretches: PlanStretch[]; onPart: (part: number) => void; part: number } | null = null;

/** The whole day's reading handed to iOS at once, so it reads all of it with the screen locked. */
async function speakPlan(bible: string, stretches: PlanStretch[], onPart: (part: number) => void, title: string) {
  pageAt.clear();
  const items: { id: number; text: string }[] = [];
  for (let i = 0; i < stretches.length; i++) {
    const x = stretches[i];
    const vs = await api.chapter(bible, x.book, x.chapter).catch(() => [] as Verse[]);
    const base = (i + 1) * 1000;
    items.push({ id: base, text: spokenChapter(x.book, x.chapter, x.from) });
    for (const v of vs.filter((v) => v.v >= x.from && (!x.to || v.v <= x.to))) {
      const { spoken, at } = speakable(speechText(v.text));
      pageAt.set(base + v.v, at);
      items.push({ id: base + v.v, text: spoken });
    }
  }
  if (items.length <= 1) return stop();
  plan = { stretches, onPart, part: stretches[0].part };
  const f = stretches[0];
  set({ on: true, paused: false, doc: undefined, bible, book: f.book, chapter: f.chapter, verse: f.from, at: -1, len: 0, error: undefined });
  await call("speak", { items, rate: state.speed, title, voice: saved<string | null>("listenVoice", null) }).catch((e) => {
    plan = null;
    set({ ...IDLE, speed: state.speed, sleep: state.sleep, error: String(e) });
  });
}

/** A book's chapter, paragraph by paragraph from `from`, announced by its name (a devotional by its title and day). */
async function speakDoc(d: { module: string; chapter: string; title: string }, from: number) {
  const html = await docHtml(d.module, d.chapter).catch(() => null);
  const paras = html ? docParas(html, d.chapter) : [];
  pageAt.clear();
  const items = paras
    .map((p, i) => {
      // As a book's paragraph is said, and where each spoken character is in its text on the page.
      const { spoken, at } = speakable(plainText(p));
      pageAt.set(i + 1, at);
      return { id: i + 1, text: spoken };
    })
    .filter((x) => x.id >= from && x.text.trim());
  if (!items.length) return stop();
  set({ on: true, paused: false, doc: d, bible: "", book: 0, chapter: 0, verse: items[0].id, at: -1, len: 0, error: undefined });
  const announce = isDevotional(d.module) ? `${d.title}, ${d.chapter}` : d.chapter;
  await call("speak", {
    items: from > 1 ? items : [{ id: 0, text: announce }, ...items],
    rate: state.speed,
    title: `${d.title} · ${d.chapter}`,
    voice: saved<string | null>("listenVoice", null),
  }).catch((e) => set({ ...IDLE, speed: state.speed, sleep: state.sleep, error: String(e) }));
}

let listening = false;
function listen() {
  if (listening) return;
  listening = true;
  addPluginListener<{ kind: string; id?: number; at?: number; len?: number }>("tes-native", "speech", (e) => {
    if (!state.on) return;
    // A day's reading: each stretch in turn, ticking off each part as the next begins, the day at the end.
    if (plan && e.id !== undefined && e.id >= 1000) {
      const x = plan.stretches[Math.floor(e.id / 1000) - 1];
      const v = e.id % 1000;
      if (!x) return;
      if (x.part !== plan.part && e.kind === "start") {
        plan.onPart(plan.part);
        plan.part = x.part;
      }
      if (e.kind === "start") set({ book: x.book, chapter: x.chapter, verse: v || x.from, at: -1, len: 0 });
      else if (e.kind === "word" && v) set({ book: x.book, chapter: x.chapter, verse: v, at: pageAt.get(e.id)?.[e.at!] ?? e.at!, len: e.len! });
      else if (e.kind === "end") {
        plan.onPart(plan.part);
        stop();
      }
      if (e.kind !== "paused" && e.kind !== "resumed") return;
    }
    if (e.id === 0) return; // the chapter's announcement
    if (e.kind === "start") set({ verse: e.id!, at: -1, len: 0 });
    else if (e.kind === "word") set({ verse: e.id!, at: pageAt.get(e.id!)?.[e.at!] ?? e.at!, len: e.len! });
    else if (e.kind === "paused") set({ paused: true });
    else if (e.kind === "resumed") set({ paused: false });
    else if (e.kind === "end" && state.doc) {
      // A book goes on to its next chapter; a devotional stops at the end of the day.
      const d = state.doc;
      if (state.sleep === "chapter" || isDevotional(d.module)) return stop();
      bookTitles(d.module).then((t) => {
        const next = t[t.indexOf(d.chapter) + 1];
        if (next) speakDoc({ ...d, chapter: next }, 1);
        else stop();
      });
    } else if (e.kind === "end") {
      // On into the next chapter, unless the sleep timer said to stop at the end of this one.
      const next = stepChapter(state.book, state.chapter, 1, null);
      if (state.sleep === "chapter" || !next) return stop();
      speakFrom(state.bible, next[0], next[1], 1);
    }
  }).catch(() => {
    listening = false;
  });
}

export interface Voice {
  id: string;
  name: string;
  language: string;
  quality: "premium" | "enhanced" | "default";
}

/** The phone's English voices, best first. */
export const voices = () =>
  call("voices")
    .then((r) => (r as { voices: Voice[] }).voices)
    .catch(() => [] as Voice[]);

/** A sentence in a voice, to hear it before choosing it. */
export const sample = (voice: string | null) =>
  call("speak", {
    items: [{ id: -1, text: "In the beginning was the Word, and the Word was with God, and the Word was God." }],
    rate: state.speed,
    title: "Sample",
    voice,
  }).catch(() => {});

export const player = {
  get: () => state,
  play(bible: string, book: number, chapter: number, verse: number, verses?: Verse[]) {
    listen();
    plan = null;
    return speakFrom(bible, book, chapter, verse, verses);
  },
  playDoc(d: { module: string; chapter: string; title: string }, from = 1) {
    listen();
    plan = null;
    return speakDoc(d, from);
  },
  /** A plan's day, all of it, in `bible`; `onPart` as each part is finished. */
  playPlan(bible: string, stretches: PlanStretch[], onPart: (part: number) => void, title: string) {
    listen();
    return speakPlan(bible, stretches, onPart, title);
  },
  pause() {
    set({ paused: true });
    call("speech_pause").catch(() => {});
  },
  resume() {
    set({ paused: false });
    call("speech_resume").catch(() => {});
  },
  stop,
  /** The next speed: 0.75×, 1×, 1.1×, 1.25×, 1.5×, 2×; it takes effect from the next verse. */
  faster() {
    const all = [0.75, 1, 1.1, 1.25, 1.5, 2];
    const speed = all[(all.indexOf(state.speed) + 1) % all.length] ?? 1;
    save("listenSpeed", speed);
    set({ speed });
    // A day's reading keeps its pace until it's started again; a chapter or a book changes at once.
    if (state.on && !state.paused && !plan)
      if (state.doc) speakDoc(state.doc, state.verse);
      else speakFrom(state.bible, state.book, state.chapter, state.verse);
  },
  /** The next sleep timer: off, 15, 30 or 60 minutes, or the end of the chapter. */
  sleeper() {
    const all: Sleep[] = ["off", "15", "30", "60", "chapter"];
    const sleep = all[(all.indexOf(state.sleep) + 1) % all.length];
    if (sleepTimer) clearTimeout(sleepTimer);
    sleepTimer = sleep === "off" || sleep === "chapter" ? null : setTimeout(stop, +sleep * 60_000);
    set({ sleep });
  },
};

function stop() {
  plan = null;
  if (sleepTimer) clearTimeout(sleepTimer);
  sleepTimer = null;
  set({ ...IDLE, speed: state.speed });
  call("speech_stop").catch(() => {});
}

export function usePlayer() {
  return useSyncExternalStore(
    (f) => {
      watchers.add(f);
      return () => watchers.delete(f);
    },
    () => state,
  );
}
