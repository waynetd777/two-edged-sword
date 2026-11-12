// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Faint pictures behind a playing song's words (LyricsPage), with or without the flames: a cross
// in light, a dove passing over, stars, rain, a field of wheat and more. One backdrop and one
// passing picture at most at a time, each chosen (none shown again during a song until all of
// its lane have been) for a random while, fading in and out. A picture whose themes (pictures/kit.ts) are in the song's title or
// words is chosen more often than the rest, so a song about fire gets fire; a song whose words
// aren't known gets them all alike. They swell a little on the beat, as the flames do; paused,
// they fade away and wait. A picture placed beside the words keeps clear of the other lane's
// picture too, and only an ambient picture (light, weather) shows with another (`goesWith`). Their colours are the
// artwork's (the page's background), lightened in the dark theme and deepened on paper. Each
// has its verse beneath it (`verses`, from the Bible chosen in Settings), by where the picture
// really is (`measure`), kept within the stretch it stands in and above the flames; an ambient
// picture's verse gives way to the other picture's. Settings › Listening turns them off, or the verses.

import { useEffect, useRef } from "react";
import { beatAt, useCanvasLoop } from "./canvasLoop";
import { FLAME_HEIGHT } from "./Flames";
import { sceneStepping } from "./sceneClock";
import {
  Box,
  drawVerse,
  Frame,
  Lane,
  random,
  RGB,
  rnd,
  Room,
  seedRandom,
  smooth,
  Spot,
  spotVerse,
  Verse,
  verseIn,
  verseWidth,
  Vision,
  withRandom,
} from "./pictures/kit";
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
async function artPalette(url: string): Promise<{ warm: Pair; cool: Pair } | null> {
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
/** Screenshot mode: one picture shown, this far through, in full (over `dur` seconds, if given). */
// `loop` (the pictures viewer, visions.html): it fades in and out as when chosen, then begins again.
// `held`: it waits where it is until an animated scene's frames begin (sceneClock.ts).
let scenePick: { name: string; at: number; loop?: boolean; dur?: number; held?: boolean } | null = null;
// A scene (not the viewer, which shows each picture afresh) draws the same picture each time, so
// screenshots of it don't change from one run to the next.
export const setSceneVision = (name: string, at = 0.5, loop = false, dur?: number, held = false) => {
  if (!loop) seedRandom(1);
  scenePick = { name, at, loop, dur, held };
};

/** How many pictures share each theme: a theme few pictures have says more about a song than one many have. */
const sharers = new Map<string, number>();
for (const v of VISIONS) for (const t of v.themes ?? []) sharers.set(t, (sharers.get(t) ?? 0) + 1);

/**
 * How well a picture suits a song: its themes found in the song's title and words, each counting
 * for one over the number of pictures that share it, so "jericho" counts for a whole picture and
 * "praise", which a dozen have, for a twelfth. `text` is the song's, lowercased, with its
 * punctuation gone and a space either end; a theme of one word matches that word or a simple
 * form of it (fires, fired, firing), a phrase is looked for as it is.
 */
function suits(v: Vision, text: string): number {
  if (!v.themes || !text.trim()) return 0;
  let n = 0;
  for (const t of v.themes) {
    if (
      t.includes(" ")
        ? text.includes(` ${t} `)
        : new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(s|es|ed|ing|'s)?\\b`).test(text)
    )
      n += 1 / (sharers.get(t) ?? 1);
  }
  return n;
}
/** A song's title and words as `suits` wants them. */
const songText = (song: string) =>
  ` ${song
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
/** How much more often a picture that suits the song is chosen: once for nothing of it in the song, up to thirteen times for much. */
const weightOf = (n: number) => 1 + 6 * Math.min(n, 2);

/** How strongly all the pictures show, at most: the whole canvas is held at this, so they stay faint behind the words. */
const FAINT = 0.72;
/** Seconds a picture takes to fade out when the words move from beside it. */
const QUIT = 1.2;

/**
 * Room beside the words, which run from `left` to `right` across a page `w` wide (in the page's
 * own pixels): a clear stretch on either side, a little apart from the words and the page's
 * edges, and clear too of `taken`, the stretches another picture already stands in; chosen at
 * random among those wide enough. When none is, the widest clear one with the picture shrunk to
 * fit (to half its size at most). Failing that, a stretch beside the words regardless of what
 * stands there, and `crowded` says so (the picture then waits for another time); when none of
 * those is wide enough either, the widest, shrunk to fit (to a third at most); when the words
 * fill the page, anywhere, and `crowded` says so too, so no picture stands behind the words.
 */
function roomBeside(
  w: number,
  words: { left: number; right: number } | null,
  taken: [number, number][] = [],
): Omit<Room, "verse"> & { crowded: boolean } {
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
  // The spans with what's taken cut out of them (a little apart from it).
  const free = taken.reduce<number[][]>(
    (acc, [t0, t1]) =>
      acc.flatMap(([a, b]) =>
        t1 + gap <= a || t0 - gap >= b
          ? [[a, b]]
          : [
              [a, Math.min(b, t0 - gap)],
              [Math.max(a, t1 + gap), b],
            ].filter(([p, q]) => q > p),
      ),
    spans,
  );
  const pick = (from: number[][], width: number) => {
    const fits = from.filter(([a, b]) => b - a >= width);
    if (!fits.length) return null;
    const [a, b] = fits[Math.floor(random() * fits.length)];
    return { x: a + width / 2 + random() * (b - a - width), scale: 1 };
  };
  const widest = (from: number[][]) => [...from].sort((p, q) => q[1] - q[0] - (p[1] - p[0]))[0];
  const room = {
    crowded: false,
    place: (width: number) => {
      const clear = pick(free, width);
      if (clear) return clear;
      const roomy = widest(free);
      if (roomy && roomy[1] - roomy[0] >= width * 0.5) return { x: (roomy[0] + roomy[1]) / 2, scale: (roomy[1] - roomy[0]) / width };
      if (taken.length) room.crowded = true;
      const found = pick(spans, width);
      if (found) return found;
      const best = spans.sort((p, q) => q[1] - q[0] - (p[1] - p[0]))[0];
      if (best && best[1] - best[0] >= width * 0.35) return { x: (best[0] + best[1]) / 2, scale: (best[1] - best[0]) / width };
      // No room beside the words (focus mode's wide lines): it would stand behind them, so it waits.
      if (words) room.crowded = true;
      return { x: rnd(Math.min(w / 2, edge + width / 2), Math.max(w / 2, w - edge - width / 2)), scale: 1 };
    },
  };
  return room;
}

export function Visions({
  bpm,
  playing,
  time,
  dark,
  art,
  words,
  song,
  verses,
  flames,
  ceiling,
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
  /** Each picture's verse, in the Bible chosen in Settings; absent when verses are off. */
  verses?: Map<string, Verse>;
  /** Flames along the foot of the page (a song without words): verses keep above them. */
  flames?: boolean;
  /** How far down the page what's at its top reaches (the song's heading): verses keep below it. */
  ceiling?: () => number;
}) {
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
  const canvas = useCanvasLoop({ bpm, playing, time, dark, words, song, verses, flames, ceiling }, ({ canvas: c, ctx, live, still }) => {
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

    // `placed`: it was put beside the words, so it fades out early (`quit`) when they move;
    // `span`: the stretch of the page it stands in, which the other lane's picture keeps clear of.
    type Active = {
      v: Vision;
      lane: Lane;
      draw: (f: Frame) => void;
      start: number;
      dur: number;
      placed: boolean;
      quit?: number;
      span?: [number, number];
      /** It was made with room for its verse: one made before the verses came shows none. */
      versed?: boolean;
      /** Where its verse is drawn, fixed when it first shows so it doesn't wander with the picture. */
      spot?: Spot | null;
      /** How strongly its verse shows (0–1): an ambient picture's goes when a picture with its own verse comes. */
      say: number;
      hushed?: boolean;
      /** The seed its making was given, and where it was placed, to make a copy of it to measure. */
      seed: number;
      places: { x: number; scale: number }[];
    };
    /** May `v` show while `other` does? Only when one of them is ambient (light, weather, a bird passing). */
    const goesWith = (v: Vision, other: Active | null) => !other || v.kind === "ambient" || other.v.kind === "ambient";

    // Where a picture really is: drawn small on a canvas of the page's colour, as it will be
    // at a few moments ahead, and the part that stands out from the page found. A picture's own
    // box is generous (its glow, room to move), which left verses far from what they belong to.
    const M = 8;
    const mc = document.createElement("canvas");
    const mx = mc.getContext("2d", { willReadFrequently: true })!;
    // The copy is made with the same numbers and placings as the picture, and drawn ahead on its
    // own: drawing the picture itself ahead would upset what it keeps from frame to frame (the
    // throne's lightning, made "later", stayed lit).
    const measure = (a: Active, f: Frame): Box | null => {
      let n = 0;
      const copy = withRandom(a.seed, () =>
        a.v.make(f.w, f.h, { verse: !!a.versed, place: () => a.places[n++] ?? a.places[a.places.length - 1] ?? { x: f.w / 2, scale: 1 } }),
      );
      const W = Math.max(1, Math.ceil(f.w / M)),
        H = Math.max(1, Math.ceil(f.h / M));
      if (mc.width !== W || mc.height !== H) {
        mc.width = W;
        mc.height = H;
      }
      const page = f.dark ? [13, 17, 23] : [246, 248, 250];
      let l = W,
        r = -1,
        t = H,
        b = -1;
      for (const k of [Math.max(f.k, 0.35), 0.55, 0.75]) {
        mx.setTransform(1, 0, 0, 1, 0, 0);
        mx.globalAlpha = 1;
        mx.globalCompositeOperation = "source-over";
        mx.fillStyle = `rgb(${page.join(",")})`;
        mx.fillRect(0, 0, W, H);
        mx.setTransform(1 / M, 0, 0, 1 / M, 0, 0);
        mx.globalCompositeOperation = f.dark ? "lighter" : "source-over";
        mx.save();
        try {
          withRandom(a.seed + 1, () => copy({ ...f, ctx: mx, dt: 0, t: k * a.dur, k, env: 1, verse: undefined, box: undefined }));
        } catch {
          for (let i = 0; i < 64; i++) mx.restore();
          return null;
        }
        mx.restore();
        const px = mx.getImageData(0, 0, W, H).data;
        const d = new Float32Array(W * H);
        let most = 0;
        for (let i = 0; i < W * H; i++) {
          const v = Math.max(Math.abs(px[i * 4] - page[0]), Math.abs(px[i * 4 + 1] - page[1]), Math.abs(px[i * 4 + 2] - page[2]));
          d[i] = v;
          if (v > most) most = v;
        }
        // What stands out: well above the faint glow round most pictures.
        const enough = Math.max(6, most * 0.3);
        for (let y = 0; y < H; y++)
          for (let x = 0; x < W; x++)
            if (d[y * W + x] >= enough) {
              if (x < l) l = x;
              if (x > r) r = x;
              if (y < t) t = y;
              if (y > b) b = y;
            }
      }
      if (r < 0) return null;
      return { x: ((l + r + 1) / 2) * M, top: t * M, bottom: (b + 1) * M, width: (r - l + 1) * M };
    };
    // `recent`: the last few shown, never chosen next; `shown`: all shown during this song, not
    // chosen again until every picture of the lane has had its turn.
    const lanes: Record<Lane, { cur: Active | null; next: number; recent: string[]; shown: Set<string> }> = {
      back: { cur: null, next: rnd(2, 5), recent: [], shown: new Set() },
      pass: { cur: null, next: rnd(9, 18), recent: [], shown: new Set() },
    };
    // The words where pictures were last placed beside them, looked at twice a second.
    let words = live.current.words(),
      looked = 0;
    const make = (a: Active) => {
      const other = lanes[a.lane === "back" ? "pass" : "back"].cur;
      // An ambient picture's verse gives way to this one's, so only its picture need be kept clear of.
      const keep = other?.span && !(other.v.kind === "ambient" && a.v.kind !== "ambient" && other.versed);
      const room = roomBeside(c.clientWidth, words, keep ? [other.span!] : []);
      a.span = undefined;
      a.spot = undefined;
      a.places = [];
      const verse = !!live.current.verses?.has(a.v.name);
      a.versed = verse;
      const draw = withRandom(a.seed, () =>
        a.v.make(c.clientWidth, c.clientHeight, {
          verse,
          place: (width) => {
            a.placed = true;
            // The first placing is the picture's own; later ones are parts of it, within that. One
            // with a verse takes a stretch wide enough for it to read well, the picture as it was.
            const first = !a.span;
            const want = first && verse ? Math.max(width, verseWidth(c.clientWidth, c.clientHeight) * 0.8) : width;
            const at = room.place(want);
            if (first) a.span = [at.x - (want * at.scale) / 2, at.x + (want * at.scale) / 2];
            const out = { x: at.x, scale: Math.min(1, (want * at.scale) / width) };
            a.places.push(out);
            return out;
          },
        }),
      );
      return { draw, crowded: room.crowded };
    };
    const begin = (lane: Lane, v: Vision, clock: number, at = 0) => {
      const dur = (scenePick?.name === v.name && scenePick.dur) || rnd(v.dur[0], v.dur[1]);
      const a: Active = {
        v,
        lane,
        draw: () => {},
        start: clock - at * dur,
        dur,
        placed: false,
        say: 1,
        seed: Math.floor(random() * 2 ** 31),
        places: [],
      };
      const made = make(a);
      // No room clear of the words or the other lane's picture: none now; another try in a few seconds.
      if (made.crowded && !scenePick) {
        lanes[lane].next = clock + rnd(2, 4);
        return;
      }
      a.draw = made.draw;
      lanes[lane].cur = a;
      // A picture shown on its own: the other lane's fades out.
      const other = lanes[lane === "back" ? "pass" : "back"].cur;
      if (v.alone && other && other.quit === undefined) other.quit = clock;
      const rec = lanes[lane].recent;
      rec.push(v.name);
      if (rec.length > 4) rec.shift();
      lanes[lane].shown.add(v.name);
    };
    // Each picture's weight for this song, worked out when the song (or its words) changes.
    let weighed = "",
      weights = new Map<string, number>();
    const weigh = () => {
      const song = live.current.song;
      if (song === weighed) return;
      // A new song: every picture may be shown again.
      if (weighed) for (const L of Object.values(lanes)) L.shown.clear();
      weighed = song;
      const text = songText(song);
      weights = new Map(VISIONS.map((v) => [v.name, weightOf(suits(v, text))]));
    };
    const choose = (choices: Vision[]) => {
      weigh();
      const total = choices.reduce((s, v) => s + (weights.get(v.name) ?? 1), 0);
      let r = random() * total;
      for (const v of choices) {
        r -= weights.get(v.name) ?? 1;
        if (r <= 0) return v;
      }
      return choices[choices.length - 1];
    };
    // A scene's picture, begun on the first frame after it is set (the page may already be showing
    // when the scene is applied).
    let pick: Vision | undefined,
      looping = false;
    const pickUp = () => {
      if (pick || !scenePick) return;
      pick = VISIONS.find((v) => v.name === scenePick!.name);
      if (!pick) return;
      looping = !!scenePick.loop;
      for (const L of Object.values(lanes)) L.cur = null;
      begin(pick.lane, pick, clock, scenePick.at);
      lanes.back.next = lanes.pass.next = Infinity;
    };

    // Time runs only while the song plays; paused, the pictures fade out and hold where they are.
    let clock = 0,
      shown = live.current.playing ? 1 : 0;
    return (now, dt) => {
      const { bpm, playing, time, dark, verses, flames } = live.current;
      pickUp();
      shown += ((playing ? 1 : 0) - shown) * Math.min(1, dt * 1.2);
      if (playing && (!scenePick?.held || sceneStepping())) clock += dt * (still ? 0.25 : 1);
      const w = c.clientWidth,
        h = c.clientHeight;
      ctx.clearRect(0, 0, w, h);
      c.style.opacity = String(shown * FAINT);
      // Paused and faded away: nothing to draw until the song plays again.
      if (!playing && shown < 0.01) return;
      const beat = beatAt(time(), bpm, playing && !still);
      // The colours of this frame, worked out once for every picture's many calls on them.
      const warm = dark ? colours.current.warm.dark : colours.current.warm.light,
        cool = dark ? colours.current.cool.dark : colours.current.cool.light;
      const warmA = `rgba(${warm.join(",")},`,
        coolA = `rgba(${cool.join(",")},`;
      const ink = (al: number, isCool?: boolean) => `${isCool ? coolA : warmA}${al})`;
      const rgb = (isCool?: boolean) => (isCool ? cool : warm);
      const dot = (isCool?: boolean) => dotOf(isCool ? cool : warm);
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
            if (pick) a.draw = make(a).draw;
            else a.quit = clock;
          }
      }
      // The verses, drawn once both pictures are, so neither picture is drawn over a verse.
      const said: (() => void)[] = [];
      for (const lane of ["back", "pass"] as Lane[]) {
        const L = lanes[lane];
        // A scene's picture, begun before its verse came: made again with room for it.
        if (pick && L.cur && !L.cur.versed && verses?.has(L.cur.v.name)) L.cur.draw = make(L.cur).draw;
        if (L.cur && (clock - L.cur.start >= L.cur.dur || (L.cur.quit !== undefined && clock - L.cur.quit >= QUIT))) {
          L.next = looping ? clock + 1.5 : clock + (L.cur.quit !== undefined ? rnd(1.5, 4) : lane === "back" ? rnd(4, 12) : rnd(6, 18));
          L.cur = null;
        }
        const across = lanes[lane === "back" ? "pass" : "back"].cur;
        if (!L.cur && clock >= L.next && !across?.v.alone) {
          weigh();
          const fit = (v: Vision) => v.lane === lane && !L.recent.includes(v.name) && !(still && v.moving) && goesWith(v, across);
          let choices = looping ? [pick!] : VISIONS.filter((v) => fit(v) && !L.shown.has(v.name));
          if (!choices.length && !looping) {
            // Every picture of the lane that may show now has been shown this song: begin again.
            for (const v of VISIONS) if (fit(v)) L.shown.delete(v.name);
            choices = VISIONS.filter(fit);
          }
          if (choices.length) begin(lane, choose(choices), clock);
          // Nothing may show with what's showing now: another look in a few seconds.
          else L.next = clock + rnd(2, 4);
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
          ink,
          rgb,
          dot,
          verse: a.versed ? verses?.get(a.v.name) : undefined,
          span: a.span,
          floor: flames ? h - FLAME_HEIGHT : h - 16,
          ceiling: (live.current.ceiling?.() ?? 0) + 16,
        };
        ctx.save();
        try {
          a.draw(f);
          ctx.restore();
          ctx.save();
          // Its verse, where it was first put, or (the first time it shows) by where the picture
          // is: an ambient picture's in the stretch it placed for it, any other's by what it drew.
          if (f.verse && f.box && verseIn(f) * f.env > 0.002) {
            if (a.spot === undefined) {
              const seen = a.v.kind === "ambient" ? null : measure(a, f);
              a.spot = spotVerse(f, seen ?? f.box);
            }
            // An ambient picture's verse gives way to a picture with its own (or an earlier ambient one's).
            const by = lanes[lane === "back" ? "pass" : "back"].cur;
            if (a.v.kind === "ambient" && by && by.quit === undefined && by.versed && (by.v.kind !== "ambient" || by.start < a.start))
              a.hushed = true;
            a.say += ((a.hushed ? 0 : 1) - a.say) * Math.min(1, dt * 1.5);
            const spot = a.spot,
              say = a.say;
            if (spot) said.push(() => drawVerse(f, spot, say));
          }
        } catch (e) {
          // A picture that fails is dropped, and the rest carry on.
          console.error(`picture "${a.v.name}":`, e);
          if (!pick) L.cur = null;
          // It may have stopped between a save and its restore: undo all it saved, so what it
          // left (a turn, a fade) doesn't stay on the canvas for the rest. This pops ours too.
          for (let i = 0; i < 64; i++) ctx.restore();
          ctx.save();
        }
        ctx.restore();
        ctx.globalCompositeOperation = dark ? "lighter" : "source-over";
      }
      for (const say of said) say();
    };
  });

  return <canvas ref={canvas} style={{ width: "100%", height: "100%", display: "block" }} />;
}
