// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// What the pictures behind a song's words (Visions.tsx, pictures/) are drawn with.

export type RGB = [number, number, number];

export interface Frame {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  /** Seconds since the picture began, of `dur`; `k` is how far through it is (0–1). */
  t: number;
  dt: number;
  dur: number;
  k: number;
  /** Its fade in and out (0–1): every alpha is multiplied by it. */
  env: number;
  beat: number;
  dark: boolean;
  /** A colour of the theme's: warm light (gold on paper), or cool (blue). */
  ink: (a: number, cool?: boolean) => string;
  /** A soft round dot of the warm (or cool) colour, 64px, to draw scaled. */
  dot: (cool?: boolean) => HTMLCanvasElement;
}

/**
 * Where a picture can go without sitting on the words: `place(width)` gives the middle of a clear
 * stretch that wide, beside the words, and how much to shrink the picture (`scale`, 1 or less)
 * when the widest clear stretch is narrower. Pictures that fill the page don't ask.
 */
export interface Room {
  place: (width: number) => { x: number; scale: number };
}

export type Lane = "back" | "pass";
export interface Vision {
  name: string;
  lane: Lane;
  dur: [number, number];
  /** Not with reduced motion: a picture that is all movement. */
  moving?: boolean;
  make: (w: number, h: number, room: Room) => (f: Frame) => void;
}

export const TAU = Math.PI * 2;
export const rnd = (a: number, b: number) => a + Math.random() * (b - a);
export const smooth = (x: number) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

/** A soft glow: a radial gradient from `inner` to nothing. */
export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, inner: string, outer: string) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** A beam of light from (x1, y1) to (x2, y2), fading at both ends, with a wide faint halo. */
export function beam(f: Frame, x1: number, y1: number, x2: number, y2: number, width: number, a: number) {
  const { ctx } = f;
  const g = ctx.createLinearGradient(x1, y1, x2, y2);
  g.addColorStop(0, f.ink(0));
  g.addColorStop(0.18, f.ink(a));
  g.addColorStop(0.82, f.ink(a));
  g.addColorStop(1, f.ink(0));
  ctx.strokeStyle = g;
  ctx.lineCap = "round";
  for (const [lw, k] of [
    [width * 5, 0.12],
    [width * 2.2, 0.3],
    [width, 1],
  ]) {
    ctx.globalAlpha = k;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Points along a ridge: a few sines of their own, so each range is a different shape. */
export function ridge(base: number, amp: number) {
  const ws = [0, 1, 2].map(() => ({ f: rnd(0.002, 0.009), p: rnd(0, TAU), a: rnd(0.4, 1) }));
  return (x: number) => base - amp * ws.reduce((s, q) => s + q.a * Math.sin(x * q.f + q.p), 0) * 0.5;
}

export const displayFont = () => getComputedStyle(document.documentElement).getPropertyValue("--display") || "Georgia, serif";

/** A small flame, flickering, its foot at (x, y), `s` high (a lamp's, the menorah's, Pentecost's). */
export function flame(f: Frame, x: number, y: number, s: number, seed: number, a = 1) {
  const { ctx } = f;
  const fl = 1 + 0.09 * Math.sin(f.t * 13 + seed) + 0.05 * Math.sin(f.t * 23 + seed * 2);
  const sway = Math.sin(f.t * 3 + seed) * 0.14;
  glow(ctx, x, y - s * 0.5, s * 2.4, f.ink(0.16 * a * f.env), f.ink(0));
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s * 0.5, s * fl * 0.62);
  const g = ctx.createRadialGradient(0, -0.5, 0, 0, -0.5, 1.2);
  g.addColorStop(0, f.ink(0.9 * a * f.env));
  g.addColorStop(0.5, f.ink(0.45 * a * f.env));
  g.addColorStop(1, f.ink(0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-0.6, -0.1, -0.4, -0.9, sway, -1.6);
  ctx.bezierCurveTo(0.4, -0.9, 0.6, -0.1, 0, 0);
  ctx.fill();
  ctx.restore();
}

/** Stroke what's in the path only so far (0–1) along it, as if being drawn; `len` is about its length. */
export function traced(ctx: CanvasRenderingContext2D, p: number, len: number) {
  ctx.setLineDash([len * p, len * 2]);
  ctx.stroke();
  ctx.setLineDash([]);
}

export interface Branch {
  len: number;
  ang: number;
  depth: number;
  kids: Branch[];
}
/** A branching tree: two or three twigs from each branch, each shorter and turned a little. */
export function grow(len: number, ang: number, depth: number, max: number, spread: number): Branch {
  const kids: Branch[] = [];
  if (depth < max) {
    const n = Math.random() < 0.35 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const a = ang + (i - (n - 1) / 2) * spread * rnd(0.7, 1.3) + rnd(-0.1, 0.1);
      kids.push(grow(len * rnd(0.68, 0.8), a, depth + 1, max, spread));
    }
  }
  return { len, ang, depth, kids };
}
