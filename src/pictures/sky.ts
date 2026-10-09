// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// The sky: light from above, stars, the moon, clouds.

import { beam, glow, rnd, smooth, TAU, Vision, RGB } from "./kit";

export const SKY: Vision[] = [
  {
    name: "rays",
    themes: ["light", "shine", "glory", "heaven", "radiance", "sun", "light of the world", "shine on", "brighter", "glorious light"],
    lane: "back",
    dur: [20, 36],
    make: (w, h) => {
      const sx = w * rnd(0.15, 0.85),
        sy = -h * 0.3;
      const rays = Array.from({ length: 9 }, (_, i) => ({ a: (i - 4) * 0.13 + rnd(-0.04, 0.04), wd: rnd(0.02, 0.06), p: rnd(0, TAU) }));
      return (f) => {
        const L = h * 1.6;
        for (const r of rays) {
          const ang = Math.PI / 2 + r.a + Math.sin(f.t * 0.08 + r.p) * 0.04;
          const wd = r.wd * (1 + 0.3 * Math.sin(f.t * 0.2 + r.p));
          const g = f.ctx.createLinearGradient(sx, sy, sx + Math.cos(ang) * L, sy + Math.sin(ang) * L);
          g.addColorStop(0.15, f.ink(0.08 * f.env));
          g.addColorStop(0.75, f.ink(0.03 * f.env));
          g.addColorStop(1, f.ink(0));
          f.ctx.fillStyle = g;
          f.ctx.beginPath();
          f.ctx.moveTo(sx, sy);
          f.ctx.lineTo(sx + Math.cos(ang - wd) * L, sy + Math.sin(ang - wd) * L);
          f.ctx.lineTo(sx + Math.cos(ang + wd) * L, sy + Math.sin(ang + wd) * L);
          f.ctx.fill();
        }
      };
    },
  },
  {
    name: "stars",
    themes: ["star", "stars", "night", "sky", "heavens", "universe", "shining", "bright morning star", "constellation"],
    lane: "back",
    dur: [24, 40],
    make: (w, h) => {
      const stars = Array.from({ length: Math.round((w * h) / 6000) }, () => ({
        x: rnd(0, w),
        y: rnd(0, h * 0.8) ** 1.15 / (h * 0.8) ** 0.15,
        r: rnd(1.5, 4.5) * (Math.random() < 0.08 ? 1.8 : 1),
        p: rnd(0, TAU),
        s: rnd(0.6, 2),
      }));
      const bx = w * rnd(0.25, 0.75),
        by = h * rnd(0.15, 0.3);
      const shoot = { at: rnd(0.3, 0.7), x: rnd(0.1, 0.6) * w, y: rnd(0.05, 0.3) * h, d: rnd(0.3, 0.5) };
      return (f) => {
        const { ctx } = f;
        const dot = f.dot(true);
        const m = f.dark ? 1 : 0.55;
        for (const s of stars) {
          ctx.globalAlpha = f.env * m * (0.25 + 0.45 * (0.5 + 0.5 * Math.sin(f.t * s.s + s.p)));
          ctx.drawImage(dot, s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
        }
        ctx.globalAlpha = 1;
        // The bright star, coming out as the rest are there, with its four long points.
        const b = f.env * smooth(f.k * 3 - 0.3) * (0.9 + 0.1 * Math.sin(f.t * 1.3));
        glow(ctx, bx, by, 60, f.ink(0.35 * b), f.ink(0));
        beam(f, bx, by - 70, bx, by + 70, 1.6, 0.55 * b);
        beam(f, bx - 42, by, bx + 42, by, 1.6, 0.5 * b);
        // Once, a shooting star.
        const q = (f.k - shoot.at) / 0.04;
        if (q > 0 && q < 1) {
          const x = shoot.x + q * w * shoot.d,
            y = shoot.y + q * h * shoot.d * 0.35;
          const g = ctx.createLinearGradient(x - 120, y - 42, x, y);
          g.addColorStop(0, f.ink(0, true));
          g.addColorStop(1, f.ink(0.6 * f.env * Math.sin(Math.PI * q), true));
          ctx.strokeStyle = g;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(x - 120, y - 42);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
      };
    },
  },
  {
    name: "glory",
    themes: ["glory", "glorious", "heaven", "splendour", "splendor", "majesty", "radiant", "shine", "unveiled"],
    lane: "back",
    dur: [24, 40],
    make: (w, h) => {
      const bands = [
        { cool: false, y: 0.16, p: rnd(0, TAU) },
        { cool: true, y: 0.24, p: rnd(0, TAU) },
        { cool: false, y: 0.32, p: rnd(0, TAU) },
      ];
      return (f) => {
        const { ctx } = f;
        for (const b of bands) {
          const top = (x: number) =>
            h * b.y + Math.sin(x * 0.0035 + f.t * 0.12 + b.p) * h * 0.06 + Math.sin(x * 0.009 - f.t * 0.2 + b.p) * h * 0.02;
          const th = h * 0.2;
          const g = ctx.createLinearGradient(0, h * b.y - h * 0.08, 0, h * b.y + th);
          g.addColorStop(0, f.ink(0, b.cool));
          g.addColorStop(0.3, f.ink(0.13 * f.env, b.cool));
          g.addColorStop(1, f.ink(0, b.cool));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(0, top(0));
          for (let x = 0; x <= w + 16; x += 16) ctx.lineTo(x, top(x));
          for (let x = w + 16; x >= 0; x -= 16) ctx.lineTo(x, top(x) + th * (0.7 + 0.3 * Math.sin(x * 0.006 + f.t * 0.3)));
          ctx.fill();
        }
      };
    },
  },
  {
    name: "sunrise",
    themes: [
      "morning",
      "sunrise",
      "dawn",
      "new day",
      "rising sun",
      "sun comes up",
      "mercies",
      "new every morning",
      "break of day",
      "daybreak",
      "light of day",
    ],
    lane: "back",
    dur: [24, 40],
    make: (w, h, room) => {
      const x = room.place(h * 0.6).x;
      const strata = Array.from({ length: 5 }, () => ({ y: rnd(0.6, 0.85), l: rnd(0.2, 0.5), x: rnd(0, 1), s: rnd(3, 9) }));
      return (f) => {
        const { ctx } = f;
        const y = h * (1.12 - 0.22 * smooth(f.k * 1.3));
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1.6, 1);
        glow(ctx, 0, 0, h * 0.55, f.ink(0.24 * f.env), f.ink(0));
        glow(ctx, 0, 0, h * 0.16, f.ink(0.3 * f.env), f.ink(0));
        ctx.restore();
        for (const s of strata) {
          const sx = ((s.x * w + f.t * s.s) % (w * 1.4)) - w * 0.2;
          beam(f, sx, h * s.y, sx + w * s.l, h * s.y, 2, 0.12 * f.env);
        }
      };
    },
  },
  {
    name: "rainbow",
    themes: ["rainbow", "promise", "covenant", "storm", "after the rain", "faithful", "promises"],
    lane: "back",
    dur: [18, 30],
    make: (w, h) => {
      const cx = w * rnd(0.35, 0.65),
        cy = h * 1.08,
        R = Math.max(w * 0.5, h * 0.75);
      // Violet inside to red outside, blending into each other.
      const spectrum: RGB[] = [
        [150, 90, 220],
        [80, 120, 240],
        [70, 190, 210],
        [90, 210, 110],
        [245, 225, 80],
        [250, 150, 60],
        [240, 70, 70],
      ];
      // Drawn on a layer, faded towards the ground there, then laid over the page faintly.
      let layer: HTMLCanvasElement | null = null;
      const bow = (L: CanvasRenderingContext2D, r: number, band: number, cols: RGB[], a: number) => {
        const g = L.createRadialGradient(cx, cy, r - band, cx, cy, r);
        g.addColorStop(0, `rgba(${cols[0].join(",")},0)`);
        cols.forEach((c, i) => g.addColorStop(0.08 + (i / (cols.length - 1)) * 0.84, `rgba(${c.join(",")},${a})`));
        g.addColorStop(1, `rgba(${cols[cols.length - 1].join(",")},0)`);
        L.fillStyle = g;
        L.fillRect(0, 0, w, h);
      };
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
        L.globalCompositeOperation = "source-over";
        L.clearRect(0, 0, layer.width, layer.height);
        L.setTransform(dpr, 0, 0, dpr, 0, 0);
        const band = R * 0.17;
        // The sky inside the bow is a little brighter than outside it.
        const glowIn = L.createRadialGradient(cx, cy, R * 0.55, cx, cy, R - band * 0.6);
        glowIn.addColorStop(0, "rgba(255,255,255,0)");
        glowIn.addColorStop(0.97, f.dark ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.35)");
        glowIn.addColorStop(1, "rgba(255,255,255,0)");
        L.fillStyle = glowIn;
        L.fillRect(0, 0, w, h);
        bow(L, R, band, spectrum, 1);
        // Fading out towards its feet.
        L.globalCompositeOperation = "destination-in";
        const fade = L.createLinearGradient(0, cy - R * 1.35, 0, h);
        fade.addColorStop(0, "rgba(0,0,0,1)");
        fade.addColorStop(0.55, "rgba(0,0,0,0.85)");
        fade.addColorStop(1, "rgba(0,0,0,0.05)");
        L.fillStyle = fade;
        L.fillRect(0, 0, w, h);
        ctx.globalAlpha = (f.dark ? 0.15 : 0.19) * f.env;
        ctx.drawImage(layer, 0, 0, w, h);
        ctx.globalAlpha = 1;
      };
    },
  },
  {
    name: "clouds",
    themes: ["cloud", "clouds", "sky", "heaven", "above", "carried", "on the clouds"],
    lane: "back",
    dur: [24, 40],
    make: (w, h) => {
      const clouds = Array.from({ length: 6 }, () => {
        const cw = rnd(160, 320);
        return {
          x: rnd(-0.2, 1) * w,
          y: rnd(0.05, 0.55) * h,
          v: rnd(5, 14),
          puffs: Array.from({ length: 9 }, () => ({ dx: rnd(-0.5, 0.5) * cw, dy: rnd(-0.12, 0.1) * cw, r: rnd(0.18, 0.34) * cw })),
        };
      });
      return (f) => {
        const dot = f.dot();
        for (const c of clouds) {
          const x = ((c.x + f.t * c.v + w * 0.3) % (w * 1.6)) - w * 0.3;
          f.ctx.globalAlpha = (f.dark ? 0.09 : 0.11) * f.env;
          for (const p of c.puffs) f.ctx.drawImage(dot, x + p.dx - p.r, c.y + p.dy - p.r * 0.7, p.r * 2, p.r * 1.4);
        }
        f.ctx.globalAlpha = 1;
      };
    },
  },
  {
    name: "twelve stars",
    themes: ["star", "stars", "crown", "twelve", "israel", "heavens"],
    lane: "back",
    dur: [20, 34],
    make: (w, h, room) => {
      const R0 = Math.min(w, h) * 0.2;
      const { x, scale } = room.place(R0 * 2.4);
      const y = h * rnd(0.3, 0.45),
        R = R0 * scale;
      return (f) => {
        const { ctx } = f;
        glow(ctx, x, y, R * 1.6, f.ink(0.06 * f.env), f.ink(0));
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * TAU + f.t * 0.02;
          const sx = x + Math.cos(a) * R,
            sy = y + Math.sin(a) * R * 0.92;
          const b = f.env * smooth(f.k * 5 - i * 0.2) * (0.75 + 0.25 * Math.sin(f.t * 1.5 + i));
          glow(ctx, sx, sy, 16, f.ink(0.45 * b), f.ink(0));
          beam(f, sx, sy - 13, sx, sy + 13, 1.2, 0.4 * b);
          beam(f, sx - 9, sy, sx + 9, sy, 1.2, 0.35 * b);
        }
      };
    },
  },
  {
    name: "galaxy",
    themes: ["galaxy", "galaxies", "universe", "stars", "heavens", "creation", "stars in the sky", "spoke", "cosmos", "planets", "formed"],
    lane: "back",
    dur: [24, 40],
    make: (w, h, room) => {
      const R0 = Math.min(w, h) * 0.32;
      const { x, scale } = room.place(R0 * 2.1);
      const y = h * rnd(0.3, 0.5),
        R = R0 * scale,
        tilt = rnd(-0.5, 0.5);
      const stars = Array.from({ length: 700 }, (_, i) => {
        const arm = i % 2;
        const d = Math.random() ** 0.7;
        return {
          d,
          a: arm * Math.PI + d * 5.2 + rnd(-0.35, 0.35) * (1.2 - d),
          r: rnd(0.8, 2.6) * (1.2 - d * 0.6),
          cool: Math.random() < 0.5,
          p: rnd(0, TAU),
        };
      });
      return (f) => {
        const { ctx } = f;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(tilt);
        ctx.scale(1, 0.42);
        glow(ctx, 0, 0, R * 0.5, f.ink(0.3 * f.env), f.ink(0));
        const spin = f.t * 0.02;
        const warm = f.dot(),
          cool = f.dot(true);
        for (const s of stars) {
          const a = s.a + spin / (0.3 + s.d);
          const px = Math.cos(a) * s.d * R,
            py = Math.sin(a) * s.d * R;
          ctx.globalAlpha = f.env * (0.3 + 0.4 * Math.sin(f.t * 1.5 + s.p) ** 2) * (1.1 - s.d);
          ctx.drawImage(s.cool ? cool : warm, px - s.r * 2, py - s.r * 2, s.r * 4, s.r * 4);
        }
        ctx.restore();
        ctx.globalAlpha = 1;
      };
    },
  },
  {
    name: "moon",
    themes: ["moon", "night", "silent", "still", "sleep", "watch", "midnight", "quiet"],
    lane: "back",
    dur: [24, 40],
    make: (w, h, room) => {
      const r = Math.min(w, h) * 0.06;
      const { x } = room.place(r * 6);
      const y = h * rnd(0.18, 0.3);
      const stars = Array.from({ length: 40 }, () => ({ x: rnd(0, w), y: rnd(0, h * 0.6), r: rnd(1.2, 3), p: rnd(0, TAU) }));
      const cloud = Array.from({ length: 7 }, () => ({ dx: rnd(-1.6, 1.6) * r, dy: rnd(-0.3, 0.3) * r, s: rnd(0.6, 1.1) * r }));
      const moon = document.createElement("canvas");
      return (f) => {
        const { ctx } = f;
        glow(ctx, x + r * 0.3, y, r * 5, f.ink(0.06 * f.env, true), f.ink(0, true));
        // The dark of the moon, just there (earthshine).
        ctx.fillStyle = f.ink(0.05 * f.env, true);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
        // The crescent, cut out on a canvas of its own so the cut takes nothing else with it.
        const d = Math.ceil(r * 2.6);
        if (moon.width !== d) moon.width = moon.height = d;
        const m = moon.getContext("2d")!;
        m.clearRect(0, 0, d, d);
        m.globalCompositeOperation = "source-over";
        m.fillStyle = f.ink(0.45 * f.env, true);
        m.beginPath();
        m.arc(d / 2, d / 2, r, 0, TAU);
        m.fill();
        m.globalCompositeOperation = "destination-out";
        m.fillStyle = "#000";
        m.beginPath();
        m.arc(d / 2 - r * 0.45, d / 2 - r * 0.12, r * 0.94, 0, TAU);
        m.fill();
        ctx.save();
        ctx.shadowColor = f.ink(0.35 * f.env, true);
        ctx.shadowBlur = r * 0.35;
        ctx.drawImage(moon, x - d / 2, y - d / 2);
        ctx.restore();
        const dot = f.dot(true);
        for (const s of stars) {
          ctx.globalAlpha = f.env * (f.dark ? 0.6 : 0.35) * (0.3 + 0.7 * Math.sin(f.t * 1.3 + s.p) ** 2);
          ctx.drawImage(dot, s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
        }
        // A thin cloud passing over.
        const cx = x - r * 6 + ((f.t * 6) % (r * 12));
        ctx.globalAlpha = 0.12 * f.env;
        const puff = f.dot();
        for (const c of cloud) ctx.drawImage(puff, cx + c.dx - c.s * 1.6, y + r * 0.5 + c.dy - c.s * 0.5, c.s * 3.2, c.s);
        ctx.globalAlpha = 1;
      };
    },
  },
  {
    name: "shooting stars",
    themes: ["star", "stars", "night", "sky", "heavens", "falling"],
    lane: "pass",
    dur: [10, 16],
    moving: true,
    make: (w, h) => {
      const dir = Math.random() < 0.5 ? 1 : -1;
      const meteors = Array.from({ length: 7 }, () => ({
        at: rnd(0.08, 0.8),
        x: rnd(0, 0.8) * w,
        y: rnd(0, 0.35) * h,
        len: rnd(0.25, 0.45),
        d: rnd(0.05, 0.09),
      }));
      const stars = Array.from({ length: 50 }, () => ({ x: rnd(0, w), y: rnd(0, h * 0.6), r: rnd(1, 2.5), p: rnd(0, TAU) }));
      return (f) => {
        const { ctx } = f;
        const dot = f.dot(true);
        for (const s of stars) {
          ctx.globalAlpha = f.env * (f.dark ? 0.5 : 0.3) * (0.3 + 0.7 * Math.sin(f.t * 1.6 + s.p) ** 2);
          ctx.drawImage(dot, s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
        }
        ctx.globalAlpha = 1;
        for (const m of meteors) {
          const q = (f.k - m.at) / m.d;
          if (q <= 0 || q >= 1) continue;
          const dx = dir * w * m.len,
            dy = h * m.len * 0.4;
          const hx = (dir > 0 ? m.x : w - m.x) + q * dx,
            hy = m.y + q * dy;
          const tx = hx - dx * 0.35,
            ty = hy - dy * 0.35;
          const a = f.env * Math.sin(Math.PI * q);
          const g = ctx.createLinearGradient(tx, ty, hx, hy);
          g.addColorStop(0, f.ink(0, true));
          g.addColorStop(1, f.ink(0.7 * a, true));
          ctx.strokeStyle = g;
          ctx.lineWidth = 1.8;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(hx, hy);
          ctx.stroke();
          glow(ctx, hx, hy, 10, f.ink(0.6 * a, true), f.ink(0, true));
        }
      };
    },
  },
];
