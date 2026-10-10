// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// What the pages shown in the reading column instead of a chapter (an online devotional, a song's
// words) share: their top bar, back to the Bible or in focus mode, and Esc leaving focus mode.

import { ReactNode, useEffect, useRef } from "react";
import { fmtRef } from "./bible";
import { Icon } from "./icons";
import { Topbar } from "./Shell";
import { useApp } from "./state";

/** Esc leaves focus mode, after anything open has had it (and prevented it). `first` gets it
 *  before that, and returns true when it has used it (a pick being cancelled, say). */
export function useEscExitsFocus(focus: boolean, setFocus: (f: boolean) => void, first?: () => boolean) {
  const before = useRef(first);
  before.current = first;
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (before.current?.()) return;
      if (focus) setFocus(false);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [focus, setFocus]);
}

/** The page's top bar: the app's, with the way back to the chapter, or in focus mode a bare one
 *  with Exit focus. `tools` go on the right of either. */
export function ReadingColumnTopbar({ focus, setFocus, tools }: { focus: boolean; setFocus: (f: boolean) => void; tools: ReactNode }) {
  const app = useApp();
  if (focus)
    return (
      <header className="topbar drag" style={{ borderBottom: 0, paddingLeft: 84 }}>
        <div className="spacer" />
        {tools}
        <button className="btn" type="button" onClick={() => setFocus(false)}>
          Exit focus<span className="kbd">esc</span>
        </button>
      </header>
    );
  return (
    <Topbar right={tools}>
      <button className="btn" type="button" title="Back to the Bible" onClick={app.closeDoc}>
        <Icon name="read" />
        {fmtRef(app.loc)}
      </button>
    </Topbar>
  );
}
