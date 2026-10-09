// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Living things passing over, and what the wind carries.

import { glow, rnd, smooth, TAU, Vision } from "./kit";

export const CREATURES: Vision[] = [
  {
    name: "dove",
    themes: ["dove", "spirit", "holy spirit", "peace", "descend", "holy ghost", "comforter", "rest on me", "gentle", "come down"],
    lane: "pass",
    dur: [11, 16],
    moving: true,
    make: (w, h) => {
      const dir = Math.random() < 0.5 ? 1 : -1;
      const y0 = h * rnd(0.15, 0.3),
        y1 = h * rnd(0.3, 0.5);
      const s = Math.min(w, h) * rnd(0.05, 0.07);
      let layer: HTMLCanvasElement | null = null;
      const trail: { x: number; y: number; t: number }[] = [];
      return (f) => {
        const { ctx } = f;
        const q = f.t / f.dur;
        const x = dir > 0 ? -s * 3 + q * (w + s * 6) : w + s * 3 - q * (w + s * 6);
        const y = y0 + (y1 - y0) * smooth(q) + Math.sin(f.t * 0.9) * s * 0.4;
        // Wings beat in bursts, then it glides.
        const strength = 0.35 + 0.65 * smooth(Math.sin(f.t * 0.55) * 1.5 + 0.5);
        const flap = Math.sin(f.t * 5) * strength;
        if (!trail.length || f.t - trail[trail.length - 1].t > 0.12) trail.push({ x: x - dir * s * 1.2, y, t: f.t });
        const dot = f.dot();
        // A faint, short trail of light, quickly gone.
        for (const p of trail) {
          const age = (f.t - p.t) / 1.6;
          if (age > 1) continue;
          ctx.globalAlpha = 0.12 * f.env * (1 - age) ** 2;
          const r = 3.5 * (1 - age) + 1.5;
          ctx.drawImage(dot, p.x - r, p.y - r + age * 14, r * 2, r * 2);
        }
        while (trail.length && f.t - trail[0].t > 1.6) trail.shift();
        glow(ctx, x, y, s * 3.2, f.ink(0.12 * f.env), f.ink(0));
        // Drawn solid on a layer, so the near wing covers the body rather than adding to its light.
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
        L.translate(x, y);
        L.scale(dir * s * 0.92, s); // a little short of its drawn length
        L.rotate(-0.08 + flap * 0.04);
        // A wing, laid out along its span (u, 0 at the shoulder to 1 at the tip) and back along its
        // width (v), then swung about the shoulder with the beat: raised, lowered, or (gliding) seen
        // edge-on along the back. `k` shortens the far wing, which is seen beyond the body.
        const wing = (k: number, a: number) => {
          const sx = (-0.32 + 0.12 * flap) * k,
            sy = (-0.12 - 1.35 * flap) * k;
          const at = (u: number, v: number): [number, number] => [0.4 + u * sx - v * 0.74, -0.16 + u * sy + v * 0.05];
          const pts: [number, number][] = [
            [0, 0],
            [0.3, -0.06],
            [0.55, -0.07], // the wrist
            [0.82, -0.02],
            [1.0, 0.06], // the tip
          ];
          // Six flight feathers spread at the tip, each rounded, with a little notch between.
          for (let i = 0; i < 6; i++) {
            const u = 0.98 - i * 0.075,
              v = 0.12 + i * 0.13;
            pts.push([u, v], [u - 0.035, v + 0.02], [u - 0.06, v - 0.015]);
          }
          // The shorter feathers of the inner wing, softly scalloped back to the body.
          for (const [u, v] of [
            [0.5, 0.86],
            [0.42, 0.9],
            [0.34, 0.95],
            [0.26, 0.97],
            [0.17, 1.0],
            [0.08, 0.98],
            [0.0, 0.8],
          ] as [number, number][])
            pts.push([u, v]);
          L.fillStyle = f.ink(a);
          L.beginPath();
          const mapped = pts.map(([u, v]) => at(u, v));
          L.moveTo(...mapped[0]);
          for (let i = 1; i < mapped.length; i++) {
            const [px, py] = mapped[i - 1],
              [qx, qy] = mapped[i];
            L.quadraticCurveTo(px, py, (px + qx) / 2, (py + qy) / 2);
          }
          L.closePath();
          L.fill();
        };
        wing(0.8, 0.5); // the far wing, behind
        // The body: a small round head, a plump breast, the back running smoothly to a fanned,
        // round-ended tail.
        L.fillStyle = f.ink(1);
        L.beginPath();
        L.moveTo(1.14, -0.24);
        L.bezierCurveTo(1.12, -0.42, 0.88, -0.48, 0.8, -0.32); // the crown of the head
        L.bezierCurveTo(0.72, -0.22, 0.5, -0.2, 0.2, -0.2); // the nape and back
        L.bezierCurveTo(-0.2, -0.18, -0.5, -0.13, -0.7, -0.11);
        L.lineTo(-1.16, -0.19); // the tail, broad from its base
        L.quadraticCurveTo(-1.31, 0.0, -1.16, 0.19);
        L.lineTo(-0.7, 0.13);
        L.bezierCurveTo(-0.4, 0.22, 0.1, 0.34, 0.5, 0.2); // the belly
        L.bezierCurveTo(0.8, 0.1, 0.92, -0.04, 1.0, -0.14); // the breast, up to the throat
        L.quadraticCurveTo(1.06, -0.18, 1.14, -0.24);
        L.fill();
        L.beginPath();
        L.moveTo(1.12, -0.29); // the beak
        L.quadraticCurveTo(1.22, -0.3, 1.28, -0.25);
        L.lineTo(1.12, -0.22);
        L.fill();
        // The eye.
        L.save();
        L.globalCompositeOperation = "destination-out";
        L.beginPath();
        L.arc(1.0, -0.31, 0.03, 0, TAU);
        L.fill();
        L.restore();
        wing(1, 0.75);
        ctx.save();
        ctx.globalAlpha = 0.5 * f.env;
        ctx.shadowColor = f.ink(0.5 * f.env);
        ctx.shadowBlur = s * 0.35;
        ctx.drawImage(layer, 0, 0, w, h);
        ctx.restore();
      };
    },
  },
  {
    name: "eagle",
    themes: ["eagle", "eagles", "wings", "soar", "rise", "mount up", "fly", "high", "renew", "strength", "above the storm", "on wings"],
    lane: "pass",
    dur: [12, 18],
    moving: true,
    make: (w, h) => {
      const dir = Math.random() < 0.5 ? 1 : -1;
      const s = Math.min(w, h) * rnd(0.06, 0.08);
      const y0 = h * rnd(0.45, 0.6),
        y1 = h * rnd(0.1, 0.22);
      let layer: HTMLCanvasElement | null = null;
      return (f) => {
        const { ctx } = f;
        const q = f.t / f.dur;
        let x = -s * 3 + q * (w + s * 6);
        if (dir < 0) x = w - x;
        // They shall mount up with wings: rising as it goes, wings still, a slow beat now and then.
        const y = y0 + (y1 - y0) * smooth(q) + Math.sin(f.t * 0.5) * s * 0.3;
        const flap = Math.sin(f.t * 3) * Math.max(0, Math.sin(f.t * 0.35)) ** 4;
        glow(ctx, x, y, s * 3, f.ink(0.08 * f.env), f.ink(0));
        // Drawn whole and solid on a layer, so the wings don't brighten where they meet the body,
        // then laid on the page faintly with a soft edge.
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
        L.translate(x, y);
        L.scale(dir * s, s);
        L.rotate(-0.06 + Math.sin(f.t * 0.4) * 0.06);
        // Soaring, seen from below and a little to one side. The wings are laid out flat (along the
        // body x, out along the span z), then seen: the near wing (towards the bottom of the page)
        // fuller, the far one foreshortened, both lifted a little in a V, and both drawn shorter as
        // they sweep up and down with the beat. All of it one colour.
        // Solid colours (mixed from the page's own and the ink), so overlapping parts don't show seams.
        const ink = f.ink(1).slice(5).split(",").slice(0, 3).map(Number);
        const page = f.dark ? [13, 17, 23] : [246, 248, 250];
        const tone = (k: number) => `rgb(${page.map((p, i) => Math.round(p + (ink[i] - p) * k)).join(",")})`;
        const beat = flap * 0.7;
        const see =
          (side: number) =>
          ([bx, z]: [number, number]): [number, number] => {
            const k = side > 0 ? 0.9 : 0.6;
            return [bx, side * z * k * Math.cos(beat) - z * 0.1];
          };
        // One wing, flat: the leading edge out to the wrist and on to the hand; seven fingers fanned
        // at the tip; then the trailing edge, bulging with the inner feathers, back to the body.
        const wingFlat: [number, number][] = [
          [0.3, 0.1],
          [0.42, 0.7],
          [0.45, 1.25], // the wrist
          [0.32, 1.78],
        ];
        // The fingers spread wider at their tips than at their roots.
        const fingers: [number, number][] = [
          [0.27, 2.42],
          [0.14, 2.52],
          [0.0, 2.55],
          [-0.13, 2.5],
          [-0.24, 2.4],
          [-0.33, 2.26],
          [-0.4, 2.08],
        ];
        fingers.forEach(([tx, tz], i) => {
          const bx = 0.3 - i * 0.08,
            bz = 1.82 - i * 0.03;
          const nx = bx - 0.05;
          wingFlat.push(
            [bx, bz],
            [(bx + tx) / 2 + 0.015, (bz + tz) / 2],
            [tx, tz],
            [(nx + tx) / 2 - 0.015, (bz + tz) / 2],
            [nx, bz - 0.015],
          );
        });
        wingFlat.push([-0.32, 1.62], [-0.44, 1.15], [-0.42, 0.6], [-0.3, 0.12]);
        const wing = (side: number, k: number) => {
          const pts = wingFlat.map(see(side));
          L.fillStyle = tone(k);
          L.beginPath();
          L.moveTo(...pts[0]);
          for (let i = 1; i < pts.length; i++) {
            const [px, py] = pts[i - 1],
              [qx, qy] = pts[i];
            L.quadraticCurveTo(px, py, (px + qx) / 2, (py + qy) / 2);
          }
          L.closePath();
          L.fill();
        };
        wing(-1, 0.45); // the far wing
        wing(1, 0.55); // the near wing
        // The body over the wings' roots, in the near wing's tone so they run into it: heavy, from
        // the breast back to the base of the tail, fullest at the shoulders.
        L.fillStyle = tone(0.55);
        L.beginPath();
        L.moveTo(0.75, -0.12);
        L.bezierCurveTo(0.45, -0.3, -0.1, -0.28, -0.65, -0.13);
        L.lineTo(-0.65, 0.13);
        L.bezierCurveTo(-0.1, 0.3, 0.45, 0.32, 0.75, 0.12);
        L.closePath();
        L.fill();
        // The tail, short and fanned, its end gently rounded, in the body's colour.
        L.fillStyle = tone(0.55);
        L.beginPath();
        L.moveTo(-0.6, -0.12);
        L.lineTo(-1.12, -0.24);
        L.quadraticCurveTo(-1.2, 0, -1.12, 0.24);
        L.lineTo(-0.6, 0.12);
        L.closePath();
        L.fill();
        // The head jutting forward, and its hooked beak.
        L.beginPath();
        L.moveTo(0.62, -0.13);
        L.bezierCurveTo(0.85, -0.17, 1.12, -0.15, 1.2, -0.04);
        L.quadraticCurveTo(1.24, 0.04, 1.16, 0.09);
        L.bezierCurveTo(1.0, 0.13, 0.8, 0.14, 0.62, 0.13);
        L.closePath();
        L.fill();
        L.fillStyle = tone(0.55);
        L.beginPath();
        L.moveTo(1.18, -0.05);
        L.quadraticCurveTo(1.34, -0.03, 1.36, 0.06);
        L.quadraticCurveTo(1.3, 0.05, 1.18, 0.06);
        L.fill();
        ctx.save();
        ctx.globalAlpha = 0.45 * f.env;
        ctx.globalCompositeOperation = "source-over";
        ctx.shadowColor = f.ink(0.6 * f.env);
        ctx.shadowBlur = s * 0.45;
        ctx.drawImage(layer, 0, 0, w, h);
        ctx.restore();
      };
    },
  },
  {
    name: "sparrows",
    themes: ["sparrow", "sparrows", "bird", "birds", "his eye is on", "care", "fly", "watches", "worry", "little"],
    lane: "pass",
    dur: [10, 15],
    moving: true,
    make: (w, h) => {
      const dir = Math.random() < 0.5 ? 1 : -1;
      const y0 = h * rnd(0.2, 0.45);
      let layer: HTMLCanvasElement | null = null;
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
        // Little birds, side on, drawn solid on a layer (so where they cross they don't brighten):
        // a round body, a small head and short beak, a notched tail, and short round wings that
        // beat in quick bursts and then fold, as sparrows fly.
        const dpr = ctx.getTransform().a || 1;
        if (!layer || layer.width !== Math.round(w * dpr) || layer.height !== Math.round(h * dpr)) {
          layer = document.createElement("canvas");
          layer.width = Math.round(w * dpr);
          layer.height = Math.round(h * dpr);
        }
        const L = layer.getContext("2d")!;
        L.setTransform(1, 0, 0, 1, 0, 0);
        L.clearRect(0, 0, layer.width, layer.height);
        L.fillStyle = f.ink(1);
        for (const b of birds) {
          // The flock folds and stretches as it goes.
          let x = lx + b.dx * (1 + 0.3 * Math.sin(f.t * 0.8 + b.p)) + Math.sin(f.t * 1.3 + b.p) * 14;
          if (dir < 0) x = w - x;
          const bursting = Math.sin(f.t * 1.6 + b.p * 3) > -0.2;
          const y = ly + b.dy * (1 + 0.4 * Math.cos(f.t * 0.6 + b.p)) + Math.cos(f.t * 1.1 + b.p) * 10 + (bursting ? 0 : 3);
          const flap = bursting ? Math.sin(f.t * b.r * 2.2 + b.p) : -0.15;
          L.setTransform(dpr * dir * b.s * 0.75, 0, 0, dpr * b.s * 0.75, x * dpr, y * dpr);
          L.beginPath();
          L.ellipse(0, 0, 1, 0.55, -0.1, 0, TAU); // the body
          L.moveTo(1.36, -0.38);
          L.arc(0.95, -0.38, 0.41, 0, TAU); // the head
          L.fill();
          L.beginPath();
          L.moveTo(1.3, -0.48); // the beak
          L.lineTo(1.62, -0.36);
          L.lineTo(1.3, -0.26);
          L.fill();
          L.beginPath();
          L.moveTo(-0.75, -0.2); // the tail, notched
          L.lineTo(-1.75, -0.38);
          L.lineTo(-1.55, -0.12);
          L.lineTo(-1.72, 0.1);
          L.lineTo(-0.75, 0.15);
          L.fill();
          // The wing, from the shoulder: up, down, or folded along the back.
          const tipY = -0.25 - 1.5 * flap,
            tipX = -0.55 + 0.25 * Math.abs(flap);
          L.beginPath();
          L.moveTo(0.35, -0.3);
          L.quadraticCurveTo(0.2, tipY * 0.8, tipX, tipY);
          L.quadraticCurveTo(tipX - 0.35, tipY * 0.6, -0.55, -0.15);
          L.closePath();
          L.fill();
        }
        ctx.save();
        ctx.globalAlpha = 0.42 * f.env;
        ctx.drawImage(layer, 0, 0, w, h);
        ctx.restore();
      };
    },
  },
  {
    name: "butterfly",
    themes: ["new", "new creation", "change", "transform", "transformed", "wings", "free", "old has gone", "born again", "made new"],
    lane: "pass",
    dur: [12, 18],
    moving: true,
    make: (w, h) => {
      const dir = Math.random() < 0.5 ? 1 : -1;
      const y0 = h * rnd(0.3, 0.7),
        p = rnd(0, TAU),
        s = rnd(18, 25);
      // One side's wings, from above, in its own units: the forewing pointed at its tip, the
      // hindwing rounded with a scalloped edge.
      const fore = (G: CanvasRenderingContext2D, k: number) => {
        G.beginPath();
        G.moveTo(0.04 * k, -0.06 * k);
        G.bezierCurveTo(0.3 * k, -0.78 * k, 0.7 * k, -0.95 * k, 1.0 * k, -0.88 * k); // the leading edge, to the tip
        G.quadraticCurveTo(0.86 * k, -0.45 * k, 0.78 * k, -0.08 * k); // the outer edge
        G.quadraticCurveTo(0.4 * k, -0.02 * k, 0.06 * k, 0.04 * k);
        G.closePath();
      };
      const hind = (G: CanvasRenderingContext2D, k: number) => {
        G.beginPath();
        G.moveTo(0.05 * k, 0.0);
        G.quadraticCurveTo(0.45 * k, -0.08 * k, 0.72 * k, 0.05 * k);
        const edge: [number, number][] = [
          [0.8, 0.28],
          [0.72, 0.5],
          [0.55, 0.66],
          [0.35, 0.74],
          [0.16, 0.7],
        ];
        let [px, py] = [0.72, 0.05];
        for (const [ex, ey] of edge) {
          G.quadraticCurveTo(((px + ex) / 2 + 0.04) * k, ((py + ey) / 2 + 0.03) * k, ex * k, ey * k);
          [px, py] = [ex, ey];
        }
        G.quadraticCurveTo(0.05 * k, 0.5 * k, 0.03 * k, 0.2 * k);
        G.closePath();
      };
      const spots: [number, number, number][] = [
        [0.9, -0.78, 0.04],
        [0.84, -0.6, 0.035],
        [0.8, -0.42, 0.03],
        [0.76, -0.24, 0.03],
        [0.72, 0.3, 0.035],
        [0.6, 0.52, 0.035],
        [0.42, 0.63, 0.03],
      ];
      let layer: HTMLCanvasElement | null = null;
      return (f) => {
        const { ctx } = f;
        const q = f.t / f.dur;
        let x = -40 + q * (w + 80) + Math.sin(f.t * 0.9 + p) * 40;
        if (dir < 0) x = w - x;
        const y = y0 + Math.sin(f.t * 0.6 + p) * h * 0.12 + Math.sin(f.t * 2.3) * 8;
        // It flutters in bursts and glides between, wings held open.
        const fluttering = Math.sin(f.t * 0.9 + p) > -0.3;
        const open = fluttering ? 0.15 + 0.85 * Math.abs(Math.cos(f.t * 6)) : 0.95;
        glow(ctx, x, y, s * 3, f.ink(0.08 * f.env), f.ink(0));
        // Solid colours on a layer: the wings dark at their borders, lighter within, with pale spots
        // along the border and fine veins; then the body over them.
        const dpr = ctx.getTransform().a || 1;
        if (!layer || layer.width !== Math.round(w * dpr) || layer.height !== Math.round(h * dpr)) {
          layer = document.createElement("canvas");
          layer.width = Math.round(w * dpr);
          layer.height = Math.round(h * dpr);
        }
        const L = layer.getContext("2d")!;
        L.setTransform(1, 0, 0, 1, 0, 0);
        L.clearRect(0, 0, layer.width, layer.height);
        L.setTransform(dpr * s, 0, 0, dpr * s, x * dpr, y * dpr);
        L.rotate(dir * 0.35 + Math.sin(f.t * 1.4) * 0.15);
        const ink = f.ink(1).slice(5).split(",").slice(0, 3).map(Number);
        const page = f.dark ? [13, 17, 23] : [246, 248, 250];
        const tone = (k: number) => `rgb(${page.map((c, i) => Math.round(c + (ink[i] - c) * k)).join(",")})`;
        for (const side of [-1, 1]) {
          L.save();
          L.scale(side * open, 1);
          for (const shape of [hind, fore]) {
            L.fillStyle = tone(0.38);
            shape(L, 1);
            L.fill();
            L.fillStyle = tone(0.8);
            shape(L, 0.8);
            L.fill();
          }
          L.fillStyle = tone(0.95);
          for (const [sx, sy, r] of spots) {
            L.beginPath();
            L.ellipse(sx, sy, r, r, 0, 0, TAU);
            L.fill();
          }
          L.strokeStyle = tone(0.5);
          L.lineWidth = 0.018;
          L.beginPath();
          for (const [vx, vy] of [
            [0.72, -0.72],
            [0.7, -0.45],
            [0.6, -0.15],
            [0.6, 0.15],
            [0.5, 0.45],
            [0.28, 0.56],
          ]) {
            L.moveTo(0.05, 0);
            L.lineTo(vx, vy);
          }
          L.stroke();
          L.restore();
        }
        // The body: a slim, tapering abdomen, the thorax, the head, and clubbed antennae.
        L.fillStyle = tone(0.45);
        L.beginPath();
        L.ellipse(0, 0.33, 0.05, 0.32, 0, 0, TAU);
        L.fill();
        L.beginPath();
        L.ellipse(0, -0.06, 0.08, 0.15, 0, 0, TAU);
        L.fill();
        L.beginPath();
        L.arc(0, -0.25, 0.055, 0, TAU);
        L.fill();
        L.strokeStyle = tone(0.45);
        L.lineWidth = 0.02;
        for (const side of [-1, 1]) {
          L.beginPath();
          L.moveTo(side * 0.02, -0.29);
          L.quadraticCurveTo(side * 0.08, -0.6, side * 0.26, -0.78);
          L.stroke();
          L.beginPath();
          L.arc(side * 0.27, -0.79, 0.03, 0, TAU);
          L.fill();
        }
        ctx.save();
        ctx.globalAlpha = 0.6 * f.env;
        ctx.globalCompositeOperation = "source-over";
        ctx.drawImage(layer, 0, 0, w, h);
        ctx.restore();
      };
    },
  },
  {
    name: "petals",
    themes: ["flower", "flowers", "petal", "petals", "bloom", "beauty", "garden", "rose", "blossom", "fragrance"],
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
    themes: ["olive", "peace", "dove", "branch", "gethsemane", "oil", "garden", "anoint"],
    lane: "pass",
    dur: [12, 18],
    moving: true,
    make: (w, h) => {
      const dir = Math.random() < 0.5 ? 1 : -1;
      // Single leaves blowing past, and a few sprigs: a twig with its leaves in pairs and an olive or two.
      const ls = Array.from({ length: 13 }, (_, i) => ({
        x: rnd(-0.6, 0) * w,
        y: rnd(0.1, 0.8) * h,
        v: rnd(50, 90),
        p: rnd(0, TAU),
        s: rnd(34, 46),
        sprig: i < 3,
      }));
      let layer: HTMLCanvasElement | null = null;
      return (f) => {
        const { ctx } = f;
        const dpr = ctx.getTransform().a || 1;
        if (!layer || layer.width !== Math.round(w * dpr) || layer.height !== Math.round(h * dpr)) {
          layer = document.createElement("canvas");
          layer.width = Math.round(w * dpr);
          layer.height = Math.round(h * dpr);
        }
        const L = layer.getContext("2d")!;
        L.setTransform(1, 0, 0, 1, 0, 0);
        L.clearRect(0, 0, layer.width, layer.height);
        const ink = f.ink(1, true).slice(5).split(",").slice(0, 3).map(Number);
        const page = f.dark ? [13, 17, 23] : [246, 248, 250];
        const tone = (k: number) => `rgb(${page.map((c, i) => Math.round(c + (ink[i] - c) * k)).join(",")})`;
        // An olive leaf, `len` long, from its stalk: long and narrow, pointed, with its midrib.
        // Its top is darker; turned over (`flip` below 0), its underside shows silvery.
        const leaf = (len: number, flip: number) => {
          L.save();
          L.scale(1, (0.35 + 0.65 * Math.abs(flip)) * Math.sign(flip || 1));
          L.fillStyle = tone(flip < 0 ? 0.85 : 0.55);
          L.beginPath();
          L.moveTo(0.1 * len, 0);
          L.quadraticCurveTo(0.42 * len, -0.21 * len, len, -0.02 * len);
          L.quadraticCurveTo(0.45 * len, 0.17 * len, 0.1 * len, 0);
          L.fill();
          L.strokeStyle = tone(flip < 0 ? 0.6 : 0.75);
          L.lineWidth = Math.max(0.6, len * 0.025);
          L.beginPath();
          L.moveTo(0, 0);
          L.quadraticCurveTo(0.5 * len, -0.03 * len, 0.95 * len, -0.02 * len);
          L.stroke();
          L.restore();
        };
        for (const l of ls) {
          let x = l.x + f.t * l.v;
          if (x < -60 || x > w + 60) continue;
          if (dir < 0) x = w - x;
          const y = l.y + Math.sin(f.t * 0.8 + l.p) * 30 + f.t * 6;
          const flip = Math.cos(f.t * (l.sprig ? 0.6 : 1.3) + l.p);
          L.setTransform(dpr, 0, 0, dpr, x * dpr, y * dpr);
          L.rotate(Math.sin(f.t * 0.7 + l.p) * 0.9 + l.p);
          if (!l.sprig) {
            leaf(l.s, flip);
            continue;
          }
          // The sprig's twig, then its leaves in pairs along it, and a couple of olives.
          const len = l.s * 2.6;
          L.strokeStyle = tone(0.5);
          L.lineWidth = 1.4;
          L.beginPath();
          L.moveTo(0, 0);
          L.quadraticCurveTo(len * 0.5, -len * 0.08 * flip, len, 0);
          L.stroke();
          for (let i = 0; i < 4; i++) {
            const u = 0.2 + i * 0.22;
            for (const side of [-1, 1]) {
              L.save();
              L.translate(len * u, -len * 0.06 * flip * Math.sin(Math.PI * u));
              L.rotate(side * (0.7 - i * 0.08));
              leaf(l.s * (0.95 - i * 0.08), flip * (side > 0 ? 1 : 0.85));
              L.restore();
            }
          }
          L.fillStyle = tone(0.4);
          for (const [ox, oy] of [
            [0.32, 0.12],
            [0.56, 0.14],
          ]) {
            L.beginPath();
            L.ellipse(len * ox, len * oy * flip, l.s * 0.14, l.s * 0.1, 0.3, 0, TAU);
            L.fill();
          }
        }
        ctx.save();
        ctx.globalAlpha = 0.75 * f.env;
        ctx.globalCompositeOperation = "source-over";
        ctx.drawImage(layer, 0, 0, w, h);
        ctx.restore();
      };
    },
  },
  {
    name: "seeds",
    themes: ["seed", "seeds", "sow", "plant", "grow", "faith", "mustard", "scattered", "harvest", "small"],
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
    themes: ["snow", "white", "whiter than snow", "wash", "clean", "pure", "winter", "spotless", "washed", "cleanse"],
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
    themes: [
      "rain",
      "pour",
      "shower",
      "showers",
      "latter rain",
      "let it rain",
      "downpour",
      "storm",
      "open the floodgates",
      "raining",
      "pour out",
      "send the rain",
    ],
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
          const u = (d.o + f.t * d.v * 0.3) % 1;
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
    themes: ["wind", "breath", "breathe", "blow", "spirit", "fresh wind", "mighty wind", "rushing", "breath of god", "winds"],
    lane: "pass",
    dur: [10, 15],
    moving: true,
    make: (w, h) => {
      const dir = Math.random() < 0.5 ? 1 : -1;
      // The air's flow: one gentle ripple across the page, which everything in it follows.
      const flow = (x: number, y: number, t: number) => Math.sin(x * 0.005 + y * 0.002 + t * 0.7) * 22 + Math.sin(x * 0.011 - t * 1.1) * 7;
      // Wisps of air, tapering at both ends, coming in gusts; a few curl into a fading swirl.
      const wisps = Array.from({ length: 26 }, () => ({
        y: rnd(0.08, 0.92) * h,
        len: rnd(0.18, 0.4) * w,
        v: rnd(0.9, 1.4) * w * 0.32,
        o: rnd(0, 2),
        curl: Math.random() < 0.2,
      }));
      // Dust and specks swept along, and a couple of leaves tumbling.
      const specks = Array.from({ length: 45 }, () => ({
        y: rnd(0.05, 0.95) * h,
        v: rnd(0.8, 1.5) * w * 0.4,
        o: rnd(0, 2),
        r: rnd(1, 2.6),
        p: rnd(0, TAU),
      }));
      const leaves = Array.from({ length: 2 }, () => ({ y: rnd(0.25, 0.75) * h, v: w * rnd(0.35, 0.5), o: rnd(0, 1), p: rnd(0, TAU) }));
      const span = (o: number, v: number, len: number, t: number) => ((o * w + t * v) % (w * 2 + len)) - len * 0.5;
      return (f) => {
        const { ctx } = f;
        const gust = 0.55 + 0.45 * Math.sin(f.t * 0.9);
        const X = (x: number) => (dir > 0 ? x : w - x);
        ctx.lineCap = "butt"; // its short pieces meet without overlapping, so no beads where they join
        for (const g of wisps) {
          const head = span(g.o, g.v, g.len, f.t);
          const n = 14;
          let prev: [number, number] | null = null;
          for (let i = 0; i <= n; i++) {
            const u = i / n;
            const px = head - u * g.len;
            const pt: [number, number] = [X(px), g.y + flow(px, g.y, f.t)];
            if (prev) {
              ctx.strokeStyle = f.ink(0.2 * f.env * gust * Math.sin(Math.PI * u), true);
              ctx.lineWidth = 0.6 + 1.1 * Math.sin(Math.PI * u);
              ctx.beginPath();
              ctx.moveTo(...prev);
              ctx.lineTo(...pt);
              ctx.stroke();
            }
            prev = pt;
          }
          if (g.curl) {
            // A swirl at its head, tightening and fading.
            const hx = head,
              hy = g.y + flow(head, g.y, f.t);
            let [lx, ly] = [X(hx), hy];
            for (let a = 0.2; a < 5; a += 0.2) {
              const r = 16 * (1 - a / 5.5);
              const nx = X(hx + Math.sin(a) * r),
                ny = hy - (1 - Math.cos(a)) * r;
              ctx.strokeStyle = f.ink(0.16 * f.env * gust * (1 - a / 5), true);
              ctx.lineWidth = 1.2 * (1 - a / 6);
              ctx.beginPath();
              ctx.moveTo(lx, ly);
              ctx.lineTo(nx, ny);
              ctx.stroke();
              [lx, ly] = [nx, ny];
            }
          }
        }
        const dot = f.dot(true);
        for (const sp of specks) {
          const px = span(sp.o, sp.v, 40, f.t);
          const py = sp.y + flow(px, sp.y, f.t) * 1.4 + Math.sin(f.t * 3 + sp.p) * 4;
          ctx.globalAlpha = 0.45 * f.env * gust;
          ctx.drawImage(dot, X(px) - sp.r * 2, py - sp.r * 2, sp.r * 4, sp.r * 4);
        }
        ctx.globalAlpha = 1;
        for (const lf of leaves) {
          const px = span(lf.o, lf.v, 60, f.t);
          const py = lf.y + flow(px, lf.y, f.t) * 1.6;
          ctx.save();
          ctx.translate(X(px), py);
          ctx.rotate(f.t * 3 + lf.p);
          ctx.scale(1, 0.25 + 0.75 * Math.abs(Math.cos(f.t * 2.4 + lf.p)));
          ctx.fillStyle = f.ink(0.4 * f.env, true);
          ctx.beginPath();
          ctx.moveTo(-9, 0);
          ctx.quadraticCurveTo(0, -5, 9, 0);
          ctx.quadraticCurveTo(0, 5, -9, 0);
          ctx.fill();
          ctx.restore();
        }
      };
    },
  },
];
