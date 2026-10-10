// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { useEffect, useState } from "react";
import { today, ymd } from "./plans";

/** The reading day it is now (plans.ts `today`, which starts at 4am), as yyyy-mm-dd, looked at every
 *  minute: a screen left open moves on to the next day's reading without anything else changing. */
export function useReadingDay(): string {
  const [day, setDay] = useState(() => ymd(today()));
  useEffect(() => {
    const t = window.setInterval(() => setDay(ymd(today())), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return day;
}
