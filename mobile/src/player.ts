// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Listen: reading a chapter aloud with iOS's own voices (plugins/tes-native), as the desktop's Listen
// does: verse by verse, the word being read marked, on into the next chapter, with a speed and a sleep
// timer. iOS reads the whole chapter it's given, so it carries on with the screen locked.

import { addPluginListener, invoke } from "@tauri-apps/api/core";
import { useSyncExternalStore } from "react";
import { fmtRef, stepChapter } from "../../src/bible";
import { tokenize } from "../../src/esword";
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

/** A verse as it's read: the text of its words, which is what the word offsets count in. */
export const spoken = (html: string) =>
  tokenize(html)
    .filter((t) => !t.note)
    .map((t) => t.text)
    .join("");

const call = (cmd: string, args: Record<string, unknown> = {}) => invoke(`plugin:tes-native|${cmd}`, args);

async function speakFrom(bible: string, book: number, chapter: number, verse: number, verses?: Verse[]) {
  const vs = verses ?? (await api.chapter(bible, book, chapter));
  const items = vs.filter((v) => v.v >= verse).map((v) => ({ id: v.v, text: spoken(v.text) }));
  if (!items.length) return stop();
  set({ on: true, paused: false, bible, book, chapter, verse, at: -1, len: 0, error: undefined });
  await call("speak", { items, rate: state.speed, title: fmtRef({ book, chapter }), voice: saved<string | null>("listenVoice", null) }).catch((e) => {
    set({ ...IDLE, speed: state.speed, sleep: state.sleep, error: String(e) });
  });
}

let listening = false;
function listen() {
  if (listening) return;
  listening = true;
  addPluginListener<{ kind: string; id?: number; at?: number; len?: number }>("tes-native", "speech", (e) => {
    if (!state.on) return;
    if (e.kind === "start") set({ verse: e.id!, at: -1, len: 0 });
    else if (e.kind === "word") set({ verse: e.id!, at: e.at!, len: e.len! });
    else if (e.kind === "paused") set({ paused: true });
    else if (e.kind === "resumed") set({ paused: false });
    else if (e.kind === "end") {
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
    return speakFrom(bible, book, chapter, verse, verses);
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
  /** The next speed: 0.75×, 1×, 1.25×, 1.5×, 2×; it takes effect from the next verse. */
  faster() {
    const all = [0.75, 1, 1.25, 1.5, 2];
    const speed = all[(all.indexOf(state.speed) + 1) % all.length] ?? 1;
    save("listenSpeed", speed);
    set({ speed });
    if (state.on && !state.paused) speakFrom(state.bible, state.book, state.chapter, state.verse);
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
