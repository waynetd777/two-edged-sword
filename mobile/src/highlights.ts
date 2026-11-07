// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Verse highlights, kept on the phone with the desktop's keys and colours ("43.3.16" → "yellow"; a book's
// paragraph is "doc|module|chapter|n"), so they sync as they are (phoneSync.ts).

import { useSyncExternalStore } from "react";
import { save, saved } from "./api";

export type HlColor = "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "purple" | "grey";
export const HL_COLORS: HlColor[] = ["yellow", "green", "teal", "blue", "purple", "red", "orange", "grey"];
/** Each colour as a dot in the picker (the desktop's HL_DOT). */
export const HL_DOT: Record<HlColor, string> = {
  red: "#e59a92",
  orange: "#efb97e",
  yellow: "#e9d271",
  green: "#a9cf9f",
  teal: "#8fcfc6",
  blue: "#9fc0e6",
  purple: "#c1a9e3",
  grey: "#aab3bf",
};

let all: Record<string, HlColor> = saved<Record<string, HlColor>>("highlights", {});
const watchers = new Set<() => void>();

export const vkey = (b: number, c: number, v: number) => `${b}.${c}.${v}`;

export const highlights = {
  get: () => all,
  set(key: string, c: HlColor | null) {
    const n = { ...all };
    if (c) n[key] = c;
    else delete n[key];
    highlights.replace(n);
  },
  replace(n: Record<string, HlColor>) {
    all = n;
    save("highlights", all);
    watchers.forEach((w) => w());
  },
  subscribe(f: () => void) {
    watchers.add(f);
    return () => {
      watchers.delete(f);
    };
  },
};

export function useHighlights() {
  return useSyncExternalStore(highlights.subscribe, highlights.get);
}
