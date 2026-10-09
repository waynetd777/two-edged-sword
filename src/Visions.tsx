// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Faint pictures behind a playing song's words (LyricsPage), with or without the flames: a cross
// in light, a dove passing over, stars, rain, a field of wheat and more. One backdrop and one
// passing picture at most at a time, each chosen (not one of the last few shown) for a random
// while, fading in and out. A picture whose themes (pictures/kit.ts) are in the song's title or
// words is chosen more often than the rest, so a song about fire gets fire; a song whose words
// aren't known gets them all alike. They swell a little on the beat, as the flames do; paused,
// they fade away and wait. Their colours are the artwork's (the page's background), lightened in
// the dark theme and deepened on paper. Settings › Listening turns them off.

import { useEffect, useRef } from "react";
import { Frame, Lane, RGB, rnd, Room, smooth, Vision } from "./pictures/kit";
import { VISIONS } from "./pictures";

type Pair = { dark: RGB; light: RGB };
/** Without artwork (or with grey artwork): warm gold and a soft blue. */
const WARM: Pair = { dark: [255, 238, 205], light: [168, 128, 58] };
const COOL: Pair = { dark: [205, 225, 255], light: [80, 112, 165] };

function hsl(h: number, s: number, l: number): RGB {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    return Math.round(255 * (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}
/** A hue as the theme wants it: light and soft over the dark page, deeper over paper. */
const pairOf = (h: number, s: number): Pair => ({ dark: hsl(h, Math.min(0.7, s), 0.8), light: hsl(h, Math.min(0.55, s), 0.42) });

/**
 * The artwork's two strongest colours: its pixels' hues in 24 bins, each weighted by how colourful
 * and bright it is; the heaviest bin, and the heaviest one well away from it (or a near neighbour
 * of the first, for a cover of one colour). Null for grey artwork, or one that can't be read.
 */
export async function artPalette(url: string): Promise<{ warm: Pair; cool: Pair } | null> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = c.height = 48;
  const x = c.getContext("2d", { willReadFrequently: true })!;
  x.drawImage(img, 0, 0, 48, 48);
  const px = x.getImageData(0, 0, 48, 48).data;
  const bins = Array.from({ length: 24 }, () => ({ w: 0, s: 0 }));
  let total = 0;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i] / 255,
      g = px[i + 1] / 255,
      b = px[i + 2] / 255;
    const mx = Math.max(r, g, b),
      mn = Math.min(r, g, b),
      d = mx - mn;
    const l = (mx + mn) / 2;
    const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    total += 1;
    if (d < 0.06) continue;
    const h = (mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) / 6;
    const wt = sat * mx * (1 - Math.abs(l - 0.5));
    const bin = bins[Math.floor(h * 24) % 24];
    bin.w += wt;
    bin.s += sat * wt;
  }
  const order = bins.map((b, i) => ({ ...b, i })).sort((a, b) => b.w - a.w);
  const top = order[0];
  if (!top || top.w / total < 0.04) return null;
  const far = order.find((b) => Math.min(Math.abs(b.i - top.i), 24 - Math.abs(b.i - top.i)) >= 4 && b.w > top.w * 0.2);
  const hue = (b: { i: number }) => (b.i + 0.5) / 24;
  const sat = (b: { w: number; s: number }) => Math.max(0.35, b.s / b.w);
  return {
    warm: pairOf(hue(top), sat(top)),
    cool: far ? pairOf(hue(far), sat(far)) : pairOf((hue(top) + 0.08) % 1, sat(top) * 0.8),
  };
}
/** Screenshot mode: one picture shown, this far through, in full. */
// `loop` (the pictures viewer, visions.html): it fades in and out as when chosen, then begins again.
let scenePick: { name: string; at: number; loop?: boolean } | null = null;
export const setSceneVision = (name: string, at = 0.5, loop = false) => (scenePick = { name, at, loop });
export const VISION_NAMES = VISIONS.map((v) => v.name);

/**
 * How well a picture suits a song: how many of its themes are in the song's title and words.
 * `text` is the song's, lowercased, with its punctuation gone and a space either end; a theme
 * of one word matches that word or a simple form of it (fires, fired, firing), a phrase is
 * looked for as it is.
 */
export function suits(v: Vision, text: string): number {
  if (!v.themes || !text.trim()) return 0;
  let n = 0;
  for (const t of v.themes) {
    if (
      t.includes(" ")
        ? text.includes(` ${t} `)
        : new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(s|es|ed|ing|'s)?\\b`).test(text)
    )
      n++;
  }
  return n;
}
/** A song's title and words as `suits` wants them. */
export const songText = (song: string) =>
  ` ${song
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
/** How much more often a picture that suits the song is chosen: once for none of its themes, more for each. */
const weightOf = (n: number) => 1 + 4 * Math.min(n, 3);

const DEFAULT_BPM = 72;
/** Seconds a picture takes to fade out when the words move from beside it. */
const QUIT = 1.2;

/**
 * Room beside the words, which run from `left` to `right` across a page `w` wide (in the page's
 * own pixels): a clear stretch on either side, a little apart from the words and the page's
 * edges, chosen at random among those wide enough. When neither is, the wider, with the picture
 * shrunk to fit (to a third of its size at most); when the words fill the page, anywhere.
 */
export function roomBeside(w: number, words: { left: number; right: number } | null): Room {
  const gap = 32,
    edge = w * 0.03;
  const spans = (
    words
      ? [
          [edge, words.left - gap],
          [words.right + gap, w - edge],
        ]
      : [[edge, w - edge]]
  ).filter(([a, b]) => b > a);
  return {
    place: (width) => {
      const fits = spans.filter(([a, b]) => b - a >= width);
      if (fits.length) {
        const [a, b] = fits[Math.floor(Math.random() * fits.length)];
        return { x: a + width / 2 + Math.random() * (b - a - width), scale: 1 };
      }
      const best = spans.sort((p, q) => q[1] - q[0] - (p[1] - p[0]))[0];
      if (best && best[1] - best[0] >= width * 0.35) return { x: (best[0] + best[1]) / 2, scale: (best[1] - best[0]) / width };
      return { x: rnd(Math.min(w / 2, edge + width / 2), Math.max(w / 2, w - edge - width / 2)), scale: 1 };
    },
  };
}

export function Visions({
  bpm,
  playing,
  time,
  dark,
  art,
  words,
  song,
}: {
  bpm: number;
  playing: boolean;
  time: () => number;
  dark: boolean;
  art: string | null;
  /** Where the words are across the page now (its pixels), for the pictures to keep beside them. */
  words: () => { left: number; right: number } | null;
  /** The song's title and its words, as far as they're known, for choosing pictures that suit it. */
  song: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const colours = useRef({ warm: WARM, cool: COOL });
  useEffect(() => {
    let dead = false;
    (art ? artPalette(art).catch(() => null) : Promise.resolve(null)).then((p) => {
      if (!dead) colours.current = p ?? { warm: WARM, cool: COOL };
    });
    return () => {
      dead = true;
    };
  }, [art]);
  const live = useRef({ bpm, playing, time, dark, words, song });
  live.current = { bpm, playing, time, dark, words, song };

  useEffect(() => {
    const c = canvas.current!;
    const ctx = c.getContext("2d")!;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dots = new Map<string, HTMLCanvasElement>();
    const dotOf = (rgb: RGB) => {
      const key = rgb.join(",");
      let d = dots.get(key);
      if (!d) {
        d = document.createElement("canvas");
        d.width = d.height = 64;
        const x = d.getContext("2d")!;
        const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, `rgba(${key},1)`);
        g.addColorStop(0.35, `rgba(${key},0.5)`);
        g.addColorStop(1, `rgba(${key},0)`);
        x.fillStyle = g;
        x.fillRect(0, 0, 64, 64);
        dots.set(key, d);
      }
      return d;
    };
    const fit = () => {
      const r = c.getBoundingClientRect();
      const d = window.devicePixelRatio || 1;
      c.width = Math.max(1, Math.round(r.width * d));
      c.height = Math.max(1, Math.round(r.height * d));
      ctx.setTransform(d, 0, 0, d, 0, 0);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(c);

    // `placed`: it was put beside the words, so it fades out early (`quit`) when they move.
    type Active = { v: Vision; draw: (f: Frame) => void; start: number; dur: number; placed: boolean; quit?: number };
    const lanes: Record<Lane, { cur: Active | null; next: number; recent: string[] }> = {
      back: { cur: null, next: rnd(2, 5), recent: [] },
      pass: { cur: null, next: rnd(9, 18), recent: [] },
    };
    // The words where pictures were last placed beside them, looked at twice a second.
    let words = live.current.words(),
      looked = 0;
    const make = (a: Active) => {
      const room = roomBeside(c.clientWidth, words);
      return a.v.make(c.clientWidth, c.clientHeight, {
        place: (width) => {
          a.placed = true;
          return room.place(width);
        },
      });
    };
    const begin = (lane: Lane, v: Vision, clock: number, at = 0) => {
      const dur = rnd(v.dur[0], v.dur[1]);
      const a: Active = { v, draw: () => {}, start: clock - at * dur, dur, placed: false };
      a.draw = make(a);
      lanes[lane].cur = a;
      const rec = lanes[lane].recent;
      rec.push(v.name);
      if (rec.length > 4) rec.shift();
    };
    // Each picture's weight for this song, worked out when the song (or its words) changes.
    let weighed = "",
      weights = new Map<string, number>();
    const weigh = () => {
      const song = live.current.song;
      if (song === weighed) return;
      weighed = song;
      const text = songText(song);
      weights = new Map(VISIONS.map((v) => [v.name, weightOf(suits(v, text))]));
    };
    const choose = (choices: Vision[]) => {
      weigh();
      const total = choices.reduce((s, v) => s + (weights.get(v.name) ?? 1), 0);
      let r = Math.random() * total;
      for (const v of choices) {
        r -= weights.get(v.name) ?? 1;
        if (r <= 0) return v;
      }
      return choices[choices.length - 1];
    };
    const pick = scenePick ? VISIONS.find((v) => v.name === scenePick!.name) : undefined;
    const looping = !!pick && !!scenePick!.loop;
    if (pick) {
      begin(pick.lane, pick, 0, scenePick!.at);
      lanes.back.next = lanes.pass.next = Infinity;
    }

    // Time runs only while the song plays; paused, the pictures fade out and hold where they are.
    let clock = 0,
      shown = live.current.playing ? 1 : 0,
      raf = 0,
      last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { bpm, playing, time, dark } = live.current;
      shown += ((playing ? 1 : 0) - shown) * Math.min(1, dt * 1.2);
      if (playing) clock += dt * (still ? 0.25 : 1);
      const w = c.clientWidth,
        h = c.clientHeight;
      ctx.clearRect(0, 0, w, h);
      c.style.opacity = String(shown);
      const phase = (time() * (bpm || DEFAULT_BPM)) / 60;
      const beat = playing && !still ? Math.exp(-(phase % 1) * 4) : 0;
      const pal = (p: Pair) => (dark ? p.dark : p.light);
      const light = dark ? 1 : 0.75; // softer on paper
      ctx.globalCompositeOperation = dark ? "lighter" : "source-over";
      // The words moved (focus mode, the lyrics arriving, the window resized): a picture beside
      // them fades out, and the next is placed beside them where they are now.
      if (now - looked > 500) {
        looked = now;
        const was = words;
        words = live.current.words();
        if (!was !== !words || (was && words && (Math.abs(was.left - words.left) > 40 || Math.abs(was.right - words.right) > 40)))
          for (const L of Object.values(lanes)) {
            const a = L.cur;
            if (!a?.placed || a.quit !== undefined) continue;
            if (pick) a.draw = make(a);
            else a.quit = clock;
          }
      }
      for (const lane of ["back", "pass"] as Lane[]) {
        const L = lanes[lane];
        if (L.cur && (clock - L.cur.start >= L.cur.dur || (L.cur.quit !== undefined && clock - L.cur.quit >= QUIT))) {
          L.next = looping ? clock + 1.5 : clock + (L.cur.quit !== undefined ? rnd(1.5, 4) : lane === "back" ? rnd(4, 12) : rnd(6, 18));
          L.cur = null;
        }
        if (!L.cur && clock >= L.next) {
          const choices = looping ? [pick] : VISIONS.filter((v) => v.lane === lane && !L.recent.includes(v.name) && !(still && v.moving));
          if (choices.length) begin(lane, choose(choices), clock);
        }
        const a = L.cur;
        if (!a) continue;
        const t = clock - a.start;
        const fade = Math.min(3, a.dur * 0.2);
        const env =
          (pick && !looping ? 1 : smooth(t / fade) * smooth((a.dur - t) / fade)) *
          (a.quit === undefined ? 1 : smooth(1 - (clock - a.quit) / QUIT));
        const f: Frame = {
          ctx,
          w,
          h,
          t,
          dt,
          dur: a.dur,
          k: t / a.dur,
          env: env * light,
          beat,
          dark,
          ink: (al, cool) => `rgba(${pal(cool ? colours.current.cool : colours.current.warm).join(",")},${al})`,
          dot: (cool) => dotOf(pal(cool ? colours.current.cool : colours.current.warm)),
        };
        ctx.save();
        try {
          a.draw(f);
        } catch (e) {
          // A picture that fails is dropped, and the rest carry on.
          console.error(`picture "${a.v.name}":`, e);
          if (!pick) L.cur = null;
        }
        ctx.restore();
        ctx.globalCompositeOperation = dark ? "lighter" : "source-over";
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvas} style={{ width: "100%", height: "100%", display: "block" }} />;
}
