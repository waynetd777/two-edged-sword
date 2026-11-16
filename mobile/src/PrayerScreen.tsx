// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Prayer on the phone and tablet: the desktop's board (src/PrayerBoard.tsx) with touch-sized rows, one
// column on a phone, two on a tablet held upright, three sideways. A verse on a point opens in Read.

import { PrayerBoard } from "../../src/PrayerBoard";
import type { Ref } from "../../src/bible";
import { NavButtons } from "./NavButtons";
import { prayerStore, usePrayer } from "./prayerStore";

export function PrayerScreen({ onVerse }: { onVerse: (r: Ref) => void }) {
  const list = usePrayer();
  return (
    <>
      <header className="topbar">
        <NavButtons />
        <h1 className="bartitle">Prayer</h1>
      </header>
      <div className="results wide">
        <PrayerBoard list={list} onChange={prayerStore.set} onOpenVerse={onVerse} touch />
      </div>
    </>
  );
}
