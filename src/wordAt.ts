// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

/** The word at a point in rendered text (commentary, a dictionary entry, a book), and where it is, for
 *  the same look-up as a Bible word. Found from the point rather than by wrapping every word in an
 *  element, so long HTML stays as it is. Null for links, numbers, images, or a point between words.
 *  Shared by the desktop (ui.tsx wordAt) and the phone (mobile/src/WordSheet.tsx). */
export function wordAtPoint(x: number, y: number, target: HTMLElement): { word: string; rect: DOMRect } | null {
  if (target.closest("a, button, input, textarea, img, .strongs, [data-num], [role=button]")) return null;
  const r = document.caretRangeFromPoint?.(x, y);
  const node = r?.startContainer;
  if (!r || !node || node.nodeType !== Node.TEXT_NODE) return null;
  const text = node.textContent ?? "";
  const isW = (c: string | undefined) => !!c && /[\p{L}\p{M}'’]/u.test(c);
  let a = r.startOffset,
    b = r.startOffset;
  while (a > 0 && isW(text[a - 1])) a--;
  while (b < text.length && isW(text[b])) b++;
  while (a < b && /['’]/.test(text[a])) a++;
  while (b > a && /['’]/.test(text[b - 1])) b--;
  if (b - a < 2) return null;
  const range = document.createRange();
  range.setStart(node, a);
  range.setEnd(node, b);
  const rect = range.getBoundingClientRect();
  if (x < rect.left - 2 || x > rect.right + 2 || y < rect.top - 2 || y > rect.bottom + 2) return null;
  return { word: text.slice(a, b), rect };
}
