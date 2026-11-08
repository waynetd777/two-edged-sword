// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Back and forward over everything, as on the desktop (state.tsx's navigate): changing tab, every move
// in Read, and Compare on or off are each a step. A step back puts the tab, the passage, the verse,
// Compare and how far down the page was back as they were.

import { useSyncExternalStore } from "react";

export type Tab = "read" | "plans" | "search" | "words" | "library" | "more";

export interface Place {
  tab: Tab;
  book: number;
  chapter: number;
  verse: number;
  comparing: boolean;
  /** Word Study's number or word. */
  word: string;
  /** A book open in Read instead of the Bible: "module|chapter", or "". */
  doc: string;
  /** How far down the reading page was. */
  top: number;
}

let stack: Place[] = [];
let at = -1;
let version = 0;
const watchers = new Set<() => void>();
const restorers = new Set<(p: Place) => void>();
/** Read's live state, to keep in the current step before leaving it. */
let snapshot: () => Partial<Place> = () => ({});

const changed = () => {
  version++;
  watchers.forEach((f) => f());
};
const same = (a: Place, b: Place) =>
  a.tab === b.tab &&
  a.book === b.book &&
  a.chapter === b.chapter &&
  a.verse === b.verse &&
  a.comparing === b.comparing &&
  a.word === b.word &&
  a.doc === b.doc;
const keepCurrent = () => {
  if (at >= 0) stack[at] = { ...stack[at], ...snapshot() };
};

export const history = {
  /** Where the app opened: the first step. */
  start(p: Place) {
    if (at < 0) {
      stack = [p];
      at = 0;
      changed();
    }
  },
  setSnapshot(f: () => Partial<Place>) {
    snapshot = f;
  },
  /** A new step: the current place with `patch` applied. */
  push(patch: Partial<Place>) {
    if (at < 0) return;
    keepCurrent();
    const next: Place = { ...stack[at], top: 0, ...patch };
    if (same(next, stack[at])) return;
    stack = stack.slice(0, at + 1);
    stack.push(next);
    if (stack.length > 200) stack.shift();
    at = stack.length - 1;
    changed();
  },
  go(d: 1 | -1) {
    const j = at + d;
    if (j < 0 || j >= stack.length) return;
    keepCurrent();
    at = j;
    restorers.forEach((f) => f(stack[at]));
    changed();
  },
  canBack: () => at > 0,
  canForward: () => at >= 0 && at < stack.length - 1,
  /** Called with the place a step back or forward lands on. */
  onRestore(f: (p: Place) => void) {
    restorers.add(f);
    return () => {
      restorers.delete(f);
    };
  },
};

/** Redraws on every step, for the back and forward buttons. */
export function useHistory() {
  useSyncExternalStore(
    (f) => {
      watchers.add(f);
      return () => watchers.delete(f);
    },
    () => version,
  );
  return history;
}
