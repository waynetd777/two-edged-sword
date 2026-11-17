// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Online devotionals on the phone, as the desktop keeps them in its settings: the websites the user added
// (synced with the computer, phoneSync.ts), and, for this phone only, which pages are inverted in the dark
// theme and each site's text size.

import { useSyncExternalStore } from "react";
import { onlineDevotionals, WebDevotional } from "./plansShared";
import { save, saved } from "./api";

interface Web {
  sites: WebDevotional[];
  /** Whether a site's page is inverted to look dark, in the dark theme (on unless turned off). */
  invert: Record<string, boolean>;
  /** A site's text size, 1 as it comes. */
  zoom: Record<string, number>;
}

let web: Web = {
  sites: saved<WebDevotional[]>("webDevotionals", []),
  invert: saved<Record<string, boolean>>("webInvert", {}),
  zoom: saved<Record<string, number>>("webZoom", {}),
};
const watchers = new Set<() => void>();
const put = (next: Web) => {
  web = next;
  save("webDevotionals", web.sites);
  save("webInvert", web.invert);
  save("webZoom", web.zoom);
  watchers.forEach((w) => w());
};

export const webStore = {
  get: () => web,
  setSites: (f: (s: WebDevotional[]) => WebDevotional[]) => put({ ...web, sites: f(web.sites) }),
  setInvert: (id: string, on: boolean) => put({ ...web, invert: { ...web.invert, [id]: on } }),
  setZoom: (id: string, z: number) => put({ ...web, zoom: { ...web.zoom, [id]: z } }),
  subscribe(f: () => void) {
    watchers.add(f);
    return () => {
      watchers.delete(f);
    };
  },
};

export const useWeb = () => useSyncExternalStore(webStore.subscribe, () => web);
/** The online devotionals there are: the app's own, then the user's. */
export const useOnline = () => onlineDevotionals(useWeb().sites);
export const inverts = (w: Web, id: string) => w.invert[id] ?? true;
