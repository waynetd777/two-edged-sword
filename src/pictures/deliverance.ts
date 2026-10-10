// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Breakthrough and freedom: chains broken, the veil torn, Jericho, the Red Sea, the fiery
// furnace, the dry bones, the prison doors, five smooth stones, the storm stilled, the shield.

import { beam, drift, flame, flatGlow, glow, lay, layering, photo, random, rangePath, ridge, rnd, smooth, TAU, tones, Vision } from "./kit";
import { KEY_BITMAP } from "./key-bitmap";
import { BREASTPLATE_BITMAP } from "./breastplate-bitmap";
import { HELMET_BITMAP } from "./helmet-bitmap";

export const DELIVERANCE: Vision[] = [
  {
    name: "broken chains",
    lane: "pass",
    dur: [12, 18],
    themes: [
      "chain",
      "chains",
      "break",
      "broken",
      "free",
      "freedom",
      "set free",
      "no longer",
      "slave",
      "slaves",
      "captive",
      "deliver",
      "bondage",
      "break every",
      "liberty",
      "loose",
      "shackles",
      "unbound",
      "release",
      "prisoner",
    ],
    make: (w, h, room) => {
      const S0 = Math.min(w, h) * 0.07;
      // The room is for the links about the break (the chain itself runs off the page).
      const { x, scale } = room.place(S0 * 6.2);
      const S = S0 * scale,
        y = h * 0.5;
      const flip = x < w / 2 ? -1 : 1; // on the left of the words, mirrored: rising to the left
      const layer = layering();
      // The fragments of the link that broke, each flying out from the break in its own way.
      const bits = Array.from({ length: 16 }, () => {
        const a = rnd(0, TAU);
        return { a, d: rnd(0.35, 1.3), s: rnd(0.05, 0.13), spin: rnd(-6, 6), r0: rnd(0, TAU), k: rnd(0.5, 1) };
      });
      return (f) => {
        const come = smooth(f.k * 2.5);
        const snap = smooth(f.k * 3 - 0.7); // the break: the halves pull apart, the pieces fly
        // A chain across the page, rising to the right, broken in the middle: links seen face on
        // (a long ring) and edge on (a bar) by turns, the two links at the break torn open and
        // the one between them shattered into pieces. Iron, lit from above. It runs off the page
        // both ways, whole at first, until the middle link snaps.
        const { L, canvas } = layer(f);
        const tone = tones(f);
        const d = 0.8, // from one link's middle to the next
          len = 1.05, // a link's length, end to end
          r = 0.27, // half its width, face on
          bar = 0.17; // the iron's thickness
        const ring = (open: boolean) => {
          const a = len / 2 - r;
          L.beginPath();
          if (open) {
            // Torn at its near end (−x): the sides stop short, ragged, of the end that broke away.
            L.moveTo(-a + 0.06, -r);
            L.lineTo(a, -r);
            L.arc(a, 0, r, -Math.PI / 2, Math.PI / 2);
            L.lineTo(-a + 0.16, r);
          } else {
            L.moveTo(-a, -r);
            L.lineTo(a, -r);
            L.arc(a, 0, r, -Math.PI / 2, Math.PI / 2);
            L.lineTo(-a, r);
            L.arc(-a, 0, r, Math.PI / 2, (Math.PI * 3) / 2);
          }
          L.stroke();
        };
        const edge = () => {
          L.beginPath();
          L.moveTo(-len / 2 + bar / 2, 0);
          L.lineTo(len / 2 - bar / 2, 0);
          L.stroke();
        };
        // One link at `k` along the chain (0 the break): odd ones face on, even ones edge on.
        const link = (k: number, shade: () => CanvasGradient) => {
          const half = Math.sign(k);
          L.save();
          L.translate(k * d + half * snap * 0.22, 0);
          if (k < 0) L.scale(-1, 1); // the near end towards the break
          L.lineWidth = bar;
          L.lineCap = "round";
          L.lineJoin = "round";
          L.strokeStyle = shade();
          if (Math.abs(k) % 2)
            ring(Math.abs(k) === 1 && snap > 0.2); // torn open only when it breaks
          else edge();
          L.restore();
        };
        const iron = () => {
          const g = L.createLinearGradient(0, -r - bar, 0, r + bar);
          g.addColorStop(0, tone(1));
          g.addColorStop(0.45, tone(0.7));
          g.addColorStop(1, tone(0.35));
          return g;
        };
        // Long enough to run off the page both ways.
        const ks = Array.from({ length: 40 }, (_, i) => i - 20).filter((k) => k !== 0);
        const chain = () => {
          L.save();
          L.translate(x, y);
          L.scale(flip, 1);
          L.rotate(-0.88);
          L.scale(S, S);
          for (const k of ks) link(k, iron);
          // The link between them, whole until it shatters.
          const whole = 1 - Math.min(1, snap * 5);
          if (whole > 0) {
            L.globalAlpha = whole;
            L.lineWidth = bar;
            L.lineCap = "round";
            L.strokeStyle = iron();
            L.beginPath();
            L.moveTo(-len / 2 + bar / 2, 0);
            L.lineTo(len / 2 - bar / 2, 0);
            L.stroke();
            L.globalAlpha = 1;
          }
          L.restore();
        };
        chain();
        // The pieces of the shattered link: they fly from the break and fade as they go.
        L.save();
        L.translate(x, y);
        L.scale(flip, 1);
        L.rotate(-0.88);
        L.scale(S, S);
        for (const b of bits) {
          const q = snap;
          if (q <= 0) continue;
          L.save();
          L.translate(Math.cos(b.a) * b.d * q * 1.4, Math.sin(b.a) * b.d * q * 1.1);
          L.rotate(b.r0 + b.spin * q);
          L.globalAlpha = Math.min(1, q * 4) * (1 - q * 0.55);
          L.fillStyle = tone(0.75 * b.k);
          L.beginPath();
          L.moveTo(0, -b.s);
          L.lineTo(b.s * 0.9, b.s * 0.6);
          L.lineTo(-b.s * 0.7, b.s * 0.4);
          L.closePath();
          L.fill();
          L.restore();
        }
        L.restore();
        lay(f, canvas, 0.85 * f.env * come);
      };
    },
  },
  {
    name: "torn veil",
    lane: "back",
    dur: [22, 36],
    themes: [
      "veil",
      "torn",
      "it is finished",
      "access",
      "holy of holies",
      "enter",
      "boldly",
      "presence",
      "curtain",
      "way is open",
      "the way",
      "mercy seat",
      "come near",
      "draw near",
      "rent",
      "in two",
      "top to bottom",
      "no more barrier",
      "wall between",
    ],
    make: (w, h, room) => {
      const cx = room.place(w * 0.3).x,
        foot = h * 0.9;
      const folds = Array.from({ length: Math.round(w / 36) }, (_, i) => ({ x: i * 36 + rnd(-6, 6), k: rnd(0.15, 0.4) }));
      const rip = Array.from({ length: 24 }, () => rnd(-1, 1) * 10);
      const layer = layering();
      return (f) => {
        const { ctx } = f;
        const tear = smooth(f.k * 2.6 - 0.4); // from the top to the bottom
        const gape = smooth(f.k * 3 - 1.4); // the halves draw apart
        // The glory behind it, seen through the rent.
        const gap = w * 0.02 + w * 0.12 * gape;
        glow(ctx, cx, h * 0.45, w * 0.3 * (0.3 + gape), f.ink(0.2 * f.env * tear * (0.92 + 0.08 * f.beat)), f.ink(0));
        beam(f, cx, -10, cx, foot, gap * 0.6, 0.22 * f.env * tear);
        const fg = ctx.createLinearGradient(0, foot, 0, h);
        fg.addColorStop(0, f.ink(0.12 * f.env * tear));
        fg.addColorStop(1, f.ink(0));
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.moveTo(cx - gap, foot);
        ctx.lineTo(cx + gap, foot);
        ctx.lineTo(cx + gap * 3, h);
        ctx.lineTo(cx - gap * 3, h);
        ctx.fill();
        // The veil, solid, hanging in folds from a rail above; then the rent cut out of it.
        const { L, canvas } = layer(f);
        const tone = tones(f);
        L.fillStyle = tone(0.16);
        L.fillRect(0, 0, w, foot);
        for (const fo of folds) {
          const g = L.createLinearGradient(fo.x, 0, fo.x + 36, 0);
          g.addColorStop(0, tone(0.14));
          g.addColorStop(0.5, tone(fo.k));
          g.addColorStop(1, tone(0.14));
          L.fillStyle = g;
          L.fillRect(fo.x, 0, 36, foot);
        }
        L.fillStyle = tone(0.4);
        L.fillRect(0, 0, w, 6);
        L.fillStyle = tone(0.3);
        L.fillRect(0, foot - 10, w, 10);
        // The rent: from the top down, jagged, its edges drawn apart and fluttering.
        if (tear > 0) {
          const reach = foot * tear;
          L.globalCompositeOperation = "destination-out";
          L.beginPath();
          L.moveTo(cx - 2, 0);
          for (let i = 0; i <= 24; i++) {
            const u = i / 24,
              yy = u * reach;
            const open = Math.sin(Math.PI * Math.min(1, u * 1.1)) * gap * 0.9 + gap * 0.3 * gape;
            L.lineTo(cx - open * (0.5 + 0.5 * tear) + rip[i] + Math.sin(f.t * 2 + i) * 3 * gape, yy);
          }
          for (let i = 24; i >= 0; i--) {
            const u = i / 24,
              yy = u * reach;
            const open = Math.sin(Math.PI * Math.min(1, u * 1.1)) * gap * 0.9 + gap * 0.3 * gape;
            L.lineTo(cx + open * (0.5 + 0.5 * tear) - rip[23 - i] - Math.sin(f.t * 2.3 + i) * 3 * gape, yy);
          }
          L.closePath();
          L.fill();
        }
        lay(f, canvas, (f.dark ? 0.32 : 0.4) * f.env, 4);
        // The torn edges catch the light.
        if (tear > 0.2) {
          glow(ctx, cx, foot * tear, gap * 2, f.ink(0.1 * f.env), f.ink(0));
        }
      };
    },
  },
  {
    name: "jericho",
    lane: "back",
    dur: [24, 40],
    themes: [
      "jericho",
      "wall",
      "walls",
      "walls fall",
      "walls come",
      "walls came",
      "walls are falling",
      "every wall",
      "march",
      "marched",
      "crumble",
      "fortress fall",
      "tumbling",
      "break down",
      "stronghold",
      "the walls",
      "seventh day",
      "fall down flat",
    ],
    make: (w, h, room) => {
      const S0 = Math.min(w, h) * 0.5;
      const { x, scale } = room.place(S0);
      const S = S0 * scale,
        ground = h * 0.78;
      // The wall: courses of stone across a rise, with two towers.
      const bw = S * 0.08,
        bh = S * 0.05;
      const blocks: { x: number; y: number; w: number; h: number; d: number; vx: number; spin: number; k: number }[] = [];
      for (let row = 0; row < 7; row++) {
        const off = row % 2 ? bw / 2 : 0;
        for (let i = -6; i <= 6; i++) {
          const bx = x + i * bw + off;
          const tower = Math.abs(i) >= 5;
          if (!tower && row >= 5) continue;
          blocks.push({
            x: bx,
            y: ground - (row + 1) * bh,
            w: bw - 2,
            h: bh - 2,
            d: rnd(0, 1),
            vx: rnd(-1, 1),
            spin: rnd(-2, 2),
            k: rnd(0.3, 0.55),
          });
        }
      }
      const dust: { x: number; y: number; t: number; r: number }[] = [];
      const blasts: number[] = [];
      let next = 2;
      const layer = layering();
      return (f) => {
        const { ctx } = f;
        const shout = smooth(f.k * 3 - 1.4); // the trumpets sound, the people shout, the wall falls
        // The rise it stands on, and the sky behind lit as it comes down.
        glow(ctx, x, ground - S * 0.2, S * 0.7, f.ink(0.14 * f.env * (0.3 + shout)), f.ink(0));
        const hg = ctx.createLinearGradient(0, ground, 0, h);
        hg.addColorStop(0, f.ink(0.1 * f.env));
        hg.addColorStop(1, f.ink(0.01 * f.env));
        ctx.fillStyle = hg;
        // Its top level where the wall stands, falling away on either side.
        ctx.beginPath();
        ctx.moveTo(0, h);
        ctx.quadraticCurveTo(x - S * 0.75, ground, x - S * 0.58, ground);
        ctx.lineTo(x + S * 0.58, ground);
        ctx.quadraticCurveTo(x + S * 0.75, ground, w, h);
        ctx.fill();
        // Trumpets sounding, before: rings going up from below the wall.
        if (shout < 0.2 && f.k > 0.15 && f.t >= next) {
          blasts.push(f.t);
          next = f.t + rnd(0.8, 1.6);
        }
        for (let i = blasts.length - 1; i >= 0; i--) {
          const q = (f.t - blasts[i]) / 2.5;
          if (q >= 1) {
            blasts.splice(i, 1);
            continue;
          }
          ctx.strokeStyle = f.ink(0.25 * f.env * (1 - q));
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(x, ground + S * 0.1, q * S * 0.7, Math.PI * 1.15, Math.PI * 1.85);
          ctx.stroke();
        }
        const { L, canvas } = layer(f);
        const tone = tones(f);
        for (const b of blocks) {
          const q = Math.max(0, (shout - b.d * 0.6) / 0.4); // each block's fall, from the top down
          const fall = Math.min(1, q);
          const dy = fall * fall * (ground + S * 0.1 - b.y - b.h) * (1 + b.d * 0.2);
          const dx = b.vx * fall * S * 0.1 * Math.sign(b.x - x + 0.01) * (0.5 + Math.abs(b.x - x) / S);
          if (fall >= 1 && random() < 0.02 && dust.length < 60) dust.push({ x: b.x + dx, y: ground + S * 0.1, t: f.t, r: rnd(10, 22) });
          L.save();
          L.translate(b.x + dx + b.w / 2, b.y + dy + b.h / 2);
          L.rotate(b.spin * fall * 0.6);
          const g = L.createLinearGradient(-b.w / 2, -b.h / 2, b.w / 2, b.h / 2);
          g.addColorStop(0, tone(b.k + 0.25));
          g.addColorStop(1, tone(b.k));
          L.fillStyle = g;
          L.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
          L.restore();
        }
        lay(f, canvas, 0.6 * f.env, 3);
        // Dust where they land.
        const dot = f.dot();
        for (let i = dust.length - 1; i >= 0; i--) {
          const q = (f.t - dust[i].t) / 2.5;
          if (q >= 1) {
            dust.splice(i, 1);
            continue;
          }
          ctx.globalAlpha = 0.14 * f.env * (1 - q);
          const r = dust[i].r * (0.5 + q * 2);
          ctx.drawImage(dot, dust[i].x - r, dust[i].y - r * 0.8 - q * 20, r * 2, r * 1.6);
        }
        ctx.globalAlpha = 1;
        // The shout itself: light swelling at the moment of the fall.
        if (shout > 0)
          glow(
            ctx,
            x,
            ground - S * 0.25,
            S * 0.9,
            f.ink(0.22 * f.env * Math.sin(Math.PI * Math.min(1, shout * 1.3)) * (0.8 + 0.2 * f.beat)),
            f.ink(0),
          );
      };
    },
  },
  {
    name: "red sea",
    lane: "back",
    dur: [24, 40],
    themes: [
      "sea",
      "red sea",
      "part",
      "parted",
      "make a way",
      "way maker",
      "egypt",
      "through the waters",
      "deliver",
      "dry ground",
      "pharaoh",
      "walk through",
      "moses",
      "path",
      "the waters",
      "divide",
      "miracle",
      "nothing is impossible",
      "stand back",
    ],
    make: (w, h, room) => {
      const cx = room.place(w * 0.3).x,
        hz = h * 0.5;
      const spray = Array.from({ length: 50 }, () => ({
        u: random(),
        side: random() < 0.5 ? -1 : 1,
        v: random(),
        s: rnd(0.1, 0.25),
        p: rnd(0, TAU),
      }));
      const walls = [ridge(0, 1), ridge(0, 1)];
      return (f) => {
        const { ctx } = f;
        const part = smooth(f.k * 2.2); // the waters stand up as walls on either side
        const half = (y: number) => {
          const u = (y - hz) / (h - hz); // 0 at the far shore, 1 nearest
          return w * (0.02 + 0.2 * u) * part;
        };
        // The far shore, and the light there.
        glow(ctx, cx, hz, h * 0.25, f.ink(0.3 * f.env * part), f.ink(0));
        beam(f, cx - w * 0.3, hz, cx + w * 0.3, hz, 1, 0.14 * f.env);
        // The dry ground between, lit from the far shore.
        const g = ctx.createLinearGradient(0, hz, 0, h);
        g.addColorStop(0, f.ink(0.25 * f.env * part));
        g.addColorStop(1, f.ink(0.04 * f.env * part));
        ctx.fillStyle = g;
        ctx.beginPath();
        for (let y = hz; y <= h + 10; y += 8) ctx.lineTo(cx - half(y), y);
        for (let y = h + 10; y >= hz; y -= 8) ctx.lineTo(cx + half(y), y);
        ctx.fill();
        // The walls of water on either hand, standing up and towering: each a sheer face rising
        // from the edge of the dry path, higher the nearer it comes, water streaming down it, its
        // crest foaming; over the top, the sea's surface running away into the dark.
        const crest = (y: number) => {
          const u = (y - hz) / (h - hz);
          return (h - hz) * (0.25 + 0.6 * u) * part;
        };
        for (const side of [-1, 1]) {
          const wall = walls[side > 0 ? 1 : 0];
          const edge = (y: number) => cx + side * (half(y) + Math.sin(y * 0.05 + f.t * 1.2 + side) * 2 * part);
          // The face.
          const wg = ctx.createLinearGradient(0, h, 0, hz);
          wg.addColorStop(0, f.ink(0.22 * f.env * part, true));
          wg.addColorStop(1, f.ink(0.1 * f.env * part, true));
          ctx.fillStyle = wg;
          ctx.beginPath();
          for (let y = hz; y <= h + 10; y += 8) ctx.lineTo(edge(y), y);
          for (let y = h + 10; y >= hz; y -= 8) ctx.lineTo(edge(y), y - crest(y) + wall(y) * 5 * part);
          ctx.closePath();
          ctx.fill();
          // The surface of the sea over the top of the wall, running away to the side.
          const sg = ctx.createLinearGradient(cx + side * half(h), 0, cx + side * w * 0.55, 0);
          sg.addColorStop(0, f.ink(0.12 * f.env * part, true));
          sg.addColorStop(1, f.ink(0.01 * f.env * part, true));
          ctx.fillStyle = sg;
          ctx.beginPath();
          for (let y = hz; y <= h + 10; y += 8) ctx.lineTo(edge(y), y - crest(y) + wall(y) * 5 * part);
          ctx.lineTo(cx + side * w * 0.6, h + 10 - crest(h + 10) * 0.6);
          ctx.lineTo(cx + side * w * 0.6, hz - crest(hz) * 0.6);
          ctx.closePath();
          ctx.fill();
          // Water streaming down the face: vertical runs, each shimmering in its own time.
          ctx.lineCap = "round";
          for (let y = hz + 6; y <= h + 10; y += 11) {
            const u = (y - hz) / (h - hz);
            const top = y - crest(y) + wall(y) * 5 * part;
            const a = 0.04 + 0.14 * Math.sin(f.t * 2.5 + y * 0.3) ** 2;
            const g = ctx.createLinearGradient(0, top, 0, y);
            g.addColorStop(0, f.ink(a * f.env * part, true));
            g.addColorStop(1, f.ink(0.04 * f.env * part, true));
            ctx.strokeStyle = g;
            ctx.lineWidth = 0.6 + 0.8 * u;
            ctx.beginPath();
            ctx.moveTo(edge(y) + side * 1, top + 4);
            ctx.lineTo(edge(y) + side * 1 + Math.sin(f.t + y) * 1.5, y - 2);
            ctx.stroke();
          }
          // The crest, foaming white along the top of the face.
          ctx.strokeStyle = f.ink(0.35 * f.env * part, true);
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          for (let y = hz; y <= h + 10; y += 8) ctx.lineTo(edge(y), y - crest(y) + wall(y) * 5 * part);
          ctx.stroke();
          const foam = f.dot(true);
          for (let y = hz; y <= h + 10; y += 10) {
            const r = 2 + ((y - hz) / (h - hz)) * 4;
            ctx.globalAlpha = 0.5 * f.env * part * (0.4 + 0.6 * Math.sin(f.t * 3 + y * 0.7) ** 2);
            ctx.drawImage(foam, edge(y) - r + Math.sin(y) * 3, y - crest(y) + wall(y) * 5 * part - r - 2, r * 2, r * 2);
          }
          ctx.globalAlpha = 1;
        }
        // Spray blown off the crests.
        const dot = f.dot(true);
        for (const sp of spray) {
          const u = drift(sp, f.t);
          const y = hz + sp.v * (h - hz);
          const top = y - crest(y);
          ctx.globalAlpha = 0.5 * f.env * part * Math.sin(Math.PI * u);
          ctx.drawImage(dot, cx + sp.side * (half(y) + 4 + u * 24) - 2, top - u * 30 - 2, 4, 4);
        }
        ctx.globalAlpha = 1;
      };
    },
  },
  {
    name: "fiery furnace",
    lane: "back",
    dur: [22, 36],
    themes: [
      "fire",
      "furnace",
      "flame",
      "flames",
      "walk through",
      "another in the fire",
      "not alone",
      "burn",
      "with me",
      "won't be burned",
      "stand",
      "through the fire",
      "fourth man",
      "three",
      "not consumed",
      "in the fire",
      "never alone",
      "shadrach",
      "daniel",
    ],
    make: (w, h, room) => {
      const S0 = Math.min(w, h) * 0.22;
      const { x, scale } = room.place(S0 * 2.2);
      const S = S0 * scale,
        floor = h * 0.84;
      const tongues = Array.from({ length: 16 }, () => ({ x: rnd(-0.95, 0.95), s: rnd(0.35, 0.7), p: rnd(0, TAU) }));
      const sparks = Array.from({ length: 30 }, () => ({ u: random(), x: rnd(-1, 1), s: rnd(0.12, 0.25), p: rnd(0, TAU) }));
      const layer = layering();
      return (f) => {
        const { ctx } = f;
        const roar = 0.85 + 0.15 * Math.sin(f.t * 1.3) + 0.08 * f.beat;
        const four = smooth(f.k * 3 - 0.6); // and the fourth is seen among them, like the Son of God
        // The heat and light of it, out over the floor.
        glow(ctx, x, floor - S * 0.6, S * 1.8, f.ink(0.26 * f.env * roar), f.ink(0));
        flatGlow(ctx, x, floor, S * 1.1, 2.6, 0.4, f.ink(0.3 * f.env * roar), f.ink(0));
        // The furnace mouth, a great arch of brick, dark; within it the fire, solid and bright, and
        // the four walking in the midst of it: three dark against the flame, and one shining.
        const { L, canvas } = layer(f);
        const tone = tones(f);
        L.translate(x, floor);
        L.scale(S, S);
        L.fillStyle = tone(0.3);
        L.beginPath();
        L.moveTo(-1.35, 0);
        L.lineTo(-1.35, -1.2);
        L.arc(0, -1.2, 1.35, Math.PI, 0);
        L.lineTo(1.35, 0);
        L.closePath();
        L.fill();
        L.strokeStyle = tone(0.2);
        L.lineWidth = 0.02;
        for (let i = 0; i < 8; i++) {
          L.beginPath();
          L.moveTo(-1.35, -i * 0.15);
          L.lineTo(1.35, -i * 0.15);
          L.stroke();
        }
        L.save();
        L.beginPath();
        L.moveTo(-1.05, 0);
        L.lineTo(-1.05, -1.0);
        L.arc(0, -1.0, 1.05, Math.PI, 0);
        L.lineTo(1.05, 0);
        L.closePath();
        L.clip();
        const fg = L.createLinearGradient(0, 0, 0, -2);
        fg.addColorStop(0, tone(1));
        fg.addColorStop(0.5, tone(0.75));
        fg.addColorStop(1, tone(0.45));
        L.fillStyle = fg;
        L.fillRect(-1.1, -2.1, 2.2, 2.2);
        // Tongues of flame rising within, as bright shapes over the glow.
        L.fillStyle = tone(1.2);
        for (const t of tongues) {
          const fl = 1 + 0.15 * Math.sin(f.t * 9 + t.p) + 0.1 * Math.sin(f.t * 17 + t.p * 2);
          const hgt = t.s * 2 * fl;
          const sway = Math.sin(f.t * 4 + t.p) * 0.1;
          L.beginPath();
          L.moveTo(t.x - 0.18, 0);
          L.bezierCurveTo(t.x - 0.2, -hgt * 0.4, t.x + sway - 0.05, -hgt * 0.8, t.x + sway, -hgt);
          L.bezierCurveTo(t.x + sway + 0.05, -hgt * 0.8, t.x + 0.2, -hgt * 0.4, t.x + 0.18, 0);
          L.fill();
        }
        // The three, walking in the midst of the fire, dark against it: head, shoulders and robe
        // to the floor, swaying with their step.
        [-0.55, -0.18, 0.6].forEach((px, i) => {
          const step = Math.sin(f.t * 1.4 + i) * 0.02;
          L.fillStyle = tone(0.12);
          L.save();
          L.beginPath();
          L.arc(px + step, -0.78, 0.085, 0, TAU);
          L.fill();
          L.beginPath();
          L.moveTo(px - 0.14 + step, -0.66);
          L.quadraticCurveTo(px + step, -0.72, px + 0.14 + step, -0.66);
          L.lineTo(px + 0.19 + step * 0.5, 0);
          L.lineTo(px - 0.19 + step * 0.5, 0);
          L.closePath();
          L.fill();
          L.restore();
        });
        L.restore();
        lay(f, canvas, 0.8 * f.env, S * 0.08);
        // Flames licking out of the mouth, and sparks.
        for (let i = 0; i < 6; i++) flame(f, x + (i - 2.5) * S * 0.36, floor + 2, S * (0.3 + (i % 3) * 0.12), i * 2.1, 0.5 * roar);
        const dot = f.dot();
        for (const s of sparks) {
          const u = drift(s, f.t);
          ctx.globalAlpha = f.env * (1 - u) * 0.8;
          ctx.drawImage(dot, x + s.x * S * (1 + u * 0.5) + Math.sin(f.t * 2 + s.p) * 6 - 2, floor - S * 1.2 - u * h * 0.35 - 2, 4, 4);
        }
        ctx.globalAlpha = 1;
        // The fourth, like the Son of God: a figure of light among them, taller, whose radiance
        // fills the furnace and spills out of its mouth.
        if (four > 0) {
          const fx = x + S * 0.2,
            step = Math.sin(f.t * 1.4 + 2) * 0.02 * S;
          glow(ctx, fx, floor - S * 0.5, S * 1.1, f.ink(0.22 * f.env * four * (0.92 + 0.08 * f.beat)), f.ink(0));
          glow(ctx, fx, floor - S * 0.85, S * 0.35, f.ink(0.3 * f.env * four), f.ink(0));
          ctx.save();
          ctx.translate(fx + step, floor);
          ctx.scale(S, S);
          ctx.shadowColor = f.ink(0.8 * f.env * four);
          ctx.shadowBlur = S * 0.25;
          ctx.fillStyle = f.ink(0.85 * f.env * four);
          ctx.beginPath();
          ctx.arc(0, -0.86, 0.09, 0, TAU);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(-0.15, -0.73);
          ctx.quadraticCurveTo(0, -0.8, 0.15, -0.73);
          ctx.lineTo(0.21, 0);
          ctx.lineTo(-0.21, 0);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          // Rays from him, faint, turning slowly.
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU + f.t * 0.05;
            beam(f, fx, floor - S * 0.5, fx + Math.cos(a) * S * 0.9, floor - S * 0.5 + Math.sin(a) * S * 0.9, 1.5, 0.12 * f.env * four);
          }
        }
      };
    },
  },
  {
    name: "dry bones",
    lane: "back",
    dur: [24, 40],
    themes: [
      "bones",
      "dry bones",
      "breath",
      "breathe",
      "live",
      "come alive",
      "rise",
      "army",
      "rattle",
      "valley",
      "dead",
      "awaken",
      "prophesy",
      "revive",
      "revival",
      "wake",
      "can these bones",
      "breath of god",
      "resurrection power",
      "dead things",
    ],
    make: (w, h) => {
      const floor = h * 0.8;
      const valley = ridge(h * 0.62, h * 0.1);
      // The bones, scattered over the valley floor: long bones most of them, with broken ribcages
      // among them; nearer the foot of the page, larger.
      const bones = Array.from({ length: 26 }, (_, i) => {
        const y = floor + rnd(-h * 0.04, h * 0.15);
        const near = (y - floor + h * 0.04) / (h * 0.19);
        return {
          kind: i < 7 ? "ribs" : "long",
          x: rnd(0.04, 0.96) * w,
          y,
          len: (26 + near * 30) * rnd(0.85, 1.15),
          a: rnd(-0.45, 0.45) + (random() < 0.3 ? 1.2 : 0) * rnd(0.5, 1),
          d: rnd(0, 1),
          p: rnd(0, TAU),
        };
      });
      // A long bone, in units of its length, along x: the shaft waisted in the middle, flaring
      // to the knobbed ends, each end two rounded condyles.
      const longBone = (G: CanvasRenderingContext2D) => {
        G.beginPath();
        G.moveTo(-0.4, -0.09);
        G.quadraticCurveTo(0, -0.03, 0.4, -0.09);
        G.lineTo(0.4, 0.09);
        G.quadraticCurveTo(0, 0.03, -0.4, 0.09);
        G.closePath();
        G.fill();
        for (const e of [-1, 1])
          for (const k of [-1, 1]) {
            G.beginPath();
            G.ellipse(e * 0.46, k * 0.075, 0.1, 0.085, e * k * 0.4, 0, TAU);
            G.fill();
          }
      };
      // A ribcage, broken: a piece of spine with ribs curving from it, some gone.
      const ribs = (G: CanvasRenderingContext2D) => {
        G.lineCap = "round";
        G.lineWidth = 0.06;
        G.beginPath();
        G.moveTo(-0.5, 0);
        G.lineTo(0.5, 0);
        G.stroke();
        G.lineWidth = 0.045;
        for (let i = 0; i < 6; i++) {
          if (i === 3) continue;
          const x = -0.42 + i * 0.17;
          G.beginPath();
          G.moveTo(x, 0);
          G.quadraticCurveTo(x + 0.08, 0.3, x - 0.08, 0.5);
          G.stroke();
        }
      };
      const wisps = Array.from({ length: 22 }, () => ({
        y: rnd(0.3, 0.9) * h,
        len: rnd(0.15, 0.35) * w,
        o: rnd(0, 1),
        from: random() < 0.5 ? 1 : -1,
      }));
      const layer = layering();
      return (f) => {
        const { ctx } = f;
        const breath = smooth(f.k * 3 - 1.0); // the four winds come
        const alive = smooth(f.k * 3 - 1.8); // and they live, and stand upon their feet
        // The valley's sides, dim.
        const vg = ctx.createLinearGradient(0, h * 0.45, 0, floor);
        vg.addColorStop(0, f.ink(0.07 * f.env, true));
        vg.addColorStop(1, f.ink(0.01 * f.env, true));
        ctx.fillStyle = vg;
        rangePath(ctx, valley, w, floor + 20);
        ctx.fill();
        // The breath, from the four winds: wisps sweeping in from both sides and over the floor.
        if (breath > 0) {
          ctx.lineCap = "round";
          for (const q of wisps) {
            const u = (q.o + f.t * 0.12) % 1;
            const head = q.from > 0 ? u * (w + q.len) - q.len : w - u * (w + q.len) + q.len;
            const g = ctx.createLinearGradient(head - q.from * q.len, 0, head, 0);
            g.addColorStop(0, f.ink(0, true));
            g.addColorStop(0.6, f.ink(0.22 * f.env * breath * Math.sin(Math.PI * u), true));
            g.addColorStop(1, f.ink(0, true));
            ctx.strokeStyle = g;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(head - q.from * q.len, q.y + Math.sin(f.t + q.o * 9) * 10);
            ctx.quadraticCurveTo(
              head - q.from * q.len * 0.5,
              q.y - 14 + Math.sin(f.t * 1.3 + q.o * 5) * 8,
              head,
              q.y + Math.sin(f.t * 0.8 + q.o * 7) * 10,
            );
            ctx.stroke();
          }
        }
        // The bones: lying scattered and very dry; then, as the breath passes, each stirs, lifts,
        // and the long bones stand upright, and all are clothed in light.
        const { L, canvas } = layer(f);
        const tone = tones(f);
        for (const b of bones) {
          const up = smooth((alive - b.d * 0.5) * 2.5);
          const stir = breath > 0 && up < 1 ? Math.sin(f.t * 12 + b.p) * 0.05 * breath * (1 - up) : 0;
          L.save();
          L.translate(b.x, b.y - up * b.len * 0.5);
          const k = 0.4 + 0.5 * up;
          // Shaded as old bone: pale on top, dim beneath.
          const g = L.createLinearGradient(0, -b.len * 0.12, 0, b.len * 0.12);
          g.addColorStop(0, tone(k + 0.25));
          g.addColorStop(1, tone(k - 0.1));
          L.fillStyle = g;
          L.strokeStyle = g;
          if (b.kind === "long") {
            L.rotate(b.a * (1 - up) + stir + (Math.PI / 2) * up);
            L.scale(b.len, b.len);
            longBone(L);
          } else {
            L.rotate(b.a * 0.5 + stir);
            L.scale(b.len * 0.9, b.len * 0.9);
            ribs(L);
          }
          L.restore();
        }
        lay(f, canvas, 0.6 * f.env, 4);
        // Standing, each is a light: an exceeding great army.
        for (const b of bones) {
          const up = smooth((alive - b.d * 0.5) * 2.5);
          if (up <= 0.5) continue;
          const a = (up - 0.5) * 2;
          glow(ctx, b.x, b.y - b.len * 0.5, b.len * 1.1, f.ink(0.2 * f.env * a * (0.85 + 0.15 * Math.sin(f.t * 1.5 + b.p))), f.ink(0));
          beam(f, b.x, b.y - b.len * 1.2, b.x, b.y + 4, 2.5, 0.35 * f.env * a);
        }
        if (alive > 0) glow(ctx, w / 2, h * 0.3, w * 0.5, f.ink(0.1 * f.env * alive), f.ink(0));
      };
    },
  },
  {
    name: "prison doors",
    lane: "back",
    dur: [22, 36],
    themes: [
      "prison",
      "chains",
      "midnight",
      "set free",
      "free",
      "praise",
      "sing",
      "doors",
      "open",
      "break",
      "shackles",
      "captive",
      "liberty",
      "walls shake",
      "shake",
      "foundations",
      "paul and silas",
      "every door",
      "cell",
      "the enemy",
      "locked",
      "unlock",
    ],
    make: (w, h, room) => {
      const H0 = Math.min(h * 0.34, w * 0.2);
      const { x, scale } = room.place(H0 * 1.3);
      const H = H0 * scale,
        foot = h * 0.8,
        dw = H * 0.5;
      const hinge = x - dw / 2,
        spring = foot - H + dw / 2;
      const layer = layering();
      return (f) => {
        const { ctx } = f;
        const quake = smooth(f.k * 4 - 1.2) * (1 - smooth(f.k * 4 - 2.2)); // the earth shakes
        const open = smooth(f.k * 3 - 1.4); // every door is opened
        const jolt = quake * Math.sin(f.t * 30) * 4;
        const phi = open * 1.3;
        // Light beyond the open door, spilling into the cell and across its floor.
        const gap = dw * (1 - Math.cos(phi));
        if (open > 0) {
          glow(ctx, x, foot - H * 0.45, H * 0.9, f.ink(0.1 * f.env * open), f.ink(0));
          const sg = ctx.createLinearGradient(0, foot, 0, h);
          sg.addColorStop(0, f.ink(0.1 * f.env * open));
          sg.addColorStop(1, f.ink(0));
          ctx.fillStyle = sg;
          ctx.beginPath();
          ctx.moveTo(hinge + dw - gap, foot);
          ctx.lineTo(hinge + dw, foot);
          ctx.lineTo(hinge + dw + dw * 2.5, h);
          ctx.lineTo(hinge + dw - gap - dw * 2, h);
          ctx.fill();
        }
        const { L, canvas } = layer(f);
        const tone = tones(f);
        L.translate(jolt, jolt * 0.3);
        // The wall of the cell about the doorway, its blocks.
        L.fillStyle = tone(0.14);
        L.fillRect(x - H * 0.9, foot - H * 1.25, H * 1.8, H * 1.25);
        L.strokeStyle = tone(0.08);
        L.lineWidth = 1.5;
        for (let i = 0; i < 9; i++) {
          L.beginPath();
          L.moveTo(x - H * 0.9, foot - i * H * 0.14);
          L.lineTo(x + H * 0.9, foot - i * H * 0.14);
          L.stroke();
        }
        // The doorway, the light within it (once open) and its stone frame.
        L.fillStyle = tone(0.6 * open + 0.05);
        L.beginPath();
        L.moveTo(hinge, foot);
        L.lineTo(hinge, spring);
        L.arc(x, spring, dw / 2, Math.PI, 0);
        L.lineTo(hinge + dw, foot);
        L.fill();
        L.strokeStyle = tone(0.3);
        L.lineWidth = H * 0.03;
        L.beginPath();
        L.moveTo(hinge, foot);
        L.lineTo(hinge, spring);
        L.arc(x, spring, dw / 2, Math.PI, 0);
        L.lineTo(hinge + dw, foot);
        L.stroke();
        // The barred door, swinging open on its hinge towards us: its bars and crosspieces.
        const eye = foot - H * 0.45;
        const turn = (px: number, py: number): [number, number] => {
          const u = (px - hinge) / dw;
          const s = 1 / (1 - u * Math.sin(phi) * 0.3);
          return [hinge + u * dw * Math.cos(phi), eye + (py - eye) * s];
        };
        L.strokeStyle = tone(0.42);
        L.lineCap = "round";
        L.lineWidth = H * 0.025;
        for (let i = 0; i <= 5; i++) {
          const px = hinge + (i / 5) * dw;
          const top = i === 0 || i === 5 ? spring : spring - Math.sqrt(Math.max(0, (dw / 2) ** 2 - (px - x) ** 2));
          L.beginPath();
          L.moveTo(...turn(px, foot));
          L.lineTo(...turn(px, top));
          L.stroke();
        }
        for (const py of [spring, foot - H * 0.45, foot - H * 0.1]) {
          L.beginPath();
          L.moveTo(...turn(hinge, py));
          L.lineTo(...turn(hinge + dw, py));
          L.stroke();
        }
        lay(f, canvas, 0.4 * f.env, 3);
        // Midnight: a little light before the song, much after it.
        glow(ctx, x, foot - H * 1.3, H * 0.4, f.ink(0.04 * f.env), f.ink(0));
      };
    },
  },
  {
    name: "key",
    lane: "pass",
    dur: [13, 20],
    themes: [
      "key",
      "keys",
      "keys of the kingdom",
      "unlock",
      "open",
      "open door",
      "doors",
      "set free",
      "free",
      "freedom",
      "loosed",
      "release",
      "authority",
      "bind",
      "chains",
    ],
    // The keys of the kingdom: an old iron key (pictures/key-bitmap.ts), in the artwork's colour.
    make: photo(KEY_BITMAP, 0.55),
  },
  {
    name: "five smooth stones",
    lane: "pass",
    dur: [12, 18],
    themes: [
      "stone",
      "stones",
      "giant",
      "giants",
      "goliath",
      "david",
      "battle",
      "fight my battles",
      "the battle",
      "victory",
      "sling",
      "brook",
      "not by might",
      "small",
      "fear",
      "stand",
      "defeat",
      "enemy",
      "face my",
      "slay",
    ],
    make: (w, h, room) => {
      const S0 = Math.min(w, h) * 0.05;
      const { x, scale } = room.place(S0 * 8);
      const S = S0 * scale,
        y = h * 0.72;
      // Pebbles, worn smooth and flat by the brook: each its own rounded shape, a little
      // lopsided, lying flat; and the flecks in its stone.
      const stones = Array.from({ length: 5 }, (_, i) => ({
        x: (i - 2) * S * 1.5 + rnd(-0.2, 0.2) * S,
        y: rnd(-0.3, 0.3) * S,
        rx: S * rnd(0.6, 0.75),
        ry: S * rnd(0.3, 0.4),
        a: rnd(-0.4, 0.4),
        bumps: [rnd(0, TAU), rnd(0.03, 0.08), rnd(0, TAU), rnd(0.02, 0.05)],
        flecks: Array.from({ length: 6 }, () => [rnd(-0.6, 0.6), rnd(-0.5, 0.5), rnd(0.03, 0.07)] as const),
      }));
      const glints = Array.from({ length: 30 }, () => ({ x: rnd(-6, 6), y: rnd(-0.8, 1.2), p: rnd(0, TAU), l: rnd(6, 16) }));
      const chosen = Math.floor(rnd(0, 5));
      const layer = layering();
      return (f) => {
        const { ctx } = f;
        // The brook, running past, with the light on it.
        const bg = ctx.createLinearGradient(0, y - S * 1.5, 0, y + S * 2);
        bg.addColorStop(0, f.ink(0, true));
        bg.addColorStop(0.5, f.ink(0.1 * f.env, true));
        bg.addColorStop(1, f.ink(0, true));
        ctx.fillStyle = bg;
        ctx.fillRect(0, y - S * 1.5, w, S * 3.5);
        for (const g of glints) {
          const gx = x + g.x * S + ((f.t * 30 + g.p * 40) % (S * 14)) - S * 7,
            gy = y + g.y * S;
          beam(f, gx - g.l, gy, gx + g.l, gy, 1, 0.3 * f.env * Math.sin(f.t * 2 + g.p) ** 2);
        }
        const take = smooth(f.k * 3 - 1.5); // one is chosen and taken up
        const { L, canvas } = layer(f);
        const tone = tones(f);
        L.translate(x, y);
        stones.forEach((s, i) => {
          const lift = i === chosen ? take : 0;
          L.save();
          L.translate(s.x, s.y - lift * S * 2.2);
          L.rotate(s.a + lift * 0.8);
          // Its shape: an oval with a gentle unevenness, as a river pebble has; shaded softly,
          // lighter where the light falls on its top, with no gloss.
          const g = L.createLinearGradient(-s.rx * 0.5, -s.ry, s.rx * 0.3, s.ry);
          g.addColorStop(0, tone(0.72 + 0.3 * lift));
          g.addColorStop(0.6, tone(0.5 + 0.2 * lift));
          g.addColorStop(1, tone(0.3));
          L.fillStyle = g;
          L.beginPath();
          for (let j = 0; j <= 40; j++) {
            const t = (j / 40) * TAU;
            const k = 1 + s.bumps[1] * Math.sin(t * 2 + s.bumps[0]) + s.bumps[3] * Math.sin(t * 3 + s.bumps[2]);
            const px = Math.cos(t) * s.rx * k,
              py = Math.sin(t) * s.ry * k;
            if (j) L.lineTo(px, py);
            else L.moveTo(px, py);
          }
          L.closePath();
          L.fill();
          // The flecks in the stone.
          L.fillStyle = tone(0.4 + 0.2 * lift);
          for (const [fx, fy, fr] of s.flecks) {
            L.beginPath();
            L.ellipse(fx * s.rx, fy * s.ry, fr * s.rx, fr * s.rx * 0.6, 0, 0, TAU);
            L.fill();
          }
          L.restore();
        });
        lay(f, canvas, 0.8 * f.env, S * 0.2);
        // The water lapping about them; the chosen one shining as it is held up.
        for (const s of stones) {
          ctx.strokeStyle = f.ink(0.2 * f.env, true);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(x + s.x, y + s.y + s.ry * 0.6, s.rx * (1.2 + 0.1 * Math.sin(f.t * 2 + s.x)), s.ry * 0.4, 0, 0, Math.PI);
          ctx.stroke();
        }
        if (take > 0) {
          const s = stones[chosen];
          glow(ctx, x + s.x, y + s.y - take * S * 2.2, S * 1.8, f.ink(0.3 * f.env * take * (0.9 + 0.1 * f.beat)), f.ink(0));
        }
      };
    },
  },
  {
    name: "peace be still",
    lane: "back",
    dur: [24, 40],
    themes: [
      "peace",
      "still",
      "storm",
      "waves",
      "wind",
      "calm",
      "be still",
      "speak",
      "the storm",
      "quiet",
      "fear not",
      "do not fear",
      "rest",
      "my soul",
      "anxious",
      "troubled",
      "raging",
      "sea",
      "stills",
      "it is well",
      "hush",
      "silence",
    ],
    make: (w, h) => {
      const sea = h * 0.6;
      const spray = Array.from({ length: 40 }, () => ({ x: rnd(0, 1), p: rnd(0, TAU), s: rnd(0.5, 1) }));
      return (f) => {
        const { ctx } = f;
        const calm = smooth(f.k * 2.2 - 0.5); // the wind ceases, and there is a great calm
        const rough = 1 - calm;
        const amp = (6 + 34 * rough) * (0.6 + 0.4 * Math.sin(f.t * 0.6));
        const wave = (x: number, i: number, t: number) =>
          Math.sin(x * 0.008 + t * (0.4 + 0.7 * rough) + i) * amp +
          Math.sin(x * 0.021 - t * (0.55 + 0.7 * rough) + i * 2) * amp * 0.45 +
          Math.sin(x * 0.05 + t * 1.5 * rough) * amp * 0.12 * rough;
        // The sky: dark and driving while the storm is on, then light breaking through.
        glow(ctx, w * 0.5, sea - h * 0.2, w * 0.5, f.ink(0.3 * f.env * calm), f.ink(0));
        if (rough > 0) {
          ctx.lineCap = "round";
          for (let i = 0; i < 12; i++) {
            const u = (i / 12 + f.t * 0.07) % 1;
            const px = u * (w + 200) - 100,
              py = h * 0.1 + (i % 4) * h * 0.1;
            const g = ctx.createLinearGradient(px, py, px + 160, py + 30);
            g.addColorStop(0, f.ink(0, true));
            g.addColorStop(0.5, f.ink(0.18 * f.env * rough, true));
            g.addColorStop(1, f.ink(0, true));
            ctx.strokeStyle = g;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.quadraticCurveTo(px + 80, py + 25, px + 160, py + 30);
            ctx.stroke();
          }
        }
        // The water: swells, nearer ones lower and brighter; spray off their crests while it rages.
        for (let i = 0; i < 7; i++) {
          const y0 = sea + i * i * 7;
          const g = ctx.createLinearGradient(0, y0 - amp, 0, y0 + 60);
          g.addColorStop(0, f.ink((0.12 + i * 0.03) * f.env, true));
          g.addColorStop(1, f.ink(0.01 * f.env, true));
          ctx.fillStyle = g;
          rangePath(ctx, (x) => y0 + wave(x, i, f.t) * (0.5 + i * 0.15), w, h + 10, 0, 10);
          ctx.fill();
        }
        const dot = f.dot(true);
        for (const s of spray) {
          const u = (s.x + f.t * 0.03 * s.s) % 1;
          const x = u * w,
            crest = sea + 49 + wave(x, 7, f.t) * 1.5;
          const fly = Math.max(0, Math.sin(f.t * 1.5 * s.s + s.p));
          ctx.globalAlpha = 0.45 * f.env * rough * fly;
          ctx.drawImage(dot, x - 2, crest - fly * 30 * rough - 2, 4, 4);
        }
        ctx.globalAlpha = 1;
        // Calm: the light's path on the still water.
        if (calm > 0) {
          const cx = w * 0.5;
          const pg = ctx.createLinearGradient(0, sea, 0, h);
          pg.addColorStop(0, f.ink(0.2 * f.env * calm));
          pg.addColorStop(1, f.ink(0.02 * f.env * calm));
          ctx.fillStyle = pg;
          ctx.beginPath();
          ctx.moveTo(cx - w * 0.04, sea);
          ctx.lineTo(cx + w * 0.04, sea);
          ctx.lineTo(cx + w * 0.22, h);
          ctx.lineTo(cx - w * 0.22, h);
          ctx.fill();
          for (let i = 0; i < 10; i++) {
            const gy = sea + 20 + i * ((h - sea) / 10);
            const gl = 10 + i * 6;
            beam(
              f,
              cx - gl + Math.sin(f.t + i) * 6,
              gy,
              cx + gl + Math.sin(f.t + i) * 6,
              gy,
              1,
              0.3 * f.env * calm * Math.sin(f.t * 1.5 + i) ** 2,
            );
          }
        }
      };
    },
  },
  {
    name: "shield of faith",
    lane: "pass",
    dur: [13, 20],
    themes: [
      "shield",
      "faith",
      "battle",
      "armor",
      "armour",
      "protect",
      "defend",
      "refuge",
      "fortress",
      "strong",
      "fiery darts",
      "arrows",
      "stand",
      "warrior",
      "surround",
      "enemy",
      "defender",
      "cover",
      "hide me",
      "strong tower",
      "shelter",
      "safe",
    ],
    make: (w, h, room) => {
      const S0 = Math.min(w, h) * 0.14;
      const { x, scale } = room.place(S0 * 2.6);
      const S = S0 * scale,
        y = h * rnd(0.42, 0.55);
      const side = x < w / 2 ? 1 : -1; // the darts come from the middle of the page
      const darts = Array.from({ length: 9 }, (_, i) => ({ at: 0.25 + i * 0.075 + rnd(0, 0.03), y: rnd(-0.7, 0.7), p: rnd(0, TAU) }));
      const layer = layering();
      return (f) => {
        const { ctx } = f;
        const up = smooth(f.k * 2.4);
        const { L, canvas } = layer(f);
        const tone = tones(f);
        L.translate(x, y + (1 - up) * 30);
        L.scale(S, S);
        // Turned a little towards the darts, so its face is seen foreshortened and tilted to meet them.
        L.rotate(-side * 0.1);
        L.scale(0.86, 1);
        L.translate(side * 0.08, 0);
        // A heater shield, solid, its face curved: rim, field and a cross.
        const face = L.createLinearGradient(-1, -1, 1, 1);
        face.addColorStop(0, tone(0.5));
        face.addColorStop(0.5, tone(0.35));
        face.addColorStop(1, tone(0.22));
        const shield = (k: number) => {
          L.beginPath();
          L.moveTo(-1 * k, -1 * k);
          L.lineTo(1 * k, -1 * k);
          L.lineTo(1 * k, 0.1 * k);
          L.quadraticCurveTo(1 * k, 1.1 * k, 0, 1.4 * k);
          L.quadraticCurveTo(-1 * k, 1.1 * k, -1 * k, 0.1 * k);
          L.closePath();
        };
        L.fillStyle = tone(0.55);
        shield(1);
        L.fill();
        L.fillStyle = face;
        shield(0.9);
        L.fill();
        L.fillStyle = tone(0.65);
        L.fillRect(-0.09, -0.7, 0.18, 1.6);
        L.fillRect(-0.6, -0.35, 1.2, 0.18);
        lay(f, canvas, 0.55 * f.env, S * 0.08);
        glow(ctx, x, y, S * 1.8, f.ink(0.04 * f.env * up * (0.9 + 0.1 * f.beat)), f.ink(0));
        // The fiery darts of the wicked: each flies in, strikes the shield, and is quenched.
        for (const d of darts) {
          const q = (f.k - d.at) / 0.05;
          if (q <= 0 || q >= 1.6) continue;
          const dy = y + d.y * S;
          if (q < 1) {
            const sx = x + side * (w * 0.6 - (w * 0.6 - S * 1.05) * q),
              len = 40;
            const g = ctx.createLinearGradient(sx + side * len, dy, sx, dy);
            g.addColorStop(0, f.ink(0));
            g.addColorStop(1, f.ink(0.7 * f.env));
            ctx.strokeStyle = g;
            ctx.lineWidth = 2;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(sx + side * len, dy);
            ctx.lineTo(sx, dy);
            ctx.stroke();
            glow(ctx, sx, dy, 10, f.ink(0.6 * f.env), f.ink(0));
          } else {
            // Quenched: a flash on the face, dying.
            const qq = (q - 1) / 0.6;
            glow(ctx, x + side * S * 1.0, dy, S * 0.6 * (1 + qq), f.ink(0.5 * f.env * (1 - qq) ** 2), f.ink(0));
          }
        }
      };
    },
  },
  {
    name: "helmet",
    lane: "pass",
    dur: [13, 20],
    themes: [
      "helmet",
      "helmet of salvation",
      "armour",
      "armor",
      "armour of god",
      "put on",
      "stand",
      "battle",
      "warfare",
      "salvation",
      "soldier",
      "strong in the lord",
      "fight",
      "victory",
      "the full armour",
    ],
    // The helmet of salvation: a close-helmet (pictures/helmet-bitmap.ts), in the artwork's colour.
    make: photo(HELMET_BITMAP, 0.5),
  },
  {
    name: "breastplate",
    lane: "pass",
    dur: [13, 20],
    themes: [
      "breastplate",
      "righteousness",
      "breastplate of righteousness",
      "armour",
      "armor",
      "armour of god",
      "put on",
      "stand",
      "clothed",
      "battle",
      "warfare",
      "guard my heart",
      "heart",
      "stand firm",
      "the full armour",
    ],
    // The breastplate of righteousness: a steel breastplate etched with a star
    // (pictures/breastplate-bitmap.ts), in the artwork's colour.
    make: photo(BREASTPLATE_BITMAP, 0.5),
  },
];
