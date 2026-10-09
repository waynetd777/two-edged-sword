// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Details of Renaissance paintings, public domain: Michelangelo, Bellini, Leonardo, Grünewald,
// Raphael and the van Eycks.

import { bitmap, glow, smooth, Vision } from "./kit";
import { CREATION_BITMAP } from "./creation-bitmap";
import { GETHSEMANE_BITMAP } from "./gethsemane-bitmap";
import { LAST_SUPPER_BITMAP } from "./last-supper-bitmap";
import { RESURRECTION_BITMAP } from "./resurrection-bitmap";
import { TRANSFIGURATION_BITMAP } from "./transfiguration-bitmap";
import { MYSTIC_LAMB_BITMAP } from "./mystic-lamb-bitmap";

export const PAINTINGS: Vision[] = [
  {
    name: "creation of adam",
    lane: "pass",
    dur: [14, 22],
    themes: [
      "creator",
      "create",
      "created",
      "made",
      "breath",
      "breath of life",
      "dust",
      "touch",
      "in his image",
      "maker",
      "life",
      "formed",
      "reach",
      "your hand",
      "the hand of god",
    ],
    make: (w, h, room) => {
      const W0 = Math.min(w, h) * 0.75;
      const { x, scale } = room.place(W0);
      const W = W0 * scale,
        y = h * 0.5;
      // The hand of God reaching to Adam's: Michelangelo's Creation of Adam, the hands
      // (pictures/creation-bitmap.ts), in the artwork's colour.
      const pic = bitmap(CREATION_BITMAP, 0.1, "photo");
      return (f) => {
        const come = smooth(f.k * 2.2);
        glow(f.ctx, x, y, W * 0.5, f.ink(0.08 * f.env * come * (0.92 + 0.08 * f.beat)), f.ink(0));
        pic.draw(f, x, y + (1 - come) * 12, W, f.env * come, 1 + 0.003 * Math.sin(f.t * 0.9));
      };
    },
  },
  {
    name: "gethsemane",
    lane: "pass",
    dur: [14, 22],
    themes: [
      "gethsemane",
      "garden",
      "not my will",
      "thy will",
      "your will",
      "pray",
      "prayer",
      "cup",
      "agony",
      "sorrow",
      "watch",
      "surrender",
      "the night",
      "alone",
      "obey",
    ],
    make: (w, h, room) => {
      const W0 = Math.min(w, h) * 0.65;
      const { x, scale } = room.place(W0);
      const W = W0 * scale,
        y = h * 0.5;
      // Not my will but yours: Christ praying in the garden, an angel bringing the cup, from
      // Bellini's Agony in the Garden (pictures/gethsemane-bitmap.ts), in the artwork's colour.
      const pic = bitmap(GETHSEMANE_BITMAP, 0.1, "photo");
      return (f) => {
        const come = smooth(f.k * 2.2);
        glow(f.ctx, x, y, W * 0.5, f.ink(0.08 * f.env * come * (0.92 + 0.08 * f.beat)), f.ink(0));
        pic.draw(f, x, y + (1 - come) * 12, W, f.env * come, 1 + 0.003 * Math.sin(f.t * 0.9));
      };
    },
  },
  {
    name: "last supper",
    lane: "pass",
    dur: [14, 22],
    themes: [
      "supper",
      "last supper",
      "table",
      "remember",
      "remembrance",
      "bread",
      "broken",
      "body",
      "do this",
      "the night he was betrayed",
      "communion",
      "disciples",
      "feast",
      "new covenant",
      "friends",
    ],
    make: (w, h, room) => {
      const W0 = Math.min(w, h) * 0.85;
      const { x, scale } = room.place(W0);
      const W = W0 * scale,
        y = h * 0.5;
      // Do this in remembrance of me: Christ among the twelve at the centre of Leonardo's Last
      // Supper (pictures/last-supper-bitmap.ts), in the artwork's colour.
      const pic = bitmap(LAST_SUPPER_BITMAP, 0.1, "photo");
      return (f) => {
        const come = smooth(f.k * 2.2);
        glow(f.ctx, x, y, W * 0.5, f.ink(0.08 * f.env * come * (0.92 + 0.08 * f.beat)), f.ink(0));
        pic.draw(f, x, y + (1 - come) * 12, W, f.env * come, 1 + 0.003 * Math.sin(f.t * 0.9));
      };
    },
  },
  {
    name: "resurrection",
    lane: "pass",
    dur: [14, 22],
    themes: [
      "risen",
      "he is risen",
      "resurrection",
      "rose",
      "rise",
      "alive",
      "the grave",
      "death",
      "victory",
      "tomb",
      "conquered",
      "glorious",
      "raised",
      "resurrected",
      "living",
    ],
    make: (w, h, room) => {
      const W0 = Math.min(w, h) * 0.65;
      const { x, scale } = room.place(W0);
      const W = W0 * scale,
        y = h * 0.5;
      // He is risen: Christ rising in a great round of light, from Grünewald's Resurrection
      // (pictures/resurrection-bitmap.ts), in the artwork's colour.
      const pic = bitmap(RESURRECTION_BITMAP, 0.1, "photo");
      return (f) => {
        const come = smooth(f.k * 2.2);
        glow(f.ctx, x, y, W * 0.5, f.ink(0.08 * f.env * come * (0.92 + 0.08 * f.beat)), f.ink(0));
        pic.draw(f, x, y + (1 - come) * 12, W, f.env * come, 1 + 0.003 * Math.sin(f.t * 0.9));
      };
    },
  },
  {
    name: "transfiguration",
    lane: "pass",
    dur: [14, 22],
    themes: [
      "transfigured",
      "transfiguration",
      "glory",
      "shining",
      "radiant",
      "mountain",
      "face shone",
      "bright",
      "light",
      "behold",
      "beloved son",
      "listen to him",
      "majesty",
      "clothes white",
      "glorious",
    ],
    make: (w, h, room) => {
      const W0 = Math.min(w, h) * 0.75;
      const { x, scale } = room.place(W0);
      const W = W0 * scale,
        y = h * 0.5;
      // Christ transfigured on the mountain between Moses and Elijah, from Raphael's Transfiguration
      // (pictures/transfiguration-bitmap.ts), in the artwork's colour.
      const pic = bitmap(TRANSFIGURATION_BITMAP, 0.1, "photo");
      return (f) => {
        const come = smooth(f.k * 2.2);
        glow(f.ctx, x, y, W * 0.5, f.ink(0.08 * f.env * come * (0.92 + 0.08 * f.beat)), f.ink(0));
        pic.draw(f, x, y + (1 - come) * 12, W, f.env * come, 1 + 0.003 * Math.sin(f.t * 0.9));
      };
    },
  },
  {
    name: "mystic lamb",
    lane: "pass",
    dur: [14, 22],
    themes: [
      "lamb",
      "worthy",
      "worthy is the lamb",
      "slain",
      "angels",
      "adore",
      "adoration",
      "worship",
      "altar",
      "blood",
      "holy",
      "around the throne",
      "sacrifice",
      "redeemed",
      "every knee",
    ],
    make: (w, h, room) => {
      const W0 = Math.min(w, h) * 0.75;
      const { x, scale } = room.place(W0);
      const W = W0 * scale,
        y = h * 0.5;
      // Worthy is the Lamb: the Lamb on the altar, angels kneeling about it, from the van Eycks'
      // Ghent Altarpiece (pictures/mystic-lamb-bitmap.ts), in the artwork's colour.
      const pic = bitmap(MYSTIC_LAMB_BITMAP, 0.1, "photo");
      return (f) => {
        const come = smooth(f.k * 2.2);
        glow(f.ctx, x, y, W * 0.5, f.ink(0.08 * f.env * come * (0.92 + 0.08 * f.beat)), f.ink(0));
        pic.draw(f, x, y + (1 - come) * 12, W, f.env * come, 1 + 0.003 * Math.sin(f.t * 0.9));
      };
    },
  },
];
