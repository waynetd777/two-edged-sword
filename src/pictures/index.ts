// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// All hundred pictures, by subject.

import { CREATURES } from "./creatures";
import { DELIVERANCE } from "./deliverance";
import { LAND } from "./land";
import { PLACES } from "./places";
import { RENEWAL } from "./renewal";
import { SIGNS } from "./signs";
import { SKY } from "./sky";
import { SPIRIT } from "./spirit";
import { THRONE } from "./throne";
import { WORSHIP } from "./worship";
import type { Vision } from "./kit";

export const VISIONS: Vision[] = [
  ...SKY,
  ...LAND,
  ...PLACES,
  ...SIGNS,
  ...CREATURES,
  ...SPIRIT,
  ...WORSHIP,
  ...THRONE,
  ...DELIVERANCE,
  ...RENEWAL,
];
