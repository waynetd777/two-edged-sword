// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// All fifty pictures, by subject.

import { CREATURES } from "./creatures";
import { LAND } from "./land";
import { PLACES } from "./places";
import { SIGNS } from "./signs";
import { SKY } from "./sky";
import type { Vision } from "./kit";

export const VISIONS: Vision[] = [...SKY, ...LAND, ...PLACES, ...SIGNS, ...CREATURES];
