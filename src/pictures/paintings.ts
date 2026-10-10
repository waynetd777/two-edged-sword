// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Details of Renaissance paintings, public domain: Michelangelo, Bellini, Leonardo, Grünewald,
// Raphael and the van Eycks.

import { photo, Vision } from "./kit";
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
    // The hand of God reaching to Adam's: Michelangelo's Creation of Adam, the hands
    // (pictures/creation-bitmap.ts), in the artwork's colour.
    make: photo(CREATION_BITMAP, 0.75, true),
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
    // Not my will but yours: Christ praying in the garden, an angel bringing the cup, from
    // Bellini's Agony in the Garden (pictures/gethsemane-bitmap.ts), in the artwork's colour.
    make: photo(GETHSEMANE_BITMAP, 0.65, true),
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
    // Do this in remembrance of me: Christ among the twelve at the centre of Leonardo's Last
    // Supper (pictures/last-supper-bitmap.ts), in the artwork's colour.
    make: photo(LAST_SUPPER_BITMAP, 0.85, true),
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
    // He is risen: Christ rising in a great round of light, from Grünewald's Resurrection
    // (pictures/resurrection-bitmap.ts), in the artwork's colour.
    make: photo(RESURRECTION_BITMAP, 0.65, true),
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
    // Christ transfigured on the mountain between Moses and Elijah, from Raphael's Transfiguration
    // (pictures/transfiguration-bitmap.ts), in the artwork's colour.
    make: photo(TRANSFIGURATION_BITMAP, 0.75, true),
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
    // Worthy is the Lamb: the Lamb on the altar, angels kneeling about it, from the van Eycks'
    // Ghent Altarpiece (pictures/mystic-lamb-bitmap.ts), in the artwork's colour.
    make: photo(MYSTIC_LAMB_BITMAP, 0.75, true),
  },
];
