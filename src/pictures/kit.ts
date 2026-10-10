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
  /** The same colour as numbers. */
  rgb: (cool?: boolean) => RGB;
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
/** Math.random, unless a scene (screenshot mode) has seeded it, so its pictures come out the same each time. */
let rand = Math.random;
export const random = () => rand();
/** From now on, the same numbers from `random` each time for the same `seed` (mulberry32). */
export function seedRandom(seed: number) {
  let s = seed >>> 0;
  rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rnd = (a: number, b: number) => a + random() * (b - a);
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

/** A glow squashed or stretched (as light thrown on the ground): `sx` as wide and `sy` as high as a round one `r` across. */
export function flatGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  sx: number,
  sy: number,
  inner: string,
  outer: string,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sx, sy);
  glow(ctx, 0, 0, r, inner, outer);
  ctx.restore();
}

/** How far (0–1, round and round) something drifting is: it began `p.u` along, and goes `p.s` a second. */
export const drift = (p: { u: number; s: number }, t: number) => (p.u + t * p.s) % 1;

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

/** The path of a range along `y` (a `ridge`) across a page `w` wide, down to its foot at `h`, in steps of `step`; `off` slides it along. */
export function rangePath(ctx: CanvasRenderingContext2D, y: (x: number) => number, w: number, h: number, off = 0, step = 12) {
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w + step; x += step) ctx.lineTo(x, y(x + off));
  ctx.lineTo(w, h);
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
    const n = random() < 0.35 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const a = ang + (i - (n - 1) / 2) * spread * rnd(0.7, 1.3) + rnd(-0.1, 0.1);
      kids.push(grow(len * rnd(0.68, 0.8), a, depth + 1, max, spread));
    }
  }
  return { len, ang, depth, kids };
}

/** The page's own colour (as in styles.css), which solid shapes are mixed from. */
const pageRGB = (dark: boolean): RGB => (dark ? [13, 17, 23] : [246, 248, 250]);

/**
 * Solid colours mixed from the page's own and the ink: `k` 0 is the page, 1 the ink. For shapes
 * drawn whole on a layer (see `layering`), so their parts don't add up where they overlap and
 * what's behind them is hidden.
 */
export function tones(f: Frame, cool = false) {
  const ink = f.rgb(cool),
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
const LAID = 0.8;

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

/** Each bitmap, made once (when its picture is first shown) and kept, tinted, for the next time. */
const bitmaps = new Map<string, ReturnType<typeof loadBitmap>>();
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
  const key = `${floor}|${light}|${uri}`;
  let b = bitmaps.get(key);
  if (!b) bitmaps.set(key, (b = loadBitmap(uri, floor, light)));
  return b;
}
function loadBitmap(uri: string, floor: number, light: "inverted" | "photo") {
  const img = new Image();
  img.onerror = () => console.error("picture bitmap failed to load");
  img.src = uri;
  let tinted: { key: string; canvas: HTMLCanvasElement } | null = null;
  const tint = (f: Frame) => {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height);
    const [r, gr, bl] = f.rgb();
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
      const key = `${f.rgb().join(",")}|${f.dark}`;
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

/**
 * A picture from a bitmap (an engraving or photograph, or with `painting` a detail of a painting),
 * `size` of the page's shorter side wide, in the middle of the page beside the words: rising a
 * little into place in a soft glow that swells on the beat, and breathing; a painting comes up
 * more slowly and breathes less.
 */
export function photo(uri: string, size: number, painting = false): Vision["make"] {
  const [rate, rise, sway, breath] = painting ? [2.2, 12, 0.003, 0.9] : [2.4, 14, 0.004, 1.1];
  return (w, h, room) => {
    const W0 = Math.min(w, h) * size;
    const { x, scale } = room.place(W0);
    const W = W0 * scale,
      y = h * 0.5;
    const pic = bitmap(uri, 0.1, "photo");
    return (f) => {
      const come = smooth(f.k * rate);
      glow(f.ctx, x, y, W * 0.5, f.ink(0.08 * f.env * come * (0.92 + 0.08 * f.beat)), f.ink(0));
      pic.draw(f, x, y + (1 - come) * rise, W, f.env * come, 1 + sway * Math.sin(f.t * breath));
    };
  };
}
