// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Bookmarks and the places read lately, kept on the phone: a verse (in the Bible it was read in) or a
// book's chapter, as the desktop's sidebar has them.

import { useSyncExternalStore } from "react";
import { save, saved } from "./api";

export interface Mark {
  /** A verse (or, from the desktop, verses or a chapter)... */
  ref?: { book: number; chapter: number; verse: number; to?: number };
  bible?: string;
  /** ...or a book's chapter: from the desktop, a paragraph of it (`para`), and the kind of book. */
  doc?: { module: string; chapter: string; title: string; para?: number; kind?: string };
  at: string;
}

let marks: Mark[] = saved<Mark[]>("bookmarks", []);
let recent: Mark[] = saved<Mark[]>("recent", []);
let version = 0;
const watchers = new Set<() => void>();
const changed = () => {
  version++;
  watchers.forEach((w) => w());
};

const same = (a: Mark, b: Mark) =>
  a.doc || b.doc
    ? a.doc?.module === b.doc?.module && a.doc?.chapter === b.doc?.chapter
    : a.ref?.book === b.ref?.book && a.ref?.chapter === b.ref?.chapter && a.ref?.verse === b.ref?.verse;
/** The same chapter: what Recent keeps one of. */
const sameChapter = (a: Mark, b: Mark) =>
  a.doc || b.doc
    ? a.doc?.module === b.doc?.module && a.doc?.chapter === b.doc?.chapter
    : a.ref?.book === b.ref?.book && a.ref?.chapter === b.ref?.chapter;

export const bookmarks = {
  list: () => marks,
  /** Both lists at once, from a sync (phoneSync.ts). */
  replace(m: Mark[], r: Mark[]) {
    marks = m;
    recent = r;
    save("bookmarks", marks);
    save("recent", recent);
    changed();
  },
  subscribe(f: () => void) {
    watchers.add(f);
    return () => {
      watchers.delete(f);
    };
  },
  recent: () => recent,
  has: (m: Omit<Mark, "at">) => marks.some((x) => same(x, { ...m, at: "" })),
  toggle(m: Omit<Mark, "at">) {
    const full = { ...m, at: new Date().toISOString() };
    marks = marks.some((x) => same(x, full)) ? marks.filter((x) => !same(x, full)) : [full, ...marks];
    save("bookmarks", marks);
    changed();
  },
  remove(m: Mark) {
    marks = marks.filter((x) => x !== m);
    save("bookmarks", marks);
    changed();
  },
  /** A place read: first in Recent, once per chapter, the last 30. */
  visited(m: Omit<Mark, "at">) {
    const full = { ...m, at: new Date().toISOString() };
    recent = [full, ...recent.filter((x) => !sameChapter(x, full))].slice(0, 30);
    save("recent", recent);
    changed();
  },
};

export function useBookmarks() {
  useSyncExternalStore(
    (f) => {
      watchers.add(f);
      return () => watchers.delete(f);
    },
    () => version,
  );
  return bookmarks;
}
