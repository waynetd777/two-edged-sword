// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// How sync with the phone app is going, as words and as a level for a dot: on the desktop, for each device
// paired (sync.rs keeps how each one's last sync went; syncDevices.ts reads them), and on the phone for its
// computer (phoneSync.ts). Only reports: nothing here changes what syncs.

/** Nothing to show; worth a look (syncs failing for a while); or needs the user (pair again, a file
 *  that can't be saved or read). */
export type Level = "ok" | "amber" | "red";

export const DAY = 86_400_000;

/** When, in words: "just now", "5 min ago", "3 h ago", "4 days ago", or the date. */
export function ago(t: number, now = Date.now()): string {
  const m = Math.round((now - t) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 24 * 60) return `${Math.round(m / 60)} h ago`;
  if (m < 7 * 24 * 60) return `${Math.round(m / (24 * 60))} days ago`;
  return new Date(t).toLocaleDateString(undefined, { dateStyle: "medium" });
}

/** How the last sync went, from one side: when one last worked and what it changed each way, and the
 *  last failure since, if any. */
export interface Last {
  ok: number;
  sent: number;
  received: number;
  err: string;
  errAt: number;
}

/** The failure since the last sync that worked, if any. */
export const failing = (l: Last) => !!l.err && l.errAt >= l.ok;

/** The last sync as a line: "Synced 2 min ago · 3 sent, 1 received", or "Failed 5 min ago: …". */
export function lastLine(l: Last, now = Date.now()): string {
  if (failing(l)) return `Failed ${ago(l.errAt, now)}: ${l.err}`;
  if (l.ok) return `Synced ${ago(l.ok, now)} · ${l.sent} sent, ${l.received} received`;
  return "Not synced yet";
}

/** A device paired with this computer, as sync.rs answers sync_devices. */
export interface Device extends Last {
  id: string;
  name: string;
  paired: number;
  seen: number;
  red: boolean;
}

/** A device's level: its last sync failed (red if that needs the user), or none for over a week. */
export function deviceLevel(d: Device, now = Date.now()): Level {
  if (failing(d)) return d.red ? "red" : "amber";
  return now - Math.max(d.ok, d.seen, d.paired) > 7 * DAY ? "amber" : "ok";
}

/** A device's line in Settings: the last sync, or how long since one, if over a week. */
export function deviceLine(d: Device, now = Date.now()): string {
  if (!failing(d) && deviceLevel(d, now) === "amber") {
    const last = Math.max(d.ok, d.seen);
    return last ? `Not synced for ${Math.round((now - last) / DAY)} days` : `Not synced since it was paired ${ago(d.paired, now)}`;
  }
  return lastLine(d, now);
}

export const worst = (ls: Level[]): Level => (ls.includes("red") ? "red" : ls.includes("amber") ? "amber" : "ok");
