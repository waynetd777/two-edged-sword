// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// The tabernacle and the temple: the ark, the table, the altars, the laver, the high priest's
// breastplate and the menorah, from public-domain engravings and the Arch of Titus.

import { photo, Vision } from "./kit";
import { ARK_BITMAP } from "./ark-bitmap";
import { SHEWBREAD_BITMAP } from "./shewbread-bitmap";
import { INCENSE_ALTAR_BITMAP } from "./incense-altar-bitmap";
import { BRAZEN_ALTAR_BITMAP } from "./brazen-altar-bitmap";
import { LAVER_BITMAP } from "./laver-bitmap";
import { PRIESTLY_BREASTPLATE_BITMAP } from "./priestly-breastplate-bitmap";
import { TITUS_MENORAH_BITMAP } from "./titus-menorah-bitmap";

export const TEMPLE: Vision[] = [
  {
    name: "ark of the covenant",
    lane: "pass",
    dur: [13, 20],
    themes: [
      "ark",
      "ark of the covenant",
      "covenant",
      "mercy seat",
      "presence",
      "glory",
      "cherubim",
      "between the cherubim",
      "holy of holies",
      "dwell",
      "most holy",
      "glory of the lord",
      "your presence",
      "manifest",
      "shekinah",
    ],
    // The ark of the covenant, the cherubim over the mercy seat (pictures/ark-bitmap.ts), an
    // engraving, in the artwork's colour.
    make: photo(ARK_BITMAP, 0.6),
  },
  {
    name: "table of shewbread",
    lane: "pass",
    dur: [13, 20],
    themes: [
      "bread",
      "bread of life",
      "shewbread",
      "showbread",
      "table",
      "presence",
      "bread of the presence",
      "feed",
      "hunger",
      "nourish",
      "daily bread",
      "break bread",
      "fellowship",
      "provision",
      "priests",
    ],
    // The table of shewbread, its loaves in two piles (pictures/shewbread-bitmap.ts), an
    // engraving, in the artwork's colour.
    make: photo(SHEWBREAD_BITMAP, 0.6),
  },
  {
    name: "altar of incense",
    lane: "pass",
    dur: [13, 20],
    themes: [
      "incense",
      "altar",
      "altar of incense",
      "prayer",
      "prayers",
      "golden altar",
      "sweet aroma",
      "fragrance",
      "before the throne",
      "intercede",
      "holy place",
      "smoke",
      "offering",
      "burn",
    ],
    // The golden altar of incense, its smoke rising (pictures/incense-altar-bitmap.ts), an
    // engraving, in the artwork's colour.
    make: photo(INCENSE_ALTAR_BITMAP, 0.5),
  },
  {
    name: "altar of burnt offering",
    lane: "pass",
    dur: [13, 20],
    themes: [
      "altar",
      "sacrifice",
      "offering",
      "burnt offering",
      "living sacrifice",
      "lay it down",
      "on the altar",
      "laid down",
      "fire",
      "consume",
      "consuming fire",
      "surrender",
      "all on the altar",
      "atonement",
      "lamb",
    ],
    // The altar of burnt offering, the sacrifice on its grate (pictures/brazen-altar-bitmap.ts), an
    // engraving, in the artwork's colour.
    make: photo(BRAZEN_ALTAR_BITMAP, 0.55),
  },
  {
    name: "laver",
    lane: "pass",
    dur: [13, 20],
    themes: [
      "wash",
      "washed",
      "laver",
      "cleanse",
      "clean",
      "pure",
      "purify",
      "water",
      "basin",
      "wash me",
      "whiter than snow",
      "sanctify",
      "holy",
      "consecrate",
      "washing",
    ],
    // The bronze laver the priests washed in (pictures/laver-bitmap.ts), an engraving, in the
    // artwork's colour.
    make: photo(LAVER_BITMAP, 0.45),
  },
  {
    name: "high priest's breastplate",
    lane: "pass",
    dur: [13, 20],
    themes: [
      "high priest",
      "priest",
      "breastplate",
      "twelve",
      "tribes",
      "stones",
      "precious stones",
      "jewels",
      "names",
      "on his heart",
      "intercession",
      "great high priest",
      "ephod",
      "royal priesthood",
      "priesthood",
    ],
    // The high priest's breastplate, its twelve stones for the tribes, over the ephod
    // (pictures/priestly-breastplate-bitmap.ts), an engraving, in the artwork's colour.
    make: photo(PRIESTLY_BREASTPLATE_BITMAP, 0.42),
  },
  {
    name: "menorah of titus",
    lane: "pass",
    dur: [13, 20],
    themes: [
      "menorah",
      "lampstand",
      "temple",
      "jerusalem",
      "exile",
      "carried away",
      "captive",
      "return",
      "restore",
      "zion",
      "israel",
      "seven lamps",
      "light",
      "golden lampstand",
      "rebuild",
    ],
    // The temple's menorah carried off from Jerusalem, as carved on the Arch of Titus
    // (pictures/titus-menorah-bitmap.ts), in the artwork's colour.
    make: photo(TITUS_MENORAH_BITMAP, 0.5),
  },
];
