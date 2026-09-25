// Spelling in the journal editor, by macOS's spell checker (spell.rs). Misspelled words get a
// wavy underline (a CSS highlight, so the editor's contents are never touched); clicking one
// offers macOS's guesses, Add to dictionary and Ignore. With "Correct spelling automatically" on
// in macOS, a word is corrected as it's finished (space or punctuation); ⌘Z undoes it, and
// clicking the corrected word offers to change it back. Verses inserted from the Bible, their
// citations and links aren't checked.

import { RefObject, useEffect, useRef, useState } from "react";
import { api } from "./api";

type Highlights = { set: (k: string, v: unknown) => void; delete: (k: string) => void };
const highlights = () => (CSS as unknown as { highlights?: Highlights }).highlights;
const HighlightOf = () => (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;

const SKIP = "blockquote.verse, cite, a.ref, code";

/** Words added to the dictionary or ignored this session. macOS can take a moment to take them
 *  in, and a check straight after would underline them again. */
const accepted = new Set<string>();

function textNodes(root: HTMLElement): Text[] {
  const out: Text[] = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = w.nextNode(); n; n = w.nextNode()) out.push(n as Text);
  return out;
}

/** Whether the point is inside the range (false for one in another document or tree). */
function holds(r: Range, node: Node, offset: number): boolean {
  try { return r.toString() !== "" && r.comparePoint(node, offset) === 0; } catch { return false; }
}

export interface SpellMenu {
  rect: DOMRect;
  word: string;
  range: Range;
  guesses: string[];
  /** For a word corrected automatically: what was typed. */
  was?: string;
}

/** Spelling for the editor `ed`; `key` is the entry shown (a new one starts afresh); `onEdit`
 *  saves after a change made here. */
export function useSpelling(ed: RefObject<HTMLDivElement | null>, key: string, onEdit: () => void) {
  const bad = useRef<Range[]>([]);
  const fixed = useRef<{ range: Range; was: string }[]>([]);
  const timer = useRef<number | undefined>(undefined);
  const [menu, setMenu] = useState<SpellMenu | null>(null);

  const paint = () => {
    const hs = highlights(), H = HighlightOf();
    if (!hs || !H) return;
    if (bad.current.length) hs.set("spelling", new H(...bad.current)); else hs.delete("spelling");
  };

  const check = async () => {
    const root = ed.current;
    if (!root) return;
    const nodes = textNodes(root);
    let text = "";
    const starts: number[] = [];
    for (const n of nodes) { starts.push(text.length); text += n.data + "\n"; }
    let found: [number, number][];
    try { found = await api.spellCheck(text); } catch { return; }
    const sel = window.getSelection();
    const caret = sel?.rangeCount && sel.isCollapsed && document.activeElement === root ? sel.getRangeAt(0) : null;
    const ranges: Range[] = [];
    for (const [a, len] of found) {
      let i = starts.length - 1;
      while (i > 0 && starts[i] > a) i--;
      const n = nodes[i], off = a - starts[i];
      // Typed over since the check was asked for: left to the next one.
      if (!n?.isConnected || n.data.slice(off, off + len) !== text.slice(a, a + len)) continue;
      if (accepted.has(text.slice(a, a + len))) continue;
      // Not the word being typed.
      if (caret && caret.startContainer === n && caret.startOffset === off + len) continue;
      const r = document.createRange();
      r.setStart(n, off);
      r.setEnd(n, off + len);
      ranges.push(r);
    }
    bad.current = ranges;
    paint();
  };

  const recheck = (delay = 600) => { window.clearTimeout(timer.current); timer.current = window.setTimeout(check, delay); };

  useEffect(() => {
    fixed.current = [];
    setMenu(null);
    recheck(50);
    return () => { window.clearTimeout(timer.current); highlights()?.delete("spelling"); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Puts `text` in place of `r`, as typing would (so ⌘Z undoes it), keeping the caret where it was. */
  const replace = (r: Range, text: string, keepCaret = true): Range | null => {
    const sel = window.getSelection();
    if (!sel || !ed.current) return null;
    const caret = keepCaret && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    ed.current.focus();
    sel.removeAllRanges();
    sel.addRange(r);
    document.execCommand("insertText", false, text);
    const end = sel.rangeCount ? sel.getRangeAt(0) : null;
    let placed: Range | null = null;
    if (end && end.endContainer.nodeType === Node.TEXT_NODE && end.endOffset >= text.length) {
      placed = document.createRange();
      placed.setStart(end.endContainer, end.endOffset - text.length);
      placed.setEnd(end.endContainer, end.endOffset);
    }
    if (caret) { sel.removeAllRanges(); sel.addRange(caret); }
    onEdit();
    return placed;
  };

  /** Before a key reaches the editor: a space or punctuation after a word may correct it. */
  const onKey = (e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || !/^[ .,;:!?)]$/.test(e.key)) return;
    const sel = window.getSelection();
    const n = sel?.anchorNode;
    if (!sel?.isCollapsed || !n || n.nodeType !== Node.TEXT_NODE || n.parentElement?.closest(SKIP)) return;
    const t = n as Text, off = sel.anchorOffset;
    const word = t.data.slice(0, off).match(/[\p{L}’']+$/u)?.[0];
    if (!word || word.length < 2) return;
    const start = off - word.length;
    api.spellCorrection(word).then((c) => {
      if (!c || !t.isConnected || t.data.slice(start, start + word.length) !== word) return;
      const r = document.createRange();
      r.setStart(t, start);
      r.setEnd(t, start + word.length);
      const placed = replace(r, c);
      if (placed) fixed.current.push({ range: placed, was: word });
      recheck();
    }).catch(() => {});
  };

  /** A click in the editor: on a misspelled or corrected word, opens its menu. */
  const onClick = async (e: React.MouseEvent) => {
    const at = document.caretRangeFromPoint?.(e.clientX, e.clientY);
    if (!at) return;
    const f = fixed.current.find((x) => holds(x.range, at.startContainer, at.startOffset));
    const r = f?.range ?? bad.current.find((x) => holds(x, at.startContainer, at.startOffset));
    if (!r) { setMenu(null); return; }
    const word = r.toString();
    const guesses = await api.spellGuesses(word).catch(() => [] as string[]);
    setMenu({ rect: r.getBoundingClientRect(), word, range: r, guesses: guesses.filter((g) => g !== word).slice(0, 6), was: f?.was });
  };

  const choose = (text: string) => {
    if (!menu) return;
    fixed.current = fixed.current.filter((x) => x.range !== menu.range);
    replace(menu.range, text, false);
    setMenu(null);
    recheck(100);
  };
  /** Takes the word's underlines off at once, everywhere in the entry, and tells macOS. */
  const accept = (word: string, tell: (w: string) => Promise<unknown>) => {
    accepted.add(word);
    bad.current = bad.current.filter((r) => r.toString() !== word);
    paint();
    tell(word).catch(() => {});
  };
  const learn = () => { if (menu) accept(menu.word, api.spellLearn); setMenu(null); };
  const ignore = () => { if (menu) accept(menu.word, api.spellIgnore); setMenu(null); };

  return { recheck, onKey, onClick, menu, closeMenu: () => setMenu(null), choose, learn, ignore };
}
