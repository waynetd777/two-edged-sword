// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Spelling in the journal editor, by macOS's spell checker (spell.rs). Misspelled words get a
// wavy underline (a CSS highlight, so the editor's contents are never touched); clicking one
// offers macOS's guesses, Add to dictionary and Ignore. With "Correct spelling automatically" on
// in macOS, a word is corrected as it's finished (space or punctuation); ⌘Z undoes it, and
// clicking the corrected word offers to change it back. Grammar too, by the same checker: a
// blue underline, and a click shows macOS's explanation and fixes. Verses inserted from the
// Bible, their citations and links aren't checked.

import { RefObject, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { BLOCKS, paintHighlight, textRange } from "./dom";

const SKIP = "blockquote.verse, cite, a.ref, code";

/** Words added to the dictionary or ignored this session. macOS can take a moment to take them
 *  in, and a check straight after would underline them again. */
const accepted = new Set<string>();
/** Grammar problems ignored this session, by their text and explanation. */
const acceptedGrammar = new Set<string>();
const grammarKey = (text: string, description: string) => `${text.toLowerCase()}|${description}`;

/** The editor's text a paragraph at a time: text in one block runs on (a word or sentence can
 *  cross bold or a link), with a range for any stretch of it. */
function blocks(nodes: Text[]) {
  const out: { text: string; range: (a: number, len: number) => Range | null }[] = [];
  let cur: Text[] = [],
    starts: number[] = [],
    text = "",
    block: Element | null | undefined;
  const close = () => {
    if (!cur.length) return;
    const [ns, ss, t] = [cur, starts, text];
    out.push({ text: t, range: (a, len) => textRange(ns, ss, a, len) });
  };
  for (const n of nodes) {
    const b = n.parentElement?.closest(BLOCKS) ?? null;
    if (b !== block) {
      close();
      cur = [];
      starts = [];
      text = "";
      block = b;
    }
    cur.push(n);
    starts.push(text.length);
    text += n.data;
  }
  close();
  return out;
}

/** What macOS found in a paragraph's text, kept so that only paragraphs that changed are sent
 *  (the checks run on the app's main thread, where a whole long entry takes a noticeable time). */
type Found = { spelling: [number, number][]; grammar: { start: number; len: number; description: string; corrections: string[] }[] | null };
const cache = new Map<string, Found>();
const remember = (text: string, f: Found) => {
  cache.delete(text);
  cache.set(text, f);
  if (cache.size > 3000) cache.delete(cache.keys().next().value!);
};

interface GrammarHit {
  range: Range;
  description: string;
  corrections: string[];
}
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
  try {
    return r.toString() !== "" && r.comparePoint(node, offset) === 0;
  } catch {
    return false;
  }
}

interface SpellMenu {
  rect: DOMRect;
  word: string;
  range: Range;
  guesses: string[];
  /** For a word corrected automatically: what was typed. */
  was?: string;
  /** For a grammar problem: macOS's explanation. */
  grammar?: string;
}

/** Spelling for the editor `ed`; `key` is the entry shown (a new one starts afresh); `onEdit`
 *  saves after a change made here; `grammarOn` checks grammar as well. */
export function useSpelling(ed: RefObject<HTMLDivElement | null>, key: string, onEdit: () => void, grammarOn = true) {
  const bad = useRef<Range[]>([]);
  const gram = useRef<GrammarHit[]>([]);
  const fixed = useRef<{ range: Range; was: string }[]>([]);
  const timer = useRef<number | undefined>(undefined);
  const [menu, setMenu] = useState<SpellMenu | null>(null);

  const paint = () => {
    paintHighlight("spelling", bad.current);
    paintHighlight(
      "grammar",
      gram.current.map((g) => g.range),
    );
  };

  const check = async () => {
    const root = ed.current;
    if (!root) return;
    const paras = blocks(textNodes(root));
    // Only paragraphs not seen before (or not yet checked for grammar) go to macOS, in one call
    // each, a line apiece; the results are split back by where each line starts.
    const need = [...new Set(paras.map((p) => p.text).filter((t) => t.trim() && (!cache.has(t) || (grammarOn && !cache.get(t)!.grammar))))];
    if (need.length) {
      const joined = need.join("\n"),
        starts: number[] = [];
      need.reduce((n, t) => {
        starts.push(n);
        return n + t.length + 1;
      }, 0);
      const line = (a: number) => {
        let k = starts.length - 1;
        while (k > 0 && starts[k] > a) k--;
        return k;
      };
      let sp: [number, number][], gr: Awaited<ReturnType<typeof api.spellGrammar>> | null;
      try {
        [sp, gr] = await Promise.all([api.spellCheck(joined), grammarOn ? api.spellGrammar(joined) : Promise.resolve(null)]);
      } catch {
        return;
      }
      const got = need.map((t): Found => ({ spelling: [], grammar: gr ? [] : (cache.get(t)?.grammar ?? null) }));
      for (const [a, len] of sp) {
        const k = line(a);
        got[k].spelling.push([a - starts[k], len]);
      }
      for (const g of gr ?? []) {
        const k = line(g.start);
        got[k].grammar!.push({ ...g, start: g.start - starts[k] });
      }
      need.forEach((t, k) => remember(t, got[k]));
    }
    const sel = window.getSelection();
    const caret = sel?.rangeCount && sel.isCollapsed && document.activeElement === root ? sel.getRangeAt(0) : null;
    // Not what is being typed at the caret.
    const typing = (r: Range) => !!caret && caret.startContainer === r.endContainer && caret.startOffset === r.endOffset;
    const ranges: Range[] = [],
      hits: GrammarHit[] = [];
    for (const p of paras) {
      const f = cache.get(p.text);
      if (!f) continue;
      for (const [a, len] of f.spelling) {
        const want = p.text.slice(a, a + len),
          r = p.range(a, len);
        // Typed over since the check was asked for: left to the next one.
        if (!r || r.toString() !== want || accepted.has(want.toLowerCase()) || typing(r)) continue;
        ranges.push(r);
      }
      for (const g of grammarOn ? (f.grammar ?? []) : []) {
        const want = p.text.slice(g.start, g.start + g.len),
          r = p.range(g.start, g.len);
        if (!r || r.toString() !== want || acceptedGrammar.has(grammarKey(want, g.description)) || typing(r)) continue;
        hits.push({ range: r, description: g.description, corrections: g.corrections });
      }
    }
    bad.current = ranges;
    gram.current = hits;
    paint();
  };

  const recheck = (delay = 600) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(check, delay);
  };

  useEffect(() => {
    fixed.current = [];
    setMenu(null);
    recheck(50);
    return () => {
      window.clearTimeout(timer.current);
      paintHighlight("spelling", []);
      paintHighlight("grammar", []);
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  // Turning grammar off in Settings takes its underlines away; on, checks again.
  useEffect(() => {
    if (!grammarOn) {
      gram.current = [];
      paint();
    } else recheck(50);
  }, [grammarOn]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (caret) {
      sel.removeAllRanges();
      sel.addRange(caret);
    }
    onEdit();
    return placed;
  };

  /** Before a key reaches the editor: a space or punctuation after a word may correct it. */
  const onKey = (e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || !/^[ .,;:!?)]$/.test(e.key)) return;
    const sel = window.getSelection();
    const n = sel?.anchorNode;
    if (!sel?.isCollapsed || !n || n.nodeType !== Node.TEXT_NODE || n.parentElement?.closest(SKIP)) return;
    const t = n as Text,
      off = sel.anchorOffset;
    const word = t.data.slice(0, off).match(/[\p{L}’']+$/u)?.[0];
    if (!word || word.length < 2) return;
    const start = off - word.length;
    api
      .spellCorrection(word)
      .then((c) => {
        if (!c || !t.isConnected || t.data.slice(start, start + word.length) !== word) return;
        const r = document.createRange();
        r.setStart(t, start);
        r.setEnd(t, start + word.length);
        const placed = replace(r, c);
        if (placed) fixed.current.push({ range: placed, was: word });
        recheck();
      })
      .catch(() => {});
  };

  /** A click in the editor: on a misspelled or corrected word, or a grammar problem, opens its menu. */
  const onClick = async (e: React.MouseEvent) => {
    const at = document.caretRangeFromPoint?.(e.clientX, e.clientY);
    if (!at) return;
    const f = fixed.current.find((x) => holds(x.range, at.startContainer, at.startOffset));
    const r = f?.range ?? bad.current.find((x) => holds(x, at.startContainer, at.startOffset));
    const g = r ? undefined : gram.current.find((x) => holds(x.range, at.startContainer, at.startOffset));
    if (g) {
      setMenu({
        rect: g.range.getBoundingClientRect(),
        word: g.range.toString(),
        range: g.range,
        guesses: g.corrections.slice(0, 6),
        grammar: g.description,
      });
      return;
    }
    if (!r) {
      setMenu(null);
      return;
    }
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
  /** Takes the word's underlines off at once, everywhere in the entry and in any capitals, then
   *  tells macOS and checks again. */
  const accept = (word: string, tell: (w: string) => Promise<unknown>) => {
    const w = word.toLowerCase();
    accepted.add(w);
    bad.current = bad.current.filter((r) => r.toString().toLowerCase() !== w);
    paint();
    tell(word)
      .then(() => recheck(0))
      .catch(() => {});
  };
  const learn = () => {
    if (menu) accept(menu.word, api.spellLearn);
    setMenu(null);
  };
  const ignore = () => {
    if (menu?.grammar !== undefined) {
      acceptedGrammar.add(grammarKey(menu.word, menu.grammar));
      gram.current = gram.current.filter((g) => g.range !== menu.range);
      paint();
    } else if (menu) accept(menu.word, api.spellIgnore);
    setMenu(null);
  };

  return { recheck, onKey, onClick, menu, closeMenu: () => setMenu(null), choose, learn, ignore };
}
