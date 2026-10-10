// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// The land and water: hills, fields, trees, rivers, the sea.

import { beam, drift, glow, layering, photo, random, rangePath, ridge, rnd, smooth, TAU, Vision } from "./kit";
import { ROSE_BITMAP } from "./rose-bitmap";

export const LAND: Vision[] = [
  {
    name: "hills",
    themes: [
      "hill",
      "hills",
      "mountain",
      "mountains",
      "valley",
      "high places",
      "lift my eyes",
      "help comes",
      "everlasting hills",
      "the heights",
    ],
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
          rangePath(ctx, r.y, w, h, off);
          ctx.fill();
        }
      };
    },
  },
  {
    name: "still waters",
    themes: ["still", "peace", "quiet", "rest", "waters", "shepherd", "still waters", "restores my soul", "be still", "calm"],
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
    themes: ["tree", "root", "roots", "branch", "planted", "grow", "fruit", "life", "leaves", "rooted", "like a tree"],
    lane: "back",
    dur: [24, 40],
    make: (_w, h, room) => {
      const { x: x0, scale } = room.place(h * 0.85);
      const max = 6;
      const W0 = h * 0.034 * scale; // the trunk's width at its foot
      const lc = h * 0.05 * scale; // how far a cluster of leaves spreads
      type Limb = {
        len: number;
        ang: number;
        bend: number;
        depth: number;
        kids: Limb[];
        leaves: { dx: number; dy: number; r: number; a: number }[];
      };
      const limb = (len: number, ang: number, depth: number): Limb => {
        const kids: Limb[] = [];
        if (depth < max) {
          const n = depth === 0 || random() < 0.4 ? 3 : 2;
          for (let i = 0; i < n; i++) {
            let a = ang + (i - (n - 1) / 2) * (depth === 0 ? 0.62 : 0.48) * rnd(0.7, 1.3) + rnd(-0.12, 0.12);
            a += (a + Math.PI / 2) * 0.1; // reaching outwards, as a broad tree does
            a = Math.min(0.05, Math.max(-Math.PI - 0.05, a)); // but not drooping
            kids.push(limb(len * rnd(0.7, 0.8), a, depth + 1));
          }
        }
        const leaves =
          depth >= max - 2
            ? Array.from({ length: depth === max ? 12 : 6 }, () => ({
                dx: rnd(-1, 1) * lc,
                dy: rnd(-1, 0.6) * lc,
                r: rnd(3.5, 7.5) * Math.max(0.6, scale),
                a: rnd(0, TAU),
              }))
            : [];
        return { len, ang, bend: rnd(-0.12, 0.12), depth, kids, leaves };
      };
      const tree = limb(h * 0.17 * scale, -Math.PI / 2 + rnd(-0.04, 0.04), 0);
      const width = (d: number) => W0 * 0.6 ** d;
      // Twelve fruits, hung among the leaves of twelve of the twigs.
      const fruitAt = new Set<number>();
      const twigs = (b: Limb): number => (b.depth === max ? 1 : b.kids.reduce((n, k) => n + twigs(k), 0));
      const nTwigs = twigs(tree);
      while (fruitAt.size < Math.min(12, nTwigs)) fruitAt.add(Math.floor(rnd(0, nTwigs)));
      const layer = layering();
      return (f) => {
        const { ctx } = f;
        // Drawn solid on a layer, so the branches don't brighten where they join, then laid on faintly.
        const { L, canvas, dpr } = layer(f);
        L.setTransform(dpr, 0, 0, dpr, 0, 0);
        const wood = f.ink(1);
        const leafy = smooth(f.k * 3.2 - 1.4);
        // It starts as a slim shoot: the wood thickens and the roots spread as it grows.
        const girth = 0.25 + 0.75 * smooth(f.k * 2.2);
        const clusters: [number, number, Limb, number][] = [];
        let twig = 0;
        const draw = (b: Limb, x: number, y: number) => {
          const g = smooth(f.k * 3.2 - b.depth * 0.2);
          if (g <= 0) return;
          const a = b.ang + Math.sin(f.t * 0.45 + b.depth) * 0.01 * b.depth;
          const len = b.len * g;
          const x2 = x + Math.cos(a) * len,
            y2 = y + Math.sin(a) * len;
          // A tapered limb, bowed a little.
          const wa = (width(b.depth) / 2) * girth,
            wb = ((b.kids.length ? width(b.depth + 1) : width(b.depth) * 0.4) / 2) * girth;
          const nx = -Math.sin(a),
            ny = Math.cos(a);
          const mx = (x + x2) / 2 + nx * b.bend * len,
            my = (y + y2) / 2 + ny * b.bend * len;
          L.fillStyle = wood;
          L.beginPath();
          L.moveTo(x + nx * wa, y + ny * wa);
          L.quadraticCurveTo(mx + (nx * (wa + wb)) / 2, my + (ny * (wa + wb)) / 2, x2 + nx * wb, y2 + ny * wb);
          L.lineTo(x2 - nx * wb, y2 - ny * wb);
          L.quadraticCurveTo(mx - (nx * (wa + wb)) / 2, my - (ny * (wa + wb)) / 2, x - nx * wa, y - ny * wa);
          L.closePath();
          L.fill();
          L.beginPath();
          L.arc(x2, y2, wb, 0, TAU);
          L.fill();
          if (b.leaves.length && g >= 0.98) clusters.push([x2, y2, b, b.depth === max ? twig++ : -1]);
          for (const k of b.kids) draw(k, x2, y2);
        };
        // Roots flaring into the ground.
        const by = h + 2,
          rw = W0 * girth,
          rh = W0 * 3 * smooth(f.k * 2.2);
        L.fillStyle = wood;
        L.beginPath();
        L.moveTo(x0 - rw * 1.6, by);
        L.quadraticCurveTo(x0 - rw * 0.48, by - rh * 0.13, x0 - rw * 0.36, by - rh);
        L.lineTo(x0 + rw * 0.36, by - rh);
        L.quadraticCurveTo(x0 + rw * 0.48, by - rh * 0.13, x0 + rw * 1.6, by);
        L.fill();
        draw(tree, x0, by);
        // The leaves, in clusters, coming out once the tree is grown, stirring a little.
        if (leafy > 0) {
          for (const [x, y, b] of clusters) {
            L.fillStyle = f.ink(0.5, true);
            for (const l of b.leaves) {
              const sway = Math.sin(f.t * 0.8 + l.a) * 1.5;
              L.beginPath();
              L.ellipse(x + l.dx * leafy + sway, y + l.dy * leafy, l.r * leafy, l.r * 0.55 * leafy, l.a + sway * 0.05, 0, TAU);
              L.fill();
            }
          }
        }
        const fruit = smooth(f.k * 4 - 2.3);
        ctx.globalAlpha = (f.dark ? 0.34 : 0.42) * f.env;
        ctx.drawImage(canvas, 0, 0, f.w, f.h);
        ctx.globalAlpha = 1;
        if (fruit > 0)
          for (const [x, y, b, i] of clusters) {
            if (!fruitAt.has(i)) continue;
            const l = b.leaves[0];
            const fx = x + l.dx * 0.6,
              fy = y + l.dy * 0.6 + 4;
            const r = 4 * Math.max(0.7, scale);
            glow(ctx, fx, fy, r * 4, f.ink(0.25 * f.env * fruit), f.ink(0));
            ctx.fillStyle = f.ink(0.6 * f.env * fruit * (0.85 + 0.15 * Math.sin(f.t * 1.2 + i)));
            ctx.beginPath();
            ctx.arc(fx, fy, r, 0, TAU);
            ctx.fill();
          }
      };
    },
  },
  {
    name: "river of life",
    themes: ["river", "stream", "flow", "living water", "rivers", "flowing", "water of life", "flows"],
    lane: "back",
    dur: [22, 36],
    make: (w, h, room) => {
      const cx = room.place(w * 0.3).x,
        top = h * 0.38;
      const p = rnd(0, TAU);
      const mid = (y: number) => cx + Math.sin(y * 0.012 + p) * w * 0.12 * ((y - top) / (h - top));
      const half = (y: number) => 3 + ((y - top) / (h - top)) ** 1.6 * w * 0.16;
      const glints = Array.from({ length: 70 }, () => ({ u: random(), o: rnd(-0.85, 0.85), s: rnd(0.03, 0.06), p: rnd(0, TAU) }));
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
          const u = drift(q, f.t);
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
    themes: [
      "sheep",
      "shepherd",
      "lamb",
      "flock",
      "pasture",
      "he leadeth me",
      "good shepherd",
      "lost sheep",
      "ninety-nine",
      "the lord is my shepherd",
      "green pastures",
    ],
    lane: "back",
    dur: [22, 36],
    make: (w, h) => {
      const hill = (x: number) => h * 0.8 - Math.sin((x / w) * Math.PI) * h * 0.08 - Math.sin(x * 0.006) * h * 0.02;
      // Sheep further off (`d` near 0) stand higher up the hill and smaller; a lamb or two keeps by its mother.
      const sheep: { x: number; d: number; s: number; dir: number; p: number; graze: number; step: number }[] = [];
      for (let i = 0; i < 10; i++) {
        const d = rnd(0, 1);
        sheep.push({ x: rnd(0.06, 0.94) * w, d, s: 8 + d * 9, dir: random() < 0.5 ? 1 : -1, p: rnd(0, TAU), graze: 1, step: 0 });
        if (i < 2) sheep.push({ ...sheep[i * 2], x: sheep[i * 2].x + rnd(20, 34), s: sheep[i * 2].s * 0.62, p: rnd(0, TAU) });
      }
      sheep.sort((a, b) => a.d - b.d);
      // Each sheep is drawn solid on a layer, then the layer faintly, so their parts don't add up where they overlap.
      const layer = layering();
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

        const { L, canvas, dpr } = layer(f);
        L.setTransform(dpr, 0, 0, dpr, 0, 0);
        const ink = (a: number) => f.ink(a);
        for (const sh of sheep) {
          // Mostly grazing; now and then a few slow steps, head up.
          const walking = Math.sin(f.t * 0.13 + sh.p) > 0.55;
          const v = walking ? sh.s * 0.35 : 0;
          sh.x += sh.dir * v * f.dt;
          if (sh.x < w * 0.04 || sh.x > w * 0.96) sh.dir = sh.x < w / 2 ? 1 : -1;
          if (walking) sh.step += f.dt * 5;
          const lookUp = walking || Math.sin(f.t * 0.27 + sh.p * 3) > 0.7;
          sh.graze += ((lookUp ? 0 : 1) - sh.graze) * Math.min(1, f.dt * 1.5);
          const gz = smooth(sh.graze);
          const ground = hill(sh.x) + sh.d * h * 0.09;
          const u = sh.s;
          L.save();
          L.translate(sh.x, ground - 1.17 * u + (walking ? -Math.abs(Math.sin(sh.step)) * 0.04 * u : 0));
          L.scale(sh.dir * u, u);
          // Legs: the far pair a shade dimmer, swinging in diagonal pairs as it walks.
          const leg = (x: number, swing: number, a: number) => {
            L.save();
            L.translate(x, 0.35);
            L.rotate(walking ? Math.sin(sh.step + swing) * 0.15 : 0);
            L.fillStyle = ink(a);
            L.beginPath();
            L.moveTo(-0.08, 0);
            L.lineTo(0.08, 0);
            L.lineTo(0.05, 0.82);
            L.lineTo(-0.05, 0.82);
            L.fill();
            L.restore();
          };
          leg(0.48, Math.PI, 0.55);
          leg(-0.72, 0, 0.55);
          leg(0.62, 0, 0.8);
          leg(-0.58, Math.PI, 0.8);
          // The tail, then the fleece: an oval with a woolly edge, brighter on the back than the belly.
          L.fillStyle = ink(0.85);
          L.beginPath();
          L.ellipse(-1.02, 0.05, 0.13, 0.24, -0.3, 0, TAU);
          L.fill();
          const fl = L.createLinearGradient(0, -0.6, 0, 0.55);
          fl.addColorStop(0, ink(1));
          fl.addColorStop(1, ink(0.72));
          L.fillStyle = fl;
          L.beginPath();
          for (let i = 0; i <= 64; i++) {
            const a = (i / 64) * TAU;
            const wool = 1 + 0.07 * Math.abs(Math.sin(a * 11 + sh.p));
            const y = Math.sin(a) * 0.6 * wool;
            const x = Math.cos(a) * wool;
            if (i) L.lineTo(x, y > 0 ? y * 0.9 : y);
            else L.moveTo(x, y);
          }
          L.fill();
          // Neck and head: up and looking about, or down to the grass. The face is darker than the wool.
          const hx = 1.3 - 0.1 * gz + (gz ? 0 : Math.sin(f.t * 0.5 + sh.p) * 0.04),
            hy = -0.5 + 1.45 * gz + (gz > 0.9 ? Math.sin(f.t * 3 + sh.p) * 0.03 : 0);
          L.strokeStyle = ink(0.9);
          L.lineWidth = 0.42;
          L.lineCap = "round";
          L.beginPath();
          L.moveTo(0.7, -0.12);
          L.quadraticCurveTo(1.05, -0.2 + 0.6 * gz, hx - 0.08, hy);
          L.stroke();
          L.save();
          L.translate(hx, hy);
          L.rotate(0.45 + 0.95 * gz);
          L.fillStyle = ink(0.68);
          L.beginPath();
          L.ellipse(-0.18, -0.1, 0.17, 0.06, -0.5, 0, TAU); // the ear
          L.fill();
          L.beginPath();
          L.moveTo(-0.2, -0.17);
          L.quadraticCurveTo(0.12, -0.2, 0.36, -0.03);
          L.quadraticCurveTo(0.4, 0.09, 0.3, 0.13);
          L.quadraticCurveTo(0, 0.2, -0.2, 0.15);
          L.quadraticCurveTo(-0.3, 0, -0.2, -0.17);
          L.fillStyle = ink(0.78);
          L.fill();
          L.restore();
          L.restore();
        }
        for (const sh of sheep) glow(ctx, sh.x, hill(sh.x) + sh.d * h * 0.09 - sh.s, sh.s * 2.6, f.ink(0.05 * f.env), f.ink(0));
        ctx.globalAlpha = (f.dark ? 0.32 : 0.42) * f.env;
        ctx.drawImage(canvas, 0, 0, f.w, f.h);
        ctx.globalAlpha = 1;
      };
    },
  },
  {
    name: "narrow path",
    themes: ["path", "way", "road", "walk", "follow", "journey", "lead", "narrow", "guide me", "lead me", "footsteps", "walk with"],
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
    themes: ["vine", "branch", "branches", "fruit", "abide", "harvest", "vineyard", "bear fruit", "remain in me", "grapes"],
    lane: "back",
    dur: [22, 36],
    make: (w, h) => {
      const fromLeft = random() < 0.5;
      const pts = Array.from({ length: 80 }, (_, i) => {
        const u = i / 79;
        return [fromLeft ? u * w : w - u * w, h * 0.86 + Math.sin(u * 9) * h * 0.04 + Math.sin(u * 23) * h * 0.01] as const;
      });
      const nodes = Array.from({ length: 12 }, (_, i) => ({
        i: 5 + i * 6 + Math.floor(rnd(0, 3)),
        up: i % 2 === 0,
        grapes: random() < 0.55,
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
            // A bunch hanging from its stem: five rows, narrowing to one grape at the bottom.
            for (let r = 0; r < 5; r++)
              for (let c = 0; c <= 4 - r; c++) {
                ctx.beginPath();
                ctx.arc(x - 15 + c * 7.5 + r * 3.75, y + 9 + r * 6.8, 3.9, 0, TAU);
                ctx.fill();
              }
          }
        }
      };
    },
  },
  {
    name: "boat on galilee",
    themes: [
      "boat",
      "sea",
      "storm",
      "waves",
      "galilee",
      "sail",
      "walk on water",
      "oceans",
      "shore",
      "deep waters",
      "the deep",
      "in the storm",
      "water",
    ],
    lane: "back",
    dur: [22, 36],
    make: (w, h, room) => {
      const sea = h * 0.74;
      const s0 = Math.min(w, h) * 0.07;
      const { x: bx, scale } = room.place(s0 * 4);
      const s = s0 * scale;
      const glints = Array.from({ length: 40 }, () => ({ x: rnd(-0.08, 0.08), y: rnd(0, 1), p: rnd(0, TAU), l: rnd(6, 18) }));
      const wave = (x: number, t: number, k: number) => Math.sin(x * 0.012 + t * 0.9 + k) * 4 + Math.sin(x * 0.031 - t * 1.3 + k * 2) * 1.6;
      const layer = layering();
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
        // The boat, rocking on them, with its sail: drawn in soft fills on a layer (no outlines),
        // laid on with a soft edge, and faintly mirrored in the water.
        const { L, canvas, dpr } = layer(f);
        L.setTransform(dpr, 0, 0, dpr, 0, 0);
        const y = sea + wave(bx, f.t, 0) - 2;
        L.translate(bx, y);
        L.rotate(Math.sin(f.t * 0.9) * 0.05);
        const hull = L.createLinearGradient(0, -s * 0.4, 0, s * 0.18);
        hull.addColorStop(0, f.ink(0.9));
        hull.addColorStop(1, f.ink(0.45));
        L.fillStyle = hull;
        L.beginPath();
        L.moveTo(-s * 1.3, -s * 0.35);
        L.quadraticCurveTo(-s * 1.0, s * 0.15, 0, s * 0.18);
        L.quadraticCurveTo(s * 1.0, s * 0.15, s * 1.3, -s * 0.4);
        L.quadraticCurveTo(0, -s * 0.28, -s * 1.3, -s * 0.35);
        L.fill();
        L.strokeStyle = f.ink(0.75);
        L.lineWidth = 1.2;
        L.lineCap = "round";
        L.beginPath();
        L.moveTo(0, -s * 0.25);
        L.lineTo(0, -s * 2.1);
        L.stroke();
        const sail = L.createLinearGradient(-s * 0.9, -s * 0.5, s * 0.6, -s * 1.6);
        sail.addColorStop(0, f.ink(0.5));
        sail.addColorStop(0.6, f.ink(0.85));
        sail.addColorStop(1, f.ink(0.6));
        L.fillStyle = sail;
        L.beginPath();
        L.moveTo(-s * 0.9, -s * 0.45);
        L.quadraticCurveTo(-s * 0.2, -s * 1.3, s * 0.15, -s * 2.15);
        L.quadraticCurveTo(s * 0.5, -s * 1.1, s * 0.9, -s * 0.5);
        L.quadraticCurveTo(0, -s * 0.4, -s * 0.9, -s * 0.45);
        L.fill();
        ctx.save();
        ctx.globalAlpha = 0.4 * f.env;
        ctx.shadowColor = f.ink(0.5 * f.env);
        ctx.shadowBlur = s * 0.35;
        ctx.drawImage(canvas, 0, 0, f.w, f.h);
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = 0.05 * f.env;
        ctx.translate(0, y * 2 + s * 0.3);
        ctx.scale(1, -1);
        ctx.drawImage(canvas, 0, 0, f.w, f.h);
        ctx.restore();
      };
    },
  },
  {
    name: "wheat",
    themes: ["harvest", "field", "fields", "wheat", "bread", "seed", "reap", "sow", "white unto harvest", "grain", "labourers", "laborers"],
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
    themes: ["lily", "lilies", "flower", "bloom", "consider the lilies", "garden", "beauty", "rose of sharon", "lily of the valley"],
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
  {
    name: "rose of sharon",
    lane: "pass",
    dur: [13, 20],
    themes: [
      "rose of sharon",
      "sharon",
      "beauty",
      "beautiful",
      "bloom",
      "blossom",
      "flower",
      "lovely",
      "fairest",
      "altogether lovely",
      "song of songs",
      "beloved",
      "fragrance",
      "bride",
    ],
    // The rose of Sharon: Redouté's Provence rose (pictures/rose-bitmap.ts), in the artwork's
    // colour, the paper it is printed on kept about it.
    make: photo(ROSE_BITMAP, 0.5),
  },
];
