// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// The devices paired with this computer and how their syncs went (sync.rs), for the dot on the sidebar's
// Settings (Shell.tsx) and Settings › Phones and tablets; the words and levels are syncStatus.ts's.

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Device } from "./syncStatus";

let sceneDevices: Device[] | null = null;
const sceneWatchers = new Set<() => void>();
/** Screenshot mode: these devices instead of the user's (none unless the scene gives some). Times below
 *  zero are that long before now. */
export function setSceneDevices(ds: Device[]) {
  const now = Date.now();
  const at = (t: number) => (t < 0 ? now + t : t);
  sceneDevices = ds.map((d) => ({ ...d, ok: at(d.ok), errAt: at(d.errAt), paired: at(d.paired), seen: at(d.seen) }));
  sceneWatchers.forEach((w) => w());
}

/** The devices paired with this computer, read again when one syncs, and a clock for their "ago"s. */
export function useSyncDevices(): { devices: Device[]; now: number } {
  const [devices, setDevices] = useState<Device[]>([]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const load = () =>
      sceneDevices
        ? setDevices(sceneDevices)
        : invoke<Device[]>("sync_devices")
            // A scene's devices, set while this was being read, stay.
            .then((ds) => setDevices(sceneDevices ?? ds))
            .catch(() => {});
    load();
    const un = listen("sync-devices", load);
    sceneWatchers.add(load);
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      un.then((u) => u());
      sceneWatchers.delete(load);
      window.clearInterval(t);
    };
  }, []);
  return { devices, now };
}

/** Settings asked to open at Phones and tablets (from the dot). */
let toPhones = false;
export const openAtPhones = () => {
  toPhones = true;
  // Settings already open: it scrolls there now.
  window.dispatchEvent(new Event("tes-open-phones"));
};
export const takeOpenAtPhones = () => {
  const w = toPhones;
  toPhones = false;
  return w;
};
