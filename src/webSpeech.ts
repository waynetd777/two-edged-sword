// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Reading aloud on Windows, through the web view's own speech and so Windows' voices. It gives the
// page what tts.rs gives it on macOS: the voices, and "tts" events for each word and the end.

import { emit } from "@tauri-apps/api/event";
import type { TtsEvent, Voice } from "./api";

const synth = () => window.speechSynthesis;

/** The voices, once Windows has listed them: the first time, they come after "voiceschanged". */
export async function webVoices(): Promise<Voice[]> {
  let all = synth().getVoices();
  if (!all.length) {
    all = await new Promise<SpeechSynthesisVoice[]>((done) => {
      const got = () => done(synth().getVoices());
      synth().addEventListener("voiceschanged", got, { once: true });
      window.setTimeout(got, 2000);
    });
  }
  // Windows' "Natural" voices are its best, as Premium ones are on macOS.
  return all.map((v) => ({ id: v.voiceURI, name: v.name, lang: v.lang, quality: /natural/i.test(v.name) ? 3 : 1, default: v.default }));
}

/** The utterance being spoken; events from any other (stopped, replaced) are dropped. */
let current: SpeechSynthesisUtterance | null = null;

const send = (e: TtsEvent) => void emit("tts", e);

/** Speaks `text` as utterance `id`, at `rate` (1 = normal), stopping whatever was being said. */
export function webSpeak(id: number, text: string, voice: string | undefined, rate: number) {
  webStop();
  const u = new SpeechSynthesisUtterance(text);
  const v = voice
    ? synth()
        .getVoices()
        .find((x) => x.voiceURI === voice)
    : undefined;
  if (v) {
    u.voice = v;
    u.lang = v.lang;
  }
  u.rate = rate;
  u.onboundary = (e) => {
    if (current !== u || e.name !== "word") return;
    // Some voices leave out the word's length: up to the next space or punctuation, then.
    const len = e.charLength || (text.slice(e.charIndex).match(/^[\p{L}\p{N}'’-]+/u)?.[0].length ?? 0);
    send({ id, kind: "word", char: e.charIndex, len });
  };
  const end = () => {
    if (current !== u) return;
    current = null;
    send({ id, kind: "end", char: 0, len: 0 });
  };
  u.onend = end;
  u.onerror = end;
  current = u;
  synth().speak(u);
}

export function webStop() {
  current = null;
  synth().cancel();
}

export function webPause(on: boolean) {
  if (on) synth().pause();
  else synth().resume();
}
