// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Bible references found in ordinary text, for links (md.ts) and for saying them aloud (spoken.ts).
// Its own file so the phone app (mobile/) can use it without the desktop app's state.

import { book, findBook, Ref } from "./bible";


// "John 3:16", "1 John 4:9-10", "Joh 3:16", "Num 21:8–9", "Ps 23:1"; as spoken, "1 John 5, verse 4"
// and "Job 19, verses 25 to 27", "Genesis chapter 3:1 - 5"; a whole chapter, "Hebrews 11"; and a
// range into a later chapter, "Mat 5:3-7:29".
const REF_RE =
  /\b((?:[123]\s?)?[A-Z][a-z]{1,15}(?:\s(?:of\s)?(?!Chapter\b)[A-Z][a-z]+)?)\.?\s(?:(?:[Cc]hapter|[Cc]hap\.|[Cc]h\.)\s)?(\d{1,3})(?::(\d{1,3})(?:\s?[-–]\s?(\d{1,3})(?::(\d{1,3}))?)?|,?\s(?:verses?|vv?\.?)\s(\d{1,3})(?:\s?(?:[-–]|to)\s?(\d{1,3}))?)?(?!\d|:\d)/g;

/** `loose` also takes a short name with a chapter alone ("1 Cor 13", "Dan 4"): right for reading
 *  aloud, where saying the book in full does no harm, but too eager for links. */
export function findRefs(text: string, loose = false): { index: number; length: number; ref: Ref }[] {
  const out = [];
  REF_RE.lastIndex = 0;
  for (let m: RegExpExecArray | null; (m = REF_RE.exec(text));) {
    // Not a reference ("In 1 Peter 1:22" first tries "In 1"): look again from the next word, so
    // the text it took can still be one.
    const reject = () => {
      REF_RE.lastIndex = m!.index + (m![0].search(/\s/) + 1 || 1);
    };
    let b = findBook(m[1]),
      skip = 0;
    // "See John 3:16": the capitalised word before the book was taken as part of its name.
    const w = !b && !/^[123]/.test(m[1]) ? m[1].match(/\s(\S+)$/) : null;
    if (w) {
      b = findBook(w[1]);
      skip = m[1].length - w[1].length;
    }
    if (!b) {
      reject();
      continue;
    }
    let chapter = +m[2],
      verse = (m[3] ?? m[6]) ? +(m[3] ?? m[6]) : undefined;
    // "5:3-7:29": the range ends in chapter 7.
    const toChapter = m[5] ? +m[4] : undefined;
    const to = m[5] ? +m[5] : (m[4] ?? m[7]) ? +(m[4] ?? m[7]) : undefined;
    if (verse === undefined) {
      // A chapter on its own only by the book's name or a long form of it ("Job 3", "Psalm 23"),
      // not "Dan 4" or "Song 3"; "Jude 5" is a verse.
      const name = m[1].slice(skip).replace(/^[123]\s?/, "");
      const full = book(b).name.replace(/^[123]\s?/, "");
      if (name !== full && (name === "Song" || (name.length < 4 && !loose))) {
        reject();
        continue;
      }
      if (book(b).chapters === 1 && chapter > 1) {
        verse = chapter;
        chapter = 1;
      }
    }
    if (chapter < 1 || chapter > book(b).chapters || (toChapter !== undefined && (toChapter <= chapter || toChapter > book(b).chapters))) {
      reject();
      continue;
    }
    out.push({ index: m.index! + skip, length: m[0].length - skip, ref: { book: b, chapter, verse, to, toChapter } });
  }
  return out;
}

