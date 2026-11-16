// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// The prayer list, kept on the phone (src/prayer.ts has its shape and the changes made to it). Synced with
// the computer item by item (phoneSync.ts), once the computer has said it syncs it.

import { useSyncExternalStore } from "react";
import { EMPTY_PRAYER, PrayerList, readPrayer } from "../../src/prayer";
import { save, saved } from "./api";

let list: PrayerList = readPrayer(saved<unknown>("prayer", EMPTY_PRAYER));
const watchers = new Set<() => void>();

export const prayerStore = {
  get: () => list,
  set(f: (l: PrayerList) => PrayerList) {
    list = f(list);
    save("prayer", list);
    watchers.forEach((w) => w());
  },
  subscribe(f: () => void) {
    watchers.add(f);
    return () => {
      watchers.delete(f);
    };
  },
};

export const usePrayer = () => useSyncExternalStore(prayerStore.subscribe, () => list);
