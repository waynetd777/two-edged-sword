// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Paragraphs of reference books and devotionals as things to link, highlight and bookmark, like
// verses. A journal entry links one by a readable label in its verses list, so the Markdown file
// stays readable: "Dispensational Truth (Clarence Larkin) › The Jews ¶4", or "¶4–6", or without a
// ¶ for the whole chapter.

import { ModuleInfo } from "./api";

export interface DocLink {
  book: string;
  chapter: string;
  from?: number;
  to?: number;
}

export function docLabel(bookTitle: string, chapter: string, from?: number, to?: number): string {
  if (!from) return `${bookTitle} › ${chapter}`;
  return `${bookTitle} › ${chapter} ¶${from}${to && to !== from ? `–${to}` : ""}`;
}

export function parseDocLabel(s: string): DocLink | null {
  const m = s.match(/^(.+?) › (.+?)(?: ¶(\d+)(?:–(\d+))?)?$/);
  if (!m) return null;
  return { book: m[1], chapter: m[2], from: m[3] ? +m[3] : undefined, to: m[4] ? +m[4] : m[3] ? +m[3] : undefined };
}

/** The reference book or devotional a label names, by its title. */
export const docModule = (l: DocLink, modules: ModuleInfo[]) =>
  modules.find((m) => (m.kind === "reference" || m.kind === "devotional") && m.title === l.book);

/** Key in the highlights store for a paragraph (verses use "book.chapter.verse"). */
export const docHlKey = (module: string, title: string, para: number) => `doc|${module}|${title}|${para}`;
