// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// What the Music app is playing, asked once a second while anything on screen wants to know
// (Quiet time's Worship part, the Lyrics page). One poller serves them all, and the next ask
// waits for the last answer, so a slow Music never has asks piling up.

import { useEffect, useState } from "react";
import { api, MusicState } from "./api";

export interface Heard {
  /** The latest answer; null until the first. */
  now: MusicState | null;
  /** Why the last ask failed (Music not allowed, say); null when it worked. */
  error: string | null;
}

const EVERY = 1000;
let heard: Heard = { now: null, error: null };
const subs = new Set<(h: Heard) => void>();
let timer: number | undefined;
let asking: Promise<MusicState | null> | null = null;

function ask(): Promise<MusicState | null> {
  window.clearTimeout(timer);
  timer = undefined;
  asking ??= api
    .musicState()
    .then(
      (now): Heard => ({ now, error: null }),
      (e): Heard => ({ now: heard.now, error: String(e) }),
    )
    .then((h) => {
      heard = h;
      asking = null;
      subs.forEach((f) => f(h));
      if (subs.size) timer = window.setTimeout(ask, EVERY);
      return h.error ? null : h.now;
    });
  return asking;
}

/** Asks Music now rather than at the next second: the answer, or null if it couldn't be had. */
export const checkMusic = () => ask();

/** What Music is playing, asked every second while `on`. */
export function useMusicState(on = true): Heard {
  const [h, setH] = useState<Heard>(heard);
  useEffect(() => {
    if (!on) return;
    subs.add(setH);
    if (subs.size === 1 && !asking) ask();
    else setH(heard);
    return () => {
      subs.delete(setH);
      if (!subs.size) {
        window.clearTimeout(timer);
        timer = undefined;
      }
    };
  }, [on]);
  return h;
}
