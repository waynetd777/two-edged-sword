// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Signs and symbols, drawn as if by hand, and music.

import { displayFont, flame, glow, rnd, smooth, TAU, Vision } from "./kit";

export const SIGNS: Vision[] = [
  {
    name: "ichthys",
    themes: ["fish", "fisher", "fishers of men", "follow", "disciples", "follow me", "christian"],
    lane: "pass",
    dur: [10, 15],
    make: (w, h, room) => {
      const S0 = Math.min(w, h) * 0.13;
      const { x, scale } = room.place(S0 * 2.3);
      const S = S0 * scale,
        y = h * rnd(0.3, 0.6);
      const font = getComputedStyle(document.documentElement).getPropertyValue("--display") || "Georgia, serif";
      return (f) => {
        const { ctx } = f;
        const p = smooth(f.k * 2.4);
        ctx.save();
        ctx.translate(x, y);
        ctx.strokeStyle = f.ink(0.5 * f.env);
        ctx.shadowColor = f.ink(0.7 * f.env);
        ctx.shadowBlur = 10;
        ctx.lineWidth = 2.2;
        ctx.lineCap = "round";
        // Drawn as if traced in sand: the two arcs crossing to make the tail.
        const L = S * 4.4;
        ctx.setLineDash([L * p, L]);
        ctx.beginPath();
        ctx.moveTo(-0.95 * S, 0.4 * S);
        ctx.quadraticCurveTo(0, -0.95 * S, 0.95 * S, 0);
        ctx.quadraticCurveTo(0, 0.95 * S, -0.95 * S, -0.4 * S);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;
        const e = smooth(f.k * 3 - 1.5);
        ctx.fillStyle = f.ink(0.5 * f.env * e);
        ctx.beginPath();
        ctx.arc(0.5 * S, -0.08 * S, 2.2, 0, TAU);
        ctx.fill();
        ctx.font = `500 ${Math.round(S * 0.22)}px ${font}`;
        ctx.textAlign = "center";
        ctx.fillStyle = f.ink(0.35 * f.env * smooth(f.k * 3 - 1.6));
        ctx.fillText("Ι Χ Θ Υ Σ", 0, S * 0.85);
        ctx.restore();
      };
    },
  },
  {
    name: "alpha and omega",
    themes: [
      "alpha",
      "omega",
      "beginning",
      "end",
      "first and the last",
      "eternal",
      "forever",
      "everlasting",
      "ancient of days",
      "from everlasting",
      "without end",
    ],
    lane: "pass",
    dur: [12, 18],
    make: (w, h, room) => {
      const size0 = Math.min(h * 0.32, w * 0.2);
      const { x: cx, scale } = room.place(size0 * 2.8);
      const size = Math.round(size0 * scale);
      const font = getComputedStyle(document.documentElement).getPropertyValue("--display") || "Georgia, serif";
      const y = h * rnd(0.4, 0.55);
      return (f) => {
        const { ctx } = f;
        ctx.save();
        ctx.font = `400 ${size}px ${font}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = f.ink(0.4 * f.env);
        ctx.shadowBlur = 24;
        const a = f.env * smooth(f.k * 4),
          o = f.env * smooth(f.k * 4 - 1.2);
        ctx.fillStyle = f.ink(0.07 * a);
        ctx.fillText("Α", cx - size * 0.85, y - Math.sin(f.t * 0.4) * 6);
        ctx.fillStyle = f.ink(0.07 * o);
        ctx.fillText("Ω", cx + size * 0.85, y + Math.sin(f.t * 0.4) * 6);
        ctx.restore();
      };
    },
  },
  {
    name: "anchor",
    themes: ["anchor", "hope", "steadfast", "hold", "sure", "secure", "anchored", "holds", "my hope", "unshaken", "storm"],
    lane: "pass",
    dur: [11, 16],
    make: (w, h, room) => {
      const S0 = Math.min(w, h) * 0.12;
      const { x, scale } = room.place(S0 * 4);
      const y = h * rnd(0.35, 0.55),
        S = S0 * scale;
      let layer: HTMLCanvasElement | null = null;
      return (f) => {
        const { ctx } = f;
        const p = smooth(f.k * 2.4);
        const ay = y + Math.sin(f.t * 0.8) * 4,
          tilt = Math.sin(f.t * 0.6) * 0.04;
        // An admiralty anchor, solid iron: the ring, a shank thickening to the crown, the stock across
        // it with knobbed ends, and the curved arms ending in spade-shaped flukes. Drawn on a layer
        // in one piece, shaded as lit from above left, and coming into view from the ring down.
        const dpr = ctx.getTransform().a || 1;
        if (!layer || layer.width !== Math.round(w * dpr) || layer.height !== Math.round(h * dpr)) {
          layer = document.createElement("canvas");
          layer.width = Math.round(w * dpr);
          layer.height = Math.round(h * dpr);
        }
        const L = layer.getContext("2d")!;
        L.setTransform(1, 0, 0, 1, 0, 0);
        L.clearRect(0, 0, layer.width, layer.height);
        L.setTransform(dpr, 0, 0, dpr, x * dpr, ay * dpr);
        L.rotate(tilt);
        L.scale(S, S);
        const iron = L.createLinearGradient(-0.8, -1.2, 0.8, 1.1);
        iron.addColorStop(0, f.ink(1));
        iron.addColorStop(0.5, f.ink(0.7));
        iron.addColorStop(1, f.ink(0.4));
        // Every part solid first, then the shading laid over the whole, so there are no seams where they join.
        L.fillStyle = "#fff";
        L.strokeStyle = "#fff";
        // The ring.
        L.lineWidth = 0.065;
        L.beginPath();
        L.arc(0, -1.12, 0.14, 0, TAU);
        L.stroke();
        // The shank, from the ring down to the crown.
        L.beginPath();
        L.moveTo(-0.045, -0.99);
        L.lineTo(0.045, -0.99);
        L.quadraticCurveTo(0.07, 0, 0.075, 0.9);
        L.lineTo(-0.075, 0.9);
        L.quadraticCurveTo(-0.07, 0, -0.045, -0.99);
        L.fill();
        // The stock, with a knob at each end.
        L.beginPath();
        L.moveTo(-0.46, -0.745);
        L.quadraticCurveTo(0, -0.77, 0.46, -0.745);
        L.lineTo(0.46, -0.695);
        L.quadraticCurveTo(0, -0.67, -0.46, -0.695);
        L.fill();
        for (const sx of [-1, 1]) {
          L.beginPath();
          L.arc(sx * 0.48, -0.72, 0.05, 0, TAU);
          L.fill();
        }
        // The arms, thick at the crown and tapering up to the flukes, and the crown's point.
        for (const sx of [-1, 1]) {
          L.beginPath();
          L.moveTo(0, 1.03);
          L.quadraticCurveTo(sx * 0.74, 1.0, sx * 0.86, 0.36);
          L.lineTo(sx * 0.76, 0.38);
          L.quadraticCurveTo(sx * 0.62, 0.84, 0, 0.84);
          L.closePath();
          L.fill();
          // The fluke: a spade on the arm's end, its bill pointing up and out.
          L.beginPath();
          L.moveTo(sx * 0.9, 0.16);
          L.quadraticCurveTo(sx * 1.02, 0.36, sx * 0.97, 0.52);
          L.quadraticCurveTo(sx * 0.86, 0.5, sx * 0.8, 0.6);
          L.quadraticCurveTo(sx * 0.66, 0.5, sx * 0.62, 0.44);
          L.quadraticCurveTo(sx * 0.8, 0.36, sx * 0.9, 0.16);
          L.fill();
        }
        L.beginPath();
        L.moveTo(-0.07, 1.0);
        L.lineTo(0, 1.1);
        L.lineTo(0.07, 1.0);
        L.fill();
        L.globalCompositeOperation = "source-in";
        L.fillStyle = iron;
        L.fillRect(-1.3, -1.4, 2.6, 2.7);
        // Not yet come into view below this line (erased, not clipped: WebKit's clip and source-in disagree).
        L.globalCompositeOperation = "destination-out";
        L.fillStyle = "#000";
        L.fillRect(-1.5, -1.1 + 2.6 * p, 3, 3);
        L.globalCompositeOperation = "source-over";
        ctx.save();
        ctx.globalAlpha = 0.5 * f.env;
        ctx.shadowColor = f.ink(0.6 * f.env);
        ctx.shadowBlur = 10;
        ctx.drawImage(layer, 0, 0, w, h);
        ctx.restore();
        ctx.save();
        ctx.translate(x, ay);
        ctx.rotate(tilt);
        ctx.font = `italic 400 ${Math.round(S * 0.17)}px ${displayFont()}`;
        ctx.textAlign = "center";
        ctx.fillStyle = f.ink(0.35 * f.env * smooth(f.k * 3 - 1.6));
        ctx.fillText("an anchor of the soul, both sure and stedfast", 0, S * 1.45);
        ctx.restore();
      };
    },
  },
  {
    name: "crown",
    themes: ["crown", "king", "king of kings", "reign", "throne", "majesty", "royal", "crowned", "glory", "exalted"],
    lane: "pass",
    dur: [11, 16],
    make: (w, h, room) => {
      const S0 = Math.min(w, h) * 0.13;
      const { x, scale } = room.place(S0 * 2.6);
      const y = h * rnd(0.35, 0.5),
        S = S0 * scale;
      // A circlet crown seen a little from above, in its own units (S): a round band in perspective
      // (an ellipse `ry` deep), points rising from its rim, those at the back seen across its hollow.
      const ry = 0.22,
        band = 0.42,
        H = 0.5;
      const rimAt = (t: number) => [Math.cos(t), ry * Math.sin(t)] as const; // front for t in 0–π
      const point = (G: CanvasRenderingContext2D, t: number, tall: number) => {
        const [px, py] = rimAt(t);
        const wd = 0.4 * Math.abs(Math.sin(t)) + 0.06;
        G.beginPath();
        G.moveTo(px - wd / 2, py + 0.02);
        G.quadraticCurveTo(px - wd * 0.18, py - tall * 0.3, px, py - tall);
        G.quadraticCurveTo(px + wd * 0.18, py - tall * 0.3, px + wd / 2, py + 0.02);
        G.closePath();
        G.fill();
        return [px, py - tall] as const;
      };
      const front = [0.1, 0.3, 0.5, 0.7, 0.9].map((k) => k * Math.PI),
        back = [0.2, 0.4, 0.6, 0.8].map((k) => Math.PI + k * Math.PI);
      let layer: HTMLCanvasElement | null = null;
      return (f) => {
        const { ctx } = f;
        const cy = y + Math.sin(f.t * 0.7) * 5;
        glow(ctx, x, cy, S * 2.2, f.ink(0.1 * f.env), f.ink(0));
        const dpr = ctx.getTransform().a || 1;
        if (!layer || layer.width !== Math.round(w * dpr) || layer.height !== Math.round(h * dpr)) {
          layer = document.createElement("canvas");
          layer.width = Math.round(w * dpr);
          layer.height = Math.round(h * dpr);
        }
        const L = layer.getContext("2d")!;
        L.setTransform(1, 0, 0, 1, 0, 0);
        L.clearRect(0, 0, layer.width, layer.height);
        L.setTransform(dpr * S, 0, 0, dpr * S, x * dpr, cy * dpr);
        // Solid colours, mixed from the page's own and the ink (warm gold, or cool for gems).
        const mix = (cool: boolean) => {
          const ink = f.ink(1, cool).slice(5).split(",").slice(0, 3).map(Number);
          const page = f.dark ? [13, 17, 23] : [246, 248, 250];
          return (k: number) => `rgb(${page.map((p, i) => Math.round(p + (ink[i] - p) * Math.min(1, k))).join(",")})`;
        };
        const gold = mix(false),
          gem = mix(true);
        // Gold shaded as a curved surface: dark at the sides, brightest a little left of the middle.
        const curved = (k: number) => {
          const g = L.createLinearGradient(-1.05, 0, 1.05, 0);
          g.addColorStop(0, gold(0.22 * k));
          g.addColorStop(0.38, gold(0.75 * k));
          g.addColorStop(0.6, gold(0.58 * k));
          g.addColorStop(1, gold(0.2 * k));
          return g;
        };
        // The back points, darker, then the hollow inside the band, then the band and its front points.
        L.fillStyle = curved(0.55);
        const pearls: (readonly [number, number, number])[] = [];
        for (const t of back) pearls.push([...point(L, t, H * 0.92), 0.6]);
        L.fillStyle = gold(0.07);
        L.beginPath();
        L.ellipse(0, 0, 1, ry, 0, 0, TAU);
        L.fill();
        L.fillStyle = curved(1);
        L.beginPath();
        L.moveTo(-1, 0);
        for (let i = 0; i <= 40; i++) {
          const [px, py] = rimAt(Math.PI - (i / 40) * Math.PI);
          L.lineTo(px, py);
        }
        L.lineTo(1, band);
        for (let i = 0; i <= 40; i++) {
          const [px, py] = rimAt((i / 40) * Math.PI);
          L.lineTo(px, py + band);
        }
        L.closePath();
        L.fill();
        for (const t of front) pearls.push([...point(L, t, H * (0.85 + 0.15 * Math.sin(t))), 1]);
        // The band's raised edges.
        L.strokeStyle = curved(1.35);
        L.lineWidth = 0.035;
        for (const off of [0.02, band - 0.02]) {
          L.beginPath();
          for (let i = 0; i <= 40; i++) {
            const [px, py] = rimAt((i / 40) * Math.PI);
            if (i) L.lineTo(px, py + off);
            else L.moveTo(px, py + off);
          }
          L.stroke();
        }
        // Gems set in the band, narrowing as it curves away; pearls on the points.
        [0.18, 0.34, 0.5, 0.66, 0.82].forEach((k, i) => {
          const t = k * Math.PI;
          const [px, py] = rimAt(t);
          const r = i === 2 ? 0.085 : 0.065;
          L.fillStyle = i % 2 ? gold(0.95) : gem(0.75);
          L.beginPath();
          L.ellipse(px, py + band / 2, r * Math.sin(t), r, 0, 0, TAU);
          L.fill();
          L.fillStyle = gem(1.2);
          L.beginPath();
          L.arc(px - r * 0.3 * Math.sin(t), py + band / 2 - r * 0.35, r * 0.22, 0, TAU);
          L.fill();
        });
        for (const [px, py, k] of pearls) {
          L.fillStyle = gold(0.9 * k);
          L.beginPath();
          L.arc(px, py, 0.05 * (0.6 + 0.4 * k), 0, TAU);
          L.fill();
        }
        // A gleam sweeping across the gold.
        const gx = -1.6 + ((f.t * 0.35) % 1.4) * 2.4;
        const gl = L.createLinearGradient(gx - 0.3, 0, gx + 0.3, 0);
        gl.addColorStop(0, "rgba(255,255,255,0)");
        gl.addColorStop(0.5, f.dark ? "rgba(255,250,235,0.35)" : "rgba(255,255,255,0.45)");
        gl.addColorStop(1, "rgba(255,255,255,0)");
        L.globalCompositeOperation = "source-atop";
        L.fillStyle = gl;
        L.fillRect(-1.3, -1, 2.6, 1.7);
        L.globalCompositeOperation = "source-over";
        ctx.save();
        ctx.globalAlpha = 0.75 * f.env;
        ctx.globalCompositeOperation = "source-over";
        ctx.shadowColor = f.ink(0.4 * f.env);
        ctx.shadowBlur = 12;
        ctx.drawImage(layer, 0, 0, w, h);
        ctx.restore();
      };
    },
  },
  {
    name: "harp",
    themes: ["harp", "sing", "song", "praise", "music", "melody", "play", "psalm", "strings", "instrument", "make music"],
    lane: "pass",
    dur: [12, 18],
    make: (w, h, room) => {
      const H0 = Math.min(h * 0.42, w * 0.3);
      const { x, scale } = room.place(H0 * 0.8);
      const left = x < w / 2;
      const H = H0 * scale,
        y = h * 0.5;
      const n = 12;
      // In the harp's own units (H): the soundbox runs up from the foot of the pillar to the top
      // of the neck, wide at the bottom; the neck makes the harp's curve between them.
      const box = (u: number) => [-0.24 + 0.56 * u, 0.46 - 0.78 * u] as const;
      const half = (u: number) => 0.1 - 0.068 * u;
      const nx = 0.81,
        ny = 0.58; // across the soundbox, towards its back
      const neckY = (px: number) => {
        const s = (px + 0.32) / 0.66;
        return -0.5 - 0.06 * Math.sin(Math.PI * Math.min(1, s * 1.4)) + 0.18 * s * s;
      };
      // The strings hang straight down from the neck to the soundboard, each a little longer.
      const strings = Array.from({ length: n }, (_, i) => {
        const sx = -0.25 + (i / (n - 1)) * 0.5;
        // Where it meets the soundboard's middle strip (a little in front of the box's middle line):
        // that strip's x grows steadily with u, so solve for u, then take its y.
        const k = 0.35;
        const u = Math.min(1, Math.max(0, (sx + 0.24 + nx * k * 0.1) / (0.56 + nx * k * 0.068)));
        const [, by] = box(u);
        return { sx, top: neckY(sx) + 0.035, bottom: by - ny * half(u) * k };
      });
      let layer: HTMLCanvasElement | null = null;
      return (f) => {
        const { ctx } = f;
        const rise = (1 - smooth(f.env)) * 20;
        const flip = left ? 1 : -1;
        const dpr = ctx.getTransform().a || 1;
        if (!layer || layer.width !== Math.round(w * dpr) || layer.height !== Math.round(h * dpr)) {
          layer = document.createElement("canvas");
          layer.width = Math.round(w * dpr);
          layer.height = Math.round(h * dpr);
        }
        const L = layer.getContext("2d")!;
        L.setTransform(1, 0, 0, 1, 0, 0);
        L.clearRect(0, 0, layer.width, layer.height);
        L.setTransform(dpr * H * flip, 0, 0, dpr * H, x * dpr, (y + rise) * dpr);
        // Solid wood, in colours mixed from the page's own and the ink.
        const ink = f.ink(1).slice(5).split(",").slice(0, 3).map(Number);
        const page = f.dark ? [13, 17, 23] : [246, 248, 250];
        const wood = (k: number) => `rgb(${page.map((p, i) => Math.round(p + (ink[i] - p) * k)).join(",")})`;
        // The soundbox: lit on its face, towards the strings, darker at its back.
        const bg = L.createLinearGradient(0.04 - nx * 0.08, 0.08 - ny * 0.08, 0.04 + nx * 0.08, 0.08 + ny * 0.08);
        bg.addColorStop(0, wood(0.6));
        bg.addColorStop(1, wood(0.22));
        L.fillStyle = bg;
        // Its face and back run on down to the floor line (y 0.5), where it stands flat.
        const floorAt = (side: number) => {
          const [a, b] = [0.46 + side * ny * 0.1, 0.78 + side * ny * 0.068]; // y = a - b·u
          return (a - 0.5) / b;
        };
        const uFace = floorAt(-1),
          uBack = floorAt(1);
        L.beginPath();
        for (let i = 0; i <= 20; i++) {
          const u = uFace + (i / 20) * (1 - uFace),
            [bx, by] = box(u);
          L.lineTo(bx - nx * half(u), by - ny * half(u));
        }
        for (let i = 20; i >= 0; i--) {
          const u = uBack + (i / 20) * (1 - uBack),
            [bx, by] = box(u);
          L.lineTo(bx + nx * half(u), by + ny * half(u));
        }
        L.closePath();
        L.fill();
        // The soundboard's middle strip, where the strings are fixed.
        L.strokeStyle = wood(0.75);
        L.lineWidth = 0.012;
        L.beginPath();
        const [b0x, b0y] = box(0.02),
          [b1x, b1y] = box(0.98);
        L.moveTo(b0x - nx * half(0.02) * 0.35, b0y - ny * half(0.02) * 0.35);
        L.lineTo(b1x - nx * half(0.98) * 0.35, b1y - ny * half(0.98) * 0.35);
        L.stroke();
        // The pillar, gently bowed, with a carved knob at its head and a foot.
        L.strokeStyle = wood(0.5);
        L.lineCap = "round";
        L.lineWidth = 0.05;
        L.beginPath();
        L.moveTo(-0.32, -0.5);
        L.quadraticCurveTo(-0.39, 0, -0.27, 0.5);
        L.stroke();
        L.strokeStyle = wood(0.72);
        L.lineWidth = 0.015;
        L.beginPath();
        L.moveTo(-0.33, -0.46);
        L.quadraticCurveTo(-0.392, 0, -0.283, 0.46);
        L.stroke();
        L.fillStyle = wood(0.6);
        L.beginPath();
        L.arc(-0.33, -0.54, 0.042, 0, TAU);
        L.fill();
        // The plinth both stand on.
        const [fx] = box(uFace),
          [bkx] = box(uBack);
        const x0 = fx - nx * half(uFace) - 0.02,
          x1 = bkx + nx * half(uBack) + 0.02;
        L.beginPath();
        L.moveTo(x0, 0.5);
        L.lineTo(x1, 0.5);
        L.quadraticCurveTo(x1 + 0.01, 0.535, x1 - 0.02, 0.535);
        L.lineTo(x0 + 0.02, 0.535);
        L.quadraticCurveTo(x0 - 0.01, 0.535, x0, 0.5);
        L.fill();
        // The neck, in the harp's curve, with its row of tuning pins.
        L.strokeStyle = wood(0.55);
        L.lineWidth = 0.055;
        L.beginPath();
        for (let i = 0; i <= 30; i++) {
          const px = -0.32 + (i / 30) * 0.66;
          if (i) L.lineTo(px, neckY(px));
          else L.moveTo(px, neckY(px));
        }
        L.stroke();
        L.fillStyle = wood(0.85);
        for (const st of strings) {
          L.beginPath();
          L.arc(st.sx, neckY(st.sx) - 0.008, 0.008, 0, TAU);
          L.fill();
        }
        ctx.save();
        ctx.globalAlpha = 0.6 * f.env;
        ctx.globalCompositeOperation = "source-over";
        ctx.shadowColor = f.ink(0.4 * f.env);
        ctx.shadowBlur = 10;
        ctx.drawImage(layer, 0, 0, w, h);
        ctx.restore();
        // The strings, plucked in turn, each trembling and lit as it sounds.
        ctx.save();
        ctx.translate(x, y + rise);
        ctx.scale(H * flip, H);
        ctx.lineWidth = 1 / H;
        strings.forEach((st, i) => {
          const since = (f.t * 2.2 - i * 0.5 + 100) % (n * 0.5 + 2);
          const ring = since < 2 ? Math.exp(-since * 1.8) : 0;
          const wob = (Math.sin(f.t * 40) * ring * 4) / H;
          ctx.strokeStyle = f.ink((0.25 + 0.5 * ring) * f.env);
          ctx.beginPath();
          ctx.moveTo(st.sx, st.top);
          ctx.quadraticCurveTo(st.sx + wob, (st.top + st.bottom) / 2, st.sx, st.bottom);
          ctx.stroke();
          if (ring > 0.1) glow(ctx, st.sx, (st.top + st.bottom) / 2, 30 / H, f.ink(0.1 * ring * f.env), f.ink(0));
        });
        ctx.restore();
      };
    },
  },
  {
    name: "music",
    themes: ["sing", "song", "music", "melody", "voice", "praise", "shout", "new song", "rejoice", "joyful noise", "singing", "choir"],
    lane: "pass",
    dur: [12, 18],
    moving: true,
    make: (w, h) => {
      const y0 = h * rnd(0.3, 0.6),
        p = rnd(0, TAU);
      const glyphs = ["♪", "♫", "♩", "♬"];
      const notes = Array.from({ length: 14 }, (_, i) => ({ u: i / 14, line: Math.floor(rnd(0, 5)), g: glyphs[i % 4], s: rnd(18, 28) }));
      return (f) => {
        const { ctx } = f;
        const staff = (x: number, i: number) => y0 + (i - 2) * 9 + Math.sin(x * 0.006 + f.t * 0.5 + p) * h * 0.06;
        ctx.lineWidth = 0.8;
        for (let i = 0; i < 5; i++) {
          const g = ctx.createLinearGradient(0, 0, w, 0);
          g.addColorStop(0, f.ink(0));
          g.addColorStop(0.5, f.ink(0.22 * f.env));
          g.addColorStop(1, f.ink(0));
          ctx.strokeStyle = g;
          ctx.beginPath();
          for (let x = 0; x <= w; x += 10) ctx.lineTo(x, staff(x, i));
          ctx.stroke();
        }
        // Notes riding along it, rising off it as they go.
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (const n of notes) {
          const u = (n.u + f.t * 0.04) % 1;
          const x = u * w;
          const lift = Math.max(0, u - 0.6) * 160;
          ctx.font = `${n.s}px "Apple Symbols", ${displayFont()}`;
          ctx.fillStyle = f.ink(0.5 * f.env * Math.sin(Math.PI * u));
          ctx.fillText(n.g, x, staff(x, n.line) - 4 - lift);
        }
      };
    },
  },
  {
    name: "tongues of fire",
    themes: [
      "fire",
      "pentecost",
      "holy spirit",
      "spirit",
      "flame",
      "tongues",
      "power",
      "holy ghost",
      "burn",
      "set a fire",
      "consuming fire",
      "fire fall",
    ],
    lane: "pass",
    dur: [12, 18],
    make: (w, h) => {
      const tongues = Array.from({ length: 12 }, () => ({
        x: rnd(0.08, 0.92) * w,
        y: rnd(0.2, 0.55) * h,
        d: rnd(0, 0.35),
        s: rnd(18, 28),
        p: rnd(0, TAU),
      }));
      return (f) => {
        // Coming down, one after another, and resting there.
        for (const t of tongues) {
          const q = smooth((f.k - t.d) * 3);
          if (q <= 0) continue;
          const y = t.y - (1 - q) * h * 0.3 + Math.sin(f.t * 0.8 + t.p) * 5;
          flame(f, t.x + Math.sin(f.t * 0.5 + t.p) * 6, y, t.s, t.p, 0.75 * q);
        }
      };
    },
  },
  {
    name: "motes",
    themes: ["light", "shine", "dust", "quiet", "sanctuary", "still", "holy", "presence", "sacred"],
    lane: "pass",
    dur: [12, 20],
    moving: true,
    make: (w, h) => {
      const x0 = w * rnd(0.1, 0.5);
      const motes = Array.from({ length: 70 }, () => ({
        u: Math.random(),
        v: rnd(-1, 1),
        s: rnd(0.01, 0.04),
        r: rnd(1.5, 4),
        p: rnd(0, TAU),
      }));
      return (f) => {
        const { ctx } = f;
        // A shaft of light, slanting down from the top.
        const ax = x0,
          bx = x0 + w * 0.35,
          wd = w * 0.12;
        const g = ctx.createLinearGradient(ax, 0, bx, h);
        g.addColorStop(0, f.ink(0.1 * f.env));
        g.addColorStop(1, f.ink(0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(ax - wd * 0.4, 0);
        ctx.lineTo(ax + wd * 0.4, 0);
        ctx.lineTo(bx + wd, h);
        ctx.lineTo(bx - wd, h);
        ctx.fill();
        const dot = f.dot();
        for (const m of motes) {
          const u = (m.u + f.t * m.s) % 1;
          const x = ax + (bx - ax) * (1 - u) + m.v * wd * (0.4 + 0.6 * (1 - u)) + Math.sin(f.t * 0.7 + m.p) * 8;
          const y = h * (1 - u);
          ctx.globalAlpha = f.env * 0.7 * (0.4 + 0.6 * Math.sin(f.t * 1.7 + m.p) ** 2) * Math.sin(Math.PI * u);
          ctx.drawImage(dot, x - m.r, y - m.r, m.r * 2, m.r * 2);
        }
        ctx.globalAlpha = 1;
      };
    },
  },
  {
    name: "lanterns",
    themes: ["light", "lamp", "night", "hope", "lantern", "shine", "lift", "darkness", "carry"],
    lane: "pass",
    dur: [14, 22],
    moving: true,
    make: (w, h) => {
      const ls = Array.from({ length: 12 }, () => ({
        x: rnd(0.08, 0.92) * w,
        v: rnd(18, 34),
        s: rnd(10, 18),
        p: rnd(0, TAU),
        y: rnd(0, 0.4) * h,
      }));
      return (f) => {
        const { ctx } = f;
        for (const l of ls) {
          const y = h + 30 + l.y - f.t * l.v;
          if (y < -40) continue;
          const x = l.x + Math.sin(f.t * 0.5 + l.p) * 18;
          const fl = 0.85 + 0.15 * Math.sin(f.t * 9 + l.p);
          glow(ctx, x, y, l.s * 3, f.ink(0.14 * f.env * fl), f.ink(0));
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(Math.sin(f.t * 0.7 + l.p) * 0.08);
          const g = ctx.createLinearGradient(0, -l.s, 0, l.s);
          g.addColorStop(0, f.ink(0.2 * f.env));
          g.addColorStop(1, f.ink(0.6 * f.env * fl));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(-l.s * 0.55, -l.s * 0.8);
          ctx.quadraticCurveTo(0, -l.s * 1.1, l.s * 0.55, -l.s * 0.8);
          ctx.lineTo(l.s * 0.4, l.s * 0.8);
          ctx.lineTo(-l.s * 0.4, l.s * 0.8);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      };
    },
  },
  {
    name: "fireflies",
    themes: ["light", "night", "little", "shine", "dark", "wonder", "glow", "lights"],
    lane: "pass",
    dur: [14, 22],
    moving: true,
    make: (w, h) => {
      const flies = Array.from({ length: 34 }, () => ({
        x: rnd(0.05, 0.95) * w,
        y: rnd(0.45, 0.95) * h,
        a: rnd(20, 60),
        p: rnd(0, TAU),
        q: rnd(0, TAU),
        blink: rnd(0.3, 0.7),
      }));
      return (f) => {
        const { ctx } = f;
        const dot = f.dot();
        for (const fl of flies) {
          const x = fl.x + Math.sin(f.t * 0.3 + fl.p) * fl.a + Math.sin(f.t * 0.83 + fl.q) * fl.a * 0.4;
          const y = fl.y + Math.cos(f.t * 0.27 + fl.q) * fl.a * 0.6;
          const on = Math.max(0, Math.sin(f.t * fl.blink * 2 + fl.p)) ** 3;
          ctx.globalAlpha = f.env * 0.25 * on;
          ctx.drawImage(dot, x - 16, y - 16, 32, 32);
          ctx.globalAlpha = f.env * 0.9 * on;
          ctx.drawImage(dot, x - 3, y - 3, 6, 6);
        }
        ctx.globalAlpha = 1;
      };
    },
  },
];
