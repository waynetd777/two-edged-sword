// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// The menu: ☰ at the left of every screen's top bar opens it from the left. The desktop's logo, then its
// screens in the desktop sidebar's order and with its icons (src/Shell.tsx NAV, src/icons.tsx).

import { useSyncExternalStore } from "react";
import { Icon as DeskIcon, Wordmark } from "../../src/icons";
import type { Tab } from "./history";
import { phoneProblem, syncLine, syncNow, useSync, useSyncLevel } from "./phoneSync";

export const SCREENS: { id: Tab; label: string; icon: string }[] = [
  { id: "read", label: "Read", icon: "read" },
  { id: "search", label: "Search", icon: "search" },
  { id: "words", label: "Word Study", icon: "word" },
  { id: "journal", label: "Journal", icon: "journal" },
  { id: "plans", label: "Quiet time", icon: "plans" },
  { id: "library", label: "Library", icon: "library" },
  { id: "settings", label: "Settings", icon: "settings" },
  { id: "help", label: "Help", icon: "help" },
];

let open = false;
const watchers = new Set<() => void>();
const setOpen = (v: boolean) => {
  open = v;
  watchers.forEach((f) => f());
};
const useOpen = () =>
  useSyncExternalStore(
    (f) => {
      watchers.add(f);
      return () => watchers.delete(f);
    },
    () => open,
  );

/** ☰, with a dot when sync with the computer isn't right. */
export function MenuButton() {
  const level = useSyncLevel();
  return (
    <button className="nav menubtn" aria-label="Menu" aria-haspopup="menu" onClick={() => setOpen(true)}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" aria-hidden="true">
        <path d="M4 6.5h16M4 12h16M4 17.5h16" />
      </svg>
      {level !== "ok" && (
        <span className={`syncdot sync-${level}`} aria-label={level === "red" ? "Sync needs you" : "Sync isn't working"} />
      )}
    </button>
  );
}

export function MenuDrawer({ tab, onPick }: { tab: Tab; onPick: (t: Tab) => void }) {
  const shown = useOpen();
  const sync = useSync();
  const level = useSyncLevel();
  if (!shown) return null;
  const pick = (t: Tab) => {
    setOpen(false);
    onPick(t);
  };
  const toSync = () => {
    pick("settings");
    setTimeout(() => document.getElementById("sync")?.scrollIntoView(), 100);
  };
  return (
    <>
      <div className="scrim menuscrim" onClick={() => setOpen(false)} />
      <nav className="menu" aria-label="Screens">
        <div className="brand">
          <Wordmark />
        </div>
        {SCREENS.map((s) => (
          <button key={s.id} className={`item ${tab === s.id ? "on" : ""}`} aria-current={tab === s.id ? "page" : undefined} onClick={() => pick(s.id)}>
            <DeskIcon name={s.icon} size={20} />
            {s.label}
          </button>
        ))}
        <div className="grow" />
        {/* Sync with the computer: how it went, and Sync now; what's wrong, and what to do, when it isn't right. */}
        <div className="menusync">
          {sync.paired ? (
            <>
              <span className={`dot sync-${level}`} aria-hidden="true" />
              <span className="what">
                <span className="t">{sync.busy ? "Syncing…" : level === "ok" ? `Synced with ${sync.paired.name}` : "Sync isn't right"}</span>
                <span className="s">{level === "ok" ? syncLine(sync) : phoneProblem(sync)}</span>
              </span>
              {sync.needsPairing ? (
                <button className="secondary" onClick={toSync}>
                  Pair again
                </button>
              ) : (
                <button className="secondary" disabled={sync.busy} onClick={() => syncNow().catch(() => {})}>
                  Sync now
                </button>
              )}
            </>
          ) : (
            <>
              <span className="what">
                <span className="s">Not syncing with a computer</span>
              </span>
              <button className="secondary" onClick={toSync}>
                Set up
              </button>
            </>
          )}
        </div>
      </nav>
    </>
  );
}
