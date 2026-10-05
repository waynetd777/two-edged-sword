// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// The land and water: hills, fields, trees, rivers, the sea.

import { beam, Branch, glow, grow, ridge, rnd, smooth, TAU, Vision } from "./kit";

export const LAND: Vision[] = [
  {
    name: "hills",
    lane: "back",
    dur: [24, 40],
    make: (w, h) => {
      const ranges = [0.62, 0.72, 0.82].map((b, i) => ({ y: ridge(h * b, h * (0.12 - i * 0.025)), v: 2 + i * 3, a: 0.09 + i * 0.03 }));
      return (f) => {
        const { ctx } = f;
        for (const r of ranges) {
          const off = f.t * r.v;
          const g = ctx.createLinearGradient(0, h * 0.45, 0, h);
          g.addColorStop(0, f.ink(r.a * f.env, true));
          g.addColorStop(1, f.ink(0, true));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(0, h);
          for (let x = 0; x <= w + 12; x += 12) ctx.lineTo(x, r.y(x + off));
          ctx.lineTo(w, h);
          ctx.fill();
        }
      };
    },
  },
  {
    name: "still waters",
    lane: "back",
    dur: [20, 34],
    make: (w, h) => {
      const rings: { x: number; y: number; t: number; m: number }[] = [];
      let next = 0;
      return (f) => {
        const { ctx } = f;
        if (f.t >= next) {
          rings.push({ x: rnd(0.15, 0.85) * w, y: rnd(0.6, 0.92) * h, t: f.t, m: rnd(140, 260) });
          next = f.t + rnd(1.2, 3.2);
        }
        // A sheen on the water.
        const g = ctx.createLinearGradient(0, h * 0.55, 0, h);
        g.addColorStop(0, f.ink(0, true));
        g.addColorStop(1, f.ink(0.07 * f.env, true));
        ctx.fillStyle = g;
        ctx.fillRect(0, h * 0.55, w, h * 0.45);
        for (let i = rings.length - 1; i >= 0; i--) {
          const r = rings[i];
          const q = (f.t - r.t) / 7;
          if (q >= 1) {
            rings.splice(i, 1);
            continue;
          }
          for (let j = 0; j < 3; j++) {
            const qq = q - j * 0.07;
            if (qq <= 0) continue;
            const rad = qq * r.m;
            ctx.strokeStyle = f.ink(0.3 * f.env * (1 - q) ** 1.5 * (1 - j * 0.3), true);
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.ellipse(r.x, r.y, rad, rad * 0.26, 0, 0, TAU);
            ctx.stroke();
          }
        }
      };
    },
  },
  {
    name: "tree of life",
    lane: "back",
    dur: [24, 40],
    make: (_w, h, room) => {
      const { x: x0, scale } = room.place(h * 0.55);
      const max = 7;
      const tree = grow(h * 0.17 * scale, -Math.PI / 2, 0, max, 0.42);
      return (f) => {
        const { ctx } = f;
        ctx.lineCap = "round";
        const tips: [number, number, number][] = [];
        const draw = (b: Branch, x: number, y: number, i: number) => {
          const g = smooth(f.k * 2.2 - b.depth * 0.18);
          if (g <= 0) return;
          const a = b.ang + Math.sin(f.t * 0.5 + b.depth) * 0.012 * b.depth;
          const x2 = x + Math.cos(a) * b.len * g,
            y2 = y + Math.sin(a) * b.len * g;
          ctx.strokeStyle = f.ink(0.3 * f.env);
          ctx.lineWidth = (max + 1 - b.depth) * 1.3;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          if (!b.kids.length && g >= 1) tips.push([x2, y2, i]);
          b.kids.forEach((k, j) => draw(k, x2, y2, i * 3 + j));
        };
        draw(tree, x0, h + 4, 1);
        // Leaves of light at the tips, coming out once the tree is grown.
        const dot = f.dot(true);
        const leaf = smooth(f.k * 3 - 1.6);
        for (const [x, y, i] of tips) {
          const r = 5 + (i % 4);
          ctx.globalAlpha = 0.55 * f.env * leaf * (0.6 + 0.4 * Math.sin(f.t * 1.2 + i));
          ctx.drawImage(dot, x - r, y - r, r * 2, r * 2);
        }
        ctx.globalAlpha = 1;
      };
    },
  },
  {
    name: "river of life",
    lane: "back",
    dur: [22, 36],
    make: (w, h, room) => {
      const cx = room.place(w * 0.3).x,
        top = h * 0.38;
      const p = rnd(0, TAU);
      const mid = (y: number) => cx + Math.sin(y * 0.012 + p) * w * 0.12 * ((y - top) / (h - top));
      const half = (y: number) => 3 + ((y - top) / (h - top)) ** 1.6 * w * 0.16;
      const glints = Array.from({ length: 70 }, () => ({ u: Math.random(), o: rnd(-0.85, 0.85), s: rnd(0.03, 0.06), p: rnd(0, TAU) }));
      return (f) => {
        const { ctx } = f;
        const g = ctx.createLinearGradient(0, top, 0, h);
        g.addColorStop(0, f.ink(0.16 * f.env, true));
        g.addColorStop(1, f.ink(0.05 * f.env, true));
        ctx.fillStyle = g;
        ctx.beginPath();
        for (let y = top; y <= h + 10; y += 8) ctx.lineTo(mid(y) - half(y), y);
        for (let y = h + 10; y >= top; y -= 8) ctx.lineTo(mid(y) + half(y), y);
        ctx.fill();
        // Its source, a light on the horizon.
        glow(ctx, mid(top), top, h * 0.14, f.ink(0.22 * f.env), f.ink(0));
        const dot = f.dot();
        for (const q of glints) {
          const u = (q.u + f.t * q.s) % 1;
          const y = top + (h - top) * u ** 1.3;
          const r = 1.2 + u * 3.5;
          ctx.globalAlpha = f.env * 0.7 * Math.sin(Math.PI * u) * (0.3 + 0.7 * Math.sin(f.t * 2.5 + q.p) ** 2);
          ctx.drawImage(dot, mid(y) + q.o * half(y) - r * 2, y - r, r * 4, r * 2);
        }
        ctx.globalAlpha = 1;
      };
    },
  },
  {
    name: "flock",
    lane: "back",
    dur: [22, 36],
    make: (w, h) => {
      const hill = (x: number) => h * 0.8 - Math.sin((x / w) * Math.PI) * h * 0.08 - Math.sin(x * 0.006) * h * 0.02;
      const sheep = Array.from({ length: 9 }, () => ({
        x: rnd(0.08, 0.92) * w,
        s: rnd(16, 24),
        v: rnd(-2, 2),
        p: rnd(0, TAU),
        dir: Math.random() < 0.5 ? 1 : -1,
      }));
      return (f) => {
        const { ctx } = f;
        const g = ctx.createLinearGradient(0, h * 0.7, 0, h);
        g.addColorStop(0, f.ink(0.1 * f.env, true));
        g.addColorStop(1, f.ink(0.01 * f.env, true));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 12) ctx.lineTo(x, hill(x));
        ctx.lineTo(w, h);
        ctx.fill();
        for (const s of sheep) {
          const x = s.x + Math.sin(f.t * 0.1 + s.p) * 20 + s.v * f.t * 0.3;
          const y = hill(x) - s.s * 0.55;
          // Grazing: the head goes down now and then.
          const graze = smooth(Math.sin(f.t * 0.4 + s.p) * 3);
          ctx.save();
          ctx.translate(x, y);
          ctx.scale(s.dir, 1);
          ctx.fillStyle = f.ink(0.3 * f.env);
          ctx.strokeStyle = f.ink(0.3 * f.env);
          ctx.lineWidth = 1.4;
          for (const lx of [-0.5, -0.2, 0.25, 0.55]) {
            ctx.beginPath();
            ctx.moveTo(lx * s.s, 0);
            ctx.lineTo(lx * s.s, s.s * 0.55);
            ctx.stroke();
          }
          // The fleece, in puffs.
          for (let i = 0; i < 7; i++) {
            const a = (i / 7) * TAU;
            ctx.beginPath();
            ctx.arc(Math.cos(a) * s.s * 0.62, Math.sin(a) * s.s * 0.32 - s.s * 0.1, s.s * 0.36, 0, TAU);
            ctx.fill();
          }
          ctx.beginPath();
          ctx.ellipse(s.s * 0.95, -s.s * 0.15 + graze * s.s * 0.45, s.s * 0.28, s.s * 0.2, 0.4 + graze * 0.6, 0, TAU);
          ctx.fill();
          ctx.restore();
        }
      };
    },
  },
  {
    name: "narrow path",
    lane: "back",
    dur: [22, 36],
    make: (w, h, room) => {
      const hz = h * 0.56,
        vx = room.place(w * 0.25).x,
        p = rnd(0, TAU);
      const mid = (u: number) => vx + Math.sin(u * 5 + p) * w * 0.1 * u + u * u * w * 0.1 * Math.sin(p);
      return (f) => {
        const { ctx } = f;
        glow(ctx, vx, hz, h * 0.3, f.ink(0.3 * f.env * (0.9 + 0.1 * f.beat)), f.ink(0));
        beam(f, 0, hz, w, hz, 1, 0.12 * f.env);
        const g = ctx.createLinearGradient(0, hz, 0, h);
        g.addColorStop(0, f.ink(0.25 * f.env));
        g.addColorStop(1, f.ink(0.04 * f.env));
        ctx.fillStyle = g;
        ctx.beginPath();
        for (let u = 0; u <= 1.001; u += 0.02) ctx.lineTo(mid(u) - 2 - u * u * w * 0.09, hz + u * (h - hz) + 8 * u);
        for (let u = 1; u >= -0.001; u -= 0.02) ctx.lineTo(mid(u) + 2 + u * u * w * 0.09, hz + u * (h - hz) + 8 * u);
        ctx.fill();
        // Steps of light going on along it.
        const dot = f.dot();
        for (let i = 0; i < 12; i++) {
          const u = ((i / 12 + f.t * 0.02) % 1) ** 1.4;
          const r = 1 + u * 4;
          ctx.globalAlpha = 0.5 * f.env * Math.sin(Math.PI * u);
          ctx.drawImage(dot, mid(u) - r, hz + u * (h - hz) - r / 2, r * 2, r);
        }
        ctx.globalAlpha = 1;
      };
    },
  },
  {
    name: "vine",
    lane: "back",
    dur: [22, 36],
    make: (w, h) => {
      const fromLeft = Math.random() < 0.5;
      const pts = Array.from({ length: 80 }, (_, i) => {
        const u = i / 79;
        return [fromLeft ? u * w : w - u * w, h * 0.86 + Math.sin(u * 9) * h * 0.04 + Math.sin(u * 23) * h * 0.01] as const;
      });
      const nodes = Array.from({ length: 12 }, (_, i) => ({
        i: 5 + i * 6 + Math.floor(rnd(0, 3)),
        up: i % 2 === 0,
        grapes: Math.random() < 0.55,
      }));
      return (f) => {
        const { ctx } = f;
        const grown = smooth(f.k * 1.8) * 79;
        ctx.strokeStyle = f.ink(0.3 * f.env);
        ctx.lineWidth = 2.2;
        ctx.lineCap = "round";
        ctx.beginPath();
        for (let i = 0; i <= grown; i++) ctx.lineTo(pts[i][0], pts[i][1] + Math.sin(f.t * 0.6 + i * 0.2) * 1.5);
        ctx.stroke();
        for (const n of nodes) {
          if (n.i > grown) continue;
          const [x, y] = pts[n.i];
          const g = smooth((grown - n.i) / 8);
          const d = n.up ? -1 : 1;
          // A tendril, curling.
          ctx.lineWidth = 0.9;
          ctx.strokeStyle = f.ink(0.22 * f.env);
          ctx.beginPath();
          for (let a = 0; a < 5 * g; a += 0.2) {
            const r = 16 * (1 - a / 6);
            ctx.lineTo(x + Math.sin(a) * r * 0.6 + a * 3, y + d * (a * 5 + Math.cos(a) * r * 0.3));
          }
          ctx.stroke();
          // A leaf.
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(d * -0.9 + Math.sin(f.t * 0.7 + n.i) * 0.08);
          ctx.scale(g, g);
          ctx.fillStyle = f.ink(0.2 * f.env, true);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.bezierCurveTo(10, -12, 24, -6, 28, 0);
          ctx.bezierCurveTo(24, 6, 10, 12, 0, 0);
          ctx.fill();
          ctx.restore();
          if (n.grapes && g > 0.5) {
            ctx.fillStyle = f.ink(0.3 * f.env * smooth(g * 2 - 1), true);
            for (let r = 0; r < 4; r++)
              for (let c = 0; c <= 3 - r; c++) {
                ctx.beginPath();
                ctx.arc(x - 6 + c * 5 + r * 2.5, y + 6 + r * 5, 2.6, 0, TAU);
                ctx.fill();
              }
          }
        }
      };
    },
  },
  {
    name: "boat on galilee",
    lane: "back",
    dur: [22, 36],
    make: (w, h, room) => {
      const sea = h * 0.74;
      const s0 = Math.min(w, h) * 0.07;
      const { x: bx, scale } = room.place(s0 * 4);
      const s = s0 * scale;
      const glints = Array.from({ length: 40 }, () => ({ x: rnd(-0.08, 0.08), y: rnd(0, 1), p: rnd(0, TAU), l: rnd(6, 18) }));
      const wave = (x: number, t: number, k: number) => Math.sin(x * 0.012 + t * 0.9 + k) * 4 + Math.sin(x * 0.031 - t * 1.3 + k * 2) * 1.6;
      return (f) => {
        const { ctx } = f;
        // The light's path on the water, behind the boat.
        for (const g of glints) {
          const gy = sea + 8 + g.y * (h - sea);
          const gx = bx + g.x * w * (1 + g.y) + Math.sin(f.t + g.p) * 6;
          beam(f, gx - g.l, gy, gx + g.l, gy, 1.2, 0.35 * f.env * Math.sin(f.t * 2 + g.p) ** 2);
        }
        // Swells, nearer ones lower and brighter.
        for (let i = 0; i < 6; i++) {
          const y0 = sea + i * i * 6;
          ctx.strokeStyle = f.ink((0.1 + i * 0.03) * f.env, true);
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          for (let x = 0; x <= w; x += 10) ctx.lineTo(x, y0 + wave(x, f.t, i) * (1 + i * 0.3));
          ctx.stroke();
        }
        // The boat, rocking on them, with its sail.
        const y = sea + wave(bx, f.t, 0) - 2;
        ctx.save();
        ctx.translate(bx, y);
        ctx.rotate(Math.sin(f.t * 0.9) * 0.05);
        ctx.strokeStyle = f.ink(0.42 * f.env);
        ctx.fillStyle = f.ink(0.1 * f.env);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-s * 1.3, -s * 0.35);
        ctx.quadraticCurveTo(-s * 1.0, s * 0.15, 0, s * 0.18);
        ctx.quadraticCurveTo(s * 1.0, s * 0.15, s * 1.3, -s * 0.4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.2);
        ctx.lineTo(0, -s * 2.1);
        ctx.stroke();
        ctx.fillStyle = f.ink(0.16 * f.env);
        ctx.beginPath();
        ctx.moveTo(-s * 0.9, -s * 0.45);
        ctx.quadraticCurveTo(-s * 0.2, -s * 1.3, s * 0.15, -s * 2.15);
        ctx.quadraticCurveTo(s * 0.5, -s * 1.1, s * 0.9, -s * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      };
    },
  },
  {
    name: "wheat",
    lane: "pass",
    dur: [14, 22],
    make: (w, h) => {
      const stalks = Array.from({ length: Math.round(w / 22) }, (_, i) => ({
        x: (i + rnd(-0.4, 0.4)) * 22,
        H: h * rnd(0.12, 0.24),
        p: rnd(0, TAU),
      }));
      return (f) => {
        const { ctx } = f;
        const rise = (1 - smooth(f.env)) * 40;
        ctx.lineCap = "round";
        for (const s of stalks) {
          const bend = Math.sin(f.t * 0.8 - s.x * 0.006 + s.p * 0.2) * 0.16 + Math.sin(f.t * 2.1 + s.p) * 0.02;
          const bx = s.x,
            by = h + 4 + rise;
          const tx = bx + Math.sin(bend) * s.H,
            ty = by - Math.cos(bend) * s.H;
          ctx.strokeStyle = f.ink(0.22 * f.env);
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.quadraticCurveTo(bx, by - s.H * 0.5, tx, ty);
          ctx.stroke();
          // The ear: grains in pairs up the top of the stalk, and their awns.
          ctx.save();
          ctx.translate(tx, ty);
          ctx.rotate(bend * 1.3);
          ctx.fillStyle = f.ink(0.3 * f.env);
          for (let g = 0; g < 7; g++) {
            const gy = -g * 5;
            for (const side of [-1, 1]) {
              ctx.beginPath();
              ctx.ellipse(side * 2.6, gy, 2.2, 4, side * 0.45, 0, TAU);
              ctx.fill();
            }
          }
          ctx.strokeStyle = f.ink(0.14 * f.env);
          ctx.lineWidth = 0.7;
          for (let g = 0; g < 7; g++) {
            for (const side of [-1, 1]) {
              ctx.beginPath();
              ctx.moveTo(side * 3, -g * 5 - 3);
              ctx.lineTo(side * 9, -g * 5 - 16);
              ctx.stroke();
            }
          }
          ctx.restore();
        }
      };
    },
  },
  {
    name: "lily",
    lane: "pass",
    dur: [12, 18],
    make: (w, h, room) => {
      const S0 = Math.min(w, h) * 0.07;
      const { x, scale } = room.place(S0 * 3);
      const base = h + 6,
        S = S0 * scale,
        top = h * rnd(0.55, 0.65);
      return (f) => {
        const { ctx } = f;
        const grow = smooth(f.k * 2.2);
        const sway = Math.sin(f.t * 0.6) * 0.05;
        const fx = x + Math.sin(sway) * (base - top),
          fy = top + (1 - grow) * (base - top) * 0.3;
        ctx.strokeStyle = f.ink(0.3 * f.env, true);
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(x, base);
        ctx.quadraticCurveTo(x, (base + fy) / 2, fx, fy + S * 0.3);
        ctx.stroke();
        // Two long leaves from the stem.
        ctx.fillStyle = f.ink(0.16 * f.env, true);
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(x, base - (base - fy) * 0.25);
          ctx.quadraticCurveTo(x + side * S * 0.9, base - (base - fy) * 0.5, x + side * S * 1.4 + sway * 40, base - (base - fy) * 0.7);
          ctx.quadraticCurveTo(x + side * S * 0.3, base - (base - fy) * 0.45, x, base - (base - fy) * 0.25);
          ctx.fill();
        }
        // The flower, opening: six petals curling outward, and the stamens.
        const open = smooth(f.k * 3 - 0.6);
        glow(ctx, fx, fy, S * 2.4, f.ink(0.1 * f.env * open), f.ink(0));
        ctx.save();
        ctx.translate(fx, fy);
        for (let i = 0; i < 6; i++) {
          const back = i % 2 === 1;
          const a = -Math.PI / 2 + (i - 2.5) * 0.42 * (0.4 + 0.6 * open);
          ctx.save();
          ctx.rotate(a + Math.PI / 2);
          ctx.fillStyle = f.ink((back ? 0.18 : 0.3) * f.env);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.bezierCurveTo(-S * 0.3, -S * 0.5, -S * 0.25, -S * 1.1, S * 0.12 * open, -S * 1.35);
          ctx.bezierCurveTo(S * 0.3, -S * 1.0, S * 0.3, -S * 0.5, 0, 0);
          ctx.fill();
          ctx.restore();
        }
        ctx.strokeStyle = f.ink(0.4 * f.env * open);
        ctx.lineWidth = 0.8;
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + (i - 2) * 0.22;
          const ex = Math.cos(a) * S * 0.9,
            ey = Math.sin(a) * S * 0.9;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(ex, ey);
          ctx.stroke();
          ctx.fillStyle = f.ink(0.6 * f.env * open);
          ctx.beginPath();
          ctx.ellipse(ex, ey, 1.4, 3, a + Math.PI / 2, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      };
    },
  },
];
