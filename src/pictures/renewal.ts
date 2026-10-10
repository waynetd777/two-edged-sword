// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Healing and new life: the waterfall, the potter's wheel, streams in the desert, the well, the
// garden, the table, new wine, the rock of ages, the net full of fish, manna.

import {
  beam,
  drift,
  flame,
  flatGlow,
  glow,
  lay,
  layering,
  photo,
  random,
  rangePath,
  ridge,
  ripples,
  rnd,
  smooth,
  TAU,
  tones,
  Vision,
} from "./kit";
import { WATER_JAR_BITMAP } from "./water-jar-bitmap";

export const RENEWAL: Vision[] = [
  {
    name: "waterfall",
    lane: "back",
    dur: [24, 40],
    themes: [
      "waterfall",
      "deep calls",
      "deep",
      "flood",
      "pour",
      "overwhelm",
      "rushing",
      "wash over",
      "waters",
      "roar",
      "many waters",
      "power",
      "fall",
      "abundant",
      "overflow",
      "cascade",
      "river",
      "deep unto deep",
      "mighty waters",
    ],
    make: (w, h, room) => {
      const S0 = Math.min(w, h) * 0.2;
      const { x, scale } = room.place(S0 * 2);
      const S = S0 * scale,
        lip = h * 0.22,
        pool = h * 0.82;
      const streams = Array.from({ length: 36 }, () => ({
        x: rnd(-1, 1),
        v: rnd(0.5, 0.9),
        o: random(),
        a: rnd(0.3, 1),
        wd: rnd(1, 3),
      }));
      const mist = Array.from({ length: 40 }, () => ({
        u: random(),
        x: rnd(-1.6, 1.6),
        s: rnd(0.05, 0.12),
        p: rnd(0, TAU),
        r: rnd(8, 20),
      }));
      const rings: { t: number; x: number }[] = [];
      let next = 0;
      const cliff = ridge(0, 1);
      return (f) => {
        const { ctx } = f;
        const flow = smooth(f.k * 2);
        // The rock face either side of the fall, and the lip it comes over.
        const rg = ctx.createLinearGradient(0, lip, 0, pool);
        rg.addColorStop(0, f.ink(0.1 * f.env));
        rg.addColorStop(1, f.ink(0.02 * f.env));
        ctx.fillStyle = rg;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(x + side * S * 1.05, lip - 10);
          for (let y = lip; y <= pool; y += 10) ctx.lineTo(x + side * (S * 1.05 + cliff(y) * S * 0.12 + (y - lip) * 0.1), y);
          ctx.lineTo(x + side * w * 0.5, pool);
          ctx.lineTo(x + side * w * 0.5, lip - 10);
          ctx.fill();
        }
        // The fall: streams of water, each its own brightness and speed, down to the pool.
        ctx.lineCap = "butt";
        for (const s of streams) {
          const sx = x + s.x * S;
          const g = ctx.createLinearGradient(0, lip, 0, pool);
          const o = (s.o + f.t * s.v * 0.5) % 1;
          g.addColorStop(0, f.ink(0.15 * s.a * f.env * flow, true));
          g.addColorStop(Math.max(0.01, o - 0.01), f.ink(0.15 * s.a * f.env * flow, true));
          g.addColorStop(o, f.ink(0.42 * s.a * f.env * flow, true));
          g.addColorStop(Math.min(0.99, o + 0.12), f.ink(0.15 * s.a * f.env * flow, true));
          g.addColorStop(1, f.ink(0.3 * s.a * f.env * flow, true));
          ctx.strokeStyle = g;
          ctx.lineWidth = s.wd;
          ctx.beginPath();
          ctx.moveTo(sx, lip);
          ctx.quadraticCurveTo(sx + Math.sin(f.t * 2 + s.o * 9) * 3, (lip + pool) / 2, sx + Math.sin(f.t + s.o * 5) * 2, pool);
          ctx.stroke();
        }
        beam(f, x - S, lip, x + S, lip, 2, 0.3 * f.env * flow);
        // The pool, the plunge churning white, mist rising, rings spreading.
        flatGlow(ctx, x, pool, S * 0.9, 2.4, 0.5, f.ink(0.4 * f.env * flow, true), f.ink(0, true));
        const dot = f.dot(true);
        for (const m of mist) {
          const u = drift(m, f.t);
          const r = m.r * (0.5 + u);
          ctx.globalAlpha = 0.14 * f.env * flow * Math.sin(Math.PI * u);
          ctx.drawImage(dot, x + m.x * S * (0.6 + u * 0.6) + Math.sin(f.t + m.p) * 8 - r, pool - u * S * 1.6 - r, r * 2, r * 2);
        }
        ctx.globalAlpha = 1;
        if (flow > 0.5 && f.t >= next) {
          rings.push({ t: f.t, x: x + rnd(-1.4, 1.4) * S });
          next = f.t + rnd(0.25, 0.6);
        }
        for (let i = rings.length - 1; i >= 0; i--) {
          const q = (f.t - rings[i].t) / 2.5;
          if (q >= 1) rings.splice(i, 1);
          else ripples(f, rings[i].x, pool + 8, q, S * 0.8, 0.3);
        }
      };
    },
  },
  {
    name: "potter's wheel",
    lane: "pass",
    dur: [14, 22],
    themes: [
      "potter",
      "clay",
      "mold",
      "mould",
      "shape",
      "make",
      "make me",
      "have your way",
      "form",
      "vessel",
      "hands",
      "yours",
      "shape me",
      "break me",
      "surrender",
      "remake",
      "fashion",
      "in your hands",
      "masterpiece",
      "work in me",
    ],
    make: (w, h, room) => {
      const S0 = Math.min(w, h) * 0.12;
      const { x, scale } = room.place(S0 * 3);
      const S = S0 * scale,
        y = h * 0.66;
      const layer = layering();
      return (f) => {
        const { ctx } = f;
        const form = smooth(f.k * 1.6); // from a lump to a vessel
        const spin = f.t * 1.6;
        glow(ctx, x, y - S * 0.8, S * 2.2, f.ink(0.12 * f.env), f.ink(0));
        const { L, canvas } = layer(f);
        const tone = tones(f);
        L.translate(x, y);
        L.scale(S, S);
        // The wheel: a thick disc turning, its rim's marks going round.
        const wg = L.createLinearGradient(-1.3, 0, 1.3, 0);
        wg.addColorStop(0, tone(0.3));
        wg.addColorStop(0.5, tone(0.6));
        wg.addColorStop(1, tone(0.3));
        L.fillStyle = wg;
        L.beginPath();
        L.ellipse(0, 0.12, 1.3, 0.3, 0, 0, Math.PI);
        L.lineTo(-1.3, 0);
        L.ellipse(0, 0, 1.3, 0.3, 0, Math.PI, 0, true);
        L.fill();
        L.fillStyle = tone(0.45);
        L.beginPath();
        L.ellipse(0, 0, 1.3, 0.3, 0, 0, TAU);
        L.fill();
        // The clay, rising under the hands: its profile, from a low lump to a vase with a neck and
        // lip, drawn as a solid of revolution with the rings of the fingers going round it.
        const prof = (u: number) => {
          // u: 0 at the foot, 1 at the top; the radius at that height.
          const lump = 0.55 * Math.sqrt(Math.max(0, 1 - u * u)) + 0.05;
          // A tall vase: a foot, a full belly low down swelling and tapering smoothly into a long
          // neck, and a lip flaring at the top.
          const belly = 0.42 * Math.exp(-(((u - 0.28) / 0.24) ** 2));
          const lip = 0.1 * smooth((u - 0.86) / 0.14);
          const vase = 0.15 + belly + lip;
          return lump + (vase - lump) * form;
        };
        const H = 0.45 + 1.7 * form;
        const n = 30;
        const cg = L.createLinearGradient(-0.7, 0, 0.7, 0);
        cg.addColorStop(0, tone(0.35));
        cg.addColorStop(0.4, tone(0.8));
        cg.addColorStop(1, tone(0.3));
        // Its shadow on the wheel, where it sits.
        L.fillStyle = tone(0.28);
        L.beginPath();
        L.ellipse(0.03, 0.03, prof(0) * 1.3, prof(0) * 0.34, 0, 0, TAU);
        L.fill();
        // The body: up one side, over the top, down the other, and round the foot's curve, so
        // it stands on the wheel's surface.
        L.fillStyle = cg;
        L.beginPath();
        for (let i = 0; i <= n; i++) {
          const u = i / n;
          L.lineTo(-prof(u), -u * H);
        }
        for (let i = n; i >= 0; i--) {
          const u = i / n;
          L.lineTo(prof(u), -u * H);
        }
        L.ellipse(0, 0, prof(0), prof(0) * 0.24, 0, 0, Math.PI);
        L.closePath();
        L.fill();
        // The foot's edge, a little darker where it meets the wheel.
        L.strokeStyle = tone(0.3);
        L.lineWidth = 0.012;
        L.beginPath();
        L.ellipse(0, 0, prof(0), prof(0) * 0.24, 0, 0, Math.PI);
        L.stroke();
        L.fillStyle = tone(0.5);
        L.beginPath();
        L.ellipse(0, -H, prof(1), prof(1) * 0.25, 0, 0, TAU);
        L.fill();
        L.fillStyle = tone(0.2);
        L.beginPath();
        L.ellipse(0, -H, prof(1) * 0.75 * form + 0.02, prof(1) * 0.18 * form + 0.01, 0, 0, TAU);
        L.fill();
        L.strokeStyle = tone(0.55);
        L.lineWidth = 0.012;
        for (let i = 1; i < 16; i++) {
          const u = i / 16;
          L.beginPath();
          L.ellipse(0, -u * H, prof(u), prof(u) * 0.22, 0, 0.1, Math.PI - 0.1);
          L.stroke();
        }
        lay(f, canvas, 0.85 * f.env, S * 0.12);
        // A gleam on the wet clay, going round with the wheel.
        const ga = 0.5 + 0.5 * Math.sin(spin);
        glow(ctx, x - S * 0.3, y - S * H * 0.5, S * 0.5, f.ink(0.12 * f.env * ga), f.ink(0));
      };
    },
  },
  {
    name: "desert blooms",
    lane: "back",
    dur: [24, 40],
    themes: [
      "desert",
      "wilderness",
      "dry",
      "stream",
      "streams in the desert",
      "bloom",
      "blossom",
      "dry land",
      "new thing",
      "way in the wilderness",
      "thirst",
      "barren",
      "spring",
      "rivers in the desert",
      "parched",
      "dry place",
      "wasteland",
      "flourish",
      "rose of sharon",
    ],
    make: (w, h, room) => {
      const cx = room.place(w * 0.3).x,
        hz = h * 0.56;
      const dunes = [0.6, 0.72, 0.85].map((b, i) => ({ y: ridge(h * b, h * (0.06 - i * 0.01)), a: 0.1 + i * 0.03 }));
      const p = rnd(0, TAU);
      const mid = (y: number) => cx + Math.sin(y * 0.014 + p) * w * 0.1 * ((y - hz) / (h - hz));
      const half = (y: number) => 2 + ((y - hz) / (h - hz)) ** 1.5 * w * 0.09;
      const plants = Array.from({ length: 34 }, () => ({
        u: rnd(0.15, 1),
        side: random() < 0.5 ? -1 : 1,
        off: rnd(1.1, 2.6),
        s: rnd(10, 22),
        d: rnd(0, 1),
        kind: Math.floor(rnd(0, 3)),
        p: rnd(0, TAU),
      }));
      return (f) => {
        const { ctx } = f;
        const water = smooth(f.k * 2.2 - 0.2);
        const bloom = smooth(f.k * 2.2 - 0.9);
        // The sand, in ranges, warm; the heat of the sky over it.
        glow(ctx, cx, hz, w * 0.4, f.ink(0.12 * f.env), f.ink(0));
        for (const d of dunes) {
          const g = ctx.createLinearGradient(0, h * 0.45, 0, h);
          g.addColorStop(0, f.ink(d.a * f.env));
          g.addColorStop(1, f.ink(0.01 * f.env));
          ctx.fillStyle = g;
          rangePath(ctx, d.y, w, h);
          ctx.fill();
        }
        // The stream, breaking out and running towards us through the sand.
        const reach = hz + (h - hz + 10) * water;
        if (water > 0) {
          const sg = ctx.createLinearGradient(0, hz, 0, h);
          sg.addColorStop(0, f.ink(0.3 * f.env, true));
          sg.addColorStop(1, f.ink(0.12 * f.env, true));
          ctx.fillStyle = sg;
          ctx.beginPath();
          for (let y = hz; y < reach; y += 6) ctx.lineTo(mid(y) - half(y), y);
          ctx.lineTo(mid(reach) - half(reach), reach);
          ctx.lineTo(mid(reach) + half(reach), reach);
          for (let y = reach; y >= hz; y -= 6) ctx.lineTo(mid(y) + half(y), y);
          ctx.fill();
          glow(ctx, mid(hz), hz, h * 0.1, f.ink(0.3 * f.env * water, true), f.ink(0, true));
          const dot = f.dot(true);
          for (let i = 0; i < 24; i++) {
            const u = ((i / 24 + f.t * 0.06) % 1) * water;
            const y = hz + (h - hz) * u;
            ctx.globalAlpha = 0.6 * f.env * Math.sin(Math.PI * u);
            ctx.drawImage(dot, mid(y) + Math.sin(i * 7) * half(y) * 0.7 - 2, y - 1.5, 4, 3);
          }
          ctx.globalAlpha = 1;
        }
        // Along its banks, the desert blossoms: grasses, then flowers, each where the water has come.
        for (const pl of plants) {
          const y = hz + (h - hz) * pl.u;
          if (y > reach) continue;
          const grow = smooth((bloom - pl.d * 0.4) * 1.8) * smooth((reach - y) / 90);
          if (grow <= 0) continue;
          const x = mid(y) + pl.side * half(y) * pl.off;
          const s = pl.s * grow * (0.6 + 0.4 * pl.u);
          const sway = Math.sin(f.t * 1.2 + pl.p) * 0.08;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(sway);
          ctx.strokeStyle = f.ink(0.3 * f.env, true);
          ctx.lineWidth = 1.2;
          ctx.lineCap = "round";
          if (pl.kind === 0) {
            // A tuft of grass.
            for (let i = -2; i <= 2; i++) {
              ctx.beginPath();
              ctx.moveTo(0, 0);
              ctx.quadraticCurveTo(i * s * 0.2, -s * 0.6, i * s * 0.45, -s * (0.8 + Math.abs(i) * 0.05));
              ctx.stroke();
            }
          } else {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(s * 0.1, -s * 0.6, 0, -s * 1.2);
            ctx.stroke();
            ctx.fillStyle = f.ink(0.2 * f.env, true);
            ctx.beginPath();
            ctx.ellipse(s * 0.25, -s * 0.5, s * 0.25, s * 0.1, -0.5, 0, TAU);
            ctx.fill();
            // The flower: a ring of petals open to the light, or a cup.
            const open = smooth(grow * 1.3 - 0.3);
            ctx.fillStyle = f.ink(0.45 * f.env * open);
            if (pl.kind === 1) {
              for (let i = 0; i < 6; i++) {
                const a = (i / 6) * TAU;
                ctx.beginPath();
                ctx.ellipse(
                  Math.cos(a) * s * 0.22 * open,
                  -s * 1.2 + Math.sin(a) * s * 0.22 * open,
                  s * 0.16 * open,
                  s * 0.09 * open,
                  a,
                  0,
                  TAU,
                );
                ctx.fill();
              }
              ctx.fillStyle = f.ink(0.7 * f.env * open);
              ctx.beginPath();
              ctx.arc(0, -s * 1.2, s * 0.08 * open, 0, TAU);
              ctx.fill();
            } else {
              ctx.beginPath();
              ctx.moveTo(-s * 0.2 * open, -s * 1.2);
              ctx.quadraticCurveTo(-s * 0.28 * open, -s * 1.5, -s * 0.15 * open, -s * 1.55);
              ctx.lineTo(s * 0.15 * open, -s * 1.55);
              ctx.quadraticCurveTo(s * 0.28 * open, -s * 1.5, s * 0.2 * open, -s * 1.2);
              ctx.closePath();
              ctx.fill();
            }
            if (open > 0.5) glow(ctx, 0, -s * 1.2, s * 0.7, f.ink(0.14 * f.env * open), f.ink(0));
          }
          ctx.restore();
        }
      };
    },
  },
  {
    name: "well",
    lane: "pass",
    dur: [14, 22],
    themes: [
      "well",
      "water",
      "living water",
      "thirst",
      "thirsty",
      "drink",
      "draw",
      "never thirst",
      "deep",
      "come to the water",
      "all who are thirsty",
      "satisfy",
      "spring",
      "wells of salvation",
      "samaria",
      "drink deep",
      "quench",
      "water of life",
    ],
    make: (w, h, room) => {
      const S0 = Math.min(w, h) * 0.12;
      const { x, scale } = room.place(S0 * 3);
      const S = S0 * scale,
        y = h * 0.7;
      const drips = Array.from({ length: 8 }, () => ({ u: random(), x: rnd(-0.25, 0.25), s: rnd(0.4, 0.7) }));
      const layer = layering();
      return (f) => {
        const { ctx } = f;
        const draw = smooth(f.k * 2.4 - 0.4); // the bucket is drawn up out of the well
        const { L, canvas } = layer(f);
        const tone = tones(f);
        L.translate(x, y);
        L.scale(S, S);
        // The well, in its own units (S): a ring of stones about a dark shaft; two posts and a
        // beam over it, with the windlass between them; the rope from the windlass to the bucket,
        // which rises out of the shaft. Drawn back to front, so the well's wall hides the bucket
        // while it is down inside.
        // The mouth of the shaft, dark, with the rim about it.
        L.fillStyle = tone(0.5);
        L.beginPath();
        L.ellipse(0, 0, 1.05, 0.35, 0, 0, TAU);
        L.fill();
        L.fillStyle = tone(0.08);
        L.beginPath();
        L.ellipse(0, 0, 0.85, 0.27, 0, 0, TAU);
        L.fill();
        // The posts and the beam over them; the windlass, a wooden drum on an axle between the
        // posts, the rope wound about its middle.
        L.fillStyle = tone(0.4);
        L.fillRect(-0.9, -1.7, 0.1, 1.8);
        L.fillRect(0.8, -1.7, 0.1, 1.8);
        L.fillRect(-1.0, -1.85, 2.0, 0.12);
        const drumY = -1.45,
          drumR = 0.11;
        const dg = L.createLinearGradient(0, drumY - drumR, 0, drumY + drumR);
        dg.addColorStop(0, tone(0.7));
        dg.addColorStop(0.5, tone(0.5));
        dg.addColorStop(1, tone(0.28));
        L.fillStyle = dg;
        L.fillRect(-0.8, drumY - drumR, 1.6, drumR * 2);
        L.fillStyle = tone(0.45);
        for (const ex of [-0.8, 0.8]) {
          L.beginPath();
          L.ellipse(ex, drumY, 0.035, drumR, 0, 0, TAU);
          L.fill();
        }
        L.strokeStyle = tone(0.72);
        L.lineWidth = 0.028;
        L.lineCap = "round";
        const turns = 5 + Math.round(draw * 5);
        for (let i = 0; i < turns; i++) {
          const tx = -0.16 + i * 0.032;
          L.beginPath();
          L.moveTo(tx, drumY - drumR);
          L.lineTo(tx + 0.02, drumY + drumR);
          L.stroke();
        }
        // The rope, from the underside of the drum down to the knot on the bucket's bail.
        const by = 0.4 - draw * 1.45; // from down in the shaft to high above the rim
        const bailTop = by - 0.24;
        L.lineWidth = 0.025;
        L.beginPath();
        L.moveTo(0, drumY + drumR);
        L.lineTo(0, bailTop);
        L.stroke();
        L.fillStyle = tone(0.72);
        L.beginPath();
        L.arc(0, bailTop, 0.03, 0, TAU);
        L.fill();
        // The bucket: its bail from rim to rim, the staves tapering a little to a rounded base,
        // two iron hoops, and the water brimming in it.
        L.strokeStyle = tone(0.6);
        L.lineWidth = 0.028;
        L.beginPath();
        L.moveTo(-0.24, by);
        L.quadraticCurveTo(0, by - 0.5, 0.24, by);
        L.stroke();
        const bg = L.createLinearGradient(-0.3, 0, 0.3, 0);
        bg.addColorStop(0, tone(0.3));
        bg.addColorStop(0.5, tone(0.7));
        bg.addColorStop(1, tone(0.3));
        L.fillStyle = bg;
        L.beginPath();
        L.moveTo(-0.27, by);
        L.lineTo(0.27, by);
        L.lineTo(0.22, by + 0.34);
        L.ellipse(0, by + 0.34, 0.22, 0.07, 0, 0, Math.PI);
        L.closePath();
        L.fill();
        L.strokeStyle = tone(0.45);
        L.lineWidth = 0.02;
        for (const hy of [0.07, 0.25]) {
          const hw = 0.27 - (hy / 0.34) * 0.05;
          L.beginPath();
          L.ellipse(0, by + hy, hw, 0.07 * (0.6 + hy), 0, 0, Math.PI);
          L.stroke();
        }
        L.fillStyle = tone(0.5);
        L.beginPath();
        L.ellipse(0, by, 0.27, 0.08, 0, 0, TAU);
        L.fill();
        L.fillStyle = tone(0.35 + 0.5 * draw);
        L.beginPath();
        L.ellipse(0, by, 0.23, 0.06, 0, 0, TAU);
        L.fill();
        // The well's wall, in front: its stones, and the joints between them.
        const stone = L.createLinearGradient(-1, 0, 1, 0);
        stone.addColorStop(0, tone(0.3));
        stone.addColorStop(0.4, tone(0.6));
        stone.addColorStop(1, tone(0.25));
        L.fillStyle = stone;
        L.beginPath();
        L.ellipse(0, 0.5, 1.05, 0.35, 0, 0, Math.PI);
        L.lineTo(-1.05, 0);
        L.ellipse(0, 0, 1.05, 0.35, 0, Math.PI, 0, true);
        L.closePath();
        L.fill();
        L.strokeStyle = tone(0.15);
        L.lineWidth = 0.02;
        for (let i = 0; i < 9; i++) {
          const px = -0.95 + (i / 8) * 1.9;
          L.beginPath();
          L.moveTo(px, 0.33 * Math.sqrt(Math.max(0, 1 - (px / 1.05) ** 2)));
          L.lineTo(px, 0.5 + 0.33 * Math.sqrt(Math.max(0, 1 - (px / 1.05) ** 2)));
          L.stroke();
        }
        L.beginPath();
        L.ellipse(0, 0.26, 1.05, 0.35, 0, 0.1, Math.PI - 0.1);
        L.stroke();
        // The rim's front edge, over the wall.
        L.strokeStyle = tone(0.62);
        L.lineWidth = 0.03;
        L.beginPath();
        L.ellipse(0, 0, 1.05, 0.35, 0, 0.05, Math.PI - 0.05);
        L.stroke();
        lay(f, canvas, 0.85 * f.env, S * 0.12);
        // Light out of the well, and the water's gleam in the bucket; drops falling back.
        glow(ctx, x, y, S * 0.9, f.ink(0.14 * f.env * (0.4 + 0.6 * draw), true), f.ink(0, true));
        if (by < -0.1) glow(ctx, x, y + by * S, S * 0.4, f.ink(0.3 * f.env * draw, true), f.ink(0, true));
        const dot = f.dot(true);
        for (const d of drips) {
          const u = drift(d, f.t);
          const dy = y + by * S + S * 0.34 + u * u * S * 0.6;
          if (dy > y - S * 0.05) continue; // not where the well's wall would hide them
          ctx.globalAlpha = 0.7 * f.env * draw * (1 - u);
          ctx.drawImage(dot, x + d.x * S - 2, dy - 2, 4, 4);
        }
        ctx.globalAlpha = 1;
      };
    },
  },
  {
    name: "water jar",
    lane: "pass",
    dur: [13, 20],
    themes: [
      "water",
      "living water",
      "jar",
      "well",
      "woman at the well",
      "never thirst",
      "thirst",
      "drink",
      "cana",
      "wine",
      "springs",
      "overflow",
      "fill",
      "pour",
      "jars",
    ],
    // Living water: an ancient terracotta water jar on its stand (pictures/water-jar-bitmap.ts), in
    // the artwork's colour.
    make: photo(WATER_JAR_BITMAP, 0.45),
  },
  {
    name: "garden",
    lane: "back",
    dur: [24, 40],
    themes: [
      "garden",
      "bloom",
      "graves into gardens",
      "beauty for ashes",
      "flower",
      "flowers",
      "grow",
      "new life",
      "spring",
      "eden",
      "restore",
      "make all things new",
      "bones",
      "dead things",
      "roses",
      "blossom",
      "turn my mourning",
      "ashes",
      "new creation",
      "alive again",
    ],
    make: (w, h) => {
      const ground = h * 0.9;
      const flowers = Array.from({ length: Math.round(w / 26) }, (_, i) => ({
        x: (i + rnd(0.2, 0.8)) * 26,
        H: h * rnd(0.1, 0.26),
        s: rnd(9, 16),
        d: rnd(0, 1),
        kind: i % 3,
        petals: 5 + Math.floor(rnd(0, 3)),
        p: rnd(0, TAU),
        cool: random() < 0.35,
      }));
      return (f) => {
        const { ctx } = f;
        const spring = smooth(f.k * 1.6);
        // The dawn over the garden.
        glow(ctx, w * 0.5, ground, w * 0.5, f.ink(0.1 * f.env * spring), f.ink(0));
        const gg = ctx.createLinearGradient(0, ground - 20, 0, h);
        gg.addColorStop(0, f.ink(0.08 * f.env, true));
        gg.addColorStop(1, f.ink(0, true));
        ctx.fillStyle = gg;
        ctx.fillRect(0, ground - 20, w, h - ground + 20);
        ctx.lineCap = "round";
        for (const fl of flowers) {
          const grow = smooth((spring - fl.d * 0.5) * 2);
          if (grow <= 0) continue;
          const H = fl.H * grow;
          const sway = Math.sin(f.t * 0.9 + fl.p) * 0.06;
          const tx = fl.x + Math.sin(sway) * H,
            ty = ground - Math.cos(sway) * H;
          // The stem and its leaves.
          ctx.strokeStyle = f.ink(0.25 * f.env, true);
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.moveTo(fl.x, ground + 4);
          ctx.quadraticCurveTo(fl.x, ground - H * 0.5, tx, ty);
          ctx.stroke();
          ctx.fillStyle = f.ink(0.18 * f.env, true);
          for (const side of [-1, 1]) {
            const ly = ground - H * (0.3 + 0.15 * (side + 1));
            ctx.beginPath();
            ctx.moveTo(fl.x, ly);
            ctx.quadraticCurveTo(fl.x + side * fl.s * 0.8, ly - fl.s * 0.5, fl.x + side * fl.s * 1.3, ly - fl.s * 0.2);
            ctx.quadraticCurveTo(fl.x + side * fl.s * 0.6, ly + fl.s * 0.1, fl.x, ly);
            ctx.fill();
          }
          // The flower, opening at the top as it grows.
          const open = smooth(grow * 1.6 - 0.6);
          if (open <= 0) continue;
          const s = fl.s * (0.5 + 0.5 * open);
          ctx.save();
          ctx.translate(tx, ty);
          ctx.rotate(sway * 2);
          if (fl.kind === 0) {
            // A daisy: a ring of petals about a bright heart.
            ctx.fillStyle = f.ink(0.4 * f.env * open, fl.cool);
            for (let i = 0; i < fl.petals + 2; i++) {
              const a = (i / (fl.petals + 2)) * TAU + f.t * 0.05;
              ctx.beginPath();
              ctx.ellipse(Math.cos(a) * s * 0.5 * open, Math.sin(a) * s * 0.5 * open, s * 0.42 * open, s * 0.18 * open, a, 0, TAU);
              ctx.fill();
            }
            ctx.fillStyle = f.ink(0.7 * f.env * open);
            ctx.beginPath();
            ctx.arc(0, 0, s * 0.22, 0, TAU);
            ctx.fill();
          } else if (fl.kind === 1) {
            // A tulip: a cup of three petals.
            ctx.fillStyle = f.ink(0.4 * f.env * open, fl.cool);
            for (const dx of [-0.35, 0.35, 0]) {
              ctx.beginPath();
              ctx.moveTo(dx * s * open - s * 0.3, s * 0.3);
              ctx.quadraticCurveTo(dx * s * open - s * 0.5 * open, -s * 0.5, dx * s * open, -s * 0.9 * open);
              ctx.quadraticCurveTo(dx * s * open + s * 0.5 * open, -s * 0.5, dx * s * open + s * 0.3, s * 0.3);
              ctx.closePath();
              ctx.fill();
            }
          } else {
            // A rose: petals spiralling in.
            for (let i = 7; i >= 0; i--) {
              const a = i * 2.4 + f.t * 0.03;
              const r = s * 0.15 + i * s * 0.07 * open;
              ctx.fillStyle = f.ink((0.3 + 0.05 * i) * f.env * open, fl.cool);
              ctx.beginPath();
              ctx.ellipse(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, r * 0.75, r * 0.5, a, 0, TAU);
              ctx.fill();
            }
          }
          ctx.restore();
          glow(ctx, tx, ty, s * 1.4, f.ink(0.12 * f.env * open * (0.85 + 0.15 * Math.sin(f.t * 1.3 + fl.p))), f.ink(0));
        }
      };
    },
  },
  {
    name: "banquet table",
    lane: "back",
    dur: [24, 40],
    themes: [
      "table",
      "feast",
      "banquet",
      "prepare a table",
      "presence of my enemies",
      "invite",
      "come to the table",
      "seat",
      "wedding",
      "supper",
      "abundance",
      "cup runneth over",
      "cup overflows",
      "a place for me",
      "set a table",
      "dine",
      "marriage supper",
      "welcome home",
      "father's house",
      "prodigal",
    ],
    make: (w, h, room) => {
      const S0 = Math.min(w, h) * 0.3;
      const { x, scale } = room.place(S0 * 2.6);
      const S = S0 * scale,
        y = h * 0.74; // the near edge of the table
      const items = Array.from({ length: 11 }, (_, i) => ({ u: (i + 0.5) / 11, kind: i % 3, d: rnd(0, 1) }));
      const layer = layering();
      return (f) => {
        const { ctx } = f;
        const laid = smooth(f.k * 5); // laid in the first while, then left as it is
        // The light over the table.
        glow(ctx, x, y - S * 0.7, S * 1.3, f.ink(0.16 * f.env * laid), f.ink(0));
        const { L, canvas } = layer(f);
        const tone = tones(f);
        // The table, running away from us, with its white cloth falling over the near edge.
        const far = y - S * 0.42,
          nearHalf = S * 1.3,
          farHalf = S * 0.7;
        const cg = L.createLinearGradient(0, far, 0, y);
        cg.addColorStop(0, tone(0.45));
        cg.addColorStop(1, tone(0.8));
        L.fillStyle = cg;
        L.beginPath();
        L.moveTo(x - farHalf, far);
        L.lineTo(x + farHalf, far);
        L.lineTo(x + nearHalf, y);
        L.lineTo(x - nearHalf, y);
        L.closePath();
        L.fill();
        L.fillStyle = tone(0.55);
        L.fillRect(x - nearHalf, y, nearHalf * 2, S * 0.08);
        L.fillStyle = tone(0.3);
        for (const lx of [x - nearHalf * 0.8, x + nearHalf * 0.8]) L.fillRect(lx - S * 0.03, y + S * 0.08, S * 0.06, S * 0.42);
        // The folds of the cloth.
        L.strokeStyle = tone(0.65);
        L.lineWidth = 1.2;
        for (let i = 0; i < 9; i++) {
          const u = i / 8;
          L.beginPath();
          L.moveTo(x - nearHalf + u * nearHalf * 2, y + S * 0.08);
          L.lineTo(x - nearHalf + u * nearHalf * 2 + Math.sin(i) * 3, y);
          L.stroke();
        }
        // Set upon it, each thing in its place: cups, loaves and lamps along its length.
        for (const it of items) {
          const come = smooth((laid - it.d * 0.4) * 3);
          if (come <= 0) continue;
          const depth = 0.25 + 0.5 * Math.abs(Math.sin(it.u * 7)); // 0 near, 1 far
          const py = y - S * 0.06 - depth * (y - far - S * 0.12),
            half = nearHalf + (farHalf - nearHalf) * depth;
          const px = x - half * 0.85 + it.u * half * 1.7;
          const s = S * 0.12 * (1 - depth * 0.45) * come;
          L.save();
          L.translate(px, py);
          if (it.kind === 0) {
            // A cup.
            L.fillStyle = tone(0.85);
            L.beginPath();
            L.moveTo(-s * 0.6, -s * 1.4);
            L.bezierCurveTo(-s * 0.6, -s * 0.5, -s * 0.15, -s * 0.5, 0, -s * 0.5);
            L.bezierCurveTo(s * 0.15, -s * 0.5, s * 0.6, -s * 0.5, s * 0.6, -s * 1.4);
            L.closePath();
            L.fill();
            L.fillRect(-s * 0.08, -s * 0.5, s * 0.16, s * 0.45);
            L.beginPath();
            L.ellipse(0, 0, s * 0.4, s * 0.1, 0, 0, TAU);
            L.fill();
            L.fillStyle = tone(0.25);
            L.beginPath();
            L.ellipse(0, -s * 1.4, s * 0.6, s * 0.15, 0, 0, TAU);
            L.fill();
          } else if (it.kind === 1) {
            // A loaf.
            const bg = L.createLinearGradient(-s, -s, s, 0);
            bg.addColorStop(0, tone(0.9));
            bg.addColorStop(1, tone(0.45));
            L.fillStyle = bg;
            L.beginPath();
            L.ellipse(0, -s * 0.3, s * 0.9, s * 0.5, 0, 0, TAU);
            L.fill();
            L.strokeStyle = tone(0.35);
            L.lineWidth = s * 0.08;
            L.beginPath();
            L.moveTo(-s * 0.5, -s * 0.55);
            L.quadraticCurveTo(0, -s * 0.85, s * 0.5, -s * 0.55);
            L.stroke();
          } else {
            // A lamp on a stand.
            L.fillStyle = tone(0.7);
            L.fillRect(-s * 0.06, -s * 1.3, s * 0.12, s * 1.3);
            L.beginPath();
            L.ellipse(0, 0, s * 0.35, s * 0.1, 0, 0, TAU);
            L.fill();
            L.beginPath();
            L.ellipse(0, -s * 1.3, s * 0.4, s * 0.18, 0, 0, TAU);
            L.fill();
          }
          L.restore();
        }
        lay(f, canvas, 0.6 * f.env, S * 0.04);
        // The lamps' flames, and the cups' gleam.
        for (const it of items) {
          const come = smooth((laid - it.d * 0.4) * 3);
          if (come <= 0) continue;
          const depth = 0.25 + 0.5 * Math.abs(Math.sin(it.u * 7));
          const py = y - S * 0.06 - depth * (y - far - S * 0.12),
            half = nearHalf + (farHalf - nearHalf) * depth;
          const px = x - half * 0.85 + it.u * half * 1.7;
          const s = S * 0.12 * (1 - depth * 0.45) * come;
          if (it.kind === 2) flame(f, px, py - s * 1.35, s * 1.0, it.u * 20, come);
          else if (it.kind === 0) glow(ctx, px, py - s * 1.2, s * 1.2, f.ink(0.25 * f.env * come, true), f.ink(0, true));
        }
      };
    },
  },
  {
    name: "new wine",
    lane: "pass",
    dur: [13, 20],
    themes: [
      "wine",
      "new wine",
      "cup",
      "overflow",
      "cup runneth over",
      "crush",
      "pour",
      "press",
      "poured out",
      "vineyard",
      "wineskin",
      "joy",
      "my cup",
      "running over",
      "fill my cup",
      "overflowing",
      "gladness",
      "crushing",
      "winepress",
    ],
    make: (w, h, room) => {
      const S0 = Math.min(w, h) * 0.11;
      const { x, scale } = room.place(S0 * 3.4);
      const S = S0 * scale,
        y = h * 0.68;
      const drops = Array.from({ length: 8 }, () => ({ u: random(), x: rnd(-1, 1), s: rnd(0.3, 0.5) }));
      const layer = layering();
      // The cup's bowl, in its own units: its half-width at height `yy`, from the stem (-0.3)
      // up to the rim (-1.0), used for the bowl, the wine within it and the wine running over.
      const half = (yy: number) => {
        const t = Math.min(1, Math.max(0, (yy + 0.3) / -0.7));
        return 0.1 + 0.46 * t ** 0.7;
      };
      return (f) => {
        const { ctx } = f;
        const tip = smooth(f.k * 2.4 - 0.2); // the jar tips
        const pour = smooth(f.k * 3 - 0.9); // and pours
        const level = smooth(f.k * 2.2 - 1.1); // the cup, empty at first, fills as the wine comes
        const full = smooth((level - 0.97) * 30); // and the pour stops when it is full
        glow(ctx, x, y - S * 0.8, S * 2.4, f.ink(0.05 * f.env), f.ink(0));
        const { L, canvas } = layer(f);
        const tone = tones(f);
        const wine = tones(f, true);
        L.translate(x, y);
        L.scale(S, S);
        // The jar, held above and to the left, tipped towards the cup: a round-bellied pitcher
        // with a lip, its handle on the far side from the pour.
        const jx = -0.95,
          jy = -1.8,
          ang = 0.35 + tip * 0.75;
        L.save();
        L.translate(jx, jy);
        L.rotate(ang);
        const jg = L.createLinearGradient(-0.5, 0, 0.5, 0);
        jg.addColorStop(0, tone(0.25));
        jg.addColorStop(0.45, tone(0.6));
        jg.addColorStop(1, tone(0.25));
        L.fillStyle = jg;
        L.beginPath();
        L.moveTo(-0.25, -0.8);
        L.quadraticCurveTo(-0.55, -0.4, -0.5, 0.1);
        L.quadraticCurveTo(-0.45, 0.6, 0, 0.62);
        L.quadraticCurveTo(0.45, 0.6, 0.5, 0.1);
        L.quadraticCurveTo(0.55, -0.4, 0.25, -0.8);
        L.closePath();
        L.fill();
        L.strokeStyle = tone(0.55);
        L.lineWidth = 0.08;
        L.lineCap = "round";
        L.beginPath(); // the handle, on the left, away from the lip
        L.moveTo(-0.3, -0.6);
        L.bezierCurveTo(-0.75, -0.6, -0.75, 0.1, -0.4, 0.2);
        L.stroke();
        L.fillStyle = tone(0.2);
        L.beginPath(); // the mouth
        L.ellipse(0, -0.82, 0.3, 0.09, 0, 0, TAU);
        L.fill();
        L.restore();
        // Where the lip is now, in the picture: the mouth's edge on the cup's side.
        const lx = 0.3,
          ly = -0.82;
        const lipX = jx + Math.cos(ang) * lx - Math.sin(ang) * ly,
          lipY = jy + Math.sin(ang) * lx + Math.cos(ang) * ly;
        // The cup: its bowl, stem and foot, solid; then the wine within, clipped to the bowl.
        const cg = L.createLinearGradient(-0.6, 0, 0.6, 0);
        cg.addColorStop(0, tone(0.3));
        cg.addColorStop(0.4, tone(0.7));
        cg.addColorStop(1, tone(0.25));
        L.fillStyle = cg;
        const bowl = (inset: number) => {
          L.beginPath();
          for (let i = 0; i <= 20; i++) {
            const yy = -1.0 + (i / 20) * 0.7;
            L.lineTo(-(half(yy) - inset), yy);
          }
          for (let i = 20; i >= 0; i--) {
            const yy = -1.0 + (i / 20) * 0.7;
            L.lineTo(half(yy) - inset, yy);
          }
          L.closePath();
        };
        bowl(0);
        L.fill();
        L.fillRect(-0.07, -0.32, 0.14, 0.52);
        L.beginPath();
        L.ellipse(0, 0.22, 0.42, 0.1, 0, 0, TAU);
        L.fill();
        // The rim, seen a little from above.
        L.fillStyle = tone(0.5);
        L.beginPath();
        L.ellipse(0, -1.0, half(-1.0), 0.14, 0, 0, TAU);
        L.fill();
        L.fillStyle = tone(0.2);
        L.beginPath();
        L.ellipse(0, -1.0, half(-1.0) - 0.04, 0.11, 0, 0, TAU);
        L.fill();
        // The wine, to its level, within the bowl; its surface an oval as wide as the bowl there.
        const lv = -0.32 - 0.68 * level;
        if (level > 0.01) {
          L.save();
          bowl(0.04);
          L.clip();
          L.fillStyle = wine(0.6);
          L.fillRect(-0.6, lv, 1.2, 1);
          L.restore();
          L.fillStyle = wine(0.85);
          L.beginPath();
          L.ellipse(0, lv, half(lv) - 0.04, (half(lv) - 0.04) * 0.25, 0, 0, TAU);
          L.fill();
        }
        lay(f, canvas, 0.6 * f.env, S * 0.08);
        // The stream from the lip into the cup, falling almost straight, and drops beside it.
        if (pour > 0 && full < 1) {
          const sx = x + lipX * S,
            sy = y + lipY * S,
            tx = x + Math.sin(f.t * 6) * 1.2,
            ty = y + lv * S;
          const a = f.env * pour * (1 - full);
          ctx.strokeStyle = f.ink(0.38 * a, true);
          ctx.lineWidth = 2.5;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.quadraticCurveTo(sx + (tx - sx) * 0.2, sy + (ty - sy) * 0.4, tx, ty);
          ctx.stroke();
          beam(f, sx, sy, tx, ty, 1, 0.18 * a);
          const dot = f.dot(true);
          for (const d of drops) {
            const u = drift(d, f.t);
            ctx.globalAlpha = a * Math.sin(Math.PI * u);
            ctx.drawImage(dot, tx + d.x * S * 0.3 * u - 2, ty - S * 0.08 + u * u * S * 0.2 - 2, 4, 4);
          }
          ctx.globalAlpha = 1;
        }
        glow(ctx, x, y + lv * S, S * 0.5, f.ink(0.16 * f.env * level, true), f.ink(0, true));
      };
    },
  },
  {
    name: "rock of ages",
    lane: "back",
    dur: [24, 40],
    themes: [
      "rock",
      "rock of ages",
      "foundation",
      "firm foundation",
      "solid rock",
      "cornerstone",
      "build my life",
      "stand",
      "unshakable",
      "cleft",
      "hide me",
      "refuge",
      "fortress",
      "shelter",
      "storm",
      "waves",
      "won't fall",
      "sinking sand",
      "upon this rock",
      "my rock",
      "never fail",
      "immovable",
      "steadfast",
    ],
    make: (w, h, room) => {
      const R0 = Math.min(w, h) * 0.36;
      const { x, scale } = room.place(R0 * 2.4);
      const R = R0 * scale,
        ground = h * 0.8;
      // A great rock on the plain, cleft into four by a cross: the light beyond it pours through
      // onto the ground before it. Each of the four is a boulder of its own, rough-edged, with
      // the faces towards the cleft straight where the rock broke. In the rock's own units (R):
      // the upright of the cross at x 0, its arm at y `armY`, the gap `g` wide.
      const g = 0.06,
        armY = -0.78;
      type Block = {
        cx: number;
        cy: number;
        hw: number;
        hh: number;
        sx: number;
        sy: number;
        r: number[];
        ridges: [number, number][];
        mottle: { x: number; y: number; r: number; k: number }[];
        k: number;
      };
      const block = (cx: number, cy: number, hw: number, hh: number, sx: number, sy: number, k: number): Block => ({
        cx,
        cy,
        hw,
        hh,
        sx,
        sy,
        r: Array.from({ length: 44 }, (_, i) => 0.92 + 0.1 * Math.sin(i * 0.9 + cx * 7) + rnd(-0.035, 0.035)),
        ridges: Array.from({ length: 2 }, () => [rnd(-0.5, 0.5), rnd(-0.5, 0.5)] as [number, number]),
        mottle: Array.from({ length: 12 }, () => ({ x: rnd(-1, 1), y: rnd(-1, 1), r: rnd(0.15, 0.5), k: rnd(-0.12, 0.1) })),
        k,
      });
      // sx, sy: which way each block's straight faces lie (towards the upright, towards the arm).
      const blocks = [
        block(-0.55, -1.05, 0.55, 0.3, 1, 1, 0.5),
        block(0.55, -1.08, 0.55, 0.32, -1, 1, 0.45),
        block(-0.58, -0.36, 0.6, 0.38, 1, -1, 0.42),
        block(0.6, -0.38, 0.6, 0.4, -1, -1, 0.38),
      ];
      const outline = (b: Block) =>
        b.r.map((r, i) => {
          const a = (i / b.r.length) * TAU;
          let px = b.cx + Math.cos(a) * b.hw * r,
            py = b.cy + Math.sin(a) * b.hh * r;
          // The broken faces along the cleft: straight, with a little roughness.
          const jx = -b.sx * (g + rnd(0, 0.025)),
            jy = armY - b.sy * (g + rnd(0, 0.025));
          if (b.sx > 0 ? px > jx : px < jx) px = jx;
          if (b.sy > 0 ? py > jy : py < jy) py = jy;
          // And they stand on the ground.
          if (py > 0) py = rnd(-0.02, 0.01);
          return [px, py] as const;
        });
      const shapes = blocks.map(outline);
      const rubble = Array.from({ length: 16 }, () => ({
        x: rnd(-1.7, 1.7),
        y: rnd(0, 0.1),
        rx: rnd(0.025, 0.07),
        ry: rnd(0.015, 0.035),
        k: rnd(0.2, 0.32),
      }));
      const grain = Array.from({ length: 1400 }, () => ({
        x: rnd(-1.25, 1.25),
        y: rnd(-1.45, 0),
        r: rnd(0.002, 0.007),
        k: rnd(-0.14, 0.12),
      }));
      const cracks = Array.from({ length: 8 }, () => ({
        x0: rnd(-1.1, 1.1),
        y0: rnd(-1.3, -0.1),
        dx: rnd(-0.25, 0.25),
        dy: rnd(-0.2, 0.25),
        bend: rnd(-0.15, 0.15),
      }));
      const motes = Array.from({ length: 30 }, () => ({ u: random(), x: rnd(-1, 1), s: rnd(0.02, 0.05), p: rnd(0, TAU) }));
      const layer = layering();
      return (f) => {
        const { ctx } = f;
        const come = smooth(f.k * 1.6);
        const shine = smooth(f.k * 2.5 - 0.4) * (0.92 + 0.08 * f.beat);
        // The light beyond the rock, seen through the cross, and the sky about the crown.
        glow(ctx, x, ground + armY * R, R * 1.1, f.ink(0.45 * f.env * shine), f.ink(0));
        glow(ctx, x, ground - R * 1.2, R * 1.6, f.ink(0.1 * f.env * come), f.ink(0));
        // The plain, and the light falling across it from the cleft.
        const pg = ctx.createLinearGradient(0, ground, 0, h);
        pg.addColorStop(0, f.ink(0.1 * f.env * come));
        pg.addColorStop(1, f.ink(0.02 * f.env * come));
        ctx.fillStyle = pg;
        ctx.fillRect(0, ground, w, h - ground);
        const bg = ctx.createLinearGradient(0, ground, 0, h);
        bg.addColorStop(0, f.ink(0.3 * f.env * shine));
        bg.addColorStop(1, f.ink(0.02 * f.env * shine));
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.moveTo(x - R * g, ground);
        ctx.lineTo(x + R * g, ground);
        ctx.lineTo(x + R * 0.9, h);
        ctx.lineTo(x - R * 0.9, h);
        ctx.fill();
        // The rock, solid: each boulder shaded as stone, lit from the cleft and from above,
        // faceted, grained, cracked; the rubble at their feet.
        const { L, canvas } = layer(f);
        const tone = tones(f);
        L.translate(x, ground);
        L.scale(R, R);
        L.fillStyle = tone(0.3);
        for (const r of rubble) {
          L.beginPath();
          L.ellipse(r.x, r.y, r.rx, r.ry, 0, 0, TAU);
          L.fillStyle = tone(r.k);
          L.fill();
        }
        shapes.forEach((pts, n) => {
          const b = blocks[n];
          const path = () => {
            L.beginPath();
            pts.forEach(([px, py], i) => (i ? L.lineTo(px, py) : L.moveTo(px, py)));
            L.closePath();
          };
          // The body: stone grey, lit from the cleft, where the light beyond catches its broken
          // face, and from above; falling off into shadow at the far side and the foot.
          const lx = b.cx + b.sx * b.hw * 0.7,
            ly = b.cy - b.hh * 0.3;
          const bgr = L.createRadialGradient(lx, ly, b.hw * 0.05, b.cx, b.cy, b.hw * 1.5);
          bgr.addColorStop(0, tone(b.k + 0.3));
          bgr.addColorStop(0.45, tone(b.k));
          bgr.addColorStop(1, tone(b.k * 0.5));
          L.fillStyle = bgr;
          path();
          L.fill();
          L.save();
          path();
          L.clip();
          // Mottling: soft patches lighter and darker, as weathered stone is.
          for (const m of b.mottle) {
            const mx = b.cx + m.x * b.hw,
              my = b.cy + m.y * b.hh,
              mr = m.r * b.hw;
            const mg = L.createRadialGradient(mx, my, 0, mx, my, mr);
            mg.addColorStop(0, m.k > 0 ? `rgba(255,255,255,${m.k})` : `rgba(0,0,0,${-m.k * 1.6})`);
            mg.addColorStop(1, "rgba(0,0,0,0)");
            L.fillStyle = mg;
            L.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
          }
          // Planes of the broken stone, meeting at ridges within, each shading away softly.
          b.ridges.forEach(([rx, ry], j) => {
            const rp = [b.cx + rx * b.hw, b.cy + ry * b.hh] as const;
            const i0 = (j * 17) % pts.length;
            const far = pts[(i0 + 6) % pts.length];
            const fg = L.createLinearGradient(rp[0], rp[1], far[0], far[1]);
            fg.addColorStop(0, j % 2 ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.16)");
            fg.addColorStop(1, "rgba(0,0,0,0)");
            L.fillStyle = fg;
            L.beginPath();
            L.moveTo(...rp);
            for (let i = 0; i < 12; i++) L.lineTo(...pts[(i0 + i) % pts.length]);
            L.closePath();
            L.fill();
          });
          // Darker along the foot, where the dust lies; and the edge turning away, a soft shadow
          // just inside the outline.
          const wg = L.createLinearGradient(0, b.cy - b.hh, 0, b.cy + b.hh);
          wg.addColorStop(0, "rgba(255,255,255,0.05)");
          wg.addColorStop(0.5, "rgba(0,0,0,0)");
          wg.addColorStop(1, "rgba(0,0,0,0.35)");
          L.fillStyle = wg;
          L.fillRect(b.cx - b.hw * 1.3, b.cy - b.hh * 1.3, b.hw * 2.6, b.hh * 2.6);
          L.strokeStyle = "rgba(0,0,0,0.22)";
          L.lineWidth = 0.02;
          path();
          L.stroke();
          L.restore();
        });
        // Grain and cracks over all the stone (clipped to it).
        L.save();
        L.beginPath();
        for (const pts of shapes) {
          pts.forEach(([px, py], i) => (i ? L.lineTo(px, py) : L.moveTo(px, py)));
          L.closePath();
        }
        L.clip();
        for (const gr of grain) {
          L.fillStyle = gr.k > 0 ? `rgba(255,255,255,${gr.k})` : `rgba(0,0,0,${-gr.k * 1.5})`;
          L.beginPath();
          L.arc(gr.x, gr.y, gr.r, 0, TAU);
          L.fill();
        }
        L.strokeStyle = "rgba(0,0,0,0.3)";
        L.lineWidth = 0.007;
        L.lineCap = "round";
        for (const c of cracks) {
          L.beginPath();
          L.moveTo(c.x0, c.y0);
          L.quadraticCurveTo(c.x0 + c.dx * 0.5 + c.bend, c.y0 + c.dy * 0.5 - c.bend, c.x0 + c.dx, c.y0 + c.dy);
          L.stroke();
        }
        L.restore();
        lay(f, canvas, 0.85 * f.env * come, 4);
        // The light through the cross, and the dust it catches.
        beam(f, x, ground - R * 1.45, x, ground, R * g * 0.9, 0.5 * f.env * shine);
        beam(f, x - R * 1.2, ground + armY * R, x + R * 1.2, ground + armY * R, R * g * 0.8, 0.45 * f.env * shine);
        glow(ctx, x, ground + armY * R, R * 0.4, f.ink(0.5 * f.env * shine), f.ink(0));
        const dot = f.dot();
        for (const m of motes) {
          const u = drift(m, f.t);
          ctx.globalAlpha = 0.5 * f.env * shine * Math.sin(Math.PI * u);
          ctx.drawImage(dot, x + m.x * R * (0.1 + 0.6 * (1 - u)) + Math.sin(f.t + m.p) * 4 - 2, ground - u * R * 1.3 - 2, 4, 4);
        }
        ctx.globalAlpha = 1;
      };
    },
  },
  {
    name: "the catch",
    lane: "pass",
    dur: [13, 20],
    themes: [
      "net",
      "nets",
      "fish",
      "fishers of men",
      "cast",
      "boat",
      "catch",
      "follow",
      "deep water",
      "launch out",
      "harvest",
      "sea of galilee",
      "draw",
      "disciples",
      "fisherman",
      "fishermen",
      "let down",
      "right side",
      "souls",
    ],
    make: (w, h, room) => {
      const S0 = Math.min(w, h) * 0.16;
      const { x, scale } = room.place(S0 * 2.6);
      const S = S0 * scale,
        sea = h * 0.7;
      const side = x < w / 2 ? -1 : 1; // hauled up and away towards the nearer side of the page
      const fish = Array.from({ length: 16 }, () => ({
        u: rnd(-0.75, 0.75),
        v: rnd(0.15, 0.92),
        s: rnd(0.1, 0.16),
        a: rnd(-0.7, 0.7),
        p: rnd(0, TAU),
        flip: random() < 0.5,
      }));
      const drips = Array.from({ length: 16 }, () => ({ u: random(), x: rnd(-1, 1), s: rnd(0.4, 0.8) }));
      const layer = layering();
      // The bag of the net, in its own units: its half-width at depth v (0 at the rim, 1 at the
      // bottom), swelling with the catch and gathered in below.
      const bag = (v: number) => 0.3 + 0.8 * Math.sin(Math.PI * (0.12 + v * 0.8)) ** 0.8 * (1 - v * 0.25);
      const bagPath = (G: CanvasRenderingContext2D) => {
        G.beginPath();
        for (let i = 0; i <= 24; i++) {
          const v = i / 24;
          G.lineTo(-bag(v), v * 1.7 + 0.1);
        }
        for (let i = 24; i >= 0; i--) {
          const v = i / 24;
          G.lineTo(bag(v), v * 1.7 + 0.1);
        }
        G.closePath();
      };
      // A fish, side on, in units of its length: a deep body tapering to the tail, the forked
      // tail, dorsal and pectoral fins, the gill and the eye; dark along the back, pale below.
      const drawFish = (G: CanvasRenderingContext2D, tone: (k: number) => string) => {
        const g = G.createLinearGradient(0, -0.3, 0, 0.3);
        g.addColorStop(0, tone(0.45));
        g.addColorStop(0.5, tone(0.75));
        g.addColorStop(1, tone(0.9));
        G.fillStyle = g;
        G.beginPath();
        G.moveTo(1.0, 0); // the nose
        G.bezierCurveTo(0.7, -0.38, -0.2, -0.36, -0.6, -0.1); // the back
        G.lineTo(-0.9, -0.05);
        G.lineTo(-0.9, 0.05);
        G.lineTo(-0.6, 0.1);
        G.bezierCurveTo(-0.2, 0.36, 0.7, 0.34, 1.0, 0); // the belly
        G.closePath();
        G.fill();
        G.fillStyle = tone(0.55);
        G.beginPath(); // the tail, forked
        G.moveTo(-0.85, 0);
        G.lineTo(-1.3, -0.32);
        G.lineTo(-1.15, 0);
        G.lineTo(-1.3, 0.32);
        G.closePath();
        G.fill();
        G.beginPath(); // the dorsal fin
        G.moveTo(0.3, -0.3);
        G.quadraticCurveTo(0.0, -0.6, -0.35, -0.32);
        G.closePath();
        G.fill();
        G.beginPath(); // the pectoral fin
        G.moveTo(0.45, 0.1);
        G.quadraticCurveTo(0.2, 0.3, 0.05, 0.14);
        G.closePath();
        G.fill();
        G.strokeStyle = tone(0.5); // the gill
        G.lineWidth = 0.03;
        G.beginPath();
        G.arc(0.75, 0, 0.2, Math.PI * 0.6, Math.PI * 1.4);
        G.stroke();
        G.fillStyle = tone(0.15); // the eye
        G.beginPath();
        G.arc(0.78, -0.08, 0.05, 0, TAU);
        G.fill();
      };
      return (f) => {
        const { ctx } = f;
        const haul = smooth(f.k * 2.4 - 0.4); // the net is drawn up out of the water
        const lift = haul * S * 2.3;
        // The water, and its glints.
        const wg = ctx.createLinearGradient(0, sea - 10, 0, h);
        wg.addColorStop(0, f.ink(0.12 * f.env, true));
        wg.addColorStop(1, f.ink(0.02 * f.env, true));
        ctx.fillStyle = wg;
        ctx.fillRect(0, sea, w, h - sea);
        for (let i = 0; i < 12; i++) {
          const gx = x + Math.sin(i * 5 + f.t * 0.4) * S * 2.5,
            gy = sea + 10 + (i / 12) * (h - sea) * 0.8;
          beam(f, gx - 12, gy, gx + 12, gy, 1, 0.3 * f.env * Math.sin(f.t * 1.8 + i) ** 2);
        }
        const { L, canvas } = layer(f);
        const tone = tones(f);
        const water = tones(f, true);
        // Hauled up and across towards the side, the bag swinging to lean the way it is pulled;
        // the fish in it tilt with it.
        L.save();
        const shift = side * Math.min(lift * 0.7, Math.max(0, (side > 0 ? w - x : x) - S * 1.5));
        L.translate(x + shift, sea - lift);
        L.rotate(side * 0.6 * haul);
        L.scale(S, S);
        // The fish within the bag, each turning and flapping as the net lifts them.
        L.save();
        bagPath(L);
        L.clip();
        for (const fs of fish) {
          const hw = bag(fs.v);
          const px = fs.u * hw,
            py = fs.v * 1.7 + 0.1;
          const flap = Math.sin(f.t * 7 + fs.p) * 0.25 * haul;
          L.save();
          L.translate(px, py);
          L.rotate(fs.a + flap);
          L.scale(fs.s * (fs.flip ? -1 : 1), fs.s);
          drawFish(L, tone);
          L.restore();
        }
        L.restore();
        // The net: a knotted diamond mesh over the bag, its rim rope, and the weights along the
        // bottom; the ropes gathered up to the hand above.
        L.save();
        bagPath(L);
        L.clip();
        L.strokeStyle = tone(0.6);
        L.lineWidth = 0.012;
        for (let k = -3; k <= 3; k += 0.14) {
          L.beginPath();
          L.moveTo(k - 2, 0);
          L.lineTo(k + 2, 2.2);
          L.stroke();
          L.beginPath();
          L.moveTo(k + 2, 0);
          L.lineTo(k - 2, 2.2);
          L.stroke();
        }
        L.restore();
        L.strokeStyle = tone(0.7);
        L.lineWidth = 0.035;
        L.lineCap = "round";
        bagPath(L);
        L.stroke();
        L.fillStyle = tone(0.5);
        for (let i = 0; i <= 6; i++) {
          const v = 0.78 + (i / 6) * 0.22;
          const sx = -bag(v) + (i / 6) * bag(v) * 2;
          L.beginPath();
          L.ellipse(sx, v * 1.7 + 0.14, 0.035, 0.05, 0, 0, TAU);
          L.fill();
        }
        L.strokeStyle = tone(0.7);
        L.lineWidth = 0.03;
        for (const u of [-1, -0.5, 0, 0.5, 1]) {
          L.beginPath();
          L.moveTo(u * bag(0), 0.1);
          L.lineTo(0, -1.2);
          L.stroke();
        }
        // And from where they gather, the one long rope, taut, away to whoever hauls it in off
        // the edge of the page.
        L.lineWidth = 0.045;
        L.beginPath();
        L.moveTo(0, -1.2);
        L.lineTo(0, -40);
        L.stroke();
        L.restore();
        // The water, in front of all that is still below the surface: the net and the fish are
        // seen only as they come up out of it.
        L.fillStyle = water(0.12);
        L.fillRect(0, sea, w, h - sea);
        L.strokeStyle = water(0.3);
        L.lineWidth = 1.5;
        L.beginPath();
        for (let px = 0; px <= w; px += 10) L.lineTo(px, sea + Math.sin(px * 0.04 + f.t * 2) * 2);
        L.stroke();
        lay(f, canvas, 0.85 * f.env, S * 0.1);
        // Water streaming off the net as it comes up, and the shine of the fish.
        const dot = f.dot(true);
        for (const d of drips) {
          const u = drift(d, f.t);
          const dy = sea - lift + S * 1.8 + u * u * (lift + 10);
          if (dy > sea) continue;
          ctx.globalAlpha = 0.7 * f.env * haul * (1 - u);
          ctx.drawImage(dot, x + shift + d.x * S * 0.9 - 2, dy - 2, 4, 4);
        }
        ctx.globalAlpha = 1;
        glow(ctx, x + shift, sea - lift + S * 0.9, S * 1.3, f.ink(0.14 * f.env * haul), f.ink(0));
      };
    },
  },
  {
    name: "manna",
    lane: "pass",
    dur: [13, 20],
    moving: true,
    themes: [
      "manna",
      "bread",
      "daily bread",
      "provide",
      "provider",
      "provision",
      "jehovah jireh",
      "jireh",
      "wilderness",
      "enough",
      "every morning",
      "new every morning",
      "feed",
      "hunger",
      "give us this day",
      "more than enough",
      "you provide",
      "supply",
      "all i need",
    ],
    make: (w, h) => {
      const ground = h * 0.9;
      const flakes = Array.from({ length: 60 }, () => ({
        x: rnd(0, w),
        o: random(),
        v: rnd(0.04, 0.08),
        r: rnd(3, 6),
        p: rnd(0, TAU),
        sway: rnd(10, 30),
      }));
      const lying: { x: number; r: number; p: number }[] = [];
      return (f) => {
        const { ctx } = f;
        // The morning: light along the ground, where it lies like hoar frost.
        const morning = smooth(f.k * 2.5);
        glow(ctx, w * 0.5, ground, w * 0.5, f.ink(0.08 * f.env * morning), f.ink(0));
        const dot = f.dot();
        for (const fl of flakes) {
          const u = (fl.o + f.t * fl.v) % 1;
          const y = u * (ground + 10);
          const x = fl.x + Math.sin(f.t * 0.6 + fl.p) * fl.sway + Math.sin(u * 9) * 10;
          // Each is a small round wafer, white, turning as it comes down; landing, it stays.
          if (u > 0.98 && lying.length < 120) lying.push({ x, r: fl.r * 0.9, p: fl.p });
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(f.t * 0.8 + fl.p);
          ctx.scale(1, 0.4 + 0.6 * Math.abs(Math.cos(f.t * 1.1 + fl.p)));
          ctx.fillStyle = f.ink(0.5 * f.env);
          ctx.beginPath();
          ctx.arc(0, 0, fl.r, 0, TAU);
          ctx.fill();
          ctx.restore();
          ctx.globalAlpha = 0.3 * f.env;
          ctx.drawImage(dot, x - fl.r * 2.5, y - fl.r * 2.5, fl.r * 5, fl.r * 5);
          ctx.globalAlpha = 1;
        }
        for (const l of lying) {
          ctx.fillStyle = f.ink(0.3 * f.env * (0.7 + 0.3 * Math.sin(f.t + l.p)));
          ctx.beginPath();
          ctx.ellipse(l.x, ground + 4 + Math.sin(l.p) * 6, l.r, l.r * 0.4, 0, 0, TAU);
          ctx.fill();
        }
        // The dew's sheen on the ground.
        const gg = ctx.createLinearGradient(0, ground - 10, 0, h);
        gg.addColorStop(0, f.ink(0.1 * f.env * morning, true));
        gg.addColorStop(1, f.ink(0, true));
        ctx.fillStyle = gg;
        ctx.fillRect(0, ground - 10, w, h - ground + 10);
      };
    },
  },
];
