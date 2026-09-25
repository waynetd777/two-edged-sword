// Find and replace in the journal editor (⌘F, ⌥⌘F). Matches are CSS highlights, like spelling's
// underlines, so the editor's contents are only touched by a replace, which goes through
// insertText so ⌘Z undoes it.

import { RefObject, useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { ClearButton } from "./ui";

type Highlights = { set: (k: string, v: unknown) => void; delete: (k: string) => void };
const highlights = () => (CSS as unknown as { highlights?: Highlights }).highlights;
const HighlightOf = () => (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;

const BLOCK = "p, li, h1, h2, h3, h4, blockquote, div, cite";

/** Every match of `q` in `root`, in order. A match can run across bold or a link, not across lines. */
function matches(root: HTMLElement, q: string, caseSensitive: boolean): Range[] {
  if (!q) return [];
  const nodes: Text[] = [], starts: number[] = [];
  let text = "", block: Element | null = null;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode() as Text | null; n; n = w.nextNode() as Text | null) {
    const b = n.parentElement?.closest(BLOCK) ?? null;
    if (nodes.length && b !== block) text += "\0"; // a line break a match can't cross
    block = b;
    nodes.push(n); starts.push(text.length); text += n.data;
  }
  const hay = caseSensitive ? text : text.toLowerCase(), needle = caseSensitive ? q : q.toLowerCase();
  const at = (i: number): [Text, number] => {
    let k = starts.length - 1;
    while (k > 0 && starts[k] > i) k--;
    return [nodes[k], i - starts[k]];
  };
  const out: Range[] = [];
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + needle.length)) {
    const r = document.createRange();
    r.setStart(...at(i));
    // The end is found from its last character, so it isn't placed at the start of the next node.
    const [n, off] = at(i + needle.length - 1);
    r.setEnd(n, off + 1);
    out.push(r);
  }
  return out;
}

/** Find and replace for the editor `ed`; `onEdit` saves after a replace. */
export function useFind(ed: RefObject<HTMLDivElement | null>, onEdit: () => void) {
  const [open, setOpen] = useState<false | "find" | "replace">(false);
  const [q, setQ] = useState("");
  const [rep, setRep] = useState("");
  const [caseSensitive, setCase] = useState(false);
  const [found, setFound] = useState<Range[]>([]);
  const [cur, setCur] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const repInput = useRef<HTMLInputElement>(null);

  const paint = (rs: Range[], i: number) => {
    const hs = highlights(), H = HighlightOf();
    if (!hs || !H) return;
    const others = rs.filter((_, k) => k !== i);
    if (others.length) hs.set("find", new H(...others)); else hs.delete("find");
    if (rs[i]) hs.set("find-current", new H(rs[i])); else hs.delete("find-current");
  };
  const show = (r: Range | undefined) => {
    const el = r?.startContainer.parentElement;
    el?.scrollIntoView({ block: "nearest" });
  };

  /** Finds again (after typing in the entry, or a new query), keeping near the current match. */
  const refresh = (keep = true, query = q, cs = caseSensitive) => {
    if (!ed.current || !open) return;
    const rs = matches(ed.current, query, cs);
    const was = keep ? found[cur] : undefined;
    let i = 0;
    if (was) { const k = rs.findIndex((r) => r.compareBoundaryPoints(Range.START_TO_START, was) >= 0); i = k < 0 ? 0 : k; }
    setFound(rs); setCur(i); paint(rs, i);
    if (!keep) show(rs[i]);
  };
  const step = (d: 1 | -1) => {
    if (!found.length) return;
    const i = (cur + d + found.length) % found.length;
    setCur(i); paint(found, i); show(found[i]);
  };

  const replaceOne = () => {
    const r = found[cur];
    if (!r || !ed.current) return;
    const sel = window.getSelection();
    ed.current.focus();
    sel?.removeAllRanges(); sel?.addRange(r);
    document.execCommand("insertText", false, rep);
    onEdit();
    // The next match is the one now at this position.
    const rs = matches(ed.current, q, caseSensitive);
    const end = sel?.rangeCount ? sel.getRangeAt(0) : null;
    let i = end ? rs.findIndex((x) => x.compareBoundaryPoints(Range.START_TO_END, end) >= 0) : 0;
    if (i < 0) i = 0;
    setFound(rs); setCur(i); paint(rs, i); show(rs[i]);
    repInput.current?.focus();
  };
  const replaceAll = () => {
    if (!found.length || !ed.current) return;
    const sel = window.getSelection();
    ed.current.focus();
    // Last to first, so each range is still where it was found.
    for (const r of [...found].reverse()) { sel?.removeAllRanges(); sel?.addRange(r); document.execCommand("insertText", false, rep); }
    onEdit();
    setFound([]); setCur(0); paint([], 0);
  };

  const start = (mode: "find" | "replace") => {
    // What's selected in the entry is what's looked for.
    const s = window.getSelection();
    const picked = s && !s.isCollapsed && ed.current?.contains(s.anchorNode) ? s.toString() : "";
    if (picked && !picked.includes("\n")) setQ(picked);
    setOpen(mode);
    window.setTimeout(() => { input.current?.focus(); input.current?.select(); }, 0);
  };
  const close = () => { setOpen(false); paint([], 0); ed.current?.focus(); };

  useEffect(() => { refresh(false); }, [open, q, caseSensitive]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!e.metaKey) return;
      if (e.key === "f" || e.key === "ƒ") { e.preventDefault(); start(e.altKey ? "replace" : "find"); }
      else if (e.key === "g" && open) { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
  useEffect(() => () => paint([], 0), []); // eslint-disable-line react-hooks/exhaustive-deps

  const bar = open && (
    <div role="search" aria-label="Find in entry" style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 20px", borderBottom: "1px solid var(--border)", background: "var(--panel2)" }}
      onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); close(); } }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <label className="field" style={{ flex: 1, maxWidth: 360 }}><Icon name="search" />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find" aria-label="Find"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); step(e.shiftKey ? -1 : 1); } }} />
          <ClearButton show={!!q} onClear={() => setQ("")} />
        </label>
        <span className="n" style={{ minWidth: 64 }}>{q ? (found.length ? `${cur + 1} of ${found.length}` : "No matches") : ""}</span>
        <button className="ibtn" type="button" aria-label="Previous match" title="Previous ⇧⌘G" disabled={!found.length} onClick={() => step(-1)}><Icon name="up" /></button>
        <button className="ibtn" type="button" aria-label="Next match" title="Next ⌘G" disabled={!found.length} onClick={() => step(1)}><Icon name="down" /></button>
        <button className={`btn small ${caseSensitive ? "on" : ""}`} type="button" aria-pressed={caseSensitive} title="Match case" onClick={() => setCase(!caseSensitive)}>Aa</button>
        {open === "find" && <button className="btn small" type="button" style={{ border: 0 }} onClick={() => setOpen("replace")}>Replace…</button>}
        <button className="ibtn" type="button" aria-label="Close find" title="Close (Esc)" style={{ marginLeft: "auto" }} onClick={close}><Icon name="x" /></button>
      </div>
      {open === "replace" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label className="field" style={{ flex: 1, maxWidth: 360 }}><Icon name="refresh" />
            <input ref={repInput} value={rep} onChange={(e) => setRep(e.target.value)} placeholder="Replace with" aria-label="Replace with"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); replaceOne(); } }} />
          </label>
          <button className="btn small" type="button" disabled={!found.length} onClick={replaceOne}>Replace</button>
          <button className="btn small" type="button" disabled={!found.length} onClick={replaceAll}>Replace all</button>
        </div>
      )}
    </div>
  );

  return { bar, refresh: () => refresh(true), start };
}
