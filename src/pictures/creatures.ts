// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Living things passing over, and what the wind carries.

import { glow, rnd, smooth, TAU, Vision } from "./kit";

export const CREATURES: Vision[] = [
  {
    name: "dove",
    lane: "pass",
    dur: [11, 16],
    moving: true,
    make: (w, h) => {
      const dir = Math.random() < 0.5 ? 1 : -1;
      const y0 = h * rnd(0.15, 0.3),
        y1 = h * rnd(0.3, 0.5);
      const s = Math.min(w, h) * rnd(0.05, 0.07);
      const trail: { x: number; y: number; t: number }[] = [];
      return (f) => {
        const { ctx } = f;
        const q = f.t / f.dur;
        const x = dir > 0 ? -s * 3 + q * (w + s * 6) : w + s * 3 - q * (w + s * 6);
        const y = y0 + (y1 - y0) * smooth(q) + Math.sin(f.t * 0.9) * s * 0.4;
        // Wings beat in bursts, then it glides.
        const strength = 0.35 + 0.65 * smooth(Math.sin(f.t * 0.55) * 1.5 + 0.5);
        const flap = Math.sin(f.t * 7.5) * strength;
        if (!trail.length || f.t - trail[trail.length - 1].t > 0.12) trail.push({ x: x - dir * s * 1.2, y, t: f.t });
        const dot = f.dot();
        for (const p of trail) {
          const age = (f.t - p.t) / 3;
          if (age > 1) continue;
          ctx.globalAlpha = 0.35 * f.env * (1 - age);
          const r = 6 * (1 - age) + 2;
          ctx.drawImage(dot, p.x - r, p.y - r + age * 30, r * 2, r * 2);
        }
        while (trail.length && f.t - trail[0].t > 3) trail.shift();
        glow(ctx, x, y, s * 3.2, f.ink(0.12 * f.env), f.ink(0));
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(dir * s, s);
        ctx.rotate(-0.08 + flap * 0.04);
        ctx.shadowColor = f.ink(0.8 * f.env);
        ctx.shadowBlur = s * 0.5;
        const wing = (k: number, a: number) => {
          const ty = -0.15 - 1.5 * flap * k,
            tx = -0.55 + 0.2 * flap;
          ctx.fillStyle = f.ink(a * f.env);
          ctx.beginPath();
          ctx.moveTo(0.4, -0.12);
          ctx.bezierCurveTo(0.35, ty * 0.6, tx + 0.45, ty, tx, ty);
          // The trailing edge, scalloped by its feathers.
          ctx.quadraticCurveTo(tx - 0.12, ty * 0.75, tx - 0.05, ty * 0.6);
          ctx.quadraticCurveTo(-0.25, ty * 0.45, -0.18, ty * 0.38);
          ctx.quadraticCurveTo(-0.4, ty * 0.2, -0.35, -0.04);
          ctx.closePath();
          ctx.fill();
        };
        wing(0.82, 0.32); // the far wing, behind
        ctx.fillStyle = f.ink(0.55 * f.env);
        ctx.beginPath();
        ctx.moveTo(1.18, -0.2);
        ctx.quadraticCurveTo(1.12, -0.42, 0.92, -0.38); // the head
        ctx.quadraticCurveTo(0.7, -0.32, 0.55, -0.12);
        ctx.quadraticCurveTo(0.0, -0.18, -0.75, -0.05);
        ctx.lineTo(-1.45, -0.22); // the tail, fanned
        ctx.quadraticCurveTo(-1.6, 0.0, -1.45, 0.2);
        ctx.lineTo(-0.75, 0.08);
        ctx.quadraticCurveTo(0.1, 0.32, 0.8, 0.0);
        ctx.quadraticCurveTo(1.0, -0.08, 1.18, -0.2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(1.17, -0.24); // the beak
        ctx.lineTo(1.32, -0.2);
        ctx.lineTo(1.17, -0.16);
        ctx.fill();
        wing(1, 0.5);
        ctx.restore();
      };
    },
  },
  {
    name: "eagle",
    lane: "pass",
    dur: [12, 18],
    moving: true,
    make: (w, h) => {
      const dir = Math.random() < 0.5 ? 1 : -1;
      const s = Math.min(w, h) * rnd(0.06, 0.08);
      const y0 = h * rnd(0.45, 0.6),
        y1 = h * rnd(0.1, 0.22);
      return (f) => {
        const { ctx } = f;
        const q = f.t / f.dur;
        let x = -s * 3 + q * (w + s * 6);
        if (dir < 0) x = w - x;
        // They shall mount up with wings: rising as it goes, wings still, a slow beat now and then.
        const y = y0 + (y1 - y0) * smooth(q) + Math.sin(f.t * 0.5) * s * 0.3;
        const flap = Math.sin(f.t * 3) * Math.max(0, Math.sin(f.t * 0.35)) ** 4;
        glow(ctx, x, y, s * 3, f.ink(0.08 * f.env), f.ink(0));
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(dir * s, s);
        ctx.rotate(-0.06 + Math.sin(f.t * 0.4) * 0.06);
        ctx.fillStyle = f.ink(0.42 * f.env);
        ctx.shadowColor = f.ink(0.5 * f.env);
        ctx.shadowBlur = s * 0.3;
        for (const side of [-1, 1]) {
          const lift = -0.25 - flap * 0.6;
          ctx.beginPath();
          ctx.moveTo(0.35, -0.05);
          ctx.quadraticCurveTo(0.2, side * 0.9 + lift, -0.05, side * 2.1 + lift * 1.2);
          // The primaries, spread like fingers.
          for (let k = 0; k < 5; k++) {
            const fx = -0.05 - k * 0.12,
              fy = side * (2.1 - k * 0.18) + lift * 1.2;
            ctx.lineTo(fx - 0.18, fy + side * 0.12);
            ctx.lineTo(fx - 0.1, fy - side * 0.12);
          }
          ctx.quadraticCurveTo(-0.5, side * 0.6, -0.35, 0);
          ctx.closePath();
          if (side < 0) ctx.globalAlpha = 0.7;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.beginPath();
        ctx.moveTo(0.95, -0.02);
        ctx.quadraticCurveTo(0.7, -0.18, 0.3, -0.14);
        ctx.lineTo(-0.7, -0.08);
        ctx.lineTo(-1.15, -0.28); // the tail
        ctx.lineTo(-1.2, 0.2);
        ctx.lineTo(-0.7, 0.1);
        ctx.quadraticCurveTo(0.3, 0.18, 0.95, -0.02);
        ctx.fill();
        ctx.restore();
      };
    },
  },
  {
    name: "sparrows",
    lane: "pass",
    dur: [10, 15],
    moving: true,
    make: (w, h) => {
      const dir = Math.random() < 0.5 ? 1 : -1;
      const y0 = h * rnd(0.2, 0.45);
      const birds = Array.from({ length: 24 }, () => ({
        dx: rnd(-1, 1) * 120,
        dy: rnd(-1, 1) * 50,
        p: rnd(0, TAU),
        s: rnd(5, 9),
        r: rnd(6, 10),
      }));
      return (f) => {
        const { ctx } = f;
        const q = f.t / f.dur;
        const lx = -200 + q * (w + 400),
          ly = y0 + Math.sin(f.t * 0.7) * h * 0.08;
        ctx.strokeStyle = f.ink(0.42 * f.env);
        ctx.lineWidth = 1.4;
        ctx.lineCap = "round";
        for (const b of birds) {
          // The flock folds and stretches as it goes.
          let x = lx + b.dx * (1 + 0.3 * Math.sin(f.t * 0.8 + b.p)) + Math.sin(f.t * 1.3 + b.p) * 14;
          if (dir < 0) x = w - x;
          const y = ly + b.dy * (1 + 0.4 * Math.cos(f.t * 0.6 + b.p)) + Math.cos(f.t * 1.1 + b.p) * 10;
          const flap = Math.sin(f.t * b.r + b.p);
          ctx.beginPath();
          ctx.moveTo(x - b.s, y - flap * b.s * 0.6);
          ctx.quadraticCurveTo(x - b.s * 0.4, y - b.s * 0.1, x, y);
          ctx.quadraticCurveTo(x + b.s * 0.4, y - b.s * 0.1, x + b.s, y - flap * b.s * 0.6);
          ctx.stroke();
        }
      };
    },
  },
  {
    name: "butterfly",
    lane: "pass",
    dur: [12, 18],
    moving: true,
    make: (w, h) => {
      const dir = Math.random() < 0.5 ? 1 : -1;
      const y0 = h * rnd(0.3, 0.7),
        p = rnd(0, TAU),
        s = rnd(14, 20);
      return (f) => {
        const { ctx } = f;
        const q = f.t / f.dur;
        let x = -40 + q * (w + 80) + Math.sin(f.t * 0.9 + p) * 40;
        if (dir < 0) x = w - x;
        const y = y0 + Math.sin(f.t * 0.6 + p) * h * 0.12 + Math.sin(f.t * 2.3) * 8;
        const open = 0.25 + 0.75 * Math.abs(Math.cos(f.t * 9));
        glow(ctx, x, y, s * 3, f.ink(0.1 * f.env), f.ink(0));
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(dir * 0.35 + Math.sin(f.t * 1.4) * 0.15);
        for (const side of [-1, 1]) {
          ctx.save();
          ctx.scale(side * open, 1);
          ctx.fillStyle = f.ink(0.45 * f.env);
          ctx.beginPath();
          ctx.moveTo(0, -2);
          ctx.bezierCurveTo(s * 0.4, -s * 1.1, s * 1.2, -s * 0.9, s * 0.9, -s * 0.1);
          ctx.bezierCurveTo(s * 0.6, s * 0.2, s * 0.3, 0, 0, 0);
          ctx.bezierCurveTo(s * 0.5, s * 0.2, s * 0.8, s * 0.8, s * 0.3, s * 0.8);
          ctx.bezierCurveTo(s * 0.1, s * 0.7, 0, s * 0.3, 0, 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.fillStyle = f.ink(0.6 * f.env);
        ctx.beginPath();
        ctx.ellipse(0, s * 0.1, 1.4, s * 0.45, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      };
    },
  },
  {
    name: "petals",
    lane: "pass",
    dur: [12, 20],
    moving: true,
    make: (w, h) => {
      const ps = Array.from({ length: 26 }, () => ({
        x: rnd(0, w),
        y: rnd(-h, 0),
        v: rnd(25, 45),
        sway: rnd(20, 50),
        p: rnd(0, TAU),
        spin: rnd(0.6, 1.6),
        s: rnd(5, 9),
      }));
      return (f) => {
        const { ctx } = f;
        for (const p of ps) {
          const y = p.y + f.t * p.v;
          if (y < -20 || y > h + 20) continue;
          const x = p.x + Math.sin(f.t * 0.6 + p.p) * p.sway + f.t * 8;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(f.t * p.spin * 0.6 + p.p);
          ctx.scale(1, Math.cos(f.t * p.spin + p.p) * 0.8 + 0.2);
          ctx.fillStyle = f.ink(0.4 * f.env, true);
          ctx.beginPath();
          ctx.moveTo(-p.s, 0);
          ctx.quadraticCurveTo(0, -p.s * 0.9, p.s, 0);
          ctx.quadraticCurveTo(0, p.s * 0.55, -p.s, 0);
          ctx.fill();
          ctx.restore();
        }
      };
    },
  },
  {
    name: "olive leaves",
    lane: "pass",
    dur: [12, 18],
    moving: true,
    make: (w, h) => {
      const dir = Math.random() < 0.5 ? 1 : -1;
      const ls = Array.from({ length: 14 }, () => ({
        x: rnd(-0.6, 0) * w,
        y: rnd(0.1, 0.8) * h,
        v: rnd(50, 90),
        p: rnd(0, TAU),
        s: rnd(10, 16),
      }));
      return (f) => {
        const { ctx } = f;
        for (const l of ls) {
          let x = l.x + f.t * l.v;
          if (x < -40 || x > w + 40) continue;
          if (dir < 0) x = w - x;
          const y = l.y + Math.sin(f.t * 0.8 + l.p) * 30 + f.t * 6;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(Math.sin(f.t * 1.1 + l.p) * 0.8 + l.p);
          ctx.scale(1, 0.4 + 0.6 * Math.abs(Math.cos(f.t * 0.9 + l.p)));
          ctx.fillStyle = f.ink(0.38 * f.env, true);
          ctx.beginPath();
          ctx.moveTo(-l.s, 0);
          ctx.quadraticCurveTo(0, -l.s * 0.32, l.s, 0);
          ctx.quadraticCurveTo(0, l.s * 0.32, -l.s, 0);
          ctx.fill();
          ctx.strokeStyle = f.ink(0.25 * f.env, true);
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(-l.s * 0.9, 0);
          ctx.lineTo(l.s * 0.9, 0);
          ctx.stroke();
          ctx.restore();
        }
      };
    },
  },
  {
    name: "seeds",
    lane: "pass",
    dur: [12, 20],
    moving: true,
    make: (w, h) => {
      const dir = Math.random() < 0.5 ? 1 : -1;
      const seeds = Array.from({ length: 18 }, () => ({
        x: rnd(-0.5, 0.4) * w,
        y: rnd(0.15, 0.8) * h,
        v: rnd(30, 60),
        p: rnd(0, TAU),
        s: rnd(9, 14),
      }));
      return (f) => {
        const { ctx } = f;
        ctx.lineCap = "round";
        for (const sd of seeds) {
          let x = sd.x + f.t * sd.v;
          if (x < -30 || x > w + 30) continue;
          if (dir < 0) x = w - x;
          const y = sd.y + Math.sin(f.t * 0.6 + sd.p) * 30 - f.t * 4;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(Math.sin(f.t * 0.9 + sd.p) * 0.4 + dir * 0.3);
          ctx.strokeStyle = f.ink(0.35 * f.env);
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(0, sd.s * 1.2);
          ctx.lineTo(0, 0);
          ctx.stroke();
          ctx.fillStyle = f.ink(0.45 * f.env);
          ctx.beginPath();
          ctx.ellipse(0, sd.s * 1.3, 1.2, 2.6, 0, 0, TAU);
          ctx.fill();
          // Its parachute of fine hairs.
          ctx.lineWidth = 0.5;
          ctx.strokeStyle = f.ink(0.3 * f.env);
          for (let i = 0; i < 14; i++) {
            const a = -Math.PI / 2 + (i / 13 - 0.5) * 2.4;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(a) * sd.s, Math.sin(a) * sd.s * 0.8);
            ctx.stroke();
          }
          ctx.restore();
        }
      };
    },
  },
  {
    name: "snow",
    lane: "pass",
    dur: [12, 20],
    moving: true,
    make: (w, h) => {
      const flakes = Array.from({ length: 130 }, () => {
        const z = Math.random();
        return { x: rnd(0, w), o: Math.random(), z, p: rnd(0, TAU), crystal: z > 0.9 };
      });
      return (f) => {
        const { ctx } = f;
        const dot = f.dot(true);
        for (const s of flakes) {
          const v = 0.03 + s.z * 0.06;
          const y = ((s.o + f.t * v) % 1) * (h + 40) - 20;
          const x = s.x + Math.sin(f.t * 0.5 + s.p) * (10 + s.z * 20);
          const r = 1.2 + s.z * 3.5;
          if (s.crystal) {
            // Nearest, a six-pointed crystal, turning.
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(f.t * 0.3 + s.p);
            ctx.strokeStyle = f.ink(0.4 * f.env, true);
            ctx.lineWidth = 1;
            for (let i = 0; i < 6; i++) {
              ctx.rotate(TAU / 6);
              ctx.beginPath();
              ctx.moveTo(0, 0);
              ctx.lineTo(0, -r * 2.6);
              ctx.moveTo(0, -r * 1.5);
              ctx.lineTo(-r * 0.6, -r * 2.1);
              ctx.moveTo(0, -r * 1.5);
              ctx.lineTo(r * 0.6, -r * 2.1);
              ctx.stroke();
            }
            ctx.restore();
          } else {
            ctx.globalAlpha = f.env * (0.3 + 0.5 * s.z);
            ctx.drawImage(dot, x - r, y - r, r * 2, r * 2);
            ctx.globalAlpha = 1;
          }
        }
      };
    },
  },
  {
    name: "rain",
    lane: "pass",
    dur: [10, 16],
    moving: true,
    make: (w, h) => {
      const drops = Array.from({ length: 160 }, () => ({ x: rnd(-0.1, 1.1) * w, o: Math.random(), v: rnd(0.6, 1), l: rnd(14, 30) }));
      const splashes: { x: number; t: number }[] = [];
      let last = 0;
      return (f) => {
        const { ctx } = f;
        ctx.strokeStyle = f.ink(0.17 * f.env, true);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const d of drops) {
          const u = (d.o + f.t * d.v * 0.9) % 1;
          const y = u * (h + 60) - 30,
            x = d.x - u * h * 0.12;
          ctx.moveTo(x, y);
          ctx.lineTo(x + d.l * 0.12, y - d.l);
        }
        ctx.stroke();
        if (f.t - last > 0.15) {
          splashes.push({ x: rnd(0, w), t: f.t });
          last = f.t;
        }
        for (let i = splashes.length - 1; i >= 0; i--) {
          const q = (f.t - splashes[i].t) / 1.2;
          if (q >= 1) {
            splashes.splice(i, 1);
            continue;
          }
          ctx.strokeStyle = f.ink(0.22 * f.env * (1 - q), true);
          ctx.beginPath();
          ctx.ellipse(splashes[i].x, h - 14, q * 22, q * 5, 0, 0, TAU);
          ctx.stroke();
        }
      };
    },
  },
  {
    name: "wind",
    lane: "pass",
    dur: [10, 15],
    moving: true,
    make: (w, h) => {
      const dir = Math.random() < 0.5 ? 1 : -1;
      const gusts = Array.from({ length: 14 }, () => ({
        y: rnd(0.1, 0.9) * h,
        a: rnd(20, 60),
        l: rnd(0.25, 0.5),
        d: rnd(0, 0.7),
        p: rnd(0, TAU),
        curl: Math.random() < 0.35,
      }));
      return (f) => {
        const { ctx } = f;
        ctx.lineCap = "round";
        for (const g of gusts) {
          const q = (f.k - g.d) / 0.3;
          if (q <= 0 || q >= 1) continue;
          const head = q * (1 + g.l),
            tail = head - g.l;
          const pt = (u: number) => {
            let x = u * w;
            if (dir < 0) x = w - x;
            return [x, g.y + Math.sin(u * 6 + g.p) * g.a] as const;
          };
          ctx.strokeStyle = f.ink(0.5 * f.env * Math.sin(Math.PI * q), true);
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          for (let u = Math.max(0, tail); u <= Math.min(1, head); u += 0.01) ctx.lineTo(...pt(u));
          // Some end in a curl.
          if (g.curl && head < 1) {
            const [ex, ey] = pt(head);
            for (let a = 0; a < 4.5; a += 0.25) ctx.lineTo(ex + dir * Math.sin(a) * (18 - a * 3), ey - (1 - Math.cos(a)) * (18 - a * 3));
          }
          ctx.stroke();
        }
      };
    },
  },
];
