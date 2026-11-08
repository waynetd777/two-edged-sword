// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// What md.ts (the journal's Markdown) takes from the desktop's state.tsx: the highlight colours. The
// rest of state.tsx is the desktop app itself, so it isn't brought in (vite.config.ts SHIMS).

export type HlColor = "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "purple" | "grey";
export const HL_COLOURS: HlColor[] = ["red", "orange", "yellow", "green", "teal", "blue", "purple", "grey"];
