// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Places and holy things: the cross, Calvary, the tomb, the city, the lampstand.

import { beam, Branch, flame, glow, grow, rnd, smooth, TAU, Vision } from "./kit";

export const PLACES: Vision[] = [
  {
    name: "cross",
    lane: "back",
    dur: [22, 40],
    make: (w, h, room) => {
      const H0 = Math.min(h * 0.6, w * 0.45);
      const { x, scale } = room.place(H0 * 0.8);
      const H = H0 * scale,
        y = h * 0.46;
      return (f) => {
        const a = f.env * (0.85 + 0.15 * f.beat);
        const cy = y - H * 0.2;
        glow(f.ctx, x, cy, H * 0.8, f.ink(0.07 * a), f.ink(0));
        // Rays turning slowly about where the beams cross.
        f.ctx.save();
        f.ctx.translate(x, cy);
        f.ctx.rotate(f.t * 0.015);
        for (let i = 0; i < 16; i++) {
          f.ctx.rotate(TAU / 16);
          const g = f.ctx.createLinearGradient(0, 0, 0, H * 1.2);
          g.addColorStop(0, f.ink(0.03 * a * (i % 2 ? 0.6 : 1)));
          g.addColorStop(1, f.ink(0));
          f.ctx.fillStyle = g;
          f.ctx.beginPath();
          f.ctx.moveTo(0, 0);
          f.ctx.lineTo(-H * 0.05, H * 1.2);
          f.ctx.lineTo(H * 0.05, H * 1.2);
          f.ctx.fill();
        }
        f.ctx.restore();
        beam(f, x, y - H * 0.5, x, y + H * 0.5, H * 0.03, 0.2 * a);
        beam(f, x - H * 0.3, cy, x + H * 0.3, cy, H * 0.03, 0.2 * a);
      };
    },
  },
  {
    name: "calvary",
    lane: "back",
    dur: [22, 36],
    make: (w, h, room) => {
      const x0 = room.place(w * 0.3).x,
        top = h * 0.8;
      const hill = (x: number) => top + ((x - x0) / (w * 0.55)) ** 2 * h * 0.18;
      const crosses = [
        { x: x0, s: 1 },
        { x: x0 - w * 0.09, s: 0.72 },
        { x: x0 + w * 0.09, s: 0.72 },
      ];
      return (f) => {
        const { ctx } = f;
        const dawn = f.env * smooth(f.k * 2.5);
        ctx.save();
        ctx.translate(x0, top);
        ctx.scale(1.8, 1);
        glow(ctx, 0, 0, h * 0.5, f.ink(0.3 * dawn), f.ink(0));
        ctx.restore();
        // The hill and its crosses, cut out of the light.
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = `rgba(0,0,0,${0.95 * f.env})`;
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 12) ctx.lineTo(x, hill(x));
        ctx.lineTo(w, h);
        ctx.fill();
        for (const c of crosses) {
          const H = h * 0.2 * c.s,
            bw = Math.max(3, H * 0.055),
            base = hill(c.x) + 2;
          ctx.fillRect(c.x - bw / 2, base - H, bw, H);
          ctx.fillRect(c.x - H * 0.3, base - H * 0.75, H * 0.6, bw);
        }
        ctx.globalCompositeOperation = f.dark ? "lighter" : "source-over";
      };
    },
  },
  {
    name: "rose window",
    lane: "back",
    dur: [24, 40],
    make: (w, h, room) => {
      const R0 = Math.min(w, h) * 0.22;
      const { x, scale } = room.place(R0 * 2.2);
      const y = h * 0.34,
        R = R0 * scale;
      return (f) => {
        const { ctx } = f;
        const a = f.env;
        // Light falling from it, slanting down.
        ctx.save();
        ctx.translate(x, y);
        const g = ctx.createLinearGradient(0, 0, R * 0.6, h);
        g.addColorStop(0, f.ink(0.08 * a));
        g.addColorStop(1, f.ink(0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-R * 0.8, 0);
        ctx.lineTo(R * 0.8, 0);
        ctx.lineTo(R * 2.2, h);
        ctx.lineTo(-R * 0.6, h);
        ctx.fill();
        // The glass: twelve petals, then six roundels, then the middle, each pane catching the light.
        for (let i = 0; i < 12; i++) {
          const a0 = (i / 12) * TAU,
            a1 = ((i + 1) / 12) * TAU;
          const sh = 0.5 + 0.5 * Math.sin(f.t * 0.7 + i * 1.3);
          ctx.fillStyle = f.ink((0.05 + 0.07 * sh) * a, i % 2 === 1);
          ctx.beginPath();
          ctx.arc(0, 0, R, a0 + 0.02, a1 - 0.02);
          ctx.arc(0, 0, R * 0.55, a1 - 0.03, a0 + 0.03, true);
          ctx.fill();
          ctx.strokeStyle = f.ink(0.3 * a);
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          const am = (a0 + a1) / 2;
          ctx.arc(Math.cos(am) * R * 0.78, Math.sin(am) * R * 0.78, R * 0.13, 0, TAU);
          ctx.stroke();
        }
        for (let i = 0; i < 6; i++) {
          const am = (i / 6) * TAU + TAU / 12;
          ctx.fillStyle = f.ink((0.08 + 0.06 * Math.sin(f.t + i)) * a, i % 2 === 0);
          ctx.beginPath();
          ctx.arc(Math.cos(am) * R * 0.36, Math.sin(am) * R * 0.36, R * 0.16, 0, TAU);
          ctx.fill();
          ctx.stroke();
        }
        glow(ctx, 0, 0, R * 0.25, f.ink(0.35 * a), f.ink(0));
        ctx.strokeStyle = f.ink(0.35 * a);
        ctx.lineWidth = 2;
        for (const r of [R, R * 0.55, R * 0.18]) {
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, TAU);
          ctx.stroke();
        }
        ctx.lineWidth = 1;
        for (let i = 0; i < 12; i++) {
          const am = (i / 12) * TAU;
          ctx.beginPath();
          ctx.moveTo(Math.cos(am) * R * 0.55, Math.sin(am) * R * 0.55);
          ctx.lineTo(Math.cos(am) * R, Math.sin(am) * R);
          ctx.stroke();
        }
        ctx.restore();
      };
    },
  },
  {
    name: "menorah",
    lane: "back",
    dur: [22, 36],
    make: (w, h, room) => {
      const H0 = Math.min(h * 0.36, w * 0.3);
      const { x, scale } = room.place(H0 * 0.95);
      const H = H0 * scale,
        base = h * 0.9;
      const top = base - H;
      return (f) => {
        const { ctx } = f;
        ctx.strokeStyle = f.ink(0.32 * f.env);
        ctx.lineWidth = Math.max(2, H * 0.018);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, base - H * 0.12);
        ctx.stroke();
        // The arms: half circles from the stem, rising to the same height.
        const armY = top + H * 0.42;
        for (let i = 1; i <= 3; i++) {
          const r = H * 0.13 * i;
          ctx.beginPath();
          ctx.arc(x, armY - r * 0.0, r, 0, Math.PI);
          ctx.stroke();
          for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(x + side * r, armY);
            ctx.lineTo(x + side * r, top);
            ctx.stroke();
          }
        }
        // Its foot.
        ctx.beginPath();
        ctx.moveTo(x - H * 0.16, base);
        ctx.quadraticCurveTo(x, base - H * 0.16, x + H * 0.16, base);
        ctx.closePath();
        ctx.stroke();
        // The lamps, lit one by one from the middle.
        const order = [0, -1, 1, -2, 2, -3, 3];
        order.forEach((o, n) => {
          const lit = smooth(f.k * 6 - n * 0.45);
          if (lit > 0) flame(f, x + o * H * 0.13, top - 2, H * 0.07, n * 2.1, lit);
          ctx.fillStyle = f.ink(0.35 * f.env);
          ctx.fillRect(x + o * H * 0.13 - H * 0.025, top - 1, H * 0.05, 3);
        });
      };
    },
  },
  {
    name: "open door",
    lane: "back",
    dur: [20, 34],
    make: (_w, h, room) => {
      const { x, scale } = room.place(h * 0.34 * 0.46 * 2.4);
      const dh = h * 0.34 * scale,
        dw = dh * 0.46,
        foot = h * 0.66;
      const doorPath = (ctx: CanvasRenderingContext2D) => {
        ctx.beginPath();
        ctx.moveTo(x - dw / 2, foot);
        ctx.lineTo(x - dw / 2, foot - dh + dw / 2);
        ctx.arc(x, foot - dh + dw / 2, dw / 2, Math.PI, 0);
        ctx.lineTo(x + dw / 2, foot);
        ctx.closePath();
      };
      return (f) => {
        const { ctx } = f;
        const open = smooth(f.k * 2.2 - 0.2);
        // The light within, and what spills out across the floor.
        const g = ctx.createLinearGradient(0, foot - dh, 0, foot);
        g.addColorStop(0, f.ink(0.14 * f.env * open));
        g.addColorStop(1, f.ink(0.26 * f.env * open));
        ctx.fillStyle = g;
        doorPath(ctx);
        ctx.fill();
        const s = ctx.createLinearGradient(0, foot, 0, h);
        s.addColorStop(0, f.ink(0.12 * f.env * open));
        s.addColorStop(1, f.ink(0));
        ctx.fillStyle = s;
        ctx.beginPath();
        ctx.moveTo(x - dw / 2, foot);
        ctx.lineTo(x + dw / 2, foot);
        ctx.lineTo(x + dw * 2.2, h);
        ctx.lineTo(x - dw * 2.2, h);
        ctx.fill();
        glow(ctx, x, foot - dh * 0.4, dh * 1.1, f.ink(0.08 * f.env * open), f.ink(0));
        // The door itself, swinging in.
        ctx.save();
        doorPath(ctx);
        ctx.clip();
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = `rgba(0,0,0,${0.85 * f.env})`;
        const leaf = dw * (1 - open * 0.85);
        ctx.fillRect(x - dw / 2, foot - dh, leaf, dh);
        ctx.restore();
        ctx.strokeStyle = f.ink(0.3 * f.env);
        ctx.lineWidth = 1.5;
        doorPath(ctx);
        ctx.stroke();
      };
    },
  },
  {
    name: "empty tomb",
    lane: "back",
    dur: [22, 36],
    make: (w, h, room) => {
      const r0 = Math.min(w, h) * 0.07;
      const { x: ox, scale } = room.place(r0 * 7);
      const left = ox < w / 2;
      const oy = h * 0.78,
        r = r0 * scale;
      return (f) => {
        const { ctx } = f;
        const dawn = f.env * smooth(f.k * 2);
        // The hillside, faintly lit at its edge.
        const g = ctx.createLinearGradient(0, h * 0.55, 0, h);
        g.addColorStop(0, f.ink(0.1 * f.env));
        g.addColorStop(1, f.ink(0.02 * f.env));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(left ? -10 : w + 10, h);
        ctx.lineTo(left ? -10 : w + 10, h * 0.58);
        ctx.quadraticCurveTo(ox, h * 0.5, left ? w * 0.62 : w * 0.38, h);
        ctx.fill();
        // The way in, open, and light from inside.
        for (let i = 0; i < 9; i++) {
          const a = -Math.PI / 2 + (i - 4) * 0.2 + Math.sin(f.t * 0.2 + i) * 0.03;
          const L = r * rnd(4, 4.4);
          const lg = ctx.createLinearGradient(ox, oy, ox + Math.cos(a) * L, oy + Math.sin(a) * L);
          lg.addColorStop(0, f.ink(0.12 * dawn));
          lg.addColorStop(1, f.ink(0));
          ctx.fillStyle = lg;
          ctx.beginPath();
          ctx.moveTo(ox, oy);
          ctx.lineTo(ox + Math.cos(a - 0.05) * L, oy + Math.sin(a - 0.05) * L);
          ctx.lineTo(ox + Math.cos(a + 0.05) * L, oy + Math.sin(a + 0.05) * L);
          ctx.fill();
        }
        glow(ctx, ox, oy, r * 2.2, f.ink(0.4 * dawn), f.ink(0));
        ctx.fillStyle = f.ink(0.45 * dawn);
        ctx.beginPath();
        ctx.moveTo(ox - r, oy + r * 0.6);
        ctx.lineTo(ox - r, oy);
        ctx.arc(ox, oy, r, Math.PI, 0);
        ctx.lineTo(ox + r, oy + r * 0.6);
        ctx.fill();
        // The stone, rolled away.
        const sx = ox + (left ? 1 : -1) * r * 2.3;
        ctx.strokeStyle = f.ink(0.32 * f.env);
        ctx.lineWidth = 1.6;
        ctx.fillStyle = f.ink(0.06 * f.env);
        ctx.beginPath();
        ctx.arc(sx, oy + r * 0.6 - r * 1.1, r * 1.1, 0, TAU);
        ctx.fill();
        ctx.stroke();
      };
    },
  },
  {
    name: "jacob's ladder",
    lane: "back",
    dur: [22, 36],
    make: (w, h, room) => {
      const bx = room.place(w * 0.16).x,
        tx = bx + w * rnd(-0.04, 0.04),
        ty = h * 0.04;
      const lights = Array.from({ length: 14 }, (_, i) => ({ u: i / 14, up: i % 2 === 0, s: rnd(0.04, 0.07) }));
      return (f) => {
        const { ctx } = f;
        glow(ctx, tx, ty, h * 0.3, f.ink(0.26 * f.env), f.ink(0));
        const at = (u: number, side: number) => {
          const half = 6 + (1 - u) * w * 0.06;
          return [bx + (tx - bx) * u + side * half, h + 10 - (h + 10 - ty) * u] as const;
        };
        for (const side of [-1, 1]) {
          const [x1, y1] = at(0, side),
            [x2, y2] = at(1, side);
          const g = ctx.createLinearGradient(x1, y1, x2, y2);
          g.addColorStop(0, f.ink(0.05 * f.env));
          g.addColorStop(1, f.ink(0.35 * f.env));
          ctx.strokeStyle = g;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
        // Rungs closer together as it climbs away.
        for (let i = 1; i < 26; i++) {
          const u = 1 - (1 - i / 26) ** 1.6;
          const [x1, y1] = at(u, -1),
            [x2, y2] = at(u, 1);
          ctx.strokeStyle = f.ink((0.06 + 0.28 * u) * f.env);
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
        // Lights going up and coming down it.
        const dot = f.dot();
        for (const l of lights) {
          const u = (l.u + (l.up ? 1 : -1) * f.t * l.s + 10) % 1;
          const [x, y] = at(u, Math.sin(l.u * 40) * 0.5);
          const r = 3 + (1 - u) * 4;
          ctx.globalAlpha = 0.7 * f.env * Math.sin(Math.PI * u);
          ctx.drawImage(dot, x - r, y - r, r * 2, r * 2);
        }
        ctx.globalAlpha = 1;
      };
    },
  },
  {
    name: "new jerusalem",
    lane: "back",
    dur: [24, 40],
    make: (w, h, room) => {
      const { x: cx, scale } = room.place(w * 0.5);
      const span = w * 0.5 * scale,
        ground = h * 0.8;
      const towers: { x: number; w: number; h: number; dome: boolean }[] = [];
      for (let x = cx - span / 2; x < cx + span / 2;) {
        const tw = rnd(18, 46);
        const mid = 1 - Math.abs(x + tw / 2 - cx) / (span / 2);
        towers.push({ x, w: tw, h: h * (0.06 + mid * 0.18 * rnd(0.6, 1.2)), dome: Math.random() < 0.3 });
        x += tw + rnd(2, 10);
      }
      const windows = towers.flatMap((t) =>
        Array.from({ length: Math.round(t.h / 22) }, (_, i) => ({
          x: t.x + t.w / 2 + rnd(-t.w * 0.25, t.w * 0.25),
          y: ground - 14 - i * 20,
          p: rnd(0, TAU),
        })),
      );
      return (f) => {
        const { ctx } = f;
        // Coming down out of heaven: settling into place as it appears.
        const dy = -(1 - smooth(f.k * 1.6)) * h * 0.08;
        ctx.save();
        ctx.translate(0, dy);
        glow(ctx, cx, ground - h * 0.1, span * 0.8, f.ink(0.14 * f.env), f.ink(0));
        const g = ctx.createLinearGradient(0, ground - h * 0.25, 0, ground);
        g.addColorStop(0, f.ink(0.22 * f.env));
        g.addColorStop(1, f.ink(0.06 * f.env));
        ctx.fillStyle = g;
        ctx.strokeStyle = f.ink(0.35 * f.env);
        ctx.lineWidth = 1;
        for (const t of towers) {
          ctx.beginPath();
          ctx.moveTo(t.x, ground);
          ctx.lineTo(t.x, ground - t.h);
          if (t.dome) ctx.arc(t.x + t.w / 2, ground - t.h, t.w / 2, Math.PI, 0);
          else ctx.lineTo(t.x + t.w / 2, ground - t.h - t.w * 0.5);
          ctx.lineTo(t.x + t.w, ground - t.h);
          ctx.lineTo(t.x + t.w, ground);
          ctx.fill();
          ctx.stroke();
        }
        // The gates, open and full of light.
        for (const k of [-0.28, 0, 0.28]) {
          const gx = cx + k * span,
            gw = 18,
            gh = 30;
          glow(ctx, gx, ground - gh / 2, 50, f.ink(0.3 * f.env), f.ink(0));
          ctx.fillStyle = f.ink(0.55 * f.env);
          ctx.beginPath();
          ctx.moveTo(gx - gw / 2, ground);
          ctx.lineTo(gx - gw / 2, ground - gh + gw / 2);
          ctx.arc(gx, ground - gh + gw / 2, gw / 2, Math.PI, 0);
          ctx.lineTo(gx + gw / 2, ground);
          ctx.fill();
        }
        for (const wd of windows) {
          ctx.fillStyle = f.ink(0.5 * f.env * (0.5 + 0.5 * Math.sin(f.t * 0.8 + wd.p)));
          ctx.fillRect(wd.x - 1.5, wd.y - 3, 3, 6);
        }
        ctx.restore();
      };
    },
  },
  {
    name: "burning bush",
    lane: "back",
    dur: [20, 32],
    make: (_w, h, room) => {
      const x0 = room.place(h * 0.4).x,
        y0 = h + 4;
      const bush = grow(h * 0.08, -Math.PI / 2, 0, 5, 0.6);
      const embers = Array.from({ length: 30 }, () => ({ u: Math.random(), x: rnd(-1, 1), s: rnd(0.08, 0.16), p: rnd(0, TAU) }));
      return (f) => {
        const { ctx } = f;
        const tips: [number, number][] = [];
        const draw = (b: Branch, x: number, y: number) => {
          const a = b.ang + Math.sin(f.t * 1.5 + b.depth) * 0.02;
          const x2 = x + Math.cos(a) * b.len,
            y2 = y + Math.sin(a) * b.len;
          ctx.strokeStyle = f.ink(0.22 * f.env);
          ctx.lineWidth = (6 - b.depth) * 1.1;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          if (b.depth >= 3) tips.push([x2, y2]);
          b.kids.forEach((k) => draw(k, x2, y2));
        };
        glow(ctx, x0, y0 - h * 0.18, h * 0.32, f.ink(0.16 * f.env * (0.9 + 0.1 * f.beat)), f.ink(0));
        draw(bush, x0, y0);
        // It burns, and is not consumed.
        tips.forEach(([x, y], i) => {
          if (i % 2) flame(f, x, y, 14 + (i % 5) * 3, i * 1.7, 0.42);
        });
        const dot = f.dot();
        for (const e of embers) {
          const u = (e.u + f.t * e.s) % 1;
          ctx.globalAlpha = 0.7 * f.env * (1 - u);
          const x = x0 + e.x * h * 0.18 + Math.sin(f.t + e.p) * 10,
            y = y0 - h * 0.15 - u * h * 0.35;
          ctx.drawImage(dot, x - 2.5, y - 2.5, 5, 5);
        }
        ctx.globalAlpha = 1;
      };
    },
  },
  {
    name: "lamp",
    lane: "pass",
    dur: [12, 18],
    make: (w, h, room) => {
      const S0 = Math.min(w, h) * 0.06;
      const { x, scale } = room.place(S0 * 6);
      const y = h * rnd(0.6, 0.72),
        S = S0 * scale;
      return (f) => {
        const { ctx } = f;
        // A lamp unto my feet: the light it throws on the path ahead.
        ctx.save();
        ctx.translate(x, y + S * 1.4);
        ctx.scale(2.6, 0.5);
        glow(ctx, S * 0.6, 0, S * 3, f.ink(0.22 * f.env), f.ink(0));
        ctx.restore();
        // The clay lamp: a round body, the spout, the handle.
        ctx.save();
        ctx.translate(x, y);
        ctx.strokeStyle = f.ink(0.42 * f.env);
        ctx.fillStyle = f.ink(0.14 * f.env);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(-S * 1.1, S * 0.1);
        ctx.quadraticCurveTo(-S * 1.0, S * 0.75, 0, S * 0.75);
        ctx.quadraticCurveTo(S * 0.9, S * 0.75, S * 1.5, S * 0.1);
        ctx.quadraticCurveTo(S * 1.4, -S * 0.05, S * 0.9, -S * 0.02);
        ctx.quadraticCurveTo(0, -S * 0.4, -S * 1.1, S * 0.1);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(-S * 0.1, S * 0.05, S * 0.25, S * 0.08, 0, 0, TAU);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-S * 1.05, S * 0.25);
        ctx.quadraticCurveTo(-S * 1.6, S * 0.1, -S * 1.25, S * 0.55);
        ctx.stroke();
        ctx.restore();
        flame(f, S * 1.35 + x, y + S * 0.02, S * 0.9, 1.3);
      };
    },
  },
];
