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
      const R0 = Math.min(w, h) * 0.15;
      const { x, scale } = room.place(R0 * 1.7);
      const y = h * 0.4,
        R = R0 * scale;
      // Stained glass: blue most of all, as at Chartres, with ruby, gold, green and violet; each
      // drawn mostly in the artwork's colours (blue, green and violet in its cool one, ruby and gold
      // in its warm one) with only a hint of its own, so the glass belongs with the song.
      const BLUE = 0,
        RUBY = 1,
        GOLD = 2,
        GREEN = 3,
        VIOLET = 4;
      const JEWELS = [BLUE, RUBY, GOLD, GREEN, VIOLET];
      const HUES: [number[], boolean][] = [
        [[60, 105, 220], true],
        [[205, 50, 65], false],
        [[235, 180, 60], false],
        [[60, 160, 105], true],
        [[135, 85, 195], true],
      ];
      const rgbOf = (ink: string) => ink.slice(ink.indexOf("(") + 1).split(",").slice(0, 3).map(Number);
      let tint = ["", "", "", "", ""];
      // The light falls slanting down towards the middle of the page, as sunlight through a real
      // window: only through the glass (the stone between the lancets leaves a darker gap), its
      // streaks of colour and lead in line with the panes, spreading a little and evenly as it
      // comes, and landing on the floor in a soft patch of the window's shape. It holds still.
      const side = x < w / 2 ? 1 : -1;
      const th = side * 0.36;
      const dx = Math.sin(th),
        dy = Math.cos(th);
      const floor = h * 0.96;
      const len = (floor - y) / dy; // from the window's middle to the floor
      // A Gothic window: flat at the foot, straight sides, and a pointed arch (two arcs, each
      // centred on the other side's springing) at the head. In the window's own units (R).
      const arch = (G: CanvasRenderingContext2D, cx: number, hw: number, spring: number, foot: number) => {
        G.beginPath();
        G.moveTo(cx - hw, foot);
        G.lineTo(cx - hw, spring);
        G.arc(cx + hw, spring, hw * 2, Math.PI, (Math.PI * 4) / 3);
        G.arc(cx - hw, spring, hw * 2, (Math.PI * 5) / 3, TAU);
        G.lineTo(cx + hw, foot);
        G.closePath();
      };
      // The glass: two lancets side by side, each in rows of panes with a round medallion, and a
      // small rose of six lobes in the head of the arch. The lead is cut out of it, so shows dark.
      const drawGlass = (G: CanvasRenderingContext2D, glass: (j: number, id: number) => string) => {
        const lead = (draw: () => void, width = 0.018) => {
          G.save();
          G.globalCompositeOperation = "destination-out";
          G.strokeStyle = "#000";
          G.lineWidth = width;
          G.beginPath();
          draw();
          G.stroke();
          G.restore();
        };
        const lancet = { hw: 0.25, spring: -0.05, foot: 0.98 };
        [-0.3, 0.3].forEach((cx, side) => {
          G.save();
          arch(G, cx, lancet.hw, lancet.spring, lancet.foot);
          G.clip();
          const rowH = 0.13;
          let row = 0;
          for (let yy = lancet.foot; yy > lancet.spring - 0.45; yy -= rowH, row++)
            for (const half of [0, 1]) {
              G.fillStyle = glass(JEWELS[(row * 2 + half + side * 3) % 5], row * 2 + half + side * 13);
              G.fillRect(cx - lancet.hw + half * lancet.hw, yy - rowH, lancet.hw, rowH);
            }
          lead(() => {
            for (let yy = lancet.foot; yy > lancet.spring - 0.45; yy -= rowH) {
              G.moveTo(cx - lancet.hw, yy);
              G.lineTo(cx + lancet.hw, yy);
            }
            G.moveTo(cx, lancet.foot);
            G.lineTo(cx, lancet.spring - 0.5);
          });
          const my = 0.42;
          G.fillStyle = glass(side ? RUBY : BLUE, 30 + side);
          G.beginPath();
          G.arc(cx, my, 0.16, 0, TAU);
          G.fill();
          G.fillStyle = glass(GOLD, 32 + side);
          G.beginPath();
          G.arc(cx, my, 0.07, 0, TAU);
          G.fill();
          lead(() => {
            G.arc(cx, my, 0.16, 0, TAU);
            G.moveTo(cx + 0.07, my);
            G.arc(cx, my, 0.07, 0, TAU);
          }, 0.024);
          G.restore();
          lead(() => arch(G, cx, lancet.hw, lancet.spring, lancet.foot), 0.03);
        });
        const oy = -0.62;
        for (let i = 0; i < 6; i++) {
          const am = (i / 6) * TAU - Math.PI / 2;
          G.fillStyle = glass(i % 2 ? BLUE : i % 4 ? GREEN : VIOLET, 40 + i);
          G.beginPath();
          G.arc(Math.cos(am) * 0.11, oy + Math.sin(am) * 0.11, 0.075, 0, TAU);
          G.fill();
        }
        G.fillStyle = glass(GOLD, 50);
        G.beginPath();
        G.arc(0, oy, 0.06, 0, TAU);
        G.fill();
        lead(() => {
          for (let i = 0; i < 6; i++) {
            const am = (i / 6) * TAU - Math.PI / 2;
            G.moveTo(Math.cos(am) * 0.11 + 0.075, oy + Math.sin(am) * 0.11);
            G.arc(Math.cos(am) * 0.11, oy + Math.sin(am) * 0.11, 0.075, 0, TAU);
          }
          G.moveTo(0.06, oy);
          G.arc(0, oy, 0.06, 0, TAU);
        }, 0.022);
      };
      // The beam, drawn once (and again only if the colours change): the glass alone, laid down
      // in many faint copies along the light's way, each a little larger, so the light is the
      // glass's shape drawn out; cut off at the floor, where a flattened copy lies.
      const beam = (dpr: number) => {
        const px = R * dpr;
        const S = document.createElement("canvas");
        S.width = Math.ceil(1.4 * px);
        S.height = Math.ceil(2.6 * px);
        const sg = S.getContext("2d")!;
        sg.setTransform(px, 0, 0, px, 0.7 * px, 1.5 * px);
        drawGlass(sg, (j) => `rgba(${tint[j]},1)`);
        const B = document.createElement("canvas");
        B.width = Math.round(w * dpr);
        B.height = Math.round(h * dpr);
        const b = B.getContext("2d")!;
        b.globalCompositeOperation = "lighter";
        b.save();
        b.beginPath();
        b.rect(0, 0, B.width, floor * dpr);
        b.clip();
        // On until the top of the window has reached the floor too.
        const reach = (floor - y + 1.5 * R) / dy;
        const N = 240;
        for (let i = 1; i <= N; i++) {
          const q = i / N,
            d = reach * q,
            k = 1 + (0.14 * d) / len;
          b.globalAlpha = 0.02 * (1 - 0.5 * q);
          b.setTransform(px * k, 0, 0, px * k, (x + dx * d) * dpr, (y + dy * d) * dpr);
          b.drawImage(S, -0.7, -1.5, 1.4, 2.6);
        }
        b.restore();
        // The patch on the floor: the window flattened, its head (which the light from it reaches
        // last) nearer, softened by drawing it a few times a little apart.
        const kE = 1.14;
        for (let j = 0; j < 14; j++) {
          b.globalAlpha = 0.07;
          b.setTransform(R * kE * dpr, 0, -R * kE * Math.tan(th) * dpr, -0.15 * R * kE * dpr, (x + dx * len + rnd(-0.09, 0.09) * R) * dpr, (floor + rnd(-0.025, 0.025) * R) * dpr);
          b.drawImage(S, -0.7, -1.5, 1.4, 2.6);
        }
        // Not over the window itself.
        b.setTransform(dpr * R, 0, 0, dpr * R, x * dpr, y * dpr);
        b.globalAlpha = 1;
        b.globalCompositeOperation = "destination-out";
        arch(b, 0, 0.7, -0.2, 1.1);
        b.fill();
        return B;
      };
      const motes = Array.from({ length: 40 }, () => ({ s: rnd(0, 1), u: rnd(-0.55, 0.55), v: rnd(-0.3, 1), p: rnd(0, TAU), vel: rnd(0.003, 0.008) }));
      let layer: HTMLCanvasElement | null = null;
      let lightOf: { key: string; canvas: HTMLCanvasElement } | null = null;
      return (f) => {
        const { ctx } = f;
        const a = f.env;
        const lit = smooth(f.k * 4 - 0.4); // the sun comes through once the window is there
        const warm = rgbOf(f.ink(1)),
          cool = rgbOf(f.ink(1, true));
        tint = HUES.map(([c, isCool]) => c.map((v, i) => Math.round((isCool ? cool : warm)[i] * 0.86 + v * 0.14)).join(","));
        const dpr = ctx.getTransform().a || 1;
        const key = `${tint.join("|")}/${dpr}`;
        if (!lightOf || lightOf.key !== key) lightOf = { key, canvas: beam(dpr) };
        ctx.globalAlpha = (f.dark ? 0.16 : 0.22) * a * lit;
        ctx.drawImage(lightOf.canvas, 0, 0, w, h);
        // Dust drifting in the light.
        const dot = f.dot();
        for (const m of motes) {
          m.s = (m.s + m.vel * f.dt) % 1;
          const d = R * 1.2 + m.s * (len - R);
          const mx = x + m.u * R + dx * d + Math.sin(f.t * 0.3 + m.p) * 4,
            my = y + m.v * R + dy * d;
          if (my > floor) continue;
          ctx.globalAlpha = 0.18 * a * lit * (1 - m.s) * (0.5 + 0.5 * Math.sin(f.t * 1.7 + m.p));
          ctx.drawImage(dot, mx - 2.5, my - 2.5, 5, 5);
        }
        ctx.globalAlpha = 1;

        // The window: drawn solid on a layer, so the leading shows as dark lines between the panes.
        if (!layer || layer.width !== Math.round(w * dpr) || layer.height !== Math.round(h * dpr)) {
          layer = document.createElement("canvas");
          layer.width = Math.round(w * dpr);
          layer.height = Math.round(h * dpr);
        }
        const L = layer.getContext("2d")!;
        L.setTransform(1, 0, 0, 1, 0, 0);
        L.clearRect(0, 0, layer.width, layer.height);
        L.setTransform(dpr * R, 0, 0, dpr * R, x * dpr, y * dpr);
        // The stone of the frame, then the glass.
        L.fillStyle = f.ink(0.22);
        arch(L, 0, 0.7, -0.2, 1.1);
        L.fill();
        L.fillStyle = f.ink(0.06);
        arch(L, 0, 0.63, -0.2, 1.04);
        L.fill();
        drawGlass(L, (j, id) => `rgba(${tint[j]},${(0.5 + 0.12 * Math.sin(f.t * 0.6 + id * 1.7)) * (0.55 + 0.45 * lit)})`);
        ctx.save();
        ctx.globalAlpha = (f.dark ? 0.32 : 0.4) * a;
        ctx.shadowColor = f.ink(0.4 * a);
        ctx.shadowBlur = R * 0.1;
        ctx.drawImage(layer, 0, 0, w, h);
        ctx.restore();
        glow(ctx, x, y - R * 0.3, R * 0.6, f.ink(0.12 * a * lit), f.ink(0));
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
    make: (w, h, room) => {
      const { x, scale } = room.place(h * 0.34 * 0.46 * 2.4);
      const dh = h * 0.34 * scale,
        dw = dh * 0.46,
        foot = h * 0.66;
      const hinge = x - dw / 2,
        spring = foot - dh + dw / 2;
      // The doorway's outline, closed-door shape: up the hinge side, over the round head, down.
      const outline: [number, number][] = [[hinge, foot], [hinge, spring]];
      for (let i = 0; i <= 32; i++) {
        const t = Math.PI + (i / 32) * Math.PI;
        outline.push([x + Math.cos(t) * (dw / 2), spring + Math.sin(t) * (dw / 2)]);
      }
      outline.push([x + dw / 2, foot]);
      const trace = (G: CanvasRenderingContext2D, pts: [number, number][]) => {
        G.beginPath();
        pts.forEach(([px, py], i) => (i ? G.lineTo(px, py) : G.moveTo(px, py)));
        G.closePath();
      };
      // A point of the door, swung out towards us by `phi` on its hinge: it comes nearer the hinge
      // across the page, and nearer us (so taller, about the eye's height) the further it is from it.
      const eye = foot - dh * 0.45;
      const swing = (phi: number) => ([px, py]: [number, number]): [number, number] => {
        const u = (px - hinge) / dw;
        const s = 1 / (1 - u * Math.sin(phi) * 0.3);
        return [hinge + u * dw * Math.cos(phi), eye + (py - eye) * s];
      };
      // Its two panels, as outlines in the closed door, each side sampled so they bend with it.
      const panel = (u0: number, u1: number, y0: number, y1: number): [number, number][] => {
        const pts: [number, number][] = [];
        const X = (u: number) => hinge + u * dw;
        for (let i = 0; i <= 8; i++) pts.push([X(u0 + ((u1 - u0) * i) / 8), y0]);
        for (let i = 0; i <= 8; i++) pts.push([X(u1), y0 + ((y1 - y0) * i) / 8]);
        for (let i = 0; i <= 8; i++) pts.push([X(u1 - ((u1 - u0) * i) / 8), y1]);
        for (let i = 0; i <= 8; i++) pts.push([X(u0), y1 - ((y1 - y0) * i) / 8]);
        return pts;
      };
      const panels = [panel(0.2, 0.8, spring - dw * 0.05, foot - dh * 0.5), panel(0.2, 0.8, foot - dh * 0.42, foot - dh * 0.08)];
      let layer: HTMLCanvasElement | null = null;
      return (f) => {
        const { ctx } = f;
        const open = smooth(f.k * 2.2 - 0.2);
        const phi = open * 1.2;
        const turn = swing(phi);
        const leaf = outline.map(turn);
        const edge = hinge + dw * Math.cos(phi); // the door's free edge, across the page
        // Light spilling out of the gap and across the floor towards us, widening as it comes.
        const gap = (x + dw / 2 - edge) / dw;
        if (gap > 0.01) {
          const s = ctx.createLinearGradient(0, foot, 0, h);
          s.addColorStop(0, f.ink(0.16 * f.env * open * smooth(gap * 3)));
          s.addColorStop(1, f.ink(0));
          ctx.fillStyle = s;
          ctx.beginPath();
          ctx.moveTo(edge, foot);
          ctx.lineTo(x + dw / 2, foot);
          ctx.lineTo(x + (x + dw / 2 - x) * 3.2, h);
          ctx.lineTo(x + (edge - x) * 3.2, h);
          ctx.fill();
        }
        glow(ctx, x, foot - dh * 0.4, dh * 1.1, f.ink(0.08 * f.env * open), f.ink(0));

        // On a layer: the light beyond the doorway and its frame, then the door in front of them,
        // cut out of them and drawn dim (its face is towards us, away from the light).
        const dpr = ctx.getTransform().a || 1;
        if (!layer || layer.width !== Math.round(w * dpr) || layer.height !== Math.round(h * dpr)) {
          layer = document.createElement("canvas");
          layer.width = Math.round(w * dpr);
          layer.height = Math.round(h * dpr);
        }
        const L = layer.getContext("2d")!;
        L.setTransform(1, 0, 0, 1, 0, 0);
        L.clearRect(0, 0, layer.width, layer.height);
        L.setTransform(dpr, 0, 0, dpr, 0, 0);
        const g = L.createLinearGradient(0, foot - dh, 0, foot);
        g.addColorStop(0, f.ink(0.55 * open));
        g.addColorStop(1, f.ink(0.85 * open));
        L.fillStyle = g;
        trace(L, outline);
        L.fill();
        L.strokeStyle = f.ink(0.45);
        L.lineWidth = 2.5;
        trace(L, outline);
        L.stroke();
        L.save();
        L.globalCompositeOperation = "destination-out";
        trace(L, leaf);
        L.fill();
        L.restore();
        L.fillStyle = f.ink(0.12);
        trace(L, leaf);
        L.fill();
        L.strokeStyle = f.ink(0.28);
        L.lineWidth = 1.2;
        for (const p of panels) {
          trace(L, p.map(turn));
          L.stroke();
        }
        // The handle, near the free edge; and that edge catching the light.
        const [hx, hy] = turn([hinge + dw * 0.86, foot - dh * 0.45]);
        L.fillStyle = f.ink(0.5);
        L.beginPath();
        L.arc(hx, hy, Math.max(1.5, dw * 0.035 * Math.cos(phi * 0.7)), 0, TAU);
        L.fill();
        const [ex1, ey1] = turn([x + dw / 2, spring]),
          [ex2, ey2] = turn([x + dw / 2, foot]);
        L.strokeStyle = f.ink(0.6 * open);
        L.lineWidth = 1.5;
        L.beginPath();
        L.moveTo(ex1, ey1);
        L.lineTo(ex2, ey2);
        L.stroke();
        ctx.save();
        ctx.globalAlpha = 0.5 * f.env;
        ctx.shadowColor = f.ink(0.4 * f.env * open);
        ctx.shadowBlur = dw * 0.25;
        ctx.drawImage(layer, 0, 0, w, h);
        ctx.restore();
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
      // The stone's rough edge, its chisel marks, and the rays' lengths, fixed for this showing.
      const lump = rnd(0, TAU);
      const rim = Array.from({ length: 72 }, (_, i) => 1 + 0.025 * Math.sin((i / 72) * TAU * 3 + lump) + 0.012 * Math.sin((i / 72) * TAU * 7 + lump * 2));
      const marks = Array.from({ length: 14 }, () => ({ a: rnd(0, TAU), r: rnd(0.15, 0.7), l: rnd(-0.4, 0.4), d: rnd(-0.12, 0.12) }));
      const rays = Array.from({ length: 9 }, () => rnd(4, 4.4));
      let layer: HTMLCanvasElement | null = null;
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
        // The stone rolls aside first, turning as it goes, and the light comes out as it does.
        const dir = left ? 1 : -1;
        const roll = smooth(f.k * 3.2 - 0.25);
        const rs = r * 1.15;
        const sx = ox + dir * r * 2.4 * roll,
          sy = oy + r * 0.6 - rs;
        const turn = (dir * (r * 2.4 * roll)) / rs;
        const shine = dawn * smooth(roll * 1.6 - 0.1);
        // Drawn on a layer, so the stone hides the light behind it.
        const dpr = ctx.getTransform().a || 1;
        if (!layer || layer.width !== Math.round(w * dpr) || layer.height !== Math.round(h * dpr)) {
          layer = document.createElement("canvas");
          layer.width = Math.round(w * dpr);
          layer.height = Math.round(h * dpr);
        }
        const L = layer.getContext("2d")!;
        L.setTransform(1, 0, 0, 1, 0, 0);
        L.clearRect(0, 0, layer.width, layer.height);
        L.setTransform(dpr, 0, 0, dpr, 0, 0);
        L.globalCompositeOperation = "lighter";
        // The way in, open, and light from inside.
        for (let i = 0; i < 9; i++) {
          const a = -Math.PI / 2 + (i - 4) * 0.2 + Math.sin(f.t * 0.2 + i) * 0.03;
          const len = r * rays[i];
          const lg = L.createLinearGradient(ox, oy, ox + Math.cos(a) * len, oy + Math.sin(a) * len);
          lg.addColorStop(0, f.ink(0.12 * shine));
          lg.addColorStop(1, f.ink(0));
          L.fillStyle = lg;
          L.beginPath();
          L.moveTo(ox, oy);
          L.lineTo(ox + Math.cos(a - 0.05) * len, oy + Math.sin(a - 0.05) * len);
          L.lineTo(ox + Math.cos(a + 0.05) * len, oy + Math.sin(a + 0.05) * len);
          L.fill();
        }
        glow(L, ox, oy, r * 2.2, f.ink(0.4 * shine), f.ink(0));
        L.fillStyle = f.ink(0.45 * shine);
        L.beginPath();
        L.moveTo(ox - r, oy + r * 0.6);
        L.lineTo(ox - r, oy);
        L.arc(ox, oy, r, Math.PI, 0);
        L.lineTo(ox + r, oy + r * 0.6);
        L.fill();
        L.globalCompositeOperation = "source-over";
        // The groove the stone runs in, along the foot of the rock.
        L.strokeStyle = f.ink(0.12);
        L.lineWidth = 2;
        L.beginPath();
        L.moveTo(ox - dir * r * 1.3, oy + r * 0.62);
        L.lineTo(ox + dir * (r * 2.4 + rs * 1.1), oy + r * 0.62);
        L.stroke();
        // The stone: a rough-hewn disc, lit on the side towards the tomb's light. Solid: the light
        // behind it is cut away, and it is filled in colours mixed from the page's own and the ink.
        L.save();
        L.translate(sx, sy);
        L.beginPath();
        rim.forEach((k, i) => {
          const t = (i / rim.length) * TAU + turn;
          const px = Math.cos(t) * rs * k,
            py = Math.sin(t) * rs * k;
          if (i) L.lineTo(px, py);
          else L.moveTo(px, py);
        });
        L.closePath();
        L.globalCompositeOperation = "destination-out";
        L.fillStyle = "#000";
        L.fill();
        L.globalCompositeOperation = "source-over";
        const ink = f.ink(1).slice(5).split(",").slice(0, 3).map(Number);
        const page = f.dark ? [13, 17, 23] : [246, 248, 250];
        const solid = (k: number) => `rgb(${page.map((p, i) => Math.round(p + (ink[i] - p) * k)).join(",")})`;
        // Lit across from the tomb's side: brightest at the edge towards the light, into shadow on the far side.
        const sg = L.createLinearGradient(-dir * rs, -rs * 0.25, dir * rs, rs * 0.25);
        sg.addColorStop(0, solid(0.22 + 0.2 * shine));
        sg.addColorStop(0.45, solid(0.17 + 0.05 * shine));
        sg.addColorStop(1, solid(0.06));
        L.fillStyle = sg;
        L.fill();
        // The marks of the chisel, turning with it.
        L.rotate(turn);
        L.strokeStyle = f.ink(0.09);
        L.lineWidth = 1.2;
        L.lineCap = "round";
        for (const m of marks) {
          L.beginPath();
          L.moveTo(Math.cos(m.a) * rs * m.r, Math.sin(m.a) * rs * m.r);
          L.lineTo(Math.cos(m.a + m.l) * rs * (m.r + m.d), Math.sin(m.a + m.l) * rs * (m.r + m.d));
          L.stroke();
        }
        L.restore();
        ctx.save();
        ctx.globalAlpha = f.env;
        ctx.globalCompositeOperation = "source-over"; // so the stone hides what's behind it
        ctx.drawImage(layer, 0, 0, w, h);
        ctx.restore();
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
          const half = 7 + (1 - u) * w * 0.032;
          return [bx + (tx - bx) * u + side * half, h + 10 - (h + 10 - ty) * u] as const;
        };
        // Soft-edged: everything with a faint glow round it.
        ctx.save();
        ctx.shadowColor = f.ink(0.5 * f.env);
        ctx.shadowBlur = 6;
        ctx.lineCap = "round";
        for (const side of [-1, 1]) {
          const [x1, y1] = at(0, side),
            [x2, y2] = at(1, side);
          const g = ctx.createLinearGradient(x1, y1, x2, y2);
          g.addColorStop(0, f.ink(0.05 * f.env));
          g.addColorStop(1, f.ink(0.26 * f.env));
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
          // Each rung a little fainter at its ends, so it melts into the rails.
          const a = (0.05 + 0.2 * u) * f.env;
          const rg = ctx.createLinearGradient(x1, y1, x2, y2);
          rg.addColorStop(0, f.ink(a * 0.4));
          rg.addColorStop(0.25, f.ink(a));
          rg.addColorStop(0.75, f.ink(a));
          rg.addColorStop(1, f.ink(a * 0.4));
          ctx.strokeStyle = rg;
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
        ctx.restore();
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
      let layer: HTMLCanvasElement | null = null;
      return (f) => {
        const { ctx } = f;
        // Coming down out of heaven: settling into place as it appears.
        const dy = -(1 - smooth(f.k * 1.6)) * h * 0.08;
        ctx.save();
        ctx.translate(0, dy);
        glow(ctx, cx, ground - h * 0.1, span * 0.8, f.ink(0.14 * f.env), f.ink(0));
        // The towers, solid and without outlines on a layer (so they don't brighten where they
        // touch), fading into mist at their feet, laid on faintly with a soft edge.
        const dpr = ctx.getTransform().a || 1;
        if (!layer || layer.width !== Math.round(w * dpr) || layer.height !== Math.round(h * dpr)) {
          layer = document.createElement("canvas");
          layer.width = Math.round(w * dpr);
          layer.height = Math.round(h * dpr);
        }
        const L = layer.getContext("2d")!;
        L.setTransform(1, 0, 0, 1, 0, 0);
        L.clearRect(0, 0, layer.width, layer.height);
        L.setTransform(dpr, 0, 0, dpr, 0, dpr * dy);
        const g = L.createLinearGradient(0, ground - h * 0.25, 0, ground);
        g.addColorStop(0, f.ink(0.9));
        g.addColorStop(0.7, f.ink(0.55));
        g.addColorStop(1, f.ink(0.2));
        L.fillStyle = g;
        L.beginPath();
        for (const t of towers) {
          L.moveTo(t.x, ground);
          L.lineTo(t.x, ground - t.h);
          if (t.dome) L.arc(t.x + t.w / 2, ground - t.h, t.w / 2, Math.PI, 0);
          else L.lineTo(t.x + t.w / 2, ground - t.h - t.w * 0.5);
          L.lineTo(t.x + t.w, ground - t.h);
          L.lineTo(t.x + t.w, ground);
          L.closePath();
        }
        L.fill();
        ctx.save();
        ctx.translate(0, -dy);
        ctx.globalAlpha = 0.24 * f.env;
        ctx.shadowColor = f.ink(0.5 * f.env);
        ctx.shadowBlur = 10;
        ctx.drawImage(layer, 0, 0, w, h);
        ctx.restore();
        // The gates, open and full of light.
        for (const k of [-0.28, 0, 0.28]) {
          const gx = cx + k * span,
            gw = 18,
            gh = 30;
          glow(ctx, gx, ground - gh / 2, 50, f.ink(0.3 * f.env), f.ink(0));
          ctx.save();
          ctx.fillStyle = f.ink(0.4 * f.env);
          ctx.shadowColor = f.ink(0.6 * f.env);
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.moveTo(gx - gw / 2, ground);
          ctx.lineTo(gx - gw / 2, ground - gh + gw / 2);
          ctx.arc(gx, ground - gh + gw / 2, gw / 2, Math.PI, 0);
          ctx.lineTo(gx + gw / 2, ground);
          ctx.fill();
          ctx.restore();
        }
        // Lamps in the windows, as soft points of light.
        const dot = f.dot();
        for (const wd of windows) {
          ctx.globalAlpha = 0.55 * f.env * (0.5 + 0.5 * Math.sin(f.t * 0.8 + wd.p));
          ctx.drawImage(dot, wd.x - 4, wd.y - 5, 8, 10);
        }
        ctx.globalAlpha = 1;
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
      let layer: HTMLCanvasElement | null = null;
      return (f) => {
        const { ctx } = f;
        const fx = x + S * 1.47,
          fy = y + S * 0.02; // the wick, at the spout's tip
        // A lamp unto my feet: the light it throws on the ground about it.
        ctx.save();
        ctx.translate(x + S * 0.6, y + S * 0.8);
        ctx.scale(2.6, 0.45);
        glow(ctx, 0, 0, S * 3, f.ink(0.22 * f.env), f.ink(0));
        ctx.restore();
        // The clay lamp, side on: a squat round body on a little foot, a shallow dished top with
        // its filling hole, a long spout with the wick at its tip, and a loop handle behind. Solid,
        // in colours mixed from the page's own and the ink, lit warm by its flame from the spout side.
        const dpr = ctx.getTransform().a || 1;
        if (!layer || layer.width !== Math.round(w * dpr) || layer.height !== Math.round(h * dpr)) {
          layer = document.createElement("canvas");
          layer.width = Math.round(w * dpr);
          layer.height = Math.round(h * dpr);
        }
        const L = layer.getContext("2d")!;
        L.setTransform(1, 0, 0, 1, 0, 0);
        L.clearRect(0, 0, layer.width, layer.height);
        L.setTransform(dpr * S, 0, 0, dpr * S, x * dpr, y * dpr);
        const ink = f.ink(1).slice(5).split(",").slice(0, 3).map(Number);
        const page = f.dark ? [13, 17, 23] : [246, 248, 250];
        const clay = (k: number) => `rgb(${page.map((p, i) => Math.round(p + (ink[i] - p) * k)).join(",")})`;
        const lit = L.createLinearGradient(1.4, -0.1, -1, 0.8);
        lit.addColorStop(0, clay(0.5));
        lit.addColorStop(0.45, clay(0.3));
        lit.addColorStop(1, clay(0.1));
        L.fillStyle = lit;
        L.strokeStyle = lit;
        // The handle, a loop at the back.
        L.lineWidth = 0.11;
        L.beginPath();
        L.moveTo(-0.82, 0.12);
        L.bezierCurveTo(-1.35, 0.05, -1.35, 0.5, -0.86, 0.45);
        L.stroke();
        // The body and spout, in one.
        L.beginPath();
        L.moveTo(-0.75, 0.04);
        L.quadraticCurveTo(0, -0.08, 0.75, 0.02);
        L.lineTo(1.42, -0.02);
        L.quadraticCurveTo(1.66, -0.01, 1.64, 0.14);
        L.quadraticCurveTo(1.6, 0.28, 1.4, 0.3);
        L.quadraticCurveTo(1.05, 0.34, 0.82, 0.52);
        L.quadraticCurveTo(0.5, 0.8, 0, 0.8);
        L.quadraticCurveTo(-0.85, 0.8, -0.95, 0.38);
        L.quadraticCurveTo(-0.98, 0.1, -0.75, 0.04);
        L.fill();
        // Its foot.
        L.beginPath();
        L.ellipse(0, 0.8, 0.42, 0.06, 0, 0, TAU);
        L.fill();
        // The dished top: its rim catching the light, a little shadow in the hollow, the filling hole.
        L.fillStyle = clay(0.42);
        L.beginPath();
        L.ellipse(0, 0, 0.74, 0.12, 0, 0, TAU);
        L.fill();
        L.fillStyle = clay(0.24);
        L.beginPath();
        L.ellipse(0.02, 0.01, 0.58, 0.08, 0, 0, TAU);
        L.fill();
        L.fillStyle = clay(0.04);
        L.beginPath();
        L.ellipse(-0.08, 0.01, 0.1, 0.035, 0, 0, TAU);
        L.fill();
        // The wick hole at the spout's tip.
        L.beginPath();
        L.ellipse(1.47, 0.0, 0.09, 0.03, 0, 0, TAU);
        L.fill();
        ctx.save();
        ctx.globalAlpha = 0.85 * f.env;
        ctx.globalCompositeOperation = "source-over";
        ctx.drawImage(layer, 0, 0, w, h);
        ctx.restore();
        // The flame's warmth on the spout and the air about it, then the flame.
        glow(ctx, fx, fy - S * 0.2, S * 1.4, f.ink(0.22 * f.env), f.ink(0));
        flame(f, fx, fy, S * 0.9, 1.3);
      };
    },
  },
];
