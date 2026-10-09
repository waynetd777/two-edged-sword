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
  /**
   * What the picture is of, as words (or short phrases) a song about it would use: a picture whose
   * themes are in the song's title or words is chosen more often while it plays (Visions.tsx).
   */
  themes?: string[];
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

/** The page's own colour (as in styles.css), which solid shapes are mixed from. */
export const pageRGB = (dark: boolean): RGB => (dark ? [13, 17, 23] : [246, 248, 250]);

/** The ink's colour as numbers. */
export const inkRGB = (f: Frame, cool = false): RGB => f.ink(1, cool).slice(5).split(",").slice(0, 3).map(Number) as RGB;

/**
 * Solid colours mixed from the page's own and the ink: `k` 0 is the page, 1 the ink. For shapes
 * drawn whole on a layer (see `layering`), so their parts don't add up where they overlap and
 * what's behind them is hidden.
 */
export function tones(f: Frame, cool = false) {
  const ink = inkRGB(f, cool),
    page = pageRGB(f.dark);
  return (k: number) => `rgb(${page.map((p, i) => Math.round(p + (ink[i] - p) * Math.min(1, Math.max(0, k)))).join(",")})`;
}

/**
 * A layer the page's size to draw on before laying it on the page (with `lay`): made once, and
 * again if the page changes size; cleared each frame, scaled to the page's pixels.
 */
export function layering() {
  let c: HTMLCanvasElement | null = null;
  return (f: Frame) => {
    const dpr = f.ctx.getTransform().a || 1;
    const W = Math.max(1, Math.round(f.w * dpr)),
      H = Math.max(1, Math.round(f.h * dpr));
    if (!c || c.width !== W || c.height !== H) {
      c = document.createElement("canvas");
      c.width = W;
      c.height = H;
    }
    const L = c.getContext("2d")!;
    L.setTransform(1, 0, 0, 1, 0, 0);
    L.globalCompositeOperation = "source-over";
    L.globalAlpha = 1;
    L.clearRect(0, 0, W, H);
    L.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { L, canvas: c, dpr };
  };
}

/**
 * How faintly the pictures that use `lay` sit on the page: their asked strengths are scaled by
 * this, so their solid shapes show through the words about as much as the first pictures'
 * (which draw their layers at a third to a half) do, while keeping fine lines such as a wall's
 * bricks.
 */
export const LAID = 0.8;

/** How faintly the bitmaps sit: fainter than `LAID`, as a photo's shading is denser than a drawing's. */
const PHOTO = 0.62;

/**
 * Lay a layer on the page, `a` strong (of `LAID`), with a soft edge `blur` wide: solid (what's
 * drawn hides what's behind it) unless `add`, when it is added to the light as the rest of a
 * picture is.
 */
export function lay(f: Frame, canvas: HTMLCanvasElement, a: number, blur = 0, add = false) {
  const { ctx } = f;
  if (!canvas.width || !canvas.height) return; // a page with no size yet (as while the app reloads) has nothing to lay
  ctx.save();
  ctx.globalAlpha = a * LAID;
  if (!add) ctx.globalCompositeOperation = "source-over";
  if (blur) {
    ctx.shadowColor = f.ink(0.5 * f.env);
    ctx.shadowBlur = blur;
  }
  ctx.drawImage(canvas, 0, 0, f.w, f.h);
  ctx.restore();
}

/** A smooth wandering value in -1..1, from a few sines: `seed` makes it its own. */
export const wander = (t: number, seed: number) =>
  (Math.sin(t * 0.7 + seed) + Math.sin(t * 0.43 + seed * 2.1) * 0.6 + Math.sin(t * 1.3 + seed * 0.7) * 0.3) / 1.9;

/** A ring of ripples spreading from (x, y): `q` is how far along (0–1), `rx` their reach. */
export function ripples(f: Frame, x: number, y: number, q: number, rx: number, a: number, cool = true) {
  const { ctx } = f;
  for (let j = 0; j < 3; j++) {
    const qq = q - j * 0.08;
    if (qq <= 0) continue;
    ctx.strokeStyle = f.ink(a * f.env * (1 - q) ** 1.5 * (1 - j * 0.3), cool);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(x, y, qq * rx, qq * rx * 0.26, 0, 0, TAU);
    ctx.stroke();
  }
}

/**
 * A picture from a small grey bitmap (made by tools/bitmap.py, its edges already faded): shown
 * in the ink's colour, tinted once per colour and kept. On the dark page its lights are the
 * ink and its darks fall to nothing, so the subject stands out of the dark. `floor` is the grey
 * (0-1) at and below which nothing shows, for a background. On paper, `light` says how: a dark
 * subject is "inverted", its darks the ink and its background (below the floor) gone; a pale
 * one (a white lamb, a book's pages) is shown as the "photo" it is, every dark as ink and every
 * light as the paper, its background kept so the pale subject stands against it.
 */
export function bitmap(uri: string, floor = 0.3, light: "inverted" | "photo" = "inverted") {
  const img = new Image();
  img.src = uri;
  let tinted: { key: string; canvas: HTMLCanvasElement } | null = null;
  const tint = (f: Frame) => {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height);
    const [r, gr, bl] = inkRGB(f);
    for (let i = 0; i < d.data.length; i += 4) {
      const lum = d.data[i] / 255;
      const above = Math.max(0, (lum - floor) / (1 - floor)); // how far above the background
      const k = f.dark ? above ** 1.4 : light === "inverted" ? Math.max(0, (1 - floor - lum) / (1 - floor)) ** 1.4 : (1 - lum) ** 1.2;
      d.data[i] = r;
      d.data[i + 1] = gr;
      d.data[i + 2] = bl;
      d.data[i + 3] = Math.round(d.data[i + 3] * k);
    }
    g.putImageData(d, 0, 0);
    return c;
  };
  return {
    /** Draw it centred at (x, y), `width` wide, `a` strong, scaled by `k` about its middle. */
    draw(f: Frame, x: number, y: number, width: number, a: number, k = 1) {
      a *= PHOTO;
      if (!img.complete || !img.naturalWidth) return;
      const key = `${f.ink(1)}|${f.dark}`;
      if (!tinted || tinted.key !== key) tinted = { key, canvas: tint(f) };
      const h = (width * img.naturalHeight) / img.naturalWidth;
      const { ctx } = f;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(x, y);
      ctx.scale(k, k);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(tinted.canvas, -width / 2, -h / 2, width, h);
      ctx.restore();
    },
  };
}
