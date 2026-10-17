// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

/** The app's shortcuts are ⌘ on macOS and Ctrl on Windows. */
export const isMac = navigator.userAgent.includes("Mac");

/** Whether the shortcut key (⌘ or Ctrl) is held. */
export const cmdKey = (e: { metaKey: boolean; ctrlKey: boolean }) => (isMac ? e.metaKey : e.ctrlKey);
