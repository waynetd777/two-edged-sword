// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { useEffect } from "react";
import { api } from "./api";
import { isMac } from "./keys";

const IDLE_MS = 3000;

/** While `on`, the mouse pointer goes after a few seconds still. macOS hides it until the mouse
 *  really moves (hide_pointer), so the page scrolling under it, as the reader follows the
 *  paragraph being read, doesn't bring it back. Windows has no such call: the page hides it
 *  itself (html.nopointer), until the mouse moves. */
export function useIdlePointer(on: boolean) {
  useEffect(() => {
    if (!on) return;
    const root = document.documentElement;
    const hide = () => (isMac ? void api.hidePointer().catch(() => {}) : root.classList.add("nopointer"));
    let t = window.setTimeout(hide, IDLE_MS);
    // WebKit also sends a mouse move when the page scrolls under a still mouse, so a move counts
    // only if the pointer went somewhere.
    let at = "";
    const moved = (e: MouseEvent) => {
      const here = `${e.screenX},${e.screenY}`;
      if (e.type === "mousemove" && here === at) return;
      at = here;
      root.classList.remove("nopointer");
      window.clearTimeout(t);
      t = window.setTimeout(hide, IDLE_MS);
    };
    window.addEventListener("mousemove", moved);
    window.addEventListener("mousedown", moved);
    return () => {
      root.classList.remove("nopointer");
      window.clearTimeout(t);
      window.removeEventListener("mousemove", moved);
      window.removeEventListener("mousedown", moved);
    };
  }, [on]);
}
