// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Soft flames and rising embers, for a song with no lyrics (LyricsPage). The app can't hear the
// music, so they swell on each beat of the song's tempo as Music knows it, or of a slow worship
// tempo when it doesn't; paused, they die down to embers.

import { useEffect, useRef } from "react";

const DEFAULT_BPM = 72;
/** Flame colours, hot to cool: white-gold, gold, orange, red, deep red. */
const STOPS: [number, number, number][] = [
  [255, 244, 214],
  [255, 206, 102],
  [255, 140, 40],
  [230, 70, 30],
  [140, 25, 20],
];
const SHADES = 16;

/** A soft round sprite in each shade, drawn once, so each frame is only drawImage calls. */
function sprites(): HTMLCanvasElement[] {
  const out: HTMLCanvasElement[] = [];
  for (let i = 0; i < SHADES; i++) {
    const f = (i / (SHADES - 1)) * (STOPS.length - 1);
    const a = STOPS[Math.floor(f)],
      b = STOPS[Math.min(STOPS.length - 1, Math.floor(f) + 1)];
    const k = f - Math.floor(f);
    const [r, g, bl] = a.map((v, j) => Math.round(v + (b[j] - v) * k));
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d")!;
    const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, `rgba(${r},${g},${bl},1)`);
    grad.addColorStop(0.4, `rgba(${r},${g},${bl},0.45)`);
    grad.addColorStop(1, `rgba(${r},${g},${bl},0)`);
    x.fillStyle = grad;
    x.fillRect(0, 0, 64, 64);
    out.push(c);
  }
  return out;
}

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  ember: boolean;
  /** The middle of its tongue, which a flame draws in towards as it rises. */
  cx: number;
}

export function Flames({ bpm, playing, time, dark }: { bpm: number; playing: boolean; time: () => number; dark: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ bpm, playing, time, dark });
  live.current = { bpm, playing, time, dark };

  useEffect(() => {
    const c = canvas.current!;
    const ctx = c.getContext("2d")!;
    const shades = sprites();
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ps: P[] = [];
    let raf = 0,
      last = performance.now(),
      heat = live.current.playing ? 1 : 0.15; // then eases towards 1 playing, 0.15 paused
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

    // One step of the fire, drawn or (warming up) not.
    const step = (now: number, dt: number, draw: boolean) => {
      const { bpm, playing, time, dark } = live.current;
      const w = c.clientWidth,
        h = c.clientHeight;
      heat += ((playing ? 1 : 0.15) - heat) * Math.min(1, dt * 1.5);
      // A swell on each beat, dying away before the next.
      const phase = (time() * (bpm || DEFAULT_BPM)) / 60;
      const beat = playing && !still ? Math.exp(-(phase % 1) * 4) : 0;
      const surge = heat * (0.75 + 0.45 * beat);
      const t = now / 1000;

      // New flame: from a few tongues along the bottom that drift slowly side to side.
      const tongues = Math.max(3, Math.round(w / 170));
      const n = (still ? 60 : 260) * surge * dt * (w / 900);
      for (let i = 0; i < n || Math.random() < n - i; i++) {
        const k = Math.floor(Math.random() * tongues);
        const cx = ((k + 0.5) / tongues) * w + Math.sin(t * 0.3 + k * 1.7) * (w / tongues) * 0.25;
        const spread = (w / tongues) * 0.28;
        const ember = Math.random() < 0.04;
        ps.push({
          x: cx + (Math.random() + Math.random() - 1) * spread,
          y: h + 10,
          vx: (Math.random() - 0.5) * 12,
          vy: -(ember ? 40 + Math.random() * 50 : 55 + Math.random() * 70) * (0.8 + 0.4 * surge),
          life: 0,
          max: ember ? 4 + Math.random() * 4 : 1.2 + Math.random() * 1.3,
          size: ember ? 3 + Math.random() * 3 : (38 + Math.random() * 46) * (0.85 + 0.3 * surge),
          ember,
          cx,
        });
      }

      if (draw) ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = dark ? "lighter" : "source-over";
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.life += dt;
        if (p.life >= p.max) {
          ps.splice(i, 1);
          continue;
        }
        const f = p.life / p.max;
        // Flames draw in to a point over their tongue as they rise, and waver; embers drift.
        if (!p.ember) p.vx += (p.cx - p.x) * 2.2 * dt;
        p.vx += Math.sin(t * 2.3 + p.y * 0.02) * (p.ember ? 18 : 30) * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (!draw) continue;
        const size = p.ember ? p.size : p.size * (1 - f * 0.75);
        const shade = shades[Math.min(SHADES - 1, Math.floor((p.ember ? 0.3 + f * 0.5 : f) * SHADES))];
        ctx.globalAlpha = (p.ember ? 0.9 : 0.16) * Math.sin(Math.PI * Math.min(1, f * 1.4 + 0.05)) * (dark ? 1 : 0.8);
        // Tall and narrow, as a flame is; embers round.
        const sw = p.ember ? size : size * 0.7,
          sh = p.ember ? size : size * 1.5;
        ctx.drawImage(shade, p.x - sw / 2, p.y - sh / 2, sw, sh);
      }
      ctx.globalAlpha = 1;
    };
    // Already burning when it appears: a few seconds of fire run through first.
    for (let i = 180; i > 0; i--) step(last - i * 16.7, 1 / 60, false);
    const frame = (now: number) => {
      step(now, Math.min(0.05, (now - last) / 1000), true);
      last = now;
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
