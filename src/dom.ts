// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Small helpers for the page itself: escaping text into HTML, the theme showing, and the CSS
// highlights (::highlight) that find, spelling and the readers paint with.

/** Text made safe to put in HTML, in an element or an attribute. */
export const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Whether the app is showing dark: the theme chosen in Settings, or macOS's on Automatic. */
export const isDark = () => {
  const t = document.documentElement.getAttribute("data-theme");
  return t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
};

/** The elements an editor's text is a paragraph of: a line, list item, heading or quote. */
export const BLOCKS = "p, li, h1, h2, h3, h4, blockquote, div";

type Highlights = { set: (k: string, v: unknown) => void; delete: (k: string) => void };
const highlights = () => (CSS as unknown as { highlights?: Highlights }).highlights;
const HighlightOf = () => (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;

/** Paints the ranges as the highlight `name` (styled by ::highlight(name)); none takes it away. */
export function paintHighlight(name: string, ranges: Range[]) {
  const hs = highlights(),
    H = HighlightOf();
  if (!hs || !H) return;
  if (ranges.length) hs.set(name, new H(...ranges));
  else hs.delete(name);
}

/**
 * A stretch of text that runs over several text nodes, as a Range: `starts` is where each node's
 * text begins in the joined-up text, and the stretch is `len` characters from `a`. The end is found
 * from its last character, so it isn't placed at the start of the next node.
 */
export function textRange(nodes: Text[], starts: number[], a: number, len: number): Range | null {
  if (len <= 0 || !nodes.length) return null;
  const at = (i: number): [Text, number] => {
    let k = starts.length - 1;
    while (k > 0 && starts[k] > i) k--;
    return [nodes[k], Math.min(i - starts[k], nodes[k].data.length)];
  };
  const r = document.createRange();
  r.setStart(...at(a));
  const [n, off] = at(a + len - 1);
  r.setEnd(n, off + 1);
  return r;
}
