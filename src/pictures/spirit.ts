// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// The Spirit's coming: the upper room, the pillar of fire, the glory cloud, heaven opened, the
// fountain, the sword of the Spirit, fire on the altar, the beating heart, palm branches, the whirlwind.

import { beam, flame, Frame, glow, lay, layering, ridge, ripples, rnd, smooth, TAU, tones, Vision, wander } from "./kit";

/**
 * A fire's tongues: where each is rooted across the fire's foot (x, -1 to 1), how high it can
 * reach (h, of the whole), how fast it leaps (s), its phase, and its brightness (a); those in
 * the middle taller and brighter, and drawn last. And the licks that break free of them.
 */
function kindle(n: number) {
  const tongues = Array.from({ length: n }, () => {
    const x = rnd(-1, 1);
    const mid = 1 - Math.abs(x);
    return { x, h: 0.3 + 0.7 * mid * rnd(0.6, 1), s: rnd(0.7, 1.6), p: rnd(0, TAU), a: 0.35 + 0.65 * mid };
  }).sort((p, q) => Math.abs(q.x) - Math.abs(p.x));
  const licks = Array.from({ length: Math.round(n / 2) }, () => ({
    u: Math.random(),
    x: rnd(-1, 1),
    s: rnd(0.08, 0.16),
    p: rnd(0, TAU),
    size: rnd(14, 26),
  }));
  const embers = Array.from({ length: n * 1.5 }, () => ({
    u: Math.random(),
    x: rnd(-1, 1),
    s: rnd(0.06, 0.14),
    p: rnd(0, TAU),
    r: rnd(1.5, 3),
  }));
  return { tongues, licks, embers };
}

/**
 * A fire burning: its tongues rooted along (x0, foot), `half` either side, each leaping up and
 * sinking back in its own time, the tallest reaching `reach` above the foot; licks going up off
 * them and fading; low flames at the foot; embers rising in the heat. `a` is how strong (0–1).
 */
function burn(f: Frame, fire: ReturnType<typeof kindle>, x0: number, foot: number, half: number, reach: number, a: number) {
  const { ctx } = f;
  if (a <= 0 || reach <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = f.dark ? "lighter" : "source-over";
  for (const t of fire.tongues) {
    const leap = 0.55 + 0.45 * Math.sin(f.t * t.s + t.p) * Math.sin(f.t * t.s * 0.37 + t.p * 2);
    const H = reach * t.h * leap * (0.95 + 0.05 * f.beat);
    if (H < 4) continue;
    const bx = x0 + t.x * half;
    const sway = Math.sin(f.t * 1.6 + t.p) * half * 0.27 + Math.sin(f.t * 3.1 + t.p * 1.3) * half * 0.09;
    const wd = half * (0.27 + 0.45 * (1 - Math.abs(t.x))) * (0.7 + 0.3 * leap);
    const g = ctx.createLinearGradient(0, foot, 0, foot - H);
    const k = a * f.env * t.a;
    g.addColorStop(0, f.ink(0.32 * k));
    g.addColorStop(0.35, f.ink(0.22 * k));
    g.addColorStop(0.75, f.ink(0.1 * k));
    g.addColorStop(1, f.ink(0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(bx - wd, foot + 2);
    ctx.bezierCurveTo(bx - wd * 1.1, foot - H * 0.35, bx + sway * 0.6 - wd * 0.3, foot - H * 0.75, bx + sway, foot - H);
    ctx.bezierCurveTo(bx + sway * 0.6 + wd * 0.3, foot - H * 0.75, bx + wd * 1.1, foot - H * 0.35, bx + wd, foot + 2);
    ctx.fill();
  }
  ctx.restore();
  for (const l of fire.licks) {
    const u = (l.u + f.t * l.s) % 1;
    const y = foot - reach * (0.25 + 0.75 * u);
    if (y < -20) continue;
    flame(
      f,
      x0 + l.x * half * 0.9 * (1 + u * 0.6) + Math.sin(f.t * 2 + l.p) * 6,
      y,
      l.size * (1 - u * 0.5) * Math.min(1, half / 30),
      l.p,
      0.6 * a * (1 - u),
    );
  }
  const n = Math.max(3, Math.round(half / 11));
  for (let i = 0; i < n; i++)
    flame(f, x0 + ((i - (n - 1) / 2) / n) * half * 1.8, foot + 2, Math.min(30, half * 0.5) * (1 + (i % 3) * 0.3), i * 1.9, 0.7 * a);
  glow(ctx, x0, foot - reach * 0.3, half * 2.2, f.ink(0.14 * f.env * a * (0.9 + 0.1 * f.beat)), f.ink(0));
  const ember = f.dot();
  for (const e of fire.embers) {
    const u = (e.u + f.t * e.s) % 1;
    ctx.globalAlpha = 0.8 * f.env * a * (1 - u) * Math.min(1, u * 4);
    ctx.drawImage(
      ember,
      x0 + e.x * half * 1.1 * (1 + u) + Math.sin(f.t * 2 + e.p) * 8 - e.r,
      foot - u * (foot + 20) - e.r,
      e.r * 2,
      e.r * 2,
    );
  }
  ctx.globalAlpha = 1;
}

export const SPIRIT: Vision[] = [
  {
    name: "upper room",
    lane: "back",
    dur: [22, 36],
    themes: [
      "pentecost",
      "upper room",
      "holy spirit",
      "holy ghost",
      "spirit",
      "wind",
      "fire",
      "tongues",
      "power",
      "filled",
      "baptize",
      "baptise",
      "fill me",
      "come holy",
    ],
    make: (w, h, room) => {
      const W0 = Math.min(w, h) * 0.16;
      const { x, scale } = room.place(W0 * 2.4);
      const W = W0 * scale,
        sill = h * 0.42,
        top = sill - W * 1.5;
      // The wind comes in through the window, slanting down into the room; the flames settle below.
      const dir = x < w / 2 ? 1 : -1;
      const gusts = Array.from({ length: 18 }, () => ({ u: rnd(0, 1), v: rnd(-0.4, 0.4), s: rnd(0.08, 0.16), len: rnd(0.1, 0.25) }));
      const tongues = Array.from({ length: 9 }, (_, i) => ({
        x: x + dir * W * rnd(0.6, 3.2),
        y: h * rnd(0.5, 0.72),
        d: 0.3 + i * 0.05 + rnd(0, 0.04),
        s: rnd(16, 26),
        p: rnd(0, TAU),
      }));
      const layer = layering();
      return (f) => {
        const { ctx } = f;
        const day = f.env;
        // The light of the window, falling across the floor.
        const fx = x + dir * W * 2.2,
          fy = h * 0.9;
        const g = ctx.createLinearGradient(x, sill, fx, fy);
        g.addColorStop(0, f.ink(0.14 * day));
        g.addColorStop(1, f.ink(0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x - W / 2, top + W / 2);
        ctx.lineTo(x + W / 2, top + W / 2);
        ctx.lineTo(fx + dir * W * 1.4, fy);
        ctx.lineTo(fx - dir * W * 1.4, fy);
        ctx.fill();
        // The window: a round-headed opening in the wall, full of light, its frame and sill.
        const { L, canvas } = layer(f);
        L.fillStyle = f.ink(0.25);
        L.fillRect(x - W * 0.62, top - W * 0.12, W * 1.24, sill - top + W * 0.16);
        L.fillStyle = f.ink(0.95);
        L.beginPath();
        L.moveTo(x - W / 2, sill);
        L.lineTo(x - W / 2, top + W / 2);
        L.arc(x, top + W / 2, W / 2, Math.PI, 0);
        L.lineTo(x + W / 2, sill);
        L.fill();
        // Its two lights, parted by a slender mullion.
        L.fillStyle = f.ink(0.25);
        L.fillRect(x - W * 0.03, top + W * 0.2, W * 0.06, sill - top - W * 0.2);
        L.fillRect(x - W * 0.62, sill, W * 1.24, W * 0.08);
        lay(f, canvas, 0.6 * day, W * 0.12);
        glow(ctx, x, top + W * 0.6, W * 1.2, f.ink(0.16 * day), f.ink(0));
        // The rushing mighty wind: wisps streaming in and down through the room.
        const rush = 0.6 + 0.4 * Math.sin(f.t * 0.8);
        ctx.lineCap = "round";
        for (const q of gusts) {
          const u = (q.u + f.t * q.s) % 1;
          const px = x + dir * (u * W * 3.4),
            py = top + W * 0.7 + q.v * W * 0.6 + u * u * (h * 0.75 - top) + Math.sin(f.t * 1.4 + q.u * 9) * 6;
          const len = q.len * w * 0.5;
          const ex = px + dir * len,
            ey = py + len * 0.35;
          const lg = ctx.createLinearGradient(px, py, ex, ey);
          lg.addColorStop(0, f.ink(0, true));
          lg.addColorStop(0.5, f.ink(0.22 * day * rush * Math.sin(Math.PI * u), true));
          lg.addColorStop(1, f.ink(0, true));
          ctx.strokeStyle = lg;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.quadraticCurveTo((px + ex) / 2, (py + ey) / 2 - 10, ex, ey);
          ctx.stroke();
        }
        // Cloven tongues like as of fire, settling in the room one by one and resting there.
        for (const t of tongues) {
          const q = smooth((f.k - t.d) * 4);
          if (q <= 0) continue;
          const y = t.y - (1 - q) * h * 0.25 + Math.sin(f.t * 0.9 + t.p) * 4;
          flame(f, t.x + Math.sin(f.t * 0.6 + t.p) * 5, y, t.s, t.p, 0.7 * q);
        }
      };
    },
  },
  {
    name: "pillar of fire",
    lane: "back",
    dur: [22, 36],
    themes: [
      "pillar",
      "fire",
      "night",
      "wilderness",
      "desert",
      "lead me",
      "guide",
      "way maker",
      "journey",
      "wander",
      "light in the dark",
      "go before",
      "by night",
    ],
    make: (w, h, room) => {
      const x0 = room.place(w * 0.22).x,
        ground = h * 0.82;
      const dunes = ridge(ground, h * 0.035);
      const foot = dunes(x0) + h * 0.006; // the sand where it stands, a little into it so no gap shows
      const stars = Array.from({ length: 30 }, () => ({ x: rnd(0, w), y: rnd(0, h * 0.5), r: rnd(1, 2.2), p: rnd(0, TAU) }));
      const fire = kindle(26);
      return (f) => {
        const { ctx } = f;
        const rise = smooth(f.k * 2.5);
        const dot = f.dot(true);
        for (const s of stars) {
          ctx.globalAlpha = f.env * (f.dark ? 0.45 : 0.25) * (0.3 + 0.7 * Math.sin(f.t * 1.2 + s.p) ** 2);
          ctx.drawImage(dot, s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
        }
        ctx.globalAlpha = 1;
        // The sand, lit about its foot.
        ctx.save();
        ctx.translate(x0, foot);
        ctx.scale(3, 0.5);
        glow(ctx, 0, 0, h * 0.28, f.ink(0.26 * f.env * rise), f.ink(0));
        ctx.restore();
        const sg = ctx.createLinearGradient(0, ground - h * 0.06, 0, h);
        sg.addColorStop(0, f.ink(0.08 * f.env));
        sg.addColorStop(1, f.ink(0.01 * f.env));
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w + 12; x += 12) ctx.lineTo(x, dunes(x));
        ctx.lineTo(w, h);
        ctx.fill();
        // The fire: a pillar of flame rooted in the ground, reaching the top of the page as it grows.
        burn(f, fire, x0, foot, w * 0.045, (foot + h * 0.1) * rise, rise);
      };
    },
  },
  {
    name: "shekinah",
    lane: "back",
    dur: [24, 40],
    themes: [
      "glory",
      "cloud",
      "presence",
      "fill this place",
      "fill this temple",
      "holy ground",
      "temple",
      "dwell",
      "your presence",
      "his presence",
      "weight of",
      "heavy",
      "overshadow",
      "shekinah",
      "come down",
    ],
    make: (w, h) => {
      const puffs = Array.from({ length: 34 }, () => ({
        x: rnd(-0.1, 1.1) * w,
        y: rnd(-0.1, 0.32) * h,
        r: rnd(0.08, 0.2) * w,
        v: rnd(3, 8),
        p: rnd(0, TAU),
      }));
      const cx = w * rnd(0.35, 0.65);
      return (f) => {
        const { ctx } = f;
        const come = smooth(f.k * 1.8);
        const dy = (1 - come) * -h * 0.15;
        // The light within the cloud, breathing slowly.
        const breath = 0.85 + 0.15 * Math.sin(f.t * 0.4);
        glow(ctx, cx, h * 0.14 + dy, w * 0.4, f.ink(0.32 * f.env * breath), f.ink(0));
        glow(ctx, cx, h * 0.14 + dy, w * 0.14, f.ink(0.3 * f.env * breath), f.ink(0));
        // The cloud itself: soft billows, brighter where the light is, drifting.
        const dot = f.dot();
        for (const p of puffs) {
          const x = ((p.x + f.t * p.v + w * 0.2) % (w * 1.4)) - w * 0.2;
          const y = p.y + dy + Math.sin(f.t * 0.3 + p.p) * 6;
          const near = Math.max(0, 1 - Math.hypot(x - cx, (y - h * 0.14) * 2) / (w * 0.45));
          ctx.globalAlpha = (f.dark ? 0.18 : 0.2) * f.env * (0.6 + 0.9 * near * breath);
          ctx.drawImage(dot, x - p.r, y - p.r * 0.6, p.r * 2, p.r * 1.2);
        }
        ctx.globalAlpha = 1;
      };
    },
  },
  {
    name: "open heaven",
    lane: "back",
    dur: [22, 36],
    themes: [
      "heaven",
      "open",
      "pour",
      "outpour",
      "floodgates",
      "windows of heaven",
      "open the heavens",
      "open heaven",
      "heaven come down",
      "flood",
      "overflow",
      "rain down",
      "pour out",
      "let it rain",
      "fall on us",
      "fall afresh",
      "latter rain",
      "fall down",
    ],
    make: (w, h, room) => {
      const cx = room.place(w * 0.34).x;
      const drops = Array.from({ length: 90 }, () => ({ u: Math.random(), x: rnd(-1, 1), s: rnd(0.25, 0.45), l: rnd(10, 26) }));
      const rings: { t: number; x: number }[] = [];
      let next = 0;
      return (f) => {
        const { ctx } = f;
        const open = smooth(f.k * 2.2);
        const rw = w * 0.16 * open,
          ry = -h * 0.05;
        // The light poured out of heaven: a ray from above the top of the page, brightest where
        // it enters and widening as it falls, to the floor; its edges soft.
        const foot = h * 0.9;
        glow(ctx, cx, -h * 0.1, rw * 3, f.ink(0.3 * f.env * open), f.ink(0));
        const g = ctx.createLinearGradient(0, -h * 0.1, 0, foot);
        g.addColorStop(0, f.ink(0.3 * f.env * open));
        g.addColorStop(0.5, f.ink(0.1 * f.env * open));
        g.addColorStop(1, f.ink(0.03 * f.env * open));
        const ray = (k: number, a: number) => {
          ctx.globalAlpha = a;
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(cx - rw * 0.6 * k, -h * 0.1);
          ctx.lineTo(cx + rw * 0.6 * k, -h * 0.1);
          ctx.lineTo(cx + rw * 1.9 * k, foot);
          ctx.lineTo(cx - rw * 1.9 * k, foot);
          ctx.fill();
        };
        ray(1.25, 0.35);
        ray(1, 0.6);
        ray(0.7, 1);
        ctx.globalAlpha = 1;
        // Rain within the light, heavy and straight.
        ctx.strokeStyle = f.ink(0.3 * f.env * open, true);
        ctx.lineWidth = 1.1;
        ctx.lineCap = "round";
        ctx.beginPath();
        for (const d of drops) {
          const u = (d.u + f.t * d.s) % 1;
          const y = ry + u * (foot - ry);
          const x = cx + d.x * rw * (1 + 0.9 * u);
          ctx.moveTo(x, y);
          ctx.lineTo(x, y - d.l * (0.5 + u));
        }
        ctx.stroke();
        // Where it lands: a pool spreading, ringed with ripples.
        ctx.save();
        ctx.translate(cx, foot);
        ctx.scale(2.6, 0.4);
        glow(ctx, 0, 0, rw * 1.5, f.ink(0.3 * f.env * open, true), f.ink(0, true));
        ctx.restore();
        if (open > 0.3 && f.t >= next) {
          rings.push({ t: f.t, x: cx + rnd(-1.6, 1.6) * rw });
          next = f.t + rnd(0.3, 0.8);
        }
        for (let i = rings.length - 1; i >= 0; i--) {
          const q = (f.t - rings[i].t) / 3;
          if (q >= 1) rings.splice(i, 1);
          else ripples(f, rings[i].x, foot + 4, q, 70, 0.3);
        }
      };
    },
  },
  {
    name: "fountain",
    lane: "back",
    dur: [22, 36],
    themes: [
      "fountain",
      "blood",
      "cleanse",
      "wash",
      "flow",
      "wash me",
      "healing",
      "spring",
      "living water",
      "overflow",
      "plunge",
      "stain",
      "whiter",
      "flows from",
      "power in the blood",
      "nothing but the blood",
    ],
    make: (w, h, room) => {
      const S0 = Math.min(w, h) * 0.26;
      const { x, scale } = room.place(S0 * 2);
      const S = S0 * scale,
        base = h * 0.84;
      // The jets: each springs from the pedestal's bowl and arcs over to fall into the basin, the
      // middle pair highest and nearest, the outer ones lower and further out; and the drops
      // that run along them.
      const jets = [-1, 1].flatMap((d) => [
        { d, R: 0.3, H: 1.0 },
        { d, R: 0.55, H: 0.68 },
        { d, R: 0.78, H: 0.42 },
      ]);
      const drops = Array.from({ length: 150 }, (_, i) => ({
        jet: i % jets.length,
        u: Math.random(),
        off: rnd(-1, 1),
        s: rnd(0.45, 0.7),
        r: rnd(1, 2.2),
        p: rnd(0, TAU),
      }));
      const rings: number[] = [];
      let next = 0;
      const layer = layering();
      return (f) => {
        const { ctx } = f;
        const up = smooth(f.k * 6); // playing almost from the first
        // The fountain itself, solid: a wide stone basin on a plinth, and a pedestal bowl above it
        // from which the jets spring; the water in both catching the light.
        const { L, canvas } = layer(f);
        const tone = tones(f);
        const water = tones(f, true);
        L.translate(x, base);
        L.scale(S, S);
        const stone = (k: number) => {
          const g = L.createLinearGradient(-1, 0, 1, 0);
          g.addColorStop(0, tone(0.3 * k));
          g.addColorStop(0.4, tone(0.75 * k));
          g.addColorStop(1, tone(0.3 * k));
          return g;
        };
        L.fillStyle = stone(0.8);
        L.beginPath(); // the plinth
        L.ellipse(0, 0.22, 0.95, 0.2, 0, 0, Math.PI);
        L.lineTo(-0.95, 0.1);
        L.ellipse(0, 0.1, 0.95, 0.2, 0, Math.PI, 0, true);
        L.closePath();
        L.fill();
        L.fillStyle = stone(1);
        L.beginPath(); // the basin's bowl, flaring to its rim
        L.moveTo(-0.85, -0.05);
        L.quadraticCurveTo(-0.7, 0.22, 0, 0.26);
        L.quadraticCurveTo(0.7, 0.22, 0.85, -0.05);
        L.closePath();
        L.fill();
        L.fillStyle = tone(0.7);
        L.beginPath();
        L.ellipse(0, -0.05, 0.85, 0.2, 0, 0, TAU);
        L.fill();
        L.fillStyle = water(0.55);
        L.beginPath();
        L.ellipse(0, -0.05, 0.76, 0.17, 0, 0, TAU);
        L.fill();
        // The pedestal and its bowl.
        L.fillStyle = stone(0.9);
        L.fillRect(-0.08, -0.6, 0.16, 0.6);
        L.beginPath();
        L.moveTo(-0.34, -0.66);
        L.quadraticCurveTo(-0.28, -0.5, 0, -0.48);
        L.quadraticCurveTo(0.28, -0.5, 0.34, -0.66);
        L.closePath();
        L.fill();
        L.fillStyle = tone(0.75);
        L.beginPath();
        L.ellipse(0, -0.66, 0.34, 0.08, 0, 0, TAU);
        L.fill();
        L.fillStyle = water(0.6);
        L.beginPath();
        L.ellipse(0, -0.66, 0.29, 0.065, 0, 0, TAU);
        L.fill();
        lay(f, canvas, 0.8 * f.env, S * 0.1);
        // The water's sheen in the basin, and the light of the whole.
        ctx.save();
        ctx.translate(x, base - S * 0.05);
        ctx.scale(1, 0.25);
        glow(ctx, 0, 0, S * 0.8, f.ink(0.25 * f.env, true), f.ink(0, true));
        ctx.restore();
        glow(ctx, x, base - S * 0.9, S * 1.2, f.ink(0.1 * f.env * up), f.ink(0));
        // Each jet is an arc of water: up from the bowl, over, and down into the basin, a
        // quadratic curve whose crown wavers a little; stroked wide and faint, then narrow and
        // bright; the drops run along it, scattering a little as they fall.
        const top = base - S * 0.66,
          pool = base - S * 0.05;
        const arc = (j: { d: number; R: number; H: number }) => {
          const Hj = S * j.H * up * (0.97 + 0.03 * Math.sin(f.t * 2.6 + j.R * 9));
          const p0 = [x, top] as const,
            c = [x + j.d * S * j.R * 0.55 + Math.sin(f.t * 1.7 + j.R * 5) * 2, top - Hj * 2] as const,
            p1 = [x + j.d * S * j.R, pool] as const;
          const at = (u: number) =>
            [
              (1 - u) ** 2 * p0[0] + 2 * (1 - u) * u * c[0] + u * u * p1[0],
              (1 - u) ** 2 * p0[1] + 2 * (1 - u) * u * c[1] + u * u * p1[1],
            ] as const;
          return { p0, c, p1, at };
        };
        ctx.lineCap = "round";
        for (const j of jets) {
          const { p0, c, p1 } = arc(j);
          const g = ctx.createLinearGradient(p0[0], 0, p1[0], 0);
          g.addColorStop(0, f.ink(0.55 * f.env * up, true));
          g.addColorStop(0.5, f.ink(0.4 * f.env * up, true));
          g.addColorStop(1, f.ink(0.12 * f.env * up, true));
          for (const [lw, k] of [
            [7, 0.18],
            [3, 0.45],
            [1.3, 1],
          ]) {
            ctx.globalAlpha = k;
            ctx.strokeStyle = g;
            ctx.lineWidth = lw * (0.6 + 0.4 * j.H);
            ctx.beginPath();
            ctx.moveTo(...p0);
            ctx.quadraticCurveTo(c[0], c[1], p1[0], p1[1]);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
          // The crown of the jet, where the water turns, catches the light; and a splash where it lands.
          const [ax, ay] = arc(j).at(0.5);
          glow(ctx, ax, ay, S * 0.14 * j.H, f.ink(0.25 * f.env * up), f.ink(0));
          glow(ctx, p1[0], p1[1], S * 0.1, f.ink(0.25 * f.env * up * (0.7 + 0.3 * Math.sin(f.t * 5 + j.R * 7) ** 2), true), f.ink(0, true));
        }
        const dot = f.dot(true);
        for (const d of drops) {
          const j = jets[d.jet];
          const u = (d.u + f.t * d.s) % 1;
          const [px, py] = arc(j).at(u);
          ctx.globalAlpha = f.env * up * 0.8 * (0.4 + 0.6 * Math.sin(f.t * 3 + d.p) ** 2);
          ctx.drawImage(dot, px + d.off * S * 0.03 * u - d.r, py + Math.abs(d.off) * S * 0.04 * u * u - d.r, d.r * 2, d.r * 2);
        }
        ctx.globalAlpha = 1;
        // Rings where the water lands in the basin.
        if (up > 0.5 && f.t >= next) {
          rings.push(f.t);
          next = f.t + rnd(0.4, 0.9);
        }
        for (let i = rings.length - 1; i >= 0; i--) {
          const q = (f.t - rings[i]) / 2;
          if (q >= 1) rings.splice(i, 1);
          else ripples(f, x + Math.sin(rings[i] * 7) * S * 0.6, base - S * 0.05, q, S * 0.4, 0.3);
        }
        // Brimming over: a sheet of water down the basin's side, once the song is well on.
        const over = smooth(f.k * 3 - 1.6);
        if (over > 0) {
          const og = ctx.createLinearGradient(0, base - S * 0.02, 0, base + S * 0.26);
          og.addColorStop(0, f.ink(0.2 * f.env * over, true));
          og.addColorStop(1, f.ink(0, true));
          ctx.fillStyle = og;
          ctx.fillRect(x - S * 0.8, base - S * 0.02, S * 1.6, S * 0.28);
        }
      };
    },
  },
  {
    name: "sword of the spirit",
    lane: "pass",
    dur: [13, 20],
    themes: [
      "sword",
      "word",
      "spirit",
      "battle",
      "fight",
      "armor",
      "armour",
      "truth",
      "two-edged",
      "two edged",
      "sharp",
      "victory",
      "warrior",
      "weapon",
      "not by might",
      "the word of god",
      "stand",
      "take up",
      "cut",
      "pierce",
    ],
    make: (w, h, room) => {
      const H0 = Math.min(h * 0.62, w * 0.3);
      const { x, scale } = room.place(H0 * 0.5);
      const H = H0 * scale,
        y = h * 0.5; // the middle of the blade
      const layer = layering();
      return (f) => {
        const { ctx } = f;
        const come = smooth(f.k * 2.2); // it comes down out of the light and holds
        const dy = (1 - come) * -h * 0.25;
        glow(ctx, x, y - H * 0.3 + dy, H * 0.5, f.ink(0.12 * f.env * come * (0.9 + 0.1 * f.beat)), f.ink(0));
        // The sword, point down, solid: a long blade with a ridge down its middle, lit on one face,
        // a straight crossguard, a bound grip and a round pommel. In the sword's own units (H).
        const { L, canvas } = layer(f);
        const tone = tones(f);
        L.translate(x, y + dy);
        L.rotate(Math.sin(f.t * 0.4) * 0.012);
        L.scale(H, H);
        const steel = L.createLinearGradient(-0.04, 0, 0.04, 0);
        steel.addColorStop(0, tone(0.45));
        steel.addColorStop(0.48, tone(1));
        steel.addColorStop(0.52, tone(0.7));
        steel.addColorStop(1, tone(0.35));
        L.fillStyle = steel;
        L.beginPath();
        L.moveTo(-0.04, -0.22);
        L.lineTo(0.04, -0.22);
        L.lineTo(0.03, 0.52);
        L.lineTo(0, 0.62); // the point
        L.lineTo(-0.03, 0.52);
        L.closePath();
        L.fill();
        // The fuller, a shallow groove down the blade.
        L.fillStyle = tone(0.55);
        L.fillRect(-0.007, -0.2, 0.014, 0.6);
        // The crossguard, its arms turned a little towards the blade.
        const gold = L.createLinearGradient(-0.2, 0, 0.2, 0);
        gold.addColorStop(0, tone(0.4));
        gold.addColorStop(0.45, tone(0.9));
        gold.addColorStop(1, tone(0.4));
        L.fillStyle = gold;
        L.beginPath();
        L.moveTo(-0.2, -0.27);
        L.quadraticCurveTo(0, -0.21, 0.2, -0.27);
        L.lineTo(0.2, -0.22);
        L.quadraticCurveTo(0, -0.16, -0.2, -0.22);
        L.closePath();
        L.fill();
        // The grip, bound with cord, and the pommel.
        L.fillStyle = tone(0.3);
        L.fillRect(-0.025, -0.44, 0.05, 0.2);
        L.strokeStyle = tone(0.5);
        L.lineWidth = 0.006;
        for (let i = 0; i < 7; i++) {
          L.beginPath();
          L.moveTo(-0.025, -0.42 + i * 0.027);
          L.lineTo(0.025, -0.405 + i * 0.027);
          L.stroke();
        }
        L.fillStyle = gold;
        L.beginPath();
        L.arc(0, -0.47, 0.04, 0, TAU);
        L.fill();
        lay(f, canvas, 0.85 * f.env, H * 0.03);
        // Light running down both edges of the blade, keener on the beat: sharper than any
        // two-edged sword.
        const run = (f.t * 0.6) % 1.4;
        for (const side of [-1, 1]) {
          const ex = x + side * H * 0.038,
            ex2 = x + side * H * 0.03;
          const g = ctx.createLinearGradient(0, y + dy - H * 0.22, 0, y + dy + H * 0.52);
          g.addColorStop(0, f.ink(0.1 * f.env * come));
          g.addColorStop(Math.max(0, Math.min(1, run - 0.2)), f.ink(0.1 * f.env * come));
          g.addColorStop(Math.max(0, Math.min(1, run)), f.ink((0.5 + 0.3 * f.beat) * f.env * come));
          g.addColorStop(Math.max(0, Math.min(1, run + 0.1)), f.ink(0.1 * f.env * come));
          g.addColorStop(1, f.ink(0.1 * f.env * come));
          ctx.strokeStyle = g;
          ctx.lineWidth = 1.5;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(ex, y + dy - H * 0.22);
          ctx.lineTo(ex2, y + dy + H * 0.52);
          ctx.lineTo(x, y + dy + H * 0.62);
          ctx.stroke();
        }
        glow(ctx, x, y + dy + H * 0.62, H * 0.1, f.ink(0.3 * f.env * come * (0.7 + 0.3 * f.beat)), f.ink(0));
      };
    },
  },
  {
    name: "fire from heaven",
    lane: "back",
    dur: [22, 36],
    themes: [
      "fire",
      "altar",
      "fire fall",
      "consume",
      "consuming",
      "burn",
      "send the fire",
      "sacrifice",
      "elijah",
      "let it burn",
      "revival",
      "set a fire",
      "fall on",
      "carmel",
      "answer by fire",
      "the god who answers",
    ],
    make: (w, h, room) => {
      const S0 = Math.min(w, h) * 0.11;
      const { x, scale } = room.place(S0 * 3.6);
      const S = S0 * scale,
        ground = h * 0.86;
      // The altar: twelve hewn stones in three courses, seen from the front and a little above, so
      // its top and one side show; the wood laid on it.
      const W = S * 1.9, // the front's width
        D = S * 0.5, // how far the top and side recede
        C = S * 0.34; // a course's height
      const courses = [0, 1, 2].map((row) =>
        Array.from({ length: 4 }, (_, i) => ({
          u0: i / 4 + (row % 2 ? 0.12 : 0),
          u1: (i + 1) / 4 + (row % 2 ? 0.12 : 0),
          k: rnd(0.5, 0.7),
        })),
      );
      const logs = Array.from({ length: 5 }, (_, i) => ({ u: 0.15 + i * 0.17 + rnd(-0.03, 0.03), l: rnd(0.7, 0.95) }));
      const fire = kindle(22);
      const layer = layering();
      return (f) => {
        const { ctx } = f;
        const fall = smooth(f.k * 5 - 1.4); // the fire comes down
        const blaze = smooth(f.k * 5 - 2.0); // and the altar burns
        const top = ground - 3 * C;
        // The hilltop, dim, lit by the fire.
        const hg = ctx.createLinearGradient(0, ground - S * 0.2, 0, h);
        hg.addColorStop(0, f.ink((0.06 + 0.1 * blaze) * f.env));
        hg.addColorStop(1, f.ink(0));
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.moveTo(0, h);
        ctx.quadraticCurveTo(x, ground - S * 0.5, w, h);
        ctx.fill();
        const { L, canvas } = layer(f);
        const tone = tones(f);
        L.translate(x, ground);
        const lit = 0.25 * blaze; // the fire's light on the stone
        // The side, in shadow, receding to the right.
        L.fillStyle = tone(0.22 + lit * 0.5);
        L.beginPath();
        L.moveTo(W / 2, 0);
        L.lineTo(W / 2 + D, -D * 0.5);
        L.lineTo(W / 2 + D, -3 * C - D * 0.5);
        L.lineTo(W / 2, -3 * C);
        L.closePath();
        L.fill();
        L.strokeStyle = tone(0.1);
        L.lineWidth = 1.5;
        for (let row = 1; row < 3; row++) {
          L.beginPath();
          L.moveTo(W / 2, -row * C);
          L.lineTo(W / 2 + D, -row * C - D * 0.5);
          L.stroke();
        }
        // The front: each course its stones, the joints between them dark, each stone a little
        // its own shade, lit from above by the fire.
        courses.forEach((row, r) => {
          for (const st of row) {
            const x0 = -W / 2 + Math.max(0, st.u0) * W,
              x1 = -W / 2 + Math.min(1, st.u1) * W;
            if (x1 <= x0) continue;
            const g = L.createLinearGradient(0, -(r + 1) * C, 0, -r * C);
            g.addColorStop(0, tone(st.k + lit));
            g.addColorStop(1, tone(st.k - 0.2 + lit * 0.5));
            L.fillStyle = g;
            L.fillRect(x0 + 1.5, -(r + 1) * C + 1.5, x1 - x0 - 3, C - 3);
          }
          // The half stone that closes the offset courses.
          if (r % 2) {
            L.fillStyle = tone(0.55 + lit);
            L.fillRect(-W / 2 + 1.5, -(r + 1) * C + 1.5, W * 0.12 - 3, C - 3);
          }
        });
        // The top, lit, and the wood laid across it.
        L.fillStyle = tone(0.6 + lit * 1.2);
        L.beginPath();
        L.moveTo(-W / 2, -3 * C);
        L.lineTo(W / 2, -3 * C);
        L.lineTo(W / 2 + D, -3 * C - D * 0.5);
        L.lineTo(-W / 2 + D, -3 * C - D * 0.5);
        L.closePath();
        L.fill();
        L.strokeStyle = tone(0.35 + lit);
        L.lineWidth = S * 0.08;
        L.lineCap = "round";
        for (const lg of logs) {
          const lx = -W / 2 + lg.u * W + D * 0.4;
          L.beginPath();
          L.moveTo(lx - D * 0.35 * lg.l, -3 * C - D * 0.08);
          L.lineTo(lx + D * 0.35 * lg.l, -3 * C - D * 0.45 * lg.l);
          L.stroke();
        }
        lay(f, canvas, 0.85 * f.env, S * 0.08);
        // The fire of the LORD, falling: a column from above the page onto the altar.
        if (fall > 0 && blaze < 1) {
          const head = -20 + (top - S * 0.2 + 20) * fall;
          const a = f.env * (1 - blaze);
          const g = ctx.createLinearGradient(0, head - h * 0.6, 0, head);
          g.addColorStop(0, f.ink(0));
          g.addColorStop(1, f.ink(0.45 * a));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(x - S * 0.45, head - h * 0.6);
          ctx.lineTo(x + S * 0.45 + D * 0.5, head - h * 0.6);
          ctx.lineTo(x + S * 0.25 + D * 0.25, head);
          ctx.lineTo(x - S * 0.25 + D * 0.25, head);
          ctx.fill();
          beam(f, x + D * 0.25, head - h * 0.6, x + D * 0.25, head, S * 0.1, 0.4 * a);
          glow(ctx, x + D * 0.25, head, S * 0.8, f.ink(0.4 * a), f.ink(0));
        }
        // The altar ablaze: the fire burning up from the wood on its top, to the top of the page.
        burn(f, fire, x + D * 0.25, top - D * 0.25, W * 0.42, (top + h * 0.1) * blaze, blaze);
      };
    },
  },
  {
    name: "beating heart",
    lane: "pass",
    dur: [13, 20],
    themes: [
      "heart",
      "my heart",
      "beat",
      "beating",
      "heartbeat",
      "every beat",
      "heart of",
      "all my heart",
      "with everything",
      "within me",
      "desire",
      "soul",
      "love",
      "clean heart",
      "create in me",
      "pure heart",
      "whole heart",
      "alive",
      "passion",
      "undivided",
    ],
    make: (w, h, room) => {
      const S0 = Math.min(w, h) * 0.08;
      const { x, scale } = room.place(S0 * 3);
      const S = S0 * scale,
        y = h * rnd(0.42, 0.55);
      const rings: number[] = [];
      let last = 0;
      const layer = layering();
      return (f) => {
        const { ctx } = f;
        const come = smooth(f.k * 2.2);
        // It beats with the song: a quick swell on each beat, settling back; a slow one of its own
        // when there is no beat to follow.
        const own = Math.max(0, Math.sin(f.t * 2.4)) ** 6 * 0.6;
        const pulse = Math.max(f.beat, own);
        const size = 1 + 0.07 * pulse;
        if (pulse > last + 0.4) rings.push(f.t);
        last = pulse;
        glow(ctx, x, y, S * 2.2, f.ink(0.08 * f.env * come * (0.7 + 0.3 * pulse)), f.ink(0));
        // The heart, solid and soft, lit from above left: two lobes meeting in a point below.
        const { L, canvas } = layer(f);
        const tone = tones(f);
        L.translate(x, y);
        L.scale(S * size, S * size);
        const g = L.createRadialGradient(-0.25, -0.35, 0.05, 0, 0, 1.3);
        g.addColorStop(0, tone(0.7 + 0.1 * pulse));
        g.addColorStop(0.55, tone(0.45));
        g.addColorStop(1, tone(0.22));
        L.fillStyle = g;
        L.beginPath();
        L.moveTo(0, 1.0);
        L.bezierCurveTo(-0.1, 0.8, -1.0, 0.35, -1.0, -0.3);
        L.bezierCurveTo(-1.0, -0.8, -0.55, -0.95, -0.3, -0.75);
        L.bezierCurveTo(-0.15, -0.65, -0.05, -0.5, 0, -0.4);
        L.bezierCurveTo(0.05, -0.5, 0.15, -0.65, 0.3, -0.75);
        L.bezierCurveTo(0.55, -0.95, 1.0, -0.8, 1.0, -0.3);
        L.bezierCurveTo(1.0, 0.35, 0.1, 0.8, 0, 1.0);
        L.closePath();
        L.fill();
        L.fillStyle = tone(0.85);
        L.beginPath();
        L.ellipse(-0.5, -0.55, 0.16, 0.08, -0.5, 0, TAU);
        L.fill();
        lay(f, canvas, 0.45 * f.env * come, S * 0.1);
        // Each beat goes out from it as a faint ring, like a sound.
        for (let i = rings.length - 1; i >= 0; i--) {
          const q = (f.t - rings[i]) / 1.6;
          if (q >= 1) {
            rings.splice(i, 1);
            continue;
          }
          ctx.strokeStyle = f.ink(0.12 * f.env * come * (1 - q) ** 1.5);
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.ellipse(x, y, S * (1.3 + q * 2.2), S * (1.3 + q * 2.2) * 0.95, 0, 0, TAU);
          ctx.stroke();
        }
      };
    },
  },
  {
    name: "palm branches",
    lane: "pass",
    dur: [13, 20],
    themes: [
      "hosanna",
      "palm",
      "palms",
      "branches",
      "blessed is he",
      "king comes",
      "king is coming",
      "praise",
      "wave",
      "highest",
      "welcome",
      "triumph",
      "shout",
      "lift up",
      "glory",
      "he comes",
      "in the name of the lord",
      "rejoice",
      "hail",
    ],
    make: (w, h) => {
      // Fronds held up from the foot of the page and waved, nearer ones larger and lower.
      const fronds = Array.from({ length: 11 }, (_, i) => {
        const near = Math.random();
        return {
          x: ((i + 0.5) / 11 + rnd(-0.03, 0.03)) * w,
          H: h * (0.3 + near * 0.3),
          s: 0.6 + near * 0.6,
          near,
          lean: rnd(-0.25, 0.25),
          d: rnd(0, 0.3),
          p: rnd(0, TAU),
          cool: Math.random() < 0.7,
          flip: Math.random() < 0.5 ? -1 : 1, // which way it arches
        };
      });
      fronds.sort((a, b) => a.near - b.near);
      const layer = layering();
      return (f) => {
        const { ctx } = f;
        glow(ctx, w / 2, -h * 0.1, h * 0.7, f.ink(0.14 * f.env), f.ink(0));
        const { L, canvas } = layer(f);
        const leaf = tones(f, true),
          warm = tones(f);
        for (const fr of fronds) {
          const up = smooth((f.k - fr.d) * 2.5);
          if (up <= 0) continue;
          const tone = fr.cool ? leaf : warm;
          const wave = Math.sin(f.t * 1.4 + fr.p) * 0.22 + Math.sin(f.t * 2.9 + fr.p * 2) * 0.05;
          const H = fr.H * (0.3 + 0.7 * up),
            s = fr.s;
          L.save();
          L.translate(fr.x, h + 10);
          L.rotate(fr.lean + wave);
          // A date palm's frond: a stiff stalk arching over as it is held up, and long narrow
          // leaflets in pairs along it, pointing forward towards the tip, longest about the middle.
          const bend = fr.flip * (0.5 + wave * 0.6); // how far the tip arches to the side
          const at = (u: number) => [bend * H * 0.55 * u * u, -H * u + H * 0.12 * u * u] as const;
          const tangent = (u: number) => {
            const [x1, y1] = at(u - 0.01),
              [x2, y2] = at(u + 0.01);
            return Math.atan2(y2 - y1, x2 - x1);
          };
          L.strokeStyle = tone(0.55);
          L.lineWidth = 3 * s;
          L.lineCap = "round";
          L.beginPath();
          L.moveTo(0, 0);
          for (let i = 1; i <= 20; i++) L.lineTo(...at(i / 20));
          L.stroke();
          const n = 15;
          for (let i = 2; i <= n; i++) {
            const u = i / n;
            const [px, py] = at(u);
            const dir = tangent(u);
            const len = H * 0.38 * Math.sin(Math.PI * (0.1 + 0.8 * u)) * (1.15 - u * 0.45) + 6 * s;
            for (const side of [-1, 1]) {
              const ang = dir + side * (0.5 - u * 0.12); // forward along the stalk, splayed to each side
              const tx = px + Math.cos(ang) * len,
                ty = py + Math.sin(ang) * len;
              const nx = -Math.sin(ang) * len * 0.045,
                ny = Math.cos(ang) * len * 0.045; // the blade's half-width, across its length
              L.fillStyle = tone(0.4 + 0.35 * u + (side > 0 ? 0.12 : 0));
              L.beginPath();
              L.moveTo(px - nx, py - ny);
              L.quadraticCurveTo(px + (tx - px) * 0.45 - nx * 1.3, py + (ty - py) * 0.45 - ny * 1.3, tx, ty);
              L.quadraticCurveTo(px + (tx - px) * 0.45 + nx * 1.3, py + (ty - py) * 0.45 + ny * 1.3, px + nx, py + ny);
              L.closePath();
              L.fill();
            }
          }
          L.restore();
        }
        lay(f, canvas, (f.dark ? 0.4 : 0.48) * f.env, 6);
        // Light catching the tips as they wave.
        for (const fr of fronds) {
          const up = smooth((f.k - fr.d) * 2.5);
          if (up <= 0) continue;
          const wave = Math.sin(f.t * 1.4 + fr.p) * 0.22;
          const H = fr.H * (0.3 + 0.7 * up);
          const bend = fr.flip * (0.5 + wave * 0.6);
          const ex = bend * H * 0.55,
            ey = -H * 0.88;
          const tx = fr.x + Math.cos(fr.lean + wave) * ex - Math.sin(fr.lean + wave) * ey,
            ty = h + 10 + Math.sin(fr.lean + wave) * ex + Math.cos(fr.lean + wave) * ey;
          glow(ctx, tx, ty, H * 0.2, f.ink(0.1 * f.env * up * (0.9 + 0.1 * f.beat)), f.ink(0));
        }
      };
    },
  },
  {
    name: "whirlwind",
    lane: "pass",
    dur: [12, 18],
    moving: true,
    themes: [
      "whirlwind",
      "wind",
      "storm",
      "spirit",
      "blow",
      "power",
      "mighty",
      "rushing",
      "breath",
      "fresh wind",
      "move",
      "sweep",
      "stir",
      "shake",
      "awaken",
      "mighty wind",
    ],
    make: (w, h, room) => {
      const S0 = Math.min(w, h) * 0.2;
      const { x, scale } = room.place(S0 * 2.6);
      const S = S0 * scale,
        foot = h * 0.9,
        top = h * 0.12;
      const wisps = Array.from({ length: 110 }, () => ({
        a: rnd(0, TAU),
        u: Math.random(),
        v: rnd(0.5, 0.9),
        len: rnd(0.3, 0.7),
        cool: Math.random() < 0.7,
      }));
      const specks = Array.from({ length: 30 }, () => ({ a: rnd(0, TAU), u: Math.random(), s: rnd(0.08, 0.16), p: rnd(0, TAU) }));
      return (f) => {
        const { ctx } = f;
        const bend = wander(f.t * 0.5, 3) * S * 0.25;
        // The funnel: narrow at its foot, wide at its head, leaning as it turns.
        const at = (u: number, a: number) => {
          const r = S * (0.12 + 1.1 * u * u);
          return [x + bend * (1 - u) + Math.cos(a) * r, foot - (foot - top) * u + Math.sin(a) * r * 0.22] as const;
        };
        glow(ctx, x, foot - (foot - top) * 0.6, S * 1.1, f.ink(0.22 * f.env), f.ink(0));
        ctx.lineCap = "round";
        for (const q of wisps) {
          const u = (q.u + f.t * 0.07 * q.v) % 1;
          const a0 = q.a + f.t * 3.2 * q.v * (1.6 - u);
          const n = 10;
          let prev: readonly [number, number] | null = null;
          for (let i = 0; i <= n; i++) {
            const s = i / n;
            const p = at(u + s * 0.04, a0 - s * q.len);
            if (prev) {
              const front = Math.sin(a0 - s * q.len) > 0 ? 1 : 0.45; // nearer wisps brighter
              ctx.strokeStyle = f.ink(0.5 * f.env * Math.sin(Math.PI * s) * front * (0.5 + 0.5 * u), q.cool);
              ctx.lineWidth = 1 + 1.6 * Math.sin(Math.PI * s);
              ctx.beginPath();
              ctx.moveTo(...prev);
              ctx.lineTo(...p);
              ctx.stroke();
            }
            prev = p;
          }
        }
        // Light at its heart, and what it has lifted whirling up in it.
        beam(f, x + bend, foot, x, top, 3, 0.25 * f.env);
        const dot = f.dot();
        for (const s of specks) {
          const u = (s.u + f.t * s.s) % 1;
          const [px, py] = at(u, s.a + f.t * 3 * (1.6 - u));
          ctx.globalAlpha = 0.6 * f.env * Math.sin(Math.PI * u);
          ctx.drawImage(dot, px - 2, py - 2, 4, 4);
        }
        ctx.globalAlpha = 1;
        // Dust kicked up at its foot.
        ctx.save();
        ctx.translate(x + bend, foot);
        ctx.scale(2, 0.4);
        glow(ctx, 0, 0, S * 0.6, f.ink(0.14 * f.env, true), f.ink(0, true));
        ctx.restore();
      };
    },
  },
];
