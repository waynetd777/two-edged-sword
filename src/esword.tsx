// Rendering e-Sword's HTML. Modules use ordinary tags plus their own: <red> (words of Jesus),
// <num>G25</num> (Strong's number for the words before it), <grk>, <heb>, <lat>, <ref>Joh 3:16</ref>
// and <blu>. Text is never injected as HTML: it is parsed and rebuilt as React elements, so a
// module can only produce the tags listed here.

import { Fragment, ReactNode } from "react";
import { findBook, parseRef, Ref } from "./bible";

const parser = new DOMParser();
const parse = (html: string) => parser.parseFromString(`<body>${html}</body>`, "text/html").body;

export interface RenderOpts {
  onRef?: (r: Ref, text: string) => void;
  onStrongs?: (num: string) => void;
  /** Hover on a reference (for previews); receives the element for positioning. */
  onRefHover?: (r: Ref | null, el: HTMLElement | null) => void;
  /** Strong's numbers as ordinary links (in lexicon text) rather than superscripts. */
  inlineNums?: boolean;
}

/** "Joh 3:16", "Joh 3:16-18", "2Co 5:19-21", or a bare "3:16" after a book in the same list. */
export function parseEswordRef(text: string, lastBook?: number): Ref | undefined {
  const t = text.trim().replace(/[.;,]$/, "");
  const r = parseRef(t);
  if (r) return r;
  const m = t.match(/^(\d+):(\d+)(?:-(\d+))?$/);
  if (m && lastBook) return { book: lastBook, chapter: +m[1], verse: +m[2], to: m[3] ? +m[3] : undefined };
  const m2 = t.match(/^([1-3]?[A-Za-z]{2,4})\s+(\d+)$/);
  if (m2) { const b = findBook(m2[1]); if (b) return { book: b, chapter: +m2[2] }; }
  return undefined;
}

function cls(el: Element): string | undefined {
  const c = el.getAttribute("class");
  return c && /^indent\d$/.test(c) ? c : undefined;
}

export function renderHtml(html: string, opts: RenderOpts = {}): ReactNode {
  let lastBook: number | undefined;
  let key = 0;
  const walk = (node: Node): ReactNode => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const el = node as Element;
    const kids = () => Array.from(el.childNodes).map((c) => <Fragment key={key++}>{walk(c)}</Fragment>);
    const tag = el.tagName.toLowerCase();
    switch (tag) {
      case "p": {
        const center = (el.getAttribute("align") || "").toLowerCase() === "center";
        return <p className={cls(el)} style={center ? { textAlign: "center", fontWeight: 600 } : undefined}>{kids()}</p>;
      }
      case "b": case "strong": return <b>{kids()}</b>;
      case "i": case "em": return <i>{kids()}</i>;
      case "u": return <u>{kids()}</u>;
      case "sup": return <sup>{kids()}</sup>;
      case "sub": return <sub>{kids()}</sub>;
      case "br": return <br />;
      case "red": return <span className="red">{kids()}</span>;
      case "blu": return <span className="blu">{kids()}</span>;
      case "grk": return <span className="grk" lang="grc">{kids()}</span>;
      case "heb": return <span className="heb" lang="he">{kids()}</span>;
      case "lat": return <span className="lat">{kids()}</span>;
      case "table": return <table><tbody>{Array.from(el.querySelectorAll(":scope > tbody > tr, :scope > tr")).map((tr) => walk(tr))}</tbody></table>;
      case "tbody": return <>{kids()}</>;
      case "tr": return <tr key={key++}>{kids()}</tr>;
      case "td": case "th": return <td colSpan={+(el.getAttribute("colspan") || 1)}>{kids()}</td>;
      case "img": {
        const src = el.getAttribute("src") || "";
        return src.startsWith("data:image/") ? <img src={src} alt="" draggable={false} /> : null;
      }
      case "num": {
        const n = (el.textContent || "").trim();
        if (opts.inlineNums) return <a className="ref" onClick={(e) => { e.preventDefault(); e.stopPropagation(); opts.onStrongs?.(n); }}>{n}</a>;
        return <span className="strongs" role="link" tabIndex={-1} onClick={(e) => { e.stopPropagation(); opts.onStrongs?.(n); }}>{n}</span>;
      }
      case "ref": {
        const text = el.textContent || "";
        const r = parseEswordRef(text, lastBook);
        if (r) lastBook = r.book;
        if (!r || !opts.onRef) return <span>{text}</span>;
        return (
          <a className="ref" onClick={(e) => { e.preventDefault(); e.stopPropagation(); opts.onRef!(r, text); }}
            onMouseEnter={(e) => opts.onRefHover?.(r, e.currentTarget)} onMouseLeave={() => opts.onRefHover?.(null, null)}>{text}</a>
        );
      }
      default: return <>{kids()}</>;
    }
  };
  return Array.from(parse(html).childNodes).map((c) => <Fragment key={key++}>{walk(c)}</Fragment>);
}

/** Plain text of e-Sword HTML (Strong's numbers dropped). */
export function plainText(html: string): string {
  const body = parse(html);
  body.querySelectorAll("num").forEach((n) => n.remove());
  body.querySelectorAll("sup").forEach((n) => { if (/^[()]$/.test(n.textContent || "")) n.remove(); });
  return (body.textContent || "").replace(/\s+/g, " ").trim();
}

// ---------- verse tokens ----------

export interface Token {
  text: string;
  /** A word (clickable), as opposed to spaces and punctuation. */
  word: boolean;
  red: boolean;
  italic: boolean;
  strongs: string[];
  /** Character offset of this token in the verse's plain text. */
  at: number;
  /** Index among the verse's words. */
  wi: number;
  /** Strong's numbers are shown after the last word of their group. */
  showNums?: string[];
}

const WORD = /[\p{L}\p{M}'’]+(?:-[\p{L}\p{M}'’]+)*/gu;

/** A verse as a list of words and gaps, with each word's Strong's numbers where the Bible has them. */
export function tokenize(html: string): Token[] {
  const out: Token[] = [];
  let at = 0;
  let wi = 0;
  let groupStart = 0; // first token since the previous <num>
  const push = (text: string, red: boolean, italic: boolean) => {
    let last = 0;
    for (const m of text.matchAll(WORD)) {
      if (m.index! > last) { const t = text.slice(last, m.index); out.push({ text: t, word: false, red, italic, strongs: [], at, wi: -1 }); at += t.length; }
      out.push({ text: m[0], word: true, red, italic, strongs: [], at, wi: wi++ });
      at += m[0].length;
      last = m.index! + m[0].length;
    }
    if (last < text.length) { const t = text.slice(last); out.push({ text: t, word: false, red, italic, strongs: [], at, wi: -1 }); at += t.length; }
  };
  const walk = (node: Node, red: boolean, italic: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) { push(node.textContent || "", red, italic); return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === "num") {
      const n = (el.textContent || "").trim();
      const words = out.slice(groupStart).filter((t) => t.word);
      words.forEach((t) => t.strongs.push(n));
      const lastWord = words[words.length - 1];
      if (lastWord) (lastWord.showNums ??= []).push(n);
      groupStart = out.length;
      return;
    }
    if (tag === "sup" && /^[()]$/.test((el.textContent || "").trim())) return;
    const r = red || tag === "red";
    const i = italic || tag === "i";
    el.childNodes.forEach((c) => walk(c, r, i));
  };
  parse(html).childNodes.forEach((c) => walk(c, false, false));
  // Collapse runs of whitespace the way the rendered text will.
  let pos = 0;
  for (const t of out) {
    if (!t.word) t.text = t.text.replace(/\s+/g, " ");
    t.at = pos;
    pos += t.text.length;
  }
  return out;
}

export const tokensText = (tokens: Token[]) => tokens.map((t) => t.text).join("");

/**
 * Strong's numbers for a verse in a Bible that has none, borrowed from its Strong's edition
 * (KJV from KJV+): the words line up one for one when the text is the same.
 */
export function alignStrongs(plainTokens: Token[], strongTokens: Token[]): Token[] {
  const a = plainTokens.filter((t) => t.word);
  const b = strongTokens.filter((t) => t.word);
  const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'");
  let j = 0;
  for (const t of a) {
    // Walk forward in b to the next word with the same spelling (tolerates small differences).
    let k = j;
    while (k < b.length && norm(b[k].text) !== norm(t.text) && k - j < 3) k++;
    if (k < b.length && norm(b[k].text) === norm(t.text)) { t.strongs = b[k].strongs; j = k + 1; }
  }
  return plainTokens;
}

/** A word reduced to a dictionary headword: "loved" → ["loved", "love"]. */
export function headwords(word: string): string[] {
  const w = word.toLowerCase().replace(/[’']s$/, "").replace(/[’']/g, "'");
  const out = [w];
  const add = (s: string) => { if (s.length > 2 && !out.includes(s)) out.push(s); };
  if (w.endsWith("eth")) { add(w.slice(0, -3)); add(w.slice(0, -3) + "e"); }
  if (w.endsWith("est")) { add(w.slice(0, -3)); add(w.slice(0, -3) + "e"); }
  if (w.endsWith("ied")) add(w.slice(0, -3) + "y");
  if (w.endsWith("ies")) add(w.slice(0, -3) + "y");
  if (w.endsWith("ed")) { add(w.slice(0, -2)); add(w.slice(0, -1)); }
  if (w.endsWith("ing")) { add(w.slice(0, -3)); add(w.slice(0, -3) + "e"); }
  if (w.endsWith("es")) add(w.slice(0, -2));
  if (w.endsWith("s") && !w.endsWith("ss")) add(w.slice(0, -1));
  return out;
}

/** Pieces of a Strong's lexicon entry: the word, transliteration, pronunciation, and the rest. */
export function lexiconParts(html: string): { word: string; translit: string; pron: string; rest: string; total?: number } {
  const ps = html.match(/<p>[\s\S]*?<\/p>/g) || [];
  const txt = (s: string) => plainText(s);
  const word = ps[0] ? txt(ps[0]) : "";
  const translit = ps[1] ? txt(ps[1]) : "";
  const pron = ps[2] ? txt(ps[2]) : "";
  const restParts = ps.slice(3);
  const total = html.match(/Total KJV occurrences:\s*(\d+)/i);
  const rest = restParts.filter((p) => !/Total KJV occurrences/i.test(p)).join("");
  return { word, translit, pron, rest, total: total ? +total[1] : undefined };
}

/** KJV renderings from the KJ Concordance entry: [["love", 74], ["loved", 38], …]. */
export function concordanceRenderings(html: string): [string, number][] {
  const out: [string, number][] = [];
  for (const m of html.matchAll(/<b>([^<]+?),\s*(\d+)<\/b>/g)) out.push([m[1].trim(), +m[2]]);
  return out;
}
