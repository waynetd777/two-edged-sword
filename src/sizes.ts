// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// A Bible's books, chapters and verses, from its own text: asked once per Bible, again after a
// failure, and again for every Bible after the library is rescanned.

import { api } from "./api";
import type { BookSizes } from "./bible";

const chapters = new Map<string, Promise<[number, number, number][]>>();
const books = new Map<string, Promise<BookSizes>>();

/** Keeps a promise until it fails, so a failure is asked again next time. */
function kept<T>(m: Map<string, Promise<T>>, key: string, make: () => Promise<T>): Promise<T> {
  let p = m.get(key);
  if (!p) {
    const made = make();
    m.set(key, made);
    made.catch(() => {
      if (m.get(key) === made) m.delete(key);
    });
    p = made;
  }
  return p;
}

/** Each chapter of a Bible as [book, chapter, verses]. */
export const chapterSizes = (bible: string) => kept(chapters, bible, () => api.chapterSizes(bible));

/** The books a Bible has and how many chapters each (Esther has 16 in the Vulgate); empty when
 *  they can't be read. */
export function bibleSizes(bible: string): Promise<BookSizes> {
  return kept(books, bible, () =>
    chapterSizes(bible).then((s) => {
      const m: BookSizes = new Map();
      for (const [b, c] of s) m.set(b, Math.max(m.get(b) ?? 0, c));
      return m;
    }),
  ).catch(() => new Map());
}

/** Forgets every Bible's sizes (after a rescan, which may find another copy of one). */
export function forgetSizes() {
  chapters.clear();
  books.clear();
}
