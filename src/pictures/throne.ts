// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// The throne room: the throne, the Lamb, the Lion of Judah, the sea of glass, crowns cast down,
// the seraph's six wings, lightnings, the scroll, the trumpet, the heavenly host.

import { beam, glow, lay, layering, rnd, smooth, TAU, tones, Vision } from "./kit";

/**
 * A wing, in its own units: the shoulder at (0, 0), the span out along x to the tip at 1. The
 * leading edge sweeps out over the wrist to the tip; the trailing edge is the feathers, long
 * primaries at the tip and shorter secondaries back towards the body, each a rounded lobe.
 */
function wingPath(G: CanvasRenderingContext2D) {
  G.beginPath();
  G.moveTo(0, 0);
  G.quadraticCurveTo(0.3, -0.26, 0.58, -0.24); // to the wrist
  G.quadraticCurveTo(0.82, -0.2, 1.0, -0.02); // and on to the tip
  // The feathers, from the tip back to the body: each lobe's end, and the notch after it.
  const ends: [number, number][] = [
    [0.98, 0.3],
    [0.92, 0.5],
    [0.82, 0.63],
    [0.7, 0.7],
    [0.57, 0.72],
    [0.44, 0.7],
    [0.32, 0.64],
    [0.2, 0.54],
    [0.1, 0.42],
    [0.02, 0.28],
  ];
  let [px, py] = [1.0, -0.02];
  for (const [ex, ey] of ends) {
    // Out to the feather's rounded end, then a small notch in before the next.
    G.quadraticCurveTo(px + (ex - px) * 0.2 + 0.05, py + (ey - py) * 0.8 + 0.03, ex, ey);
    const nx = ex - 0.045,
      ny = ey - 0.05;
    G.lineTo(nx, ny);
    [px, py] = [nx, ny];
  }
  G.closePath();
}

/** The rows of covert feathers over a wing's root, as scalloped lines, drawn in the current stroke. */
function wingCoverts(G: CanvasRenderingContext2D) {
  for (const [row, n, y0, y1] of [
    [0, 7, 0.12, 0.36],
    [1, 9, 0.02, 0.2],
  ]) {
    G.beginPath();
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const x = 0.04 + u * (0.78 - row * 0.12),
        y = y0 + (y1 - y0) * Math.sin(Math.PI * u) * 0.9 - (1 - u) * 0.02;
      if (i) G.quadraticCurveTo(x - (0.74 / n) * 0.5, y + 0.05, x, y);
      else G.moveTo(x, y);
    }
    G.stroke();
  }
}

/** A small crown, flat on: the band, three points with pearls, a gem in the middle. */
function crownPath(G: CanvasRenderingContext2D, s: number) {
  G.beginPath();
  G.moveTo(-s, s * 0.5);
  G.lineTo(-s, -s * 0.1);
  G.lineTo(-s * 0.55, s * 0.15);
  G.lineTo(-s * 0.3, -s * 0.5);
  G.lineTo(0, s * 0.15);
  G.lineTo(s * 0.3, -s * 0.5);
  G.lineTo(s * 0.55, s * 0.15);
  G.lineTo(s, -s * 0.1);
  G.lineTo(s, s * 0.5);
  G.closePath();
}

export const THRONE: Vision[] = [
  {
    name: "throne",
    lane: "back",
    dur: [24, 40],
    themes: [
      "throne",
      "king",
      "reign",
      "majesty",
      "holy",
      "exalted",
      "high and lifted",
      "seated",
      "worthy",
      "sovereign",
      "lord of lords",
      "rule",
      "enthroned",
      "glory",
      "before the throne",
      "train",
      "kingdom",
    ],
    make: (w, h, room) => {
      const S0 = Math.min(w, h) * 0.3;
      const { x, scale } = room.place(S0 * 2.2);
      const S = S0 * scale,
        floor = h * 0.88;
      const bolts: { t: number; pts: [number, number][] }[] = [];
      let next = rnd(3, 6);
      const layer = layering();
      return (f) => {
        const { ctx } = f;
        const come = smooth(f.k * 2);
        const top = floor - S * 1.6;
        // The brightness upon the throne, which hides the One who sits there; and the emerald
        // rainbow round about it.
        glow(ctx, x, top + S * 0.45, S * 1.4, f.ink(0.3 * f.env * come * (0.92 + 0.08 * f.beat)), f.ink(0));
        glow(ctx, x, top + S * 0.45, S * 0.5, f.ink(0.4 * f.env * come), f.ink(0));
        for (let i = 0; i < 3; i++) {
          ctx.strokeStyle = f.ink(0.1 * f.env * come * (1 - i * 0.25), true);
          ctx.lineWidth = S * 0.05;
          ctx.beginPath();
          ctx.arc(x, top + S * 0.5, S * (1.0 + i * 0.07), Math.PI * 1.08, Math.PI * 1.92);
          ctx.stroke();
        }
        // The throne itself, solid, high and lifted up: its steps, the seat, its tall back and arms.
        const { L, canvas } = layer(f);
        const tone = tones(f);
        L.translate(x, floor);
        L.scale(S, S);
        for (let i = 0; i < 4; i++) {
          const y0 = -i * 0.12,
            hw = 1.5 - i * 0.22;
          const sg = L.createLinearGradient(0, y0 - 0.12, 0, y0);
          sg.addColorStop(0, tone(0.45 - i * 0.04));
          sg.addColorStop(1, tone(0.2));
          L.fillStyle = sg;
          L.fillRect(-hw, y0 - 0.12, hw * 2, 0.12);
        }
        const bg = L.createLinearGradient(-0.5, 0, 0.5, 0);
        bg.addColorStop(0, tone(0.3));
        bg.addColorStop(0.5, tone(0.6));
        bg.addColorStop(1, tone(0.3));
        L.fillStyle = bg;
        L.beginPath();
        L.moveTo(-0.45, -0.48);
        L.lineTo(-0.45, -1.45);
        L.quadraticCurveTo(0, -1.75, 0.45, -1.45);
        L.lineTo(0.45, -0.48);
        L.closePath();
        L.fill();
        L.fillStyle = tone(0.5);
        L.fillRect(-0.55, -0.72, 1.1, 0.24);
        for (const side of [-1, 1]) {
          L.fillStyle = tone(0.4);
          L.fillRect(side * 0.5 - 0.06, -1.0, 0.12, 0.52);
          L.beginPath();
          L.arc(side * 0.5, -1.0, 0.08, 0, TAU);
          L.fill();
        }
        // Where the light is, the throne itself is lost in it: cut away towards the seat.
        L.globalCompositeOperation = "destination-out";
        const cut = L.createRadialGradient(0, -1.15, 0, 0, -1.15, 0.75);
        cut.addColorStop(0, `rgba(0,0,0,${0.95 * come})`);
        cut.addColorStop(1, "rgba(0,0,0,0)");
        L.fillStyle = cut;
        L.fillRect(-1, -2, 2, 1.6);
        lay(f, canvas, 0.55 * f.env * come, S * 0.1);
        // The train, filling the temple: light flowing down the steps and over the floor.
        const tg = ctx.createLinearGradient(0, floor - S * 0.5, 0, h);
        tg.addColorStop(0, f.ink(0.18 * f.env * come));
        tg.addColorStop(1, f.ink(0.02 * f.env * come));
        ctx.fillStyle = tg;
        ctx.beginPath();
        ctx.moveTo(x - S * 0.5, floor - S * 0.5);
        ctx.lineTo(x + S * 0.5, floor - S * 0.5);
        ctx.quadraticCurveTo(x + S * 1.6, floor + S * 0.1 + Math.sin(f.t * 0.5) * 4, x + S * 2.6, h);
        ctx.lineTo(x - S * 2.6, h);
        ctx.quadraticCurveTo(x - S * 1.6, floor + S * 0.1 - Math.sin(f.t * 0.5) * 4, x - S * 0.5, floor - S * 0.5);
        ctx.fill();
        // Out of the throne, lightnings now and then, faint and quick.
        if (come > 0.8 && f.t >= next) {
          const pts: [number, number][] = [[x + rnd(-0.3, 0.3) * S, top + S * 0.3]];
          for (let i = 0; i < 7; i++) {
            const [px, py] = pts[pts.length - 1];
            pts.push([px + rnd(-0.25, 0.25) * S, py - S * rnd(0.12, 0.25)]);
          }
          bolts.push({ t: f.t, pts });
          next = f.t + rnd(3, 7);
        }
        for (let i = bolts.length - 1; i >= 0; i--) {
          const q = (f.t - bolts[i].t) / 0.7;
          if (q >= 1) {
            bolts.splice(i, 1);
            continue;
          }
          ctx.strokeStyle = f.ink(0.4 * f.env * (1 - q) ** 2, true);
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          bolts[i].pts.forEach(([px, py], j) => (j ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
          ctx.stroke();
        }
      };
    },
  },
  {
    name: "lamb",
    lane: "pass",
    dur: [13, 20],
    themes: [
      "lamb",
      "worthy",
      "slain",
      "lamb of god",
      "the lamb",
      "blood",
      "sacrifice",
      "takes away",
      "worthy is the lamb",
      "innocent",
      "spotless",
      "behold",
      "lamb upon the throne",
      "agnus",
    ],
    make: (w, h, room) => {
      const S0 = Math.min(w, h) * 0.09;
      const { x, scale } = room.place(S0 * 4);
      const S = S0 * scale,
        y = h * 0.62;
      const dir = x < w / 2 ? 1 : -1;
      const wool = Array.from({ length: 48 }, () => rnd(0.9, 1.1));
      const layer = layering();
      return (f) => {
        const { ctx } = f;
        const come = smooth(f.k * 2.4);
        // Light about it, and the rise it stands on.
        glow(ctx, x, y - S * 0.3, S * 2.6, f.ink(0.16 * f.env * come * (0.92 + 0.08 * f.beat)), f.ink(0));
        const hg = ctx.createLinearGradient(0, y + S * 1.0, 0, y + S * 2.0);
        hg.addColorStop(0, f.ink(0.1 * f.env * come));
        hg.addColorStop(1, f.ink(0));
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.ellipse(x, y + S * 1.35, S * 2.2, S * 0.5, 0, 0, TAU);
        ctx.fill();
        // The lamb, side on, standing with its head up, in its own units (S): the body a cloud of
        // wool, long slim legs, a woolly neck to a small head with a rounded muzzle and ears laid
        // back; the face and legs darker than the fleece. Solid, on a layer.
        const { L, canvas } = layer(f);
        const tone = tones(f);
        L.translate(x, y + (1 - come) * 16);
        L.scale(dir * S, S);
        const breathe = 1 + 0.01 * Math.sin(f.t * 1.6);
        // The legs: far pair dimmer, each a slim tapering line with a knee and a dark hoof.
        const leg = (lx: number, k: number, back: boolean) => {
          L.strokeStyle = tone(k);
          L.lineCap = "round";
          L.lineWidth = 0.13;
          L.beginPath();
          L.moveTo(lx, 0.3);
          L.lineTo(lx + (back ? -0.04 : 0.02), 0.75);
          L.lineTo(lx + (back ? 0.02 : 0.03), 1.15);
          L.stroke();
          L.fillStyle = tone(k * 0.6);
          L.beginPath();
          L.ellipse(lx + (back ? 0.03 : 0.04), 1.17, 0.08, 0.05, 0, 0, TAU);
          L.fill();
        };
        leg(-0.55, 0.42, true);
        leg(0.62, 0.42, false);
        leg(-0.75, 0.6, true);
        leg(0.42, 0.6, false);
        // The tail, a woolly stub.
        L.fillStyle = tone(0.8);
        L.beginPath();
        L.ellipse(-1.05, -0.05, 0.13, 0.2, -0.4, 0, TAU);
        L.fill();
        // The fleece: an oval with a woolly edge, brighter on the back than the belly.
        const fl = L.createLinearGradient(0, -0.65, 0, 0.45);
        fl.addColorStop(0, tone(1));
        fl.addColorStop(1, tone(0.7));
        L.fillStyle = fl;
        L.beginPath();
        for (let i = 0; i <= 48; i++) {
          const a = (i / 48) * TAU;
          const k = (1 + 0.06 * Math.abs(Math.sin(a * 12))) * wool[i % 48] * breathe;
          const px = Math.cos(a) * 1.0 * k,
            py = Math.sin(a) * 0.6 * k * (Math.sin(a) > 0 ? 0.85 : 1);
          if (i) L.lineTo(px, py);
          else L.moveTo(px, py);
        }
        L.closePath();
        L.fill();
        // The neck, woolly, rising to the head; it lifts and turns a little as the lamb looks about.
        const look = Math.sin(f.t * 0.4) * 0.04;
        L.strokeStyle = tone(0.92);
        L.lineCap = "round";
        L.lineWidth = 0.34;
        L.beginPath();
        L.moveTo(0.72, -0.2);
        L.quadraticCurveTo(0.9, -0.42, 1.0 + look, -0.62);
        L.stroke();
        // The head: the skull, the muzzle rounding to the nose, the ear laid back, the eye.
        L.save();
        L.translate(1.04 + look, -0.68);
        L.rotate(0.3 + look);
        L.fillStyle = tone(0.72);
        L.beginPath();
        L.ellipse(0, 0, 0.26, 0.21, 0, 0, TAU);
        L.fill();
        L.beginPath();
        L.moveTo(0.1, -0.16);
        L.quadraticCurveTo(0.5, -0.14, 0.52, 0.02);
        L.quadraticCurveTo(0.5, 0.14, 0.3, 0.16);
        L.quadraticCurveTo(0.1, 0.18, 0.05, 0.1);
        L.closePath();
        L.fill();
        L.fillStyle = tone(0.45); // the nose and mouth
        L.beginPath();
        L.ellipse(0.5, 0.0, 0.045, 0.035, 0, 0, TAU);
        L.fill();
        L.strokeStyle = tone(0.5);
        L.lineWidth = 0.015;
        L.beginPath();
        L.moveTo(0.48, 0.05);
        L.quadraticCurveTo(0.42, 0.11, 0.34, 0.1);
        L.stroke();
        L.fillStyle = tone(0.62); // the ear, laid back and down
        L.beginPath();
        L.ellipse(-0.18, -0.06, 0.2, 0.08, 0.35, 0, TAU);
        L.fill();
        L.fillStyle = tone(1.0); // a tuft of wool on the crown
        L.beginPath();
        L.ellipse(-0.02, -0.2, 0.14, 0.08, 0, 0, TAU);
        L.fill();
        L.globalCompositeOperation = "destination-out"; // the eye
        L.beginPath();
        L.ellipse(0.1, -0.05, 0.035, 0.03, 0.3, 0, TAU);
        L.fill();
        L.restore();
        lay(f, canvas, 0.7 * f.env, S * 0.2);
        // A nimbus about its head.
        glow(ctx, x + dir * S * 1.2, y - S * 0.7, S * 0.7, f.ink(0.2 * f.env * come), f.ink(0));
      };
    },
  },
  {
    name: "lion of judah",
    lane: "pass",
    dur: [13, 20],
    themes: [
      "lion",
      "judah",
      "roar",
      "mighty",
      "king",
      "strong",
      "fierce",
      "warrior",
      "conquer",
      "victory",
      "lion and the lamb",
      "lion of judah",
      "prevail",
      "tribe of judah",
      "triumph",
    ],
    make: (w, h, room) => {
      const S0 = Math.min(w, h) * 0.1;
      const { x, scale } = room.place(S0 * 4.4);
      const S = S0 * scale,
        y = h * 0.6;
      const dir = x < w / 2 ? 1 : -1;
      const mane = Array.from({ length: 40 }, () => rnd(0.92, 1.12));
      const layer = layering();
      return (f) => {
        const { ctx } = f;
        const come = smooth(f.k * 2.4);
        const roar = Math.max(0, Math.sin(f.t * 0.45 - 1)) ** 6; // now and then it lifts its head and roars
        glow(ctx, x, y - S * 0.4, S * 2.8, f.ink(0.12 * f.env * come * (0.9 + 0.1 * f.beat)), f.ink(0));
        // The lion, side on, standing on a rock, in its own units (S): a long deep-chested body,
        // the great mane about the head and down over the chest, the head in profile with its
        // muzzle, the tail hanging in a curve to its tuft. Solid, on a layer.
        const { L, canvas } = layer(f);
        const tone = tones(f);
        L.translate(x, y + (1 - come) * 16);
        L.scale(dir * S, S);
        // The rock.
        const rg = L.createLinearGradient(0, 1.1, 0, 2.0);
        rg.addColorStop(0, tone(0.3));
        rg.addColorStop(1, tone(0.1));
        L.fillStyle = rg;
        L.beginPath();
        L.moveTo(-2.3, 2.0);
        L.quadraticCurveTo(-2.0, 1.1, -1.5, 1.12);
        L.lineTo(1.4, 1.1);
        L.quadraticCurveTo(2.1, 1.15, 2.3, 2.0);
        L.closePath();
        L.fill();
        // The tail, swinging slowly, with its tuft.
        const sw = Math.sin(f.t * 0.7) * 0.15;
        L.strokeStyle = tone(0.5);
        L.lineWidth = 0.09;
        L.lineCap = "round";
        L.beginPath();
        L.moveTo(-1.15, -0.35);
        L.bezierCurveTo(-1.6, -0.1, -1.75 + sw, 0.55, -1.5 + sw * 1.6, 0.75);
        L.stroke();
        L.fillStyle = tone(0.4);
        L.beginPath();
        L.ellipse(-1.5 + sw * 1.6, 0.78, 0.11, 0.18, 0.4, 0, TAU);
        L.fill();
        // The far legs, dimmer, then the body, then the near legs over it.
        const legs = (k: number, dx: number) => {
          L.fillStyle = tone(k);
          // The hind leg: the thigh, the hock bending back, the shank down to the paw.
          L.beginPath();
          L.moveTo(-0.55 + dx, -0.1);
          L.quadraticCurveTo(-1.25 + dx, -0.15, -1.2 + dx, 0.45);
          L.lineTo(-1.05 + dx, 0.62);
          L.lineTo(-1.0 + dx, 1.08);
          L.lineTo(-0.78 + dx, 1.08);
          L.lineTo(-0.8 + dx, 0.6);
          L.quadraticCurveTo(-0.6 + dx, 0.4, -0.5 + dx, 0.4);
          L.closePath();
          L.fill();
          // The foreleg, straight down from the shoulder.
          L.beginPath();
          L.moveTo(0.42 + dx, -0.05);
          L.lineTo(0.78 + dx, -0.05);
          L.lineTo(0.76 + dx, 1.08);
          L.lineTo(0.5 + dx, 1.08);
          L.closePath();
          L.fill();
          // The paws.
          L.fillStyle = tone(k * 0.85);
          for (const px of [-0.86 + dx, 0.65 + dx]) {
            L.beginPath();
            L.ellipse(px + 0.03, 1.08, 0.17, 0.07, 0, 0, TAU);
            L.fill();
          }
        };
        legs(0.38, -0.12);
        const bg = L.createLinearGradient(0, -0.6, 0, 0.5);
        bg.addColorStop(0, tone(0.7));
        bg.addColorStop(1, tone(0.45));
        L.fillStyle = bg;
        L.beginPath();
        L.moveTo(0.3, -0.6);
        L.quadraticCurveTo(-0.4, -0.72, -1.0, -0.5);
        L.quadraticCurveTo(-1.3, -0.3, -1.2, 0.1);
        L.quadraticCurveTo(-1.1, 0.42, -0.7, 0.45);
        L.quadraticCurveTo(-0.1, 0.52, 0.5, 0.45);
        L.quadraticCurveTo(0.85, 0.3, 0.8, -0.2);
        L.quadraticCurveTo(0.75, -0.55, 0.3, -0.6);
        L.closePath();
        L.fill();
        legs(0.55, 0);
        // The mane: a great tufted mass about the head, deepest below, falling over the chest;
        // darker than the coat, as a lion's is, stirring a little.
        const mx = 0.8,
          my = -0.6 - roar * 0.1;
        const mg = L.createRadialGradient(mx, my, 0.1, mx, my, 1.0);
        mg.addColorStop(0, tone(0.55));
        mg.addColorStop(1, tone(0.3));
        L.fillStyle = mg;
        L.beginPath();
        for (let i = 0; i <= 40; i++) {
          const a = (i / 40) * TAU;
          const down = Math.max(0, Math.sin(a)); // fuller below, over the chest
          const r = (0.7 + 0.3 * down) * mane[i % 40] * (1 + 0.015 * Math.sin(f.t * 1.5 + i));
          const px = mx + Math.cos(a) * r * 0.9,
            py = my + Math.sin(a) * r;
          if (i) L.lineTo(px, py);
          else L.moveTo(px, py);
        }
        L.closePath();
        L.fill();
        // The head within it, in profile: the brow and skull, the muzzle to the nose, the jaw;
        // the ear; the eye. Lifted as it roars, the mouth opening.
        L.save();
        L.translate(mx + 0.2, my - 0.1);
        L.rotate(-roar * 0.4);
        const hg = L.createLinearGradient(0, -0.4, 0, 0.3);
        hg.addColorStop(0, tone(0.82));
        hg.addColorStop(1, tone(0.6));
        L.fillStyle = hg;
        L.beginPath();
        L.moveTo(-0.3, -0.35); // the brow
        L.quadraticCurveTo(0.1, -0.45, 0.35, -0.3);
        L.quadraticCurveTo(0.62, -0.25, 0.68, -0.08); // the muzzle to the nose
        L.quadraticCurveTo(0.7, 0.08, 0.55, 0.12 + roar * 0.1); // the upper lip
        L.quadraticCurveTo(0.3, 0.3 + roar * 0.08, 0.0, 0.3); // the jaw
        L.quadraticCurveTo(-0.3, 0.25, -0.35, 0.0);
        L.closePath();
        L.fill();
        L.fillStyle = tone(0.25); // the nose
        L.beginPath();
        L.ellipse(0.64, -0.1, 0.07, 0.05, 0.3, 0, TAU);
        L.fill();
        L.strokeStyle = tone(0.3); // the mouth
        L.lineWidth = 0.02 + roar * 0.06;
        L.beginPath();
        L.moveTo(0.6, 0.02);
        L.quadraticCurveTo(0.4, 0.14 + roar * 0.06, 0.15, 0.1 + roar * 0.04);
        L.stroke();
        L.fillStyle = tone(0.5); // the ear
        L.beginPath();
        L.ellipse(-0.18, -0.42, 0.11, 0.1, 0, 0, TAU);
        L.fill();
        L.globalCompositeOperation = "destination-out"; // the eye
        L.beginPath();
        L.ellipse(0.22, -0.2, 0.05, 0.035, 0.2, 0, TAU);
        L.fill();
        L.restore();
        lay(f, canvas, 0.65 * f.env, S * 0.18);
        // Its roar, going out.
        if (roar > 0.05)
          for (let i = 0; i < 3; i++) {
            const q = (roar * 1.5 + i * 0.25) % 1;
            ctx.strokeStyle = f.ink(0.2 * f.env * (1 - q) * roar);
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(x + dir * S * 1.7, y - S * 0.8, S * 0.4 + q * S * 1.8, dir > 0 ? -0.8 : Math.PI - 0.8, dir > 0 ? 0.8 : Math.PI + 0.8);
            ctx.stroke();
          }
      };
    },
  },
  {
    name: "sea of glass",
    lane: "back",
    dur: [24, 40],
    themes: [
      "glass",
      "crystal",
      "before the throne",
      "heaven",
      "holy",
      "worship",
      "sea of glass",
      "pure",
      "forever",
      "day and night",
      "saints",
      "stand before",
      "worthy",
      "endless",
      "eternity",
    ],
    make: (w, h) => {
      const hz = h * 0.42,
        cx = w * rnd(0.4, 0.6);
      const glints = Array.from({ length: 90 }, () => ({
        u: Math.random() ** 1.5,
        x: rnd(-1, 1),
        p: rnd(0, TAU),
        l: rnd(8, 30),
        fire: Math.random() < 0.3,
      }));
      return (f) => {
        const { ctx } = f;
        const come = smooth(f.k * 1.6);
        // The light at the horizon, and its path down the floor towards us.
        glow(ctx, cx, hz, w * 0.35, f.ink(0.3 * f.env * come), f.ink(0));
        beam(f, 0, hz, w, hz, 1.2, 0.2 * f.env * come);
        const pg = ctx.createLinearGradient(0, hz, 0, h);
        pg.addColorStop(0, f.ink(0.16 * f.env * come, true));
        pg.addColorStop(0.5, f.ink(0.05 * f.env * come, true));
        pg.addColorStop(1, f.ink(0.1 * f.env * come, true));
        ctx.fillStyle = pg;
        ctx.fillRect(0, hz, w, h - hz);
        // The reflection of the light, a column of brightness wavering a little.
        const rg = ctx.createLinearGradient(0, hz, 0, h);
        rg.addColorStop(0, f.ink(0.3 * f.env * come));
        rg.addColorStop(1, f.ink(0.04 * f.env * come));
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.moveTo(cx - w * 0.04, hz);
        ctx.lineTo(cx + w * 0.04, hz);
        ctx.lineTo(cx + w * 0.3 + Math.sin(f.t * 0.3) * 10, h);
        ctx.lineTo(cx - w * 0.3 - Math.sin(f.t * 0.3) * 10, h);
        ctx.fill();
        // The floor's lines, running away to the horizon as on a sheet of glass.
        ctx.lineWidth = 1;
        for (let i = 1; i <= 14; i++) {
          const u = (i / 14) ** 2;
          const y = hz + u * (h - hz);
          ctx.strokeStyle = f.ink(0.1 * f.env * come * u, true);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
        for (let i = -8; i <= 8; i++) {
          ctx.strokeStyle = f.ink(0.05 * f.env * come, true);
          ctx.beginPath();
          ctx.moveTo(cx + i * w * 0.02, hz);
          ctx.lineTo(cx + i * w * 0.2, h);
          ctx.stroke();
        }
        // Glints on the glass, and flecks of fire mingled with it.
        for (const g of glints) {
          const y = hz + g.u * (h - hz);
          const x = cx + g.x * w * 0.6 * (0.15 + g.u) + Math.sin(f.t * 0.4 + g.p) * 6;
          const a = 0.4 * f.env * come * (0.3 + 0.7 * Math.sin(f.t * 1.6 + g.p) ** 2) * (0.3 + g.u);
          beam(f, x - g.l * g.u, y, x + g.l * g.u, y, 1, a);
          if (g.fire) glow(ctx, x, y, 6 + g.u * 14, f.ink(0.4 * a), f.ink(0));
        }
      };
    },
  },
  {
    name: "crowns cast down",
    lane: "pass",
    dur: [13, 20],
    themes: [
      "crown",
      "crowns",
      "worthy",
      "cast",
      "lay down",
      "at your feet",
      "bow",
      "surrender",
      "elders",
      "honour",
      "honor",
      "all to you",
      "throne",
      "lay it down",
      "lay my",
      "before you",
      "fall down",
      "cast our crowns",
    ],
    make: (w, h, room) => {
      const S0 = Math.min(w, h) * 0.07;
      const { x, scale } = room.place(S0 * 7);
      const S = S0 * scale,
        floor = h * 0.72;
      const crowns = Array.from({ length: 7 }, (_, i) => ({
        at: 0.1 + i * 0.09 + rnd(0, 0.04),
        x0: x + rnd(-2.6, 2.6) * S,
        x1: x + (i - 3) * S * 0.9 + rnd(-0.2, 0.2) * S,
        spin: rnd(-3, 3),
        rest: rnd(-0.3, 0.3),
        s: S * rnd(0.85, 1.1),
      }));
      const layer = layering();
      return (f) => {
        const { ctx } = f;
        // The light before which they are cast.
        glow(ctx, x, floor - S * 4, S * 5, f.ink(0.2 * f.env * (0.92 + 0.08 * f.beat)), f.ink(0));
        beam(f, x - S * 4, floor + S * 0.4, x + S * 4, floor + S * 0.4, 1, 0.12 * f.env);
        const { L, canvas } = layer(f);
        const tone = tones(f);
        for (const c of crowns) {
          const q = (f.k - c.at) / 0.12; // falling
          if (q <= 0) continue;
          const fall = Math.min(1, q);
          const bounce = q > 1 ? Math.abs(Math.sin(Math.min(q - 1, 0.5) * Math.PI * 2)) * (1 - Math.min(q - 1, 0.5) * 2) * 0.3 : 0;
          const px = c.x0 + (c.x1 - c.x0) * smooth(fall),
            py = -S + (floor - S * 0.5 + S) * fall * fall - bounce * S;
          const rot = fall < 1 ? c.spin * fall : c.rest + Math.sin(f.t * 0.3) * 0.01;
          L.save();
          L.translate(px, py);
          L.rotate(rot + (fall >= 1 ? 0 : Math.sin(f.t * 5) * 0.1));
          if (fall >= 1) L.scale(1, 0.6); // lying on the floor, seen foreshortened
          const g = L.createLinearGradient(-c.s, 0, c.s, 0);
          g.addColorStop(0, tone(0.3));
          g.addColorStop(0.45, tone(0.85));
          g.addColorStop(1, tone(0.35));
          L.fillStyle = g;
          crownPath(L, c.s);
          L.fill();
          L.fillStyle = tone(0.95);
          for (const dx of [-0.3, 0.3]) {
            L.beginPath();
            L.arc(dx * c.s, -c.s * 0.5, c.s * 0.07, 0, TAU);
            L.fill();
          }
          L.fillStyle = tone(0.7);
          L.beginPath();
          L.arc(0, c.s * 0.25, c.s * 0.1, 0, TAU);
          L.fill();
          L.restore();
        }
        lay(f, canvas, 0.75 * f.env, S * 0.3);
        // Each glints where it lies.
        for (const c of crowns) {
          const q = (f.k - c.at) / 0.12;
          if (q < 1) continue;
          glow(ctx, c.x1, floor - S * 0.5, c.s * 1.6, f.ink(0.12 * f.env * (0.6 + 0.4 * Math.sin(f.t * 1.3 + c.x1))), f.ink(0));
        }
      };
    },
  },
  {
    name: "six wings",
    lane: "back",
    dur: [22, 36],
    themes: [
      "holy",
      "holy holy holy",
      "seraph",
      "seraphim",
      "angel",
      "angels",
      "wings",
      "holy is the lord",
      "lord god almighty",
      "heaven",
      "cry",
      "whole earth is full",
      "glory",
      "isaiah",
      "train",
      "worthy",
    ],
    make: (w, h, room) => {
      const S0 = Math.min(w, h) * 0.22;
      const { x, scale } = room.place(S0 * 3.8);
      const S = S0 * scale,
        y = h * 0.42;
      const layer = layering();
      return (f) => {
        const { ctx } = f;
        const come = smooth(f.k * 2);
        // The brightness within, which the wings cover.
        glow(ctx, x, y, S * 1.3, f.ink(0.3 * f.env * come * (0.9 + 0.1 * f.beat)), f.ink(0));
        glow(ctx, x, y, S * 0.4, f.ink(0.5 * f.env * come), f.ink(0));
        const { L, canvas } = layer(f);
        const tone = tones(f);
        L.translate(x, y + Math.sin(f.t * 0.5) * 4);
        const beat = Math.sin(f.t * 0.9) * 0.12;
        // Three pairs: two covering the face (folded up and over), two covering the feet (down),
        // two with which it flies, outstretched and beating slowly. The far pair of each is dimmer.
        const pairs: { a: number; k: number; sx: number; sy: number; ox: number; oy: number }[] = [
          { a: -1.3 - beat * 0.3, k: 0.5, sx: 1.15, sy: 0.75, ox: 0.08, oy: -0.22 }, // raised, over the face
          { a: 1.15 + beat * 0.2, k: 0.45, sx: 1.1, sy: 0.75, ox: 0.08, oy: 0.22 }, // lowered, over the feet
          { a: -0.12 - beat * 0.6, k: 0.8, sx: 1.8, sy: 0.95, ox: 0.18, oy: -0.08 }, // outstretched, flying
        ];
        for (const p of pairs)
          for (const side of [-1, 1]) {
            L.save();
            L.scale(side * S, S);
            L.translate(p.ox, p.oy);
            L.rotate(p.a);
            L.scale(p.sx, p.sy);
            const g = L.createLinearGradient(0, 0, 1, 0.5);
            g.addColorStop(0, tone(p.k));
            g.addColorStop(1, tone(p.k * 0.55));
            L.fillStyle = g;
            wingPath(L);
            L.fill();
            // The coverts over the wing's root, and the shafts of the long feathers.
            L.strokeStyle = tone(p.k * 0.7);
            L.lineWidth = 0.012;
            wingCoverts(L);
            // The long feathers' shafts, each running down its own feather from the wrist.
            L.strokeStyle = tone(p.k * 1.15);
            L.lineWidth = 0.006;
            L.beginPath();
            for (const [ex, ey] of [
              [0.97, 0.28],
              [0.9, 0.47],
              [0.8, 0.6],
              [0.68, 0.67],
            ]) {
              L.moveTo(0.6 + (ex - 0.6) * 0.3, -0.1 + (ey + 0.1) * 0.3);
              L.lineTo(ex - 0.02, ey - 0.04);
            }
            L.stroke();
            L.restore();
          }
        // Cut away where the brightness is, so the wings are lost in it at their roots.
        L.globalCompositeOperation = "destination-out";
        const cut = L.createRadialGradient(0, 0, 0, 0, 0, S * 0.5);
        cut.addColorStop(0, "rgba(0,0,0,0.9)");
        cut.addColorStop(1, "rgba(0,0,0,0)");
        L.fillStyle = cut;
        L.fillRect(-S, -S, S * 2, S * 2);
        lay(f, canvas, 0.55 * f.env * come, S * 0.1);
      };
    },
  },
  {
    name: "lightnings",
    lane: "back",
    dur: [18, 30],
    moving: true,
    themes: [
      "lightning",
      "thunder",
      "power",
      "mighty",
      "voice",
      "majesty",
      "awesome",
      "storm",
      "god of wonders",
      "fear",
      "tremble",
      "shake",
      "roar",
      "the heavens declare",
      "thunders",
    ],
    make: (w, h) => {
      const puffs = Array.from({ length: 22 }, () => ({
        x: rnd(-0.1, 1.1) * w,
        y: rnd(-0.05, 0.22) * h,
        r: rnd(0.08, 0.18) * w,
        p: rnd(0, TAU),
      }));
      const bolts: { t: number; x: number; pts: [number, number][][] }[] = [];
      let next = rnd(1, 3);
      // A bolt: a main stroke stepping down from the cloud, with a few branches off it.
      const bolt = (x0: number): [number, number][][] => {
        const main: [number, number][] = [[x0, h * 0.12]];
        const branches: [number, number][][] = [];
        for (let i = 0; i < 11; i++) {
          const [px, py] = main[main.length - 1];
          const nx = px + rnd(-0.04, 0.04) * w,
            ny = py + h * rnd(0.04, 0.07);
          main.push([nx, ny]);
          if (i > 1 && i < 9 && Math.random() < 0.4) {
            const br: [number, number][] = [[nx, ny]];
            const d = Math.random() < 0.5 ? 1 : -1;
            for (let j = 0; j < 4; j++) {
              const [bx, by] = br[br.length - 1];
              br.push([bx + d * rnd(0.01, 0.035) * w, by + h * rnd(0.02, 0.05)]);
            }
            branches.push(br);
          }
        }
        return [main, ...branches];
      };
      return (f) => {
        const { ctx } = f;
        if (f.t >= next) {
          const x0 = rnd(0.1, 0.9) * w;
          bolts.push({ t: f.t, x: x0, pts: bolt(x0) });
          next = f.t + rnd(2.5, 6);
        }
        let flash = 0;
        for (let i = bolts.length - 1; i >= 0; i--) {
          const q = (f.t - bolts[i].t) / 1.1;
          if (q >= 1) {
            bolts.splice(i, 1);
            continue;
          }
          // Up in an instant, then dying away; a second flicker as it goes.
          const a = (q < 0.08 ? q / 0.08 : (1 - q) ** 2 * (0.7 + 0.3 * Math.sin(q * 40))) * f.env;
          flash = Math.max(flash, a);
          ctx.save();
          ctx.shadowColor = f.ink(0.6 * a, true);
          ctx.shadowBlur = 12;
          ctx.lineCap = "round";
          bolts[i].pts.forEach((path, j) => {
            ctx.strokeStyle = f.ink((j ? 0.25 : 0.45) * a, true);
            ctx.lineWidth = j ? 1 : 1.8;
            ctx.beginPath();
            path.forEach(([px, py], k) => (k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
            ctx.stroke();
          });
          ctx.restore();
          glow(ctx, bolts[i].x, h * 0.12, w * 0.25, f.ink(0.25 * a, true), f.ink(0, true));
        }
        // The cloud along the top, lit from within as the lightning plays in it.
        const dot = f.dot(true);
        for (const p of puffs) {
          const x = ((p.x + f.t * 4 + w * 0.2) % (w * 1.4)) - w * 0.2;
          ctx.globalAlpha =
            (f.dark ? 0.08 : 0.1) * f.env * (1 + 2.5 * flash * Math.max(0, 1 - Math.abs(x - (bolts[0]?.x ?? -1e9)) / (w * 0.3)));
          ctx.drawImage(dot, x - p.r, p.y - p.r * 0.6 + Math.sin(f.t * 0.3 + p.p) * 5, p.r * 2, p.r * 1.2);
        }
        ctx.globalAlpha = 1;
      };
    },
  },
  {
    name: "scroll",
    lane: "pass",
    dur: [13, 20],
    themes: [
      "scroll",
      "worthy",
      "seal",
      "seals",
      "open",
      "written",
      "book",
      "book of life",
      "word",
      "promise",
      "revelation",
      "worthy is",
      "history",
      "every tribe",
      "unfold",
      "plans",
      "story",
      "author",
    ],
    make: (w, h, room) => {
      const S0 = Math.min(w, h) * 0.16;
      const { x, scale } = room.place(S0 * 2.6);
      const S = S0 * scale,
        y = h * rnd(0.42, 0.55);
      const lines = Array.from({ length: 7 }, () => rnd(0.6, 1));
      const layer = layering();
      return (f) => {
        const { ctx } = f;
        const open = smooth(f.k * 2.6 - 0.3);
        const half = S * (0.12 + 1.08 * open); // from the two rollers together to the open scroll
        glow(ctx, x, y, S * 1.6, f.ink(0.1 * f.env * open), f.ink(0));
        const { L, canvas } = layer(f);
        const tone = tones(f);
        L.translate(x, y);
        // The sheet between the rollers, curling a little, with its lines of writing.
        const pg = L.createLinearGradient(0, -S * 0.55, 0, S * 0.55);
        pg.addColorStop(0, tone(0.6));
        pg.addColorStop(0.5, tone(0.9));
        pg.addColorStop(1, tone(0.6));
        L.fillStyle = pg;
        L.beginPath();
        L.moveTo(-half, -S * 0.55);
        L.quadraticCurveTo(0, -S * 0.5, half, -S * 0.55);
        L.lineTo(half, S * 0.55);
        L.quadraticCurveTo(0, S * 0.5, -half, S * 0.55);
        L.closePath();
        L.fill();
        L.strokeStyle = tone(0.45);
        L.lineWidth = Math.max(1, S * 0.018);
        L.lineCap = "round";
        lines.forEach((len, i) => {
          const ly = -S * 0.38 + i * S * 0.12;
          const seen = Math.max(0, half - S * 0.2);
          if (seen <= 0) return;
          L.beginPath();
          L.moveTo(-seen * len, ly);
          L.lineTo(seen * len, ly);
          L.stroke();
        });
        // The rollers, each a rod with knobs, the paper wound thick on them.
        for (const side of [-1, 1]) {
          const rx = side * (half + S * 0.08),
            wound = S * (0.1 + 0.12 * (1 - open));
          const rg = L.createLinearGradient(rx - wound, 0, rx + wound, 0);
          rg.addColorStop(0, tone(0.4));
          rg.addColorStop(0.5, tone(0.85));
          rg.addColorStop(1, tone(0.4));
          L.fillStyle = rg;
          L.fillRect(rx - wound, -S * 0.58, wound * 2, S * 1.16);
          L.fillStyle = tone(0.55);
          L.fillRect(rx - S * 0.035, -S * 0.75, S * 0.07, S * 1.5);
          for (const ky of [-0.75, 0.75]) {
            L.beginPath();
            L.arc(rx, ky * S, S * 0.06, 0, TAU);
            L.fill();
          }
        }
        // The seven seals along the edge, each breaking in turn as it opens.
        for (let i = 0; i < 7; i++) {
          const broken = smooth(f.k * 7 - i - 1);
          const sy = -S * 0.45 + i * S * 0.15;
          L.fillStyle = tone(0.35 + 0.3 * (1 - broken));
          L.beginPath();
          L.arc(half + S * 0.08, sy, S * 0.045 * (1 - 0.6 * broken), 0, TAU);
          L.fill();
        }
        lay(f, canvas, 0.8 * f.env, S * 0.12);
        // The writing's light.
        if (open > 0.5) {
          const a = smooth((open - 0.5) * 2);
          glow(ctx, x, y, half * 0.8, f.ink(0.08 * f.env * a), f.ink(0));
        }
      };
    },
  },
  {
    name: "trumpet",
    lane: "pass",
    dur: [13, 20],
    themes: [
      "trumpet",
      "sound",
      "return",
      "coming",
      "soon",
      "king is coming",
      "lift up your heads",
      "awake",
      "arise",
      "when he comes",
      "call",
      "last day",
      "the dead",
      "rise",
      "caught up",
      "in the clouds",
      "he's coming",
      "maranatha",
      "herald",
    ],
    make: (w, h, room) => {
      const S0 = Math.min(w, h) * 0.2;
      const { x, scale } = room.place(S0 * 2.4);
      const S = S0 * scale,
        y = h * rnd(0.4, 0.5);
      const dir = x < w / 2 ? 1 : -1;
      const blasts: number[] = [];
      let next = 1.5;
      const layer = layering();
      return (f) => {
        const { ctx } = f;
        const raise = smooth(f.k * 2.4);
        const ang = -0.55; // lifted, its bell to the sky
        const { L, canvas } = layer(f);
        const tone = tones(f);
        L.translate(x, y + (1 - raise) * 30);
        L.scale(dir * S, S);
        L.rotate(ang);
        // A long straight herald's trumpet: the mouthpiece, a slender tube, and the flaring bell.
        const tg = L.createLinearGradient(0, -0.3, 0, 0.3);
        tg.addColorStop(0, tone(0.45));
        tg.addColorStop(0.4, tone(0.95));
        tg.addColorStop(1, tone(0.35));
        L.fillStyle = tg;
        L.beginPath();
        L.moveTo(-1.1, -0.045);
        L.lineTo(0.55, -0.055);
        L.bezierCurveTo(0.85, -0.07, 0.95, -0.25, 1.1, -0.36);
        L.lineTo(1.1, 0.36);
        L.bezierCurveTo(0.95, 0.25, 0.85, 0.07, 0.55, 0.055);
        L.lineTo(-1.1, 0.045);
        L.closePath();
        L.fill();
        L.fillStyle = tone(0.7);
        L.beginPath();
        L.ellipse(-1.1, 0, 0.03, 0.08, 0, 0, TAU);
        L.fill();
        for (const bx of [-0.3, 0.3]) {
          L.fillRect(bx - 0.025, -0.075, 0.05, 0.15);
        }
        // The bell's mouth.
        L.fillStyle = tone(0.2);
        L.beginPath();
        L.ellipse(1.1, 0, 0.06, 0.36, 0, 0, TAU);
        L.fill();
        // A pennant hung beneath it, swaying.
        L.fillStyle = tone(0.55);
        L.beginPath();
        L.moveTo(0.0, 0.06);
        L.lineTo(0.5, 0.06);
        L.lineTo(0.5 + Math.sin(f.t * 2) * 0.03, 0.55);
        L.lineTo(0.0 - Math.sin(f.t * 2) * 0.03, 0.55);
        L.closePath();
        L.fill();
        lay(f, canvas, 0.8 * f.env, S * 0.1);
        // Its sound, going out and up from the bell: long blasts.
        const bx = x + dir * S * (Math.cos(ang) * 1.1),
          by = y + S * (Math.sin(ang) * 1.1) * 1;
        if (raise > 0.9 && f.t >= next) {
          blasts.push(f.t);
          next = f.t + rnd(2.5, 4);
        }
        glow(ctx, bx, by, S * 0.6, f.ink(0.14 * f.env * raise), f.ink(0));
        for (let i = blasts.length - 1; i >= 0; i--) {
          const q = (f.t - blasts[i]) / 4;
          if (q >= 1) {
            blasts.splice(i, 1);
            continue;
          }
          const r = q * S * 4;
          ctx.strokeStyle = f.ink(0.3 * f.env * (1 - q) ** 1.5);
          ctx.lineWidth = 2;
          ctx.beginPath();
          const mid = dir > 0 ? ang : Math.PI - ang;
          ctx.arc(bx, by, r, mid - 0.9, mid + 0.9);
          ctx.stroke();
        }
      };
    },
  },
  {
    name: "heavenly host",
    lane: "back",
    dur: [24, 40],
    themes: [
      "angels",
      "host",
      "ten thousand",
      "thousand",
      "heavenly host",
      "all of heaven",
      "join",
      "angels sing",
      "multitude",
      "saints",
      "every nation",
      "countless",
      "angel armies",
      "myriads",
      "choir",
      "all creation",
      "with the angels",
      "heaven and earth",
      "every tongue",
    ],
    make: (w, h, room) => {
      const cx = room.place(w * 0.5).x,
        cy = h * 0.18;
      const rings = Array.from({ length: 9 }, (_, i) => ({
        r: h * (0.16 + i * 0.1),
        n: 18 + i * 9,
        v: (i % 2 ? 1 : -1) * rnd(0.015, 0.03),
        p: rnd(0, TAU),
      }));
      return (f) => {
        const { ctx } = f;
        const come = smooth(f.k * 6);
        // The light they stand about.
        glow(ctx, cx, cy, h * 0.4, f.ink(0.26 * f.env * come * (0.92 + 0.08 * f.beat)), f.ink(0));
        const warm = f.dot(),
          cool = f.dot(true);
        rings.forEach((ring, i) => {
          const seen = smooth(f.k * 12 - i * 0.4);
          if (seen <= 0) return;
          const a0 = ring.p + f.t * ring.v;
          for (let j = 0; j < ring.n; j++) {
            const a = a0 + (j / ring.n) * TAU;
            const x = cx + Math.cos(a) * ring.r,
              y = cy + Math.sin(a) * ring.r * 0.55;
            if (y < cy - 10 || x < -10 || x > w + 10 || y > h + 10) continue; // only the near half, before the light
            const tw = 0.5 + 0.5 * Math.sin(f.t * 1.4 + j * 0.7 + i);
            const r = 3 + i * 0.5;
            ctx.globalAlpha = f.env * come * seen * (0.5 + 0.5 * tw) * (0.9 + 0.1 * f.beat);
            ctx.drawImage(j % 5 ? warm : cool, x - r, y - r, r * 2, r * 2);
            // Each light's small figure of praise: a little column beneath it, as one standing.
            ctx.globalAlpha = f.env * come * seen * 0.2;
            ctx.drawImage(warm, x - r * 0.7, y, r * 1.4, r * 3.5);
          }
        });
        ctx.globalAlpha = 1;
      };
    },
  },
];
