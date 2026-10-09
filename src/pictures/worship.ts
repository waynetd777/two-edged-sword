// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// The worshippers: hands raised, a banner, the timbrel, the shofar, hallelujah, the holy mountain,
// the open Word, the bread and cup, lights held high, the Name.

import { displayFont, flame, glow, lay, layering, ridge, rnd, smooth, TAU, tones, Vision, wander } from "./kit";

export const WORSHIP: Vision[] = [
  {
    name: "raised hands",
    lane: "back",
    dur: [22, 36],
    themes: [
      "hands",
      "lift",
      "raise",
      "lift up",
      "surrender",
      "hands high",
      "praise",
      "worship",
      "i surrender",
      "all to",
      "yield",
      "open hands",
      "reach",
      "arms",
      "lift my",
      "we lift",
      "raise my",
      "hands up",
    ],
    make: (w, h) => {
      // Arms raised from the foot of the page, seen from behind the crowd: the forearm, and the
      // open hand with its fingers spread to the light. Nearer ones larger and lower; each rises
      // once, in its own time, to its full height and holds there, swaying a little.
      const arms = Array.from({ length: 13 }, (_, i) => {
        const near = Math.random();
        const s = 11 + near * 13; // the palm's width: the hand's unit
        return {
          x: ((i + 0.5) / 13 + rnd(-0.03, 0.03)) * w,
          s,
          H: s * rnd(5.5, 7), // from the foot of the page to the wrist
          near,
          lean: rnd(-0.22, 0.22),
          d: rnd(0, 0.12),
          p: rnd(0, TAU),
          spread: rnd(0.7, 1),
          left: Math.random() < 0.5, // which hand, so the thumb is on the right side
        };
      });
      arms.sort((a, b) => a.near - b.near);
      const layer = layering();
      // The hand, in units of the palm's width, the wrist at (0, 0), the fingers upward.
      const hand = (G: CanvasRenderingContext2D, spread: number, left: boolean) => {
        const t = left ? -1 : 1; // the thumb's side
        // The palm: the wrist's width where it leaves the forearm (overlapping it a little, so
        // there is no seam), widening to the knuckles, rounded.
        G.beginPath();
        G.moveTo(-0.36, 0.25);
        G.lineTo(-0.36, -0.05);
        G.quadraticCurveTo(-0.5, -0.6, -0.5, -1.05);
        G.quadraticCurveTo(0, -1.2, 0.5, -1.05);
        G.quadraticCurveTo(0.5, -0.6, 0.36, -0.05);
        G.lineTo(0.36, 0.25);
        G.closePath();
        G.fill();
        // Four fingers from the knuckles, the middle longest, each a tapering rounded stroke.
        G.lineCap = "round";
        const fingers = [
          [-0.36, 0.9],
          [-0.12, 1.0],
          [0.12, 0.95],
          [0.36, 0.72],
        ];
        for (const [fx, len] of fingers) {
          const ang = fx * 0.55 * spread;
          G.lineWidth = 0.22;
          G.beginPath();
          G.moveTo(fx, -1.05);
          G.lineTo(fx + Math.sin(ang) * len, -1.05 - Math.cos(ang) * len);
          G.stroke();
          G.lineWidth = 0.17;
          G.beginPath();
          G.moveTo(fx + Math.sin(ang) * len * 0.6, -1.05 - Math.cos(ang) * len * 0.6);
          G.lineTo(fx + Math.sin(ang) * len * 1.1, -1.05 - Math.cos(ang) * len * 1.1);
          G.stroke();
        }
        // The thumb, from the side of the palm, angled out.
        G.lineWidth = 0.24;
        G.beginPath();
        G.moveTo(t * 0.42, -0.35);
        G.lineTo(t * (0.42 + 0.5 * spread), -0.75 - 0.25 * spread);
        G.stroke();
      };
      return (f) => {
        const { ctx } = f;
        glow(ctx, w / 2, -h * 0.1, h * 0.7, f.ink(0.16 * f.env), f.ink(0));
        const { L, canvas } = layer(f);
        const tone = tones(f);
        const foot = h + 10;
        for (const a of arms) {
          const up = smooth((f.k - a.d) * 6); // raised in the first while, then held
          if (up <= 0) continue;
          const sway = wander(f.t * 0.5, a.p) * 0.05;
          const H = a.H * (0.45 + 0.55 * up);
          L.save();
          L.translate(a.x, foot);
          L.rotate(a.lean + sway);
          // The forearm: thicker towards the elbow (below the page), narrowing to the wrist, lit
          // towards the hand.
          const g = L.createLinearGradient(0, 0, 0, -H);
          g.addColorStop(0, tone(0.1 + 0.08 * a.near));
          g.addColorStop(1, tone(0.42 + 0.3 * a.near));
          L.fillStyle = g;
          L.strokeStyle = g;
          L.beginPath();
          L.moveTo(-a.s * 0.58, 0);
          L.lineTo(a.s * 0.58, 0);
          L.quadraticCurveTo(a.s * 0.5, -H * 0.5, a.s * 0.36, -H);
          L.lineTo(-a.s * 0.36, -H);
          L.quadraticCurveTo(-a.s * 0.5, -H * 0.5, -a.s * 0.58, 0);
          L.closePath();
          L.fill();
          // The hand at the wrist, in the forearm's tone there.
          L.translate(0, -H);
          L.scale(a.s, a.s);
          L.fillStyle = tone(0.42 + 0.3 * a.near);
          L.strokeStyle = tone(0.42 + 0.3 * a.near);
          hand(L, a.spread * (0.9 + 0.1 * Math.sin(f.t * 0.6 + a.p)), a.left);
          L.restore();
        }
        lay(f, canvas, (f.dark ? 0.45 : 0.52) * f.env, 6);
        // The light catching the raised hands.
        for (const a of arms) {
          const up = smooth((f.k - a.d) * 6);
          if (up <= 0) continue;
          const sway = wander(f.t * 0.5, a.p) * 0.05;
          const H = a.H * (0.45 + 0.55 * up);
          const tx = a.x + Math.sin(a.lean + sway) * (H + a.s),
            ty = foot - Math.cos(a.lean + sway) * (H + a.s);
          glow(ctx, tx, ty, a.s * 2.2, f.ink(0.1 * f.env * up * (0.9 + 0.1 * f.beat)), f.ink(0));
        }
      };
    },
  },
  {
    name: "banner",
    lane: "pass",
    dur: [12, 18],
    themes: [
      "banner",
      "flag",
      "his banner",
      "banner over me",
      "victory",
      "jehovah nissi",
      "nissi",
      "wave",
      "lift high",
      "army",
      "battle",
      "standard",
      "raise a",
      "rally",
      "unfurl",
      "colours",
      "colors",
    ],
    make: (w, h, room) => {
      const H0 = Math.min(h * 0.5, w * 0.3);
      const { x: mid, scale } = room.place(H0 * 1.1);
      const H = H0 * scale,
        foot = h * 0.86,
        top = foot - H;
      const dir = mid < w / 2 ? 1 : -1;
      const x = mid - dir * H * 0.36; // the pole, so that pole and cloth together sit in the clear
      const layer = layering();
      return (f) => {
        const { ctx } = f;
        const up = smooth(f.k * 5); // raised in the first moments, then flown
        const ty = foot - (foot - top) * up;
        const { L, canvas } = layer(f);
        const tone = tones(f);
        // The pole, with a finial.
        L.strokeStyle = tone(0.5);
        L.lineWidth = Math.max(2, H * 0.014);
        L.lineCap = "round";
        L.beginPath();
        L.moveTo(x, foot + 10);
        L.lineTo(x, ty);
        L.stroke();
        L.fillStyle = tone(0.85);
        L.beginPath();
        L.arc(x, ty - H * 0.014, H * 0.02, 0, TAU);
        L.fill();
        // The cloth, flown from the pole: a rectangle of `len` by `depth`, its surface a wave that
        // runs out from the pole and grows as it goes, so the free end ripples most. It is drawn as
        // narrow strips along its length, each shaded by which way it faces the light, and the
        // cross upon it (a bar down the middle, a bar across) is shaded with them, so it bends
        // with the cloth.
        const len = H * 0.72,
          depth = H * 0.4;
        const n = 48;
        const waveAt = (u: number) =>
          Math.sin(u * 7.5 - f.t * 2.2) * depth * 0.1 * u + Math.sin(u * 3.2 - f.t * 1.3 + 1) * depth * 0.06 * u;
        const slopeAt = (u: number) => Math.cos(u * 7.5 - f.t * 2.2) * 7.5 * 0.1 * u + Math.cos(u * 3.2 - f.t * 1.3 + 1) * 3.2 * 0.06 * u;
        const flutter = (u: number) => 1 - 0.08 * u * (0.5 + 0.5 * Math.sin(u * 5 - f.t * 1.8)); // the free end a little gathered
        const cloth = (u: number, v: number) =>
          [x + dir * u * len, ty + H * 0.03 + (v - 0.5) * depth * flutter(u) + depth * 0.5 + waveAt(u)] as const;
        for (let i = 0; i < n; i++) {
          const u0 = i / n,
            u1 = (i + 1) / n + 0.006, // a hair over the next strip, so no seam shows between them
            um = (u0 + u1) / 2;
          const facing = 0.5 + 0.5 * Math.max(-1, Math.min(1, slopeAt(um) * dir * 1.6));
          const shade = 0.28 + 0.36 * facing;
          const onBar = um > 0.47 && um < 0.53; // the cross's upright, slender, in the middle of the cloth
          L.fillStyle = tone(shade);
          L.beginPath();
          L.moveTo(...cloth(u0, 0));
          L.lineTo(...cloth(u1, 0));
          L.lineTo(...cloth(u1, 1));
          L.lineTo(...cloth(u0, 1));
          L.closePath();
          L.fill();
          // The cross, brighter than the cloth, in the same light.
          L.fillStyle = tone(shade + 0.28);
          if (onBar) {
            L.beginPath();
            L.moveTo(...cloth(u0, 0.15));
            L.lineTo(...cloth(u1, 0.15));
            L.lineTo(...cloth(u1, 0.85));
            L.lineTo(...cloth(u0, 0.85));
            L.closePath();
            L.fill();
          }
          if (um > 0.37 && um < 0.63) {
            // The bar across, a little above the middle.
            L.beginPath();
            L.moveTo(...cloth(u0, 0.38));
            L.lineTo(...cloth(u1, 0.38));
            L.lineTo(...cloth(u1, 0.48));
            L.lineTo(...cloth(u0, 0.48));
            L.closePath();
            L.fill();
          }
        }
        // The cloth's hem and head, a little darker, and the cords that tie it to the pole.
        L.strokeStyle = tone(0.3);
        L.lineWidth = 1.2;
        for (const v of [0, 1]) {
          L.beginPath();
          for (let i = 0; i <= n; i++) L.lineTo(...cloth(i / n, v));
          L.stroke();
        }
        L.strokeStyle = tone(0.7);
        L.lineWidth = 1.5;
        for (const v of [0.02, 0.98]) {
          const [cx, cy] = cloth(0, v);
          L.beginPath();
          L.moveTo(x, cy - 2);
          L.lineTo(cx, cy);
          L.stroke();
        }
        lay(f, canvas, 0.5 * f.env, H * 0.03);
        glow(ctx, x + dir * len * 0.42, ty + depth * 0.55, H * 0.4, f.ink(0.06 * f.env * up * (0.9 + 0.1 * f.beat)), f.ink(0));
      };
    },
  },
  {
    name: "timbrel",
    lane: "pass",
    dur: [12, 18],
    themes: [
      "dance",
      "dancing",
      "timbrel",
      "tambourine",
      "rejoice",
      "joy",
      "celebrate",
      "miriam",
      "shout",
      "praise",
      "feast",
      "clap",
      "glad",
      "jump",
      "leap",
      "undignified",
      "sing and dance",
    ],
    make: (w, h, room) => {
      const S0 = Math.min(w, h) * 0.12;
      const { x, scale } = room.place(S0 * 2.8);
      const S = S0 * scale,
        y = h * rnd(0.42, 0.55);
      const n = 8; // pairs of jingles in the frame
      const layer = layering();
      return (f) => {
        const { ctx } = f;
        const come = smooth(f.k * 2.4);
        // Shaken: a quick tilt and a lift on each beat, settling back; and a slow sway.
        const shake = Math.sin(f.t * 12) * 0.07 * f.beat + Math.sin(f.t * 1.1) * 0.06;
        const lift = -f.beat * S * 0.12 + Math.sin(f.t * 1.3) * S * 0.06;
        const { L, canvas } = layer(f);
        const tone = tones(f);
        L.translate(x, y + lift + (1 - come) * 20);
        L.rotate(shake);
        L.scale(S, S);
        // A tambourine seen from in front and above: the hoop a wooden band `D` deep, its top rim
        // an ellipse squashed by the tilt (`sq`), the skin stretched across the top, and the
        // jingles in slots in the band, pairs of small metal discs on a pin.
        const sq = 0.42,
          D = 0.3;
        const rim = (a: number, dy: number) => [Math.cos(a), Math.sin(a) * sq + dy] as const;
        // The band's front half, from one side round to the other, lit from the left.
        const wood = L.createLinearGradient(-1, 0, 1, 0);
        wood.addColorStop(0, tone(0.72));
        wood.addColorStop(0.4, tone(0.5));
        wood.addColorStop(1, tone(0.26));
        L.fillStyle = wood;
        L.beginPath();
        for (let i = 0; i <= 40; i++) L.lineTo(...rim((i / 40) * Math.PI, 0));
        for (let i = 40; i >= 0; i--) L.lineTo(...rim((i / 40) * Math.PI, D));
        L.closePath();
        L.fill();
        // The skin across the top, pale and taut, brightest where the light falls; the rim about it.
        const skin = L.createRadialGradient(-0.3, -0.12, 0.05, 0, 0, 1);
        skin.addColorStop(0, tone(0.8));
        skin.addColorStop(1, tone(0.5));
        L.fillStyle = skin;
        L.beginPath();
        L.ellipse(0, 0, 1, sq, 0, 0, TAU);
        L.fill();
        L.strokeStyle = tone(0.62);
        L.lineWidth = 0.06;
        L.beginPath();
        L.ellipse(0, 0, 1, sq, 0, 0, TAU);
        L.stroke();
        L.strokeStyle = tone(0.2);
        L.lineWidth = 0.015;
        L.beginPath();
        L.ellipse(0, D, 1, sq, 0, 0, Math.PI);
        L.stroke();
        // The jingles, in the slots: those at the front seen edge on, those at the sides face on.
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + Math.PI / n;
          if (Math.sin(a) < -0.15) continue; // round the back
          const [px, py] = rim(a, D / 2);
          const face = Math.abs(Math.cos(a)); // how much of the disc's face we see
          const tx = -Math.sin(a),
            ty = Math.cos(a) * sq; // along the band, where the pin runs
          // The slot, dark.
          L.fillStyle = tone(0.08);
          L.beginPath();
          L.ellipse(px, py, 0.05 + 0.1 * (1 - face), 0.11, 0, 0, TAU);
          L.fill();
          // The pair of discs, a little apart on their pin, rattling together as it is shaken.
          const jolt = Math.sin(f.t * 14 + i * 1.7) * 0.02 * f.beat;
          for (const k of [-1, 1]) {
            const flash = Math.max(0, Math.sin(f.t * 9 + i * 1.3 + k)) ** 3 * (0.4 + 0.6 * f.beat);
            L.fillStyle = tone(0.75 + 0.5 * flash);
            L.beginPath();
            L.ellipse(px + tx * (0.045 + jolt) * k, py + ty * (0.045 + jolt) * k, 0.025 + 0.085 * face, 0.1, 0, 0, TAU);
            L.fill();
          }
        }
        lay(f, canvas, 0.8 * f.env * come, S * 0.1);
        // The light off the jingles as they flash.
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + Math.PI / n;
          if (Math.sin(a) < -0.15) continue;
          const flash = Math.max(0, Math.sin(f.t * 9 + i * 1.3)) ** 4 * (0.3 + 0.7 * f.beat);
          if (flash < 0.15) continue;
          const [px, py] = rim(a, D / 2);
          const gx = x + (px * Math.cos(shake) - py * Math.sin(shake)) * S,
            gy = y + lift + (px * Math.sin(shake) + py * Math.cos(shake)) * S;
          glow(ctx, gx, gy, S * 0.3, f.ink(0.3 * f.env * flash), f.ink(0));
        }
      };
    },
  },
  {
    name: "shofar",
    lane: "pass",
    dur: [12, 18],
    themes: [
      "shofar",
      "trumpet",
      "horn",
      "sound",
      "blow",
      "awake",
      "call",
      "israel",
      "zion",
      "jubilee",
      "year of",
      "battle",
      "cry",
      "sound the",
      "alarm",
      "proclaim",
      "declare",
      "wake up",
    ],
    make: (w, h, room) => {
      const S0 = Math.min(w, h) * 0.16;
      const { x, scale } = room.place(S0 * 2.6);
      const S = S0 * scale,
        y = h * rnd(0.42, 0.55);
      const dir = x < w / 2 ? 1 : -1; // its bell towards the middle of the page
      const blasts: number[] = [];
      let next = 1.5;
      // The horn's spine, in its own units (S): from the mouthpiece, up and over in a ram's
      // horn's sweep, to the bell; and its girth along the way, narrow at the mouth, flaring wide.
      const P = [
        [-1.15, -0.6],
        [-0.85, 0.75],
        [0.35, 1.0],
        [1.0, -0.25],
      ] as const;
      const spine = (u: number) => {
        const v = 1 - u;
        return [
          v * v * v * P[0][0] + 3 * v * v * u * P[1][0] + 3 * v * u * u * P[2][0] + u * u * u * P[3][0],
          v * v * v * P[0][1] + 3 * v * v * u * P[1][1] + 3 * v * u * u * P[2][1] + u * u * u * P[3][1],
        ] as const;
      };
      const normal = (u: number) => {
        const [x1, y1] = spine(Math.max(0, u - 0.01)),
          [x2, y2] = spine(Math.min(1, u + 0.01));
        const l = Math.hypot(x2 - x1, y2 - y1) || 1;
        return [-(y2 - y1) / l, (x2 - x1) / l] as const;
      };
      const girth = (u: number) => 0.03 + 0.3 * u ** 1.6;
      const bands = [0.8, 0.86, 0.92]; // the light bands near the bell
      const layer = layering();
      return (f) => {
        const { ctx } = f;
        const raise = smooth(f.k * 2.4);
        const { L, canvas } = layer(f);
        const tone = tones(f);
        L.translate(x, y + (1 - raise) * 30);
        L.scale(dir * S, S);
        L.rotate(Math.sin(f.t * 0.6) * 0.02);
        // The body: the outline run along one side and back along the other, filled as a shaded
        // tube, dark horn at the mouthpiece warming to the polished flare of the bell.
        const N = 40;
        L.beginPath();
        for (let i = 0; i <= N; i++) {
          const u = i / N,
            [px, py] = spine(u),
            [nx, ny] = normal(u),
            g = girth(u);
          L.lineTo(px + nx * g, py + ny * g);
        }
        for (let i = N; i >= 0; i--) {
          const u = i / N,
            [px, py] = spine(u),
            [nx, ny] = normal(u),
            g = girth(u);
          L.lineTo(px - nx * g, py - ny * g);
        }
        L.closePath();
        const body = L.createLinearGradient(-1.1, 0, 1.0, 0);
        body.addColorStop(0, tone(0.22));
        body.addColorStop(0.5, tone(0.36));
        body.addColorStop(1, tone(0.5));
        L.fillStyle = body;
        L.fill();
        // The light along its upper side, and the shadow under it: a highlight run along the spine,
        // offset towards the light, wide where the horn is wide.
        for (const [off, k, wd] of [
          [0.45, 0.62, 0.5],
          [-0.55, 0.18, 0.4],
        ]) {
          L.strokeStyle = tone(k);
          L.lineCap = "round";
          L.beginPath();
          for (let i = 1; i < N; i++) {
            const u = i / N,
              [px, py] = spine(u),
              [nx, ny] = normal(u),
              g = girth(u);
            L.lineWidth = g * wd;
            L.lineTo(px + nx * g * off, py + ny * g * off);
          }
          L.stroke();
        }
        // The pale bands that ring the horn near its bell, each following its roundness.
        L.strokeStyle = tone(0.65);
        L.lineWidth = 0.03;
        for (const u of bands) {
          const [px, py] = spine(u),
            [nx, ny] = normal(u),
            g = girth(u) * 0.97;
          L.beginPath();
          L.moveTo(px + nx * g, py + ny * g);
          L.quadraticCurveTo(px + ny * g * 0.35, py - nx * g * 0.35, px - nx * g, py - ny * g);
          L.stroke();
        }
        // The keel: the ridge that runs the length of a ram's horn, a faint line along it.
        L.strokeStyle = tone(0.38);
        L.lineWidth = 0.01;
        L.beginPath();
        for (let i = 0; i <= N; i++) {
          const u = i / N,
            [px, py] = spine(u),
            [nx, ny] = normal(u);
          L.lineTo(px + nx * girth(u) * 0.1, py + ny * girth(u) * 0.1);
        }
        L.stroke();
        // The bell: its open mouth an oval, dark within, with a bright rim; and the mouthpiece's
        // small round end.
        const [bx, by] = spine(1),
          [bnx, bny] = normal(1);
        const bg = girth(1);
        L.save();
        L.translate(bx, by);
        L.rotate(Math.atan2(bny, bnx));
        L.fillStyle = tone(0.6);
        L.beginPath();
        L.ellipse(0, 0, bg * 1.02, bg * 0.42, 0, 0, TAU);
        L.fill();
        L.fillStyle = tone(0.08);
        L.beginPath();
        L.ellipse(0, 0, bg * 0.9, bg * 0.32, 0, 0, TAU);
        L.fill();
        L.restore();
        const [mx, my] = spine(0),
          [mnx, mny] = normal(0);
        L.save();
        L.translate(mx, my);
        L.rotate(Math.atan2(mny, mnx));
        L.fillStyle = tone(0.2);
        L.fillRect(-girth(0) * 1.2, -0.03, girth(0) * 2.4, 0.06);
        L.restore();
        lay(f, canvas, 0.55 * f.env, S * 0.04);
        // Its blasts: rings of sound going out from the bell, long and short, as the shofar is blown.
        const ang = Math.atan2(bny, bnx);
        const ex = x + dir * S * (bx + Math.cos(ang) * 0.05),
          ey = y + (1 - raise) * 30 + S * (by + Math.sin(ang) * 0.05);
        if (raise > 0.9 && f.t >= next) {
          blasts.push(f.t);
          next = f.t + (blasts.length % 3 ? rnd(0.5, 0.9) : rnd(2, 3.5));
        }
        glow(ctx, ex, ey, S * 0.5, f.ink(0.05 * f.env * raise), f.ink(0));
        // The sound goes the way the bell faces.
        const out = Math.atan2(Math.sin(ang) * 1, dir * Math.cos(ang));
        for (let i = blasts.length - 1; i >= 0; i--) {
          const q = (f.t - blasts[i]) / 3;
          if (q >= 1) {
            blasts.splice(i, 1);
            continue;
          }
          ctx.strokeStyle = f.ink(0.16 * f.env * (1 - q) ** 1.5);
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(ex, ey, q * S * 3.2, out - 0.9, out + 0.9);
          ctx.stroke();
        }
      };
    },
  },
  {
    name: "hallelujah",
    lane: "pass",
    dur: [12, 18],
    themes: [
      "hallelujah",
      "alleluia",
      "praise",
      "praise the lord",
      "glory",
      "raise a hallelujah",
      "shout",
      "sing",
      "hosanna",
      "glory to god",
      "worthy",
      "lift up",
      "exalt",
      "magnify",
    ],
    make: (w, h, room) => {
      const size0 = Math.min(h * 0.16, w * 0.09);
      const { x: cx, scale } = room.place(size0 * 5.4);
      const size = Math.round(size0 * scale);
      const y = h * rnd(0.4, 0.55);
      const word = "Hallelujah";
      let widths: number[] | null = null;
      return (f) => {
        const { ctx } = f;
        ctx.save();
        ctx.font = `italic 400 ${size}px ${displayFont()}`;
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        if (!widths) widths = [...word].map((c) => ctx.measureText(c).width);
        const total = widths.reduce((a, b) => a + b, 0);
        let px = cx - total / 2;
        // Letter by letter, each coming up out of the light, and holding still.
        [...word].forEach((c, i) => {
          const a = f.env * smooth(f.k * 6 - i * 0.35) * smooth((1 - f.k) * 5);
          ctx.shadowColor = f.ink(0.5 * a);
          ctx.shadowBlur = size * 0.4;
          ctx.fillStyle = f.ink(0.3 * a);
          ctx.fillText(c, px, y);
          px += widths![i];
        });
        ctx.restore();
        glow(ctx, cx, y, size * 3, f.ink(0.08 * f.env * (0.9 + 0.1 * f.beat)), f.ink(0));
      };
    },
  },
  {
    name: "holy mountain",
    lane: "back",
    dur: [24, 40],
    themes: [
      "mountain",
      "mountains",
      "holy mountain",
      "mountain of the lord",
      "sinai",
      "zion",
      "come up",
      "higher",
      "high places",
      "ascend",
      "climb",
      "the mountain",
      "mountains tremble",
      "lift my eyes",
      "majesty",
      "top of the mountain",
      "mountain top",
      "the heights",
      "summit",
    ],
    make: (w, h, room) => {
      const px = room.place(w * 0.5).x,
        base = h + 10,
        peakY = h * 0.22;
      // The mountain: a great peak, its sides falling in long rough slopes to the foot of the
      // page; a lesser ridge before it; cloud about the summit; fire and light upon it.
      const side = ridge(0, 1);
      const profile = (x: number) => {
        const d = Math.abs(x - px) / (w * 0.55);
        const slope = peakY + (base - peakY) * Math.min(1, d ** 0.85 * 1.05);
        return slope + side(x * 0.7 + 300) * h * 0.02 * Math.min(1, d * 3);
      };
      const fore = ridge(h * 0.86, h * 0.05);
      const puffs = Array.from({ length: 16 }, () => ({
        a: rnd(0, TAU),
        r: rnd(0.07, 0.14) * w,
        d: rnd(0.9, 1.5),
        v: rnd(0.04, 0.1),
        p: rnd(0, TAU),
      }));
      const flashes: number[] = [];
      let next = rnd(4, 8);
      return (f) => {
        const { ctx } = f;
        const come = smooth(f.k * 1.6);
        const glory = smooth(f.k * 2.5 - 0.4) * (0.9 + 0.1 * f.beat);
        // The sky lit about the summit.
        glow(ctx, px, peakY, w * 0.16, f.ink(0.06 * f.env * glory), f.ink(0));
        // The mountain, in its own faint light, brighter towards the summit where the glory is.
        const mg = ctx.createLinearGradient(0, peakY, 0, base);
        mg.addColorStop(0, f.ink((0.1 + 0.1 * glory) * f.env * come, true));
        mg.addColorStop(0.35, f.ink(0.07 * f.env * come, true));
        mg.addColorStop(1, f.ink(0.015 * f.env * come, true));
        ctx.fillStyle = mg;
        ctx.beginPath();
        ctx.moveTo(-10, base);
        for (let x = -10; x <= w + 20; x += 10) ctx.lineTo(x, profile(x));
        ctx.lineTo(w + 10, base);
        ctx.fill();
        // Its lit side: the face towards the light a shade brighter, cut along the summit's fall line.
        const lg = ctx.createLinearGradient(px, peakY, px + w * 0.4, base);
        lg.addColorStop(0, f.ink(0.04 * f.env * come * glory, true));
        lg.addColorStop(1, f.ink(0, true));
        ctx.fillStyle = lg;
        ctx.beginPath();
        ctx.moveTo(px, peakY);
        for (let x = px; x <= w + 20; x += 10) ctx.lineTo(x, profile(x));
        ctx.lineTo(w + 10, base);
        ctx.lineTo(px + w * 0.05, base);
        ctx.fill();
        // The lesser ridge before it, dark.
        const fg = ctx.createLinearGradient(0, h * 0.8, 0, h);
        fg.addColorStop(0, f.ink(0.06 * f.env * come, true));
        fg.addColorStop(1, f.ink(0.01 * f.env * come, true));
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w + 12; x += 12) ctx.lineTo(x, fore(x));
        ctx.lineTo(w, h);
        ctx.fill();
        // Fire on the summit, and now and then lightning in the cloud.
        for (let i = 0; i < 5; i++) flame(f, px + (i - 2) * w * 0.01, peakY + 4, 11 + (i % 3) * 5, i * 2.3, 0.5 * glory);
        glow(ctx, px, peakY, w * 0.05, f.ink(0.2 * f.env * glory), f.ink(0));
        if (glory > 0.8 && f.t >= next) {
          flashes.push(f.t);
          next = f.t + rnd(5, 10);
        }
        let flash = 0;
        for (let i = flashes.length - 1; i >= 0; i--) {
          const q = (f.t - flashes[i]) / 0.8;
          if (q >= 1) flashes.splice(i, 1);
          else flash = Math.max(flash, (1 - q) ** 2);
        }
        // The cloud, wreathing the summit and turning slowly about it, lit from within by the glory.
        const dot = f.dot();
        for (const c of puffs) {
          const a = c.a + f.t * c.v;
          const x = px + Math.cos(a) * w * 0.12 * c.d,
            y = peakY + Math.sin(a) * h * 0.05 * c.d - h * 0.02 + Math.sin(f.t * 0.3 + c.p) * 4;
          ctx.globalAlpha = (f.dark ? 0.05 : 0.07) * f.env * come * (0.7 + 0.5 * glory + flash);
          ctx.drawImage(dot, x - c.r, y - c.r * 0.6, c.r * 2, c.r * 1.2);
        }
        ctx.globalAlpha = 1;
        if (flash > 0) glow(ctx, px + w * 0.04, peakY - h * 0.03, w * 0.14, f.ink(0.18 * f.env * flash, true), f.ink(0, true));
      };
    },
  },
  {
    name: "open bible",
    lane: "pass",
    dur: [13, 20],
    themes: [
      "word",
      "scripture",
      "truth",
      "bible",
      "promise",
      "written",
      "your word",
      "every promise",
      "read",
      "speak",
      "voice",
      "says",
      "his word",
      "the word",
      "lamp unto",
      "sword of the spirit",
      "living word",
      "thy word",
      "it is written",
    ],
    make: (w, h, room) => {
      const S0 = Math.min(w, h) * 0.17;
      const { x, scale } = room.place(S0 * 2.5);
      const S = S0 * scale,
        y = h * rnd(0.52, 0.6);
      const lines = [0, 1].map(() => Array.from({ length: 11 }, () => rnd(0.72, 1)));
      const layer = layering();
      return (f) => {
        const { ctx } = f;
        // Soft light rising off the open pages.
        const g = ctx.createLinearGradient(0, y, 0, y - S * 1.6);
        g.addColorStop(0, f.ink(0.14 * f.env));
        g.addColorStop(1, f.ink(0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x - S * 1.0, y);
        ctx.lineTo(x + S * 1.0, y);
        ctx.lineTo(x + S * 1.3, y - S * 1.6);
        ctx.lineTo(x - S * 1.3, y - S * 1.6);
        ctx.fill();
        const { L, canvas } = layer(f);
        const tone = tones(f);
        L.translate(x, y);
        L.scale(S, S);
        // The book lies open, seen from in front and a little above. In its own units: the spine
        // at x 0; each page runs out to x ±1, its top and bottom edges bowing up a little as the
        // page curves away from the gutter; the cover a little larger beneath, and the block of
        // leaves showing at the fore-edge.
        const page = (side: number, k: number) => {
          // The outline of one page, `k` larger than the page itself (1 for the page, more for the cover).
          const o = (k - 1) * 0.5;
          L.beginPath();
          L.moveTo(0, 0.3 + o * 0.5);
          L.quadraticCurveTo(side * 0.5 * k, 0.2 + o * 0.5, side * (1.0 + o), 0.14 + o * 0.3);
          L.lineTo(side * (1.0 + o), -0.5 - o * 0.3);
          L.quadraticCurveTo(side * 0.5 * k, -0.44 - o * 0.5, 0, -0.36 - o * 0.5);
          L.closePath();
        };
        // The cover, dark, with its lighter edge.
        for (const side of [-1, 1]) {
          L.fillStyle = tone(0.55);
          page(side, 1.14);
          L.fill();
          L.fillStyle = tone(0.28);
          page(side, 1.1);
          L.fill();
        }
        // The spine, standing a little proud below the pages.
        L.fillStyle = tone(0.35);
        L.fillRect(-0.06, -0.42, 0.12, 0.78);
        // The block of leaves at the fore-edges and foot: fine lines a little inside the cover.
        L.strokeStyle = tone(0.7);
        L.lineWidth = 0.008;
        for (const side of [-1, 1])
          for (let i = 1; i <= 4; i++) {
            const o = i * 0.012;
            L.beginPath();
            L.moveTo(side * (1.0 + o), 0.14 + o * 0.8);
            L.lineTo(side * (1.0 + o), -0.5 - o * 0.5);
            L.stroke();
            L.beginPath();
            L.moveTo(0, 0.3 + o * 1.1);
            L.quadraticCurveTo(side * 0.5, 0.2 + o * 1.1, side * (1.0 + o), 0.14 + o * 0.8);
            L.stroke();
          }
        // The two open pages, pale, shaded into the gutter.
        for (const side of [-1, 1]) {
          const pg = L.createLinearGradient(0, 0, side, 0);
          pg.addColorStop(0, tone(0.6));
          pg.addColorStop(0.2, tone(0.9));
          pg.addColorStop(1, tone(0.82));
          L.fillStyle = pg;
          page(side, 1);
          L.fill();
          // Two columns of text on each page, as lines following the page's curve.
          L.strokeStyle = tone(0.5);
          L.lineWidth = 0.014;
          L.lineCap = "round";
          lines[side > 0 ? 1 : 0].forEach((len, i) => {
            const v = i / 10; // down the page
            const yIn = -0.28 + v * 0.5,
              yOut = -0.42 + v * 0.5;
            for (const [c0, c1] of [
              [0.1, 0.5],
              [0.56, 0.92],
            ]) {
              const l = c1 - (c1 - c0) * (1 - len) * (i % 3 === 2 ? 1 : 0.1);
              L.beginPath();
              L.moveTo(side * c0, yIn + (yOut - yIn) * c0 - Math.sin(Math.PI * c0) * 0.03);
              L.lineTo(side * l, yIn + (yOut - yIn) * l - Math.sin(Math.PI * l) * 0.03);
              L.stroke();
            }
          });
        }
        // The gutter's shadow, and the ribbon marker lying in it and over the foot of the right page.
        const gg = L.createLinearGradient(-0.12, 0, 0.12, 0);
        gg.addColorStop(0, "rgba(0,0,0,0)");
        gg.addColorStop(0.5, tone(0.4));
        gg.addColorStop(1, "rgba(0,0,0,0)");
        L.fillStyle = gg;
        L.beginPath();
        L.moveTo(-0.12, -0.38);
        L.lineTo(0.12, -0.38);
        L.lineTo(0.12, 0.3);
        L.lineTo(-0.12, 0.3);
        L.fill();
        L.strokeStyle = tone(0.45);
        L.lineWidth = 0.05;
        L.lineCap = "butt";
        L.beginPath();
        L.moveTo(0.02, -0.3);
        L.quadraticCurveTo(0.08, 0.1, 0.18, 0.28);
        L.lineTo(0.22, 0.5);
        L.stroke();
        lay(f, canvas, 0.85 * f.env, S * 0.1);
      };
    },
  },
  {
    name: "communion",
    lane: "pass",
    dur: [13, 20],
    themes: [
      "bread",
      "cup",
      "wine",
      "body",
      "blood",
      "remember",
      "broken",
      "table",
      "communion",
      "supper",
      "poured out",
      "do this",
      "take and eat",
      "his body",
      "shed for",
      "covenant",
      "last supper",
      "broken for",
    ],
    make: (w, h, room) => {
      const S0 = Math.min(w, h) * 0.1;
      const { x, scale } = room.place(S0 * 3.6);
      const S = S0 * scale,
        y = h * 0.66;
      const layer = layering();
      return (f) => {
        const { ctx } = f;
        const come = smooth(f.k * 2.4);
        const part = smooth(f.k * 3 - 1.2); // the bread is broken
        // Light from above, on the table.
        glow(ctx, x, y - S * 2.5, S * 2.6, f.ink(0.12 * f.env), f.ink(0));
        ctx.save();
        ctx.translate(x, y + S * 0.3);
        ctx.scale(3, 0.4);
        glow(ctx, 0, 0, S * 1.2, f.ink(0.18 * f.env * come), f.ink(0));
        ctx.restore();
        const { L, canvas } = layer(f);
        const tone = tones(f);
        L.translate(x, y + (1 - come) * 20);
        L.scale(S, S);
        // The cup: a chalice, its bowl catching the light, the wine dark within.
        const cx = 0.9;
        const cg = L.createLinearGradient(cx - 0.5, 0, cx + 0.5, 0);
        cg.addColorStop(0, tone(0.35));
        cg.addColorStop(0.4, tone(0.85));
        cg.addColorStop(1, tone(0.3));
        L.fillStyle = cg;
        L.beginPath();
        L.moveTo(cx - 0.5, -1.0);
        L.bezierCurveTo(cx - 0.5, -0.3, cx - 0.1, -0.2, cx, -0.2);
        L.bezierCurveTo(cx + 0.1, -0.2, cx + 0.5, -0.3, cx + 0.5, -1.0);
        L.closePath();
        L.fill();
        L.fillRect(cx - 0.06, -0.25, 0.12, 0.45);
        L.beginPath();
        L.ellipse(cx, 0.22, 0.38, 0.1, 0, 0, TAU);
        L.fill();
        L.fillStyle = tone(0.5);
        L.beginPath();
        L.ellipse(cx, -1.0, 0.5, 0.13, 0, 0, TAU);
        L.fill();
        L.fillStyle = tone(0.2);
        L.beginPath();
        L.ellipse(cx, -0.99, 0.42, 0.1, 0, 0, TAU);
        L.fill();
        // The loaf, round and crusted, broken in two and the halves drawn apart.
        for (const side of [-1, 1]) {
          const dx = -0.9 + side * (0.02 + 0.22 * part);
          const bg = L.createLinearGradient(dx - 0.6, -0.5, dx + 0.3, 0.2);
          bg.addColorStop(0, tone(0.8));
          bg.addColorStop(1, tone(0.35));
          L.fillStyle = bg;
          L.beginPath();
          if (side < 0) {
            L.moveTo(dx, -0.45);
            L.bezierCurveTo(dx - 0.5, -0.5, dx - 0.75, -0.2, dx - 0.72, 0.1);
            L.quadraticCurveTo(dx - 0.6, 0.22, dx, 0.22);
          } else {
            L.moveTo(dx, -0.45);
            L.bezierCurveTo(dx + 0.5, -0.5, dx + 0.75, -0.2, dx + 0.72, 0.1);
            L.quadraticCurveTo(dx + 0.6, 0.22, dx, 0.22);
          }
          // The broken face, rough.
          for (let i = 0; i <= 6; i++) L.lineTo(dx + side * Math.sin(i * 2.1) * 0.04 * part, 0.22 - (i / 6) * 0.67);
          L.closePath();
          L.fill();
          L.fillStyle = tone(0.9);
          L.beginPath();
          for (let i = 0; i <= 6; i++) L.lineTo(dx + side * (0.02 + Math.sin(i * 2.1) * 0.04) * part, 0.22 - (i / 6) * 0.67);
          for (let i = 6; i >= 0; i--) L.lineTo(dx + side * Math.sin(i * 2.1) * 0.03 * part, 0.2 - (i / 6) * 0.65);
          L.closePath();
          L.fill();
        }
        // A few crumbs.
        L.fillStyle = tone(0.6);
        for (const [bx, by] of [
          [-0.95, 0.27],
          [-0.8, 0.3],
          [-1.1, 0.3],
        ])
          L.fillRect(bx + Math.sin(bx * 50) * 0.1 * part, by, 0.04, 0.025);
        lay(f, canvas, 0.85 * f.env, S * 0.12);
        // The wine's gleam.
        glow(ctx, x + S * 0.9, y - S * 1.0, S * 0.4, f.ink(0.3 * f.env * come, true), f.ink(0, true));
      };
    },
  },
  {
    name: "lights held high",
    lane: "back",
    dur: [22, 36],
    themes: [
      "light",
      "candle",
      "shine",
      "let your light",
      "we are the light",
      "city on a hill",
      "night",
      "light of the world",
      "hope",
      "together",
      "church",
      "we are",
      "one voice",
      "every heart",
      "generation",
      "stand together",
      "shine on",
    ],
    make: (w, h) => {
      // A crowd's lights, held up and swaying: rows further up the page smaller and closer.
      const lights: { x: number; y: number; r: number; p: number; s: number; cool: boolean }[] = [];
      for (let row = 0; row < 9; row++) {
        const d = row / 8; // 0 nearest
        const n = Math.round(7 + d * 14);
        for (let i = 0; i < n; i++) {
          lights.push({
            x: ((i + rnd(0.2, 0.8)) / n) * w,
            y: h * (0.92 - d * 0.5) + rnd(-8, 8),
            r: 7 - d * 4.5,
            p: rnd(0, TAU),
            s: rnd(0.4, 0.8),
            cool: Math.random() < 0.2,
          });
        }
      }
      return (f) => {
        const { ctx } = f;
        const lit = smooth(f.k * 6);
        // A soft haze of all of them together, and a brightness over the stage ahead.
        glow(ctx, w / 2, h * 0.25, w * 0.5, f.ink(0.1 * f.env * lit), f.ink(0));
        const warm = f.dot(),
          cool = f.dot(true);
        for (const l of lights) {
          const on = smooth(f.k * 12 - (l.y / h) * 1.5 - 0.3);
          if (on <= 0) continue;
          const x = l.x + Math.sin(f.t * l.s + l.p) * (14 - l.r) * 2.2;
          const y = l.y - Math.abs(Math.sin(f.t * l.s + l.p)) * 6;
          const flick = 0.75 + 0.25 * Math.sin(f.t * 7 + l.p) * (0.5 + 0.5 * f.beat);
          const dot = l.cool ? cool : warm;
          ctx.globalAlpha = f.env * on * 0.28 * flick;
          ctx.drawImage(dot, x - l.r * 4, y - l.r * 4, l.r * 8, l.r * 8);
          ctx.globalAlpha = f.env * on * 0.9 * flick;
          ctx.drawImage(dot, x - l.r, y - l.r, l.r * 2, l.r * 2);
          // The hand and arm beneath, a faint line down into the dark.
          const lg = ctx.createLinearGradient(x, y, x, y + l.r * 9);
          lg.addColorStop(0, f.ink(0.2 * f.env * on));
          lg.addColorStop(1, f.ink(0));
          ctx.globalAlpha = 1;
          ctx.strokeStyle = lg;
          ctx.lineWidth = l.r * 0.4;
          ctx.beginPath();
          ctx.moveTo(x, y + l.r);
          ctx.lineTo(x + Math.sin(f.t * l.s + l.p) * 3, y + l.r * 9);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      };
    },
  },
  {
    name: "yeshua",
    lane: "pass",
    dur: [13, 20],
    themes: [
      "jesus",
      "name",
      "yeshua",
      "name of jesus",
      "beautiful name",
      "no other name",
      "at the name",
      "savior",
      "saviour",
      "name above",
      "christ",
      "messiah",
      "emmanuel",
      "immanuel",
      "king jesus",
      "lord jesus",
      "every knee",
    ],
    make: (w, h, room) => {
      const size0 = Math.min(h * 0.26, w * 0.14);
      const { x: cx, scale } = room.place(size0 * 2.6);
      const size = Math.round(size0 * scale);
      const y = h * rnd(0.4, 0.5);
      return (f) => {
        const { ctx } = f;
        const a = f.env * smooth(f.k * 4) * smooth((1 - f.k) * 5);
        // Rays turning slowly behind the Name.
        ctx.save();
        ctx.translate(cx, y);
        ctx.rotate(f.t * 0.02);
        for (let i = 0; i < 14; i++) {
          ctx.rotate(TAU / 14);
          const g = ctx.createLinearGradient(0, 0, 0, size * 2.2);
          g.addColorStop(0, f.ink(0.035 * a * (i % 2 ? 0.6 : 1)));
          g.addColorStop(1, f.ink(0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-size * 0.09, size * 2.2);
          ctx.lineTo(size * 0.09, size * 2.2);
          ctx.fill();
        }
        ctx.restore();
        glow(ctx, cx, y, size * 1.4, f.ink(0.1 * a * (0.9 + 0.1 * f.beat)), f.ink(0));
        // The Name in Hebrew, and beneath it as we say it.
        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = f.ink(0.5 * a);
        ctx.shadowBlur = size * 0.35;
        ctx.font = `500 ${size}px "Times New Roman", ${displayFont()}`;
        ctx.fillStyle = f.ink(0.3 * a);
        ctx.fillText("ישוע", cx, y - Math.sin(f.t * 0.4) * 4);
        ctx.font = `italic 400 ${Math.round(size * 0.22)}px ${displayFont()}`;
        ctx.fillStyle = f.ink(0.3 * a * smooth(f.k * 4 - 1));
        ctx.fillText("Yeshua · Jesus", cx, y + size * 0.72);
        ctx.restore();
      };
    },
  },
];
