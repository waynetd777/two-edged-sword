// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

/** The app's shortcuts are ⌘ on macOS and Ctrl on Windows. */
export const isMac = navigator.userAgent.includes("Mac");

/** Whether the shortcut key (⌘ or Ctrl) is held. */
export const cmdKey = (e: { metaKey: boolean; ctrlKey: boolean }) => (isMac ? e.metaKey : e.ctrlKey);

const MODS: Record<string, string> = { "⌃": "Ctrl", "⌘": "Ctrl", "⌥": "Alt", "⇧": "Shift" };
const ORDER = ["Ctrl", "Alt", "Shift"];
const NAMES: Record<string, string> = { "+": "Plus", "−": "Minus" };

/** Shortcuts as they're written on macOS ("⇧⌘G", "⌥↩", "⇧-click", "⌘+"), in Windows' words there
 *  ("Ctrl+Shift+G", "Alt+Enter", "Shift-click", "Ctrl+Plus"); unchanged on macOS. */
export function shortcut(s: string): string {
  if (isMac) return s;
  return s
    .replace(/([⌃⌥⇧⌘]+)([^\s)·⌃⌥⇧⌘-])?/g, (_, mods: string, key?: string) => {
      const names = ORDER.filter((n) => [...mods].some((m) => MODS[m] === n));
      return [...names, ...(key ? [NAMES[key] ?? key.toUpperCase()] : [])].join("+");
    })
    .replace(/[↩⏎]/g, "Enter");
}
