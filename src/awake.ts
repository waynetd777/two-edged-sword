// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Keeping the screen from sleeping (and the screensaver and lock from coming on): while reading
// aloud, in Quiet time, and while a reading screen is in front. Each asks for it under its own
// name; the screen is kept awake while any of them wants it.

import { useEffect } from "react";
import { api, isReadOnly } from "./api";

const wanting = new Set<string>();
let awake = false;

function want(why: string, on: boolean) {
  if (on) wanting.add(why);
  else wanting.delete(why);
  // Not in screenshot mode, which leaves the Mac as it is.
  const next = wanting.size > 0 && !isReadOnly();
  if (next === awake) return;
  awake = next;
  api.keepAwake(next).catch(() => {});
}

/** Keeps the screen awake while `on`, for the reason `why`. */
export function useKeepAwake(why: string, on: boolean) {
  useEffect(() => {
    want(why, on);
    return () => want(why, false);
  }, [why, on]);
}
