// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// The Prayer screen: the prayer list's board (PrayerBoard.tsx) under the top bar. A verse on a point opens
// in Read.

import { PrayerBoard } from "./PrayerBoard";
import { SearchField, Topbar } from "./Shell";
import { useApp } from "./state";

export function PrayerScreen({ openPalette }: { openPalette: () => void }) {
  const app = useApp();
  return (
    <div className="main">
      <Topbar>
        <SearchField onOpen={openPalette} />
      </Topbar>
      <div className="scroll" style={{ flexGrow: 1, padding: "20px 28px 100px" }}>
        <h1 style={{ margin: "0 0 18px", font: "500 30px/1 var(--display)" }}>Prayer</h1>
        <PrayerBoard
          list={app.prayer}
          onChange={app.setPrayer}
          onOpenVerse={(r) => app.open({ book: r.book, chapter: r.chapter, verse: r.verse, to: r.to }, "read")}
        />
      </div>
    </div>
  );
}
