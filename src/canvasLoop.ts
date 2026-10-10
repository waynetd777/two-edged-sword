// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// What the canvases behind a song (Flames, Visions) share: a canvas the size of its box in the
// screen's pixels, kept so as the box changes; the latest props, for a loop that outlives renders;
// and the song's beat.

import { MutableRefObject, useEffect, useRef } from "react";

/** A slow worship tempo, for a song whose tempo Music doesn't know. */
export const DEFAULT_BPM = 72;

/** A swell on each beat of the song (`time` seconds in, at `bpm`), dying away before the next: 1 on the beat, 0 when `on` is false. */
export const beatAt = (time: number, bpm: number, on: boolean) => (on ? Math.exp(-(((time * (bpm || DEFAULT_BPM)) / 60) % 1) * 4) : 0);

export interface Loop<T> {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** The props as they are now. */
  live: MutableRefObject<T>;
  /** Reduced motion, as it was when the loop began. */
  still: boolean;
  /** The screen's pixels to each of the page's, which `ctx` is scaled by. */
  dpr: () => number;
}

/**
 * Run a drawing loop on a canvas, once for the life of the component: `start` is given the canvas
 * (sized and scaled to the screen's pixels) and returns what to do each frame, given the time and
 * the seconds since the last frame (at most a twentieth). The canvas element is the ref returned.
 */
export function useCanvasLoop<T>(props: T, start: (loop: Loop<T>) => (now: number, dt: number) => void) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef(props);
  live.current = props;
  useEffect(() => {
    const c = canvas.current!;
    const ctx = c.getContext("2d")!;
    let d = window.devicePixelRatio || 1;
    const fit = () => {
      const r = c.getBoundingClientRect();
      d = window.devicePixelRatio || 1;
      c.width = Math.max(1, Math.round(r.width * d));
      c.height = Math.max(1, Math.round(r.height * d));
      ctx.setTransform(d, 0, 0, d, 0, 0);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const frame = start({ canvas: c, ctx, live, still, dpr: () => d });
    let last = performance.now(),
      raf = 0;
    const tick = (now: number) => {
      frame(now, Math.min(0.05, (now - last) / 1000));
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // Once: the loop reads the props through `live`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return canvas;
}
