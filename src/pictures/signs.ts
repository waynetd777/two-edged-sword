// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Signs and symbols, drawn as if by hand, and music.

import { displayFont, flame, glow, rnd, smooth, TAU, traced, Vision } from "./kit";

export const SIGNS: Vision[] = [
  {
    name: "ichthys",
    lane: "pass",
    dur: [10, 15],
    make: (w, h, room) => {
      const S0 = Math.min(w, h) * 0.13;
      const { x, scale } = room.place(S0 * 2.3);
      const S = S0 * scale,
        y = h * rnd(0.3, 0.6);
      const font = getComputedStyle(document.documentElement).getPropertyValue("--display") || "Georgia, serif";
      return (f) => {
        const { ctx } = f;
        const p = smooth(f.k * 2.4);
        ctx.save();
        ctx.translate(x, y);
        ctx.strokeStyle = f.ink(0.5 * f.env);
        ctx.shadowColor = f.ink(0.7 * f.env);
        ctx.shadowBlur = 10;
        ctx.lineWidth = 2.2;
        ctx.lineCap = "round";
        // Drawn as if traced in sand: the two arcs crossing to make the tail.
        const L = S * 4.4;
        ctx.setLineDash([L * p, L]);
        ctx.beginPath();
        ctx.moveTo(-0.95 * S, 0.4 * S);
        ctx.quadraticCurveTo(0, -0.95 * S, 0.95 * S, 0);
        ctx.quadraticCurveTo(0, 0.95 * S, -0.95 * S, -0.4 * S);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;
        const e = smooth(f.k * 3 - 1.5);
        ctx.fillStyle = f.ink(0.5 * f.env * e);
        ctx.beginPath();
        ctx.arc(0.5 * S, -0.08 * S, 2.2, 0, TAU);
        ctx.fill();
        ctx.font = `500 ${Math.round(S * 0.22)}px ${font}`;
        ctx.textAlign = "center";
        ctx.fillStyle = f.ink(0.35 * f.env * smooth(f.k * 3 - 1.6));
        ctx.fillText("Ι Χ Θ Υ Σ", 0, S * 0.85);
        ctx.restore();
      };
    },
  },
  {
    name: "alpha and omega",
    lane: "pass",
    dur: [12, 18],
    make: (w, h, room) => {
      const size0 = Math.min(h * 0.32, w * 0.2);
      const { x: cx, scale } = room.place(size0 * 2.8);
      const size = Math.round(size0 * scale);
      const font = getComputedStyle(document.documentElement).getPropertyValue("--display") || "Georgia, serif";
      const y = h * rnd(0.4, 0.55);
      return (f) => {
        const { ctx } = f;
        ctx.save();
        ctx.font = `400 ${size}px ${font}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = f.ink(0.4 * f.env);
        ctx.shadowBlur = 24;
        const a = f.env * smooth(f.k * 4),
          o = f.env * smooth(f.k * 4 - 1.2);
        ctx.fillStyle = f.ink(0.07 * a);
        ctx.fillText("Α", cx - size * 0.85, y - Math.sin(f.t * 0.4) * 6);
        ctx.fillStyle = f.ink(0.07 * o);
        ctx.fillText("Ω", cx + size * 0.85, y + Math.sin(f.t * 0.4) * 6);
        ctx.restore();
      };
    },
  },
  {
    name: "anchor",
    lane: "pass",
    dur: [11, 16],
    make: (w, h, room) => {
      const S0 = Math.min(w, h) * 0.12;
      const { x, scale } = room.place(S0 * 4);
      const y = h * rnd(0.35, 0.55),
        S = S0 * scale;
      return (f) => {
        const { ctx } = f;
        const p = smooth(f.k * 2.4);
        ctx.save();
        ctx.translate(x, y + Math.sin(f.t * 0.8) * 4);
        ctx.rotate(Math.sin(f.t * 0.6) * 0.04);
        ctx.strokeStyle = f.ink(0.5 * f.env);
        ctx.shadowColor = f.ink(0.6 * f.env);
        ctx.shadowBlur = 10;
        ctx.lineWidth = 2.4;
        ctx.lineCap = "round";
        // Ring, shank, stock, then the arms and their flukes, drawn in that order.
        ctx.beginPath();
        ctx.arc(0, -S * 1.1, S * 0.14, Math.PI / 2, Math.PI / 2 + TAU);
        ctx.moveTo(0, -S * 0.96);
        ctx.lineTo(0, S);
        ctx.moveTo(-S * 0.42, -S * 0.7);
        ctx.lineTo(S * 0.42, -S * 0.7);
        ctx.moveTo(-S * 0.8, S * 0.35);
        ctx.quadraticCurveTo(-S * 0.7, S, 0, S);
        ctx.quadraticCurveTo(S * 0.7, S, S * 0.8, S * 0.35);
        ctx.moveTo(-S * 0.8, S * 0.35);
        ctx.lineTo(-S * 0.92, S * 0.52);
        ctx.moveTo(-S * 0.8, S * 0.35);
        ctx.lineTo(-S * 0.62, S * 0.42);
        ctx.moveTo(S * 0.8, S * 0.35);
        ctx.lineTo(S * 0.92, S * 0.52);
        ctx.moveTo(S * 0.8, S * 0.35);
        ctx.lineTo(S * 0.62, S * 0.42);
        traced(ctx, p, S * 7.5);
        ctx.shadowBlur = 0;
        ctx.font = `italic 400 ${Math.round(S * 0.17)}px ${displayFont()}`;
        ctx.textAlign = "center";
        ctx.fillStyle = f.ink(0.35 * f.env * smooth(f.k * 3 - 1.6));
        ctx.fillText("an anchor of the soul, both sure and stedfast", 0, S * 1.45);
        ctx.restore();
      };
    },
  },
  {
    name: "crown",
    lane: "pass",
    dur: [11, 16],
    make: (w, h, room) => {
      const S0 = Math.min(w, h) * 0.13;
      const { x, scale } = room.place(S0 * 2.6);
      const y = h * rnd(0.35, 0.5),
        S = S0 * scale;
      const crownPath = (ctx: CanvasRenderingContext2D) => {
        ctx.beginPath();
        ctx.moveTo(-S, S * 0.4);
        ctx.lineTo(-S * 1.05, -S * 0.45);
        ctx.lineTo(-S * 0.6, -S * 0.05);
        ctx.lineTo(-S * 0.3, -S * 0.65);
        ctx.lineTo(0, -S * 0.1);
        ctx.lineTo(S * 0.3, -S * 0.65);
        ctx.lineTo(S * 0.6, -S * 0.05);
        ctx.lineTo(S * 1.05, -S * 0.45);
        ctx.lineTo(S, S * 0.4);
        ctx.closePath();
      };
      return (f) => {
        const { ctx } = f;
        ctx.save();
        ctx.translate(x, y + Math.sin(f.t * 0.7) * 5);
        glow(ctx, 0, 0, S * 2.2, f.ink(0.1 * f.env), f.ink(0));
        ctx.fillStyle = f.ink(0.1 * f.env);
        crownPath(ctx);
        ctx.fill();
        ctx.strokeStyle = f.ink(0.45 * f.env);
        ctx.lineWidth = 1.8;
        ctx.lineJoin = "round";
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-S * 0.98, S * 0.2);
        ctx.lineTo(S * 0.98, S * 0.2);
        ctx.stroke();
        // Jewels on the band and pearls on the points.
        for (const [jx, jy, r, cool] of [
          [-S * 1.05, -S * 0.5, 4, false],
          [-S * 0.3, -S * 0.7, 4.5, false],
          [S * 0.3, -S * 0.7, 4.5, false],
          [S * 1.05, -S * 0.5, 4, false],
          [-S * 0.5, S * 0.3, 3.5, true],
          [0, S * 0.3, 4.5, true],
          [S * 0.5, S * 0.3, 3.5, true],
        ] as [number, number, number, boolean][]) {
          glow(ctx, jx, jy, r * 3, f.ink(0.4 * f.env, cool), f.ink(0, cool));
        }
        // A gleam sweeping across it.
        crownPath(ctx);
        ctx.clip();
        const gx = -S * 1.6 + ((f.t * 0.35) % 1.4) * S * 2.4;
        const g = ctx.createLinearGradient(gx - S * 0.3, 0, gx + S * 0.3, 0);
        g.addColorStop(0, f.ink(0));
        g.addColorStop(0.5, f.ink(0.4 * f.env));
        g.addColorStop(1, f.ink(0));
        ctx.fillStyle = g;
        ctx.fillRect(-S * 1.2, -S, S * 2.4, S * 1.6);
        ctx.restore();
      };
    },
  },
  {
    name: "harp",
    lane: "pass",
    dur: [12, 18],
    make: (w, h, room) => {
      const H0 = Math.min(h * 0.42, w * 0.3);
      const { x, scale } = room.place(H0 * 0.8);
      const left = x < w / 2;
      const H = H0 * scale,
        y = h * 0.5;
      const n = 10;
      return (f) => {
        const { ctx } = f;
        ctx.save();
        ctx.translate(x, y);
        if (!left) ctx.scale(-1, 1);
        const rise = (1 - smooth(f.env)) * 20;
        ctx.translate(0, rise);
        // The frame: the pillar, the curved neck and the soundboard.
        const neck = (u: number) => [-H * 0.3 + u * H * 0.62, -H * 0.5 + Math.sin(u * Math.PI) * -H * 0.08 + u * H * 0.1] as const;
        const board = (u: number) => [-H * 0.24 + u * H * 0.56, H * 0.5 - u * H * 0.85] as const;
        ctx.strokeStyle = f.ink(0.4 * f.env);
        ctx.lineWidth = 2.4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-H * 0.3, -H * 0.5);
        ctx.quadraticCurveTo(-H * 0.36, 0, -H * 0.24, H * 0.5);
        ctx.stroke();
        ctx.beginPath();
        for (let u = 0; u <= 1.001; u += 0.05) ctx.lineTo(...neck(u));
        ctx.stroke();
        ctx.lineWidth = 3.4;
        ctx.beginPath();
        ctx.moveTo(...board(0));
        ctx.lineTo(...board(1));
        ctx.stroke();
        // The strings, plucked in turn, each trembling and lit as it sounds.
        ctx.lineWidth = 1;
        for (let i = 0; i < n; i++) {
          const u = (i + 0.7) / (n + 0.4);
          const [x1, y1] = neck(u),
            [x2, y2] = board(u);
          const since = (f.t * 2.2 - i * 0.5 + 100) % (n * 0.5 + 2);
          const ring = since < 2 ? Math.exp(-since * 1.8) : 0;
          const wob = Math.sin(f.t * 40) * ring * 4;
          ctx.strokeStyle = f.ink((0.22 + 0.5 * ring) * f.env);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.quadraticCurveTo((x1 + x2) / 2 + wob, (y1 + y2) / 2, x2, y2);
          ctx.stroke();
          if (ring > 0.1) glow(ctx, (x1 + x2) / 2, (y1 + y2) / 2, 30, f.ink(0.1 * ring * f.env), f.ink(0));
        }
        ctx.restore();
      };
    },
  },
  {
    name: "music",
    lane: "pass",
    dur: [12, 18],
    moving: true,
    make: (w, h) => {
      const y0 = h * rnd(0.3, 0.6),
        p = rnd(0, TAU);
      const glyphs = ["♪", "♫", "♩", "♬"];
      const notes = Array.from({ length: 14 }, (_, i) => ({ u: i / 14, line: Math.floor(rnd(0, 5)), g: glyphs[i % 4], s: rnd(18, 28) }));
      return (f) => {
        const { ctx } = f;
        const staff = (x: number, i: number) => y0 + (i - 2) * 9 + Math.sin(x * 0.006 + f.t * 0.5 + p) * h * 0.06;
        ctx.lineWidth = 0.8;
        for (let i = 0; i < 5; i++) {
          const g = ctx.createLinearGradient(0, 0, w, 0);
          g.addColorStop(0, f.ink(0));
          g.addColorStop(0.5, f.ink(0.22 * f.env));
          g.addColorStop(1, f.ink(0));
          ctx.strokeStyle = g;
          ctx.beginPath();
          for (let x = 0; x <= w; x += 10) ctx.lineTo(x, staff(x, i));
          ctx.stroke();
        }
        // Notes riding along it, rising off it as they go.
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (const n of notes) {
          const u = (n.u + f.t * 0.04) % 1;
          const x = u * w;
          const lift = Math.max(0, u - 0.6) * 160;
          ctx.font = `${n.s}px "Apple Symbols", ${displayFont()}`;
          ctx.fillStyle = f.ink(0.5 * f.env * Math.sin(Math.PI * u));
          ctx.fillText(n.g, x, staff(x, n.line) - 4 - lift);
        }
      };
    },
  },
  {
    name: "tongues of fire",
    lane: "pass",
    dur: [12, 18],
    make: (w, h) => {
      const tongues = Array.from({ length: 12 }, () => ({
        x: rnd(0.08, 0.92) * w,
        y: rnd(0.2, 0.55) * h,
        d: rnd(0, 0.35),
        s: rnd(18, 28),
        p: rnd(0, TAU),
      }));
      return (f) => {
        // Coming down, one after another, and resting there.
        for (const t of tongues) {
          const q = smooth((f.k - t.d) * 3);
          if (q <= 0) continue;
          const y = t.y - (1 - q) * h * 0.3 + Math.sin(f.t * 0.8 + t.p) * 5;
          flame(f, t.x + Math.sin(f.t * 0.5 + t.p) * 6, y, t.s, t.p, 0.75 * q);
        }
      };
    },
  },
  {
    name: "motes",
    lane: "pass",
    dur: [12, 20],
    moving: true,
    make: (w, h) => {
      const x0 = w * rnd(0.1, 0.5);
      const motes = Array.from({ length: 70 }, () => ({
        u: Math.random(),
        v: rnd(-1, 1),
        s: rnd(0.01, 0.04),
        r: rnd(1.5, 4),
        p: rnd(0, TAU),
      }));
      return (f) => {
        const { ctx } = f;
        // A shaft of light, slanting down from the top.
        const ax = x0,
          bx = x0 + w * 0.35,
          wd = w * 0.12;
        const g = ctx.createLinearGradient(ax, 0, bx, h);
        g.addColorStop(0, f.ink(0.1 * f.env));
        g.addColorStop(1, f.ink(0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(ax - wd * 0.4, 0);
        ctx.lineTo(ax + wd * 0.4, 0);
        ctx.lineTo(bx + wd, h);
        ctx.lineTo(bx - wd, h);
        ctx.fill();
        const dot = f.dot();
        for (const m of motes) {
          const u = (m.u + f.t * m.s) % 1;
          const x = ax + (bx - ax) * (1 - u) + m.v * wd * (0.4 + 0.6 * (1 - u)) + Math.sin(f.t * 0.7 + m.p) * 8;
          const y = h * (1 - u);
          ctx.globalAlpha = f.env * 0.7 * (0.4 + 0.6 * Math.sin(f.t * 1.7 + m.p) ** 2) * Math.sin(Math.PI * u);
          ctx.drawImage(dot, x - m.r, y - m.r, m.r * 2, m.r * 2);
        }
        ctx.globalAlpha = 1;
      };
    },
  },
  {
    name: "lanterns",
    lane: "pass",
    dur: [14, 22],
    moving: true,
    make: (w, h) => {
      const ls = Array.from({ length: 12 }, () => ({
        x: rnd(0.08, 0.92) * w,
        v: rnd(18, 34),
        s: rnd(10, 18),
        p: rnd(0, TAU),
        y: rnd(0, 0.4) * h,
      }));
      return (f) => {
        const { ctx } = f;
        for (const l of ls) {
          const y = h + 30 + l.y - f.t * l.v;
          if (y < -40) continue;
          const x = l.x + Math.sin(f.t * 0.5 + l.p) * 18;
          const fl = 0.85 + 0.15 * Math.sin(f.t * 9 + l.p);
          glow(ctx, x, y, l.s * 3, f.ink(0.14 * f.env * fl), f.ink(0));
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(Math.sin(f.t * 0.7 + l.p) * 0.08);
          const g = ctx.createLinearGradient(0, -l.s, 0, l.s);
          g.addColorStop(0, f.ink(0.2 * f.env));
          g.addColorStop(1, f.ink(0.6 * f.env * fl));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(-l.s * 0.55, -l.s * 0.8);
          ctx.quadraticCurveTo(0, -l.s * 1.1, l.s * 0.55, -l.s * 0.8);
          ctx.lineTo(l.s * 0.4, l.s * 0.8);
          ctx.lineTo(-l.s * 0.4, l.s * 0.8);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      };
    },
  },
  {
    name: "fireflies",
    lane: "pass",
    dur: [14, 22],
    moving: true,
    make: (w, h) => {
      const flies = Array.from({ length: 34 }, () => ({
        x: rnd(0.05, 0.95) * w,
        y: rnd(0.45, 0.95) * h,
        a: rnd(20, 60),
        p: rnd(0, TAU),
        q: rnd(0, TAU),
        blink: rnd(0.3, 0.7),
      }));
      return (f) => {
        const { ctx } = f;
        const dot = f.dot();
        for (const fl of flies) {
          const x = fl.x + Math.sin(f.t * 0.3 + fl.p) * fl.a + Math.sin(f.t * 0.83 + fl.q) * fl.a * 0.4;
          const y = fl.y + Math.cos(f.t * 0.27 + fl.q) * fl.a * 0.6;
          const on = Math.max(0, Math.sin(f.t * fl.blink * 2 + fl.p)) ** 3;
          ctx.globalAlpha = f.env * 0.25 * on;
          ctx.drawImage(dot, x - 16, y - 16, 32, 32);
          ctx.globalAlpha = f.env * 0.9 * on;
          ctx.drawImage(dot, x - 3, y - 3, 6, 6);
        }
        ctx.globalAlpha = 1;
      };
    },
  },
];
