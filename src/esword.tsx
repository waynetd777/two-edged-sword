// Rendering e-Sword's HTML. Modules use ordinary tags plus their own: <red> (words of Jesus),
// <num>G25</num> (Strong's number for the words before it), <grk>, <heb>, <lat>, <ref>Joh 3:16</ref>
// and <blu>. Text is never injected as HTML: it is parsed and rebuilt as React elements, so a
// module can only produce the tags listed here.

import { Fragment, ReactNode } from "react";
import { findBook, parseRef, Ref } from "./bible";
import { api } from "./api";

const parser = new DOMParser();
const parse = (html: string) => parser.parseFromString(`<body>${html}</body>`, "text/html").body;

export interface RenderOpts {
  onRef?: (r: Ref, text: string) => void;
  onStrongs?: (num: string) => void;
  /** Hover on a reference (for previews); receives the element for positioning. */
  onRefHover?: (r: Ref | null, el: HTMLElement | null) => void;
  /** Strong's numbers as ordinary links (in lexicon text) rather than superscripts. */
  inlineNums?: boolean;
  /** Click on an image (to show it full screen). */
  onImage?: (src: string) => void;
  /** The entry a name refers to in this module ("ASTRONOMY" → "Astronomy"), if it has one; with onTopic, "See X" becomes a link. */
  topic?: (name: string) => string | undefined;
  onTopic?: (topic: string) => void;
  /** A reference that points at this commentary's own note ("see on Jdg 9:7", "Gen 12:8 note") opens that note instead of the Bible. */
  onNote?: (r: Ref) => void;
}

const NOTE_BEFORE = /\b[Ss]ee\b[^.()]{0,40}?\b(?:on|notes?)\s*$/;
const NOTE_AFTER = /^\s*[,;]?\s*\(?\s*(?:see the )?notes?\b/i;
const LIST_GAP = /^\s*(?:[;,]|and)\s*$/;

const SEE = /\b(?:[Ss]ee(?: also| under)?|[Cc]ompare|[Cc]f\.)\s+/g;
const SEE_AT_END = /\b(?:[Ss]ee(?: also| under)?|[Cc]ompare|[Cc]f\.)\s*$/;

/** The entry named at the start of `s`, trying up to six words and then fewer: "Aaron's Rod, the" → "Aaron's Rod". */
function leadingTopic(s: string, topic: (n: string) => string | undefined): { text: string; topic: string } | undefined {
  const words = s.trim().split(/\s+/);
  for (let n = Math.min(words.length, 6); n > 0; n--) {
    const text = words.slice(0, n).join(" ").replace(/[,;:'’]+$/, "");
    const t = text && topic(text);
    if (t) return { text, topic: t };
  }
  return undefined;
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
  let noteChain = false; // "see notes on A; B": B is a note too
  let key = 0;
  const walk = (node: Node): ReactNode => {
    if (node.nodeType === Node.TEXT_NODE) return opts.topic && opts.onTopic ? linkSees(node.textContent || "") : node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const el = node as Element;
    const kids = () => Array.from(el.childNodes).map((c) => <Fragment key={key++}>{walk(c)}</Fragment>);
    const tag = el.tagName.toLowerCase();
    switch (tag) {
      case "p": {
        const center = (el.getAttribute("align") || "").toLowerCase() === "center";
        return <p className={cls(el)} style={center ? { textAlign: "center", fontWeight: 600 } : undefined}>{kids()}</p>;
      }
      case "b": case "strong": return seeTarget(el) ?? <b>{kids()}</b>;
      case "i": case "em": return seeTarget(el) ?? <i>{kids()}</i>;
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
        if (!src.startsWith("data:image/")) return null;
        const onImage = opts.onImage;
        return onImage ? <img src={src} alt="" draggable={false} className="zoomable" onClick={(e) => { e.stopPropagation(); onImage(src); }} /> : <img src={src} alt="" draggable={false} />;
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
        if (opts.onNote) {
          const before = el.previousSibling?.nodeType === Node.TEXT_NODE ? el.previousSibling.textContent || "" : "";
          const after = el.nextSibling?.nodeType === Node.TEXT_NODE ? el.nextSibling.textContent || "" : "";
          noteChain = NOTE_BEFORE.test(before) || NOTE_AFTER.test(after) || (noteChain && LIST_GAP.test(before));
          if (noteChain) {
            return (
              <a className="ref" title="Open this commentary's note" onClick={(e) => { e.preventDefault(); e.stopPropagation(); opts.onNote!(r); }}
                onMouseEnter={(e) => opts.onRefHover?.(r, e.currentTarget)} onMouseLeave={() => opts.onRefHover?.(null, null)}>{text}</a>
            );
          }
        }
        return (
          <a className="ref" onClick={(e) => { e.preventDefault(); e.stopPropagation(); opts.onRef!(r, text); }}
            onMouseEnter={(e) => opts.onRefHover?.(r, e.currentTarget)} onMouseLeave={() => opts.onRefHover?.(null, null)}>{text}</a>
        );
      }
      default: return <>{kids()}</>;
    }
  };
  const link = (text: string, topic: string) => <a key={key++} className="ref" title={`Open ${topic}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); opts.onTopic!(topic); }}>{text}</a>;
  // "See ASTRONOMY. III, 3" or "see also Meal; Banquet": each name after the cue that is an entry here becomes a link.
  const linkSees = (text: string): ReactNode => {
    const out: ReactNode[] = [];
    let last = 0;
    for (const m of text.matchAll(SEE)) {
      const start = m.index! + m[0].length;
      const tail = text.slice(start);
      const end = start + (tail.search(/[.()[\]:]/) + 1 || tail.length + 1) - 1;
      // Longest entry name first ("Mining and Metals"), else move on past the next ; , or "and".
      let at = start;
      while (at < end) {
        const rest = text.slice(at, end);
        const hit = leadingTopic(rest, opts.topic!);
        const lead = hit ? rest.indexOf(hit.text) : -1;
        if (hit && lead >= 0) {
          if (at + lead > last) out.push(text.slice(last, at + lead));
          out.push(link(hit.text, hit.topic));
          at = last = at + lead + hit.text.length;
        } else {
          const d = rest.search(/;|,|\band\b/);
          if (d < 0) break;
          at += d + (rest[d] === "a" ? 3 : 1);
        }
      }
    }
    if (!out.length) return text;
    if (last < text.length) out.push(text.slice(last));
    return out;
  };
  // "See <b>Hagar</b>." — the name is its own element straight after the cue.
  const seeTarget = (el: Element): ReactNode | undefined => {
    if (!opts.topic || !opts.onTopic) return undefined;
    const prev = el.previousSibling;
    if (prev?.nodeType !== Node.TEXT_NODE || !SEE_AT_END.test(prev.textContent || "")) return undefined;
    const name = (el.textContent || "").trim().replace(/[.,;:]+$/, "");
    const t = opts.topic(name);
    return t ? link(el.textContent || name, t) : undefined;
  };
  return Array.from(parse(html).childNodes).map((c) => <Fragment key={key++}>{walk(c)}</Fragment>);
}

const BLOCK = new Set(["p", "table", "div", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "blockquote", "center", "hr"]);

/**
 * A reference book's chapter as paragraphs of HTML, the units it is read aloud in. Block elements
 * stand alone; loose text between them is split at blank lines (two <br>s). A single wrapping
 * element is looked through.
 */
export function docSegments(html: string): string[] {
  let root: Element = parse(html);
  const meaningful = (n: Node) => n.nodeType === Node.ELEMENT_NODE || (n.textContent || "").trim() !== "";
  for (;;) {
    const kids = Array.from(root.childNodes).filter(meaningful);
    if (kids.length === 1 && kids[0].nodeType === Node.ELEMENT_NODE && !["p", "table"].includes((kids[0] as Element).tagName.toLowerCase()) && (kids[0] as Element).querySelector("p, br, table, div")) root = kids[0] as Element;
    else break;
  }
  const out: string[] = [];
  let run: string[] = [];
  let brs = 0;
  const flush = () => {
    const h = run.join("").replace(/^(\s|<br\s*\/?>)+|(\s|<br\s*\/?>)+$/gi, "");
    if (h && (plainText(h) || /<img/i.test(h))) out.push(h);
    run = []; brs = 0;
  };
  for (const n of Array.from(root.childNodes)) {
    if (n.nodeType === Node.ELEMENT_NODE) {
      const el = n as Element;
      const tag = el.tagName.toLowerCase();
      if (BLOCK.has(tag)) {
        flush();
        if (tag === "div" && el.querySelector("p, table, div")) out.push(...docSegments(el.innerHTML));
        else if (plainText(el.outerHTML) || el.querySelector("img")) out.push(el.outerHTML);
        continue;
      }
      if (tag === "br") { if (++brs >= 2) flush(); else run.push("<br>"); continue; }
      brs = 0;
      run.push(el.outerHTML);
    } else if (n.nodeType === Node.TEXT_NODE) {
      const t = n.textContent || "";
      if (t.trim()) brs = 0;
      run.push(t.replace(/&/g, "&amp;").replace(/</g, "&lt;"));
    }
  }
  flush();
  return out;
}

/** Plain text of e-Sword HTML (Strong's numbers dropped). */
/**
 * The word at `char` in `el`'s text as plainText would give it (what the voice is reading),
 * as a Range over the rendered page: Strong's numbers and bracket superscripts are skipped, and
 * spaces collapsed, just as there.
 */
export function wordRangeAt(el: Element, char: number): Range | null {
  const at: [Text, number][] = []; // for each character of the plain text, where it is on the page
  let space = true; // as if after a space, so leading spaces are dropped
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const p = n.parentElement;
      if (p?.closest(".strongs")) return NodeFilter.FILTER_REJECT;
      if (p?.closest("sup") && /^[()]$/.test((p.closest("sup")!.textContent || "").trim())) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let n = walk.nextNode() as Text | null; n; n = walk.nextNode() as Text | null) {
    const t = n.data;
    for (let i = 0; i < t.length; i++) {
      const ws = /\s/.test(t[i]);
      if (ws && space) continue;
      at.push([n, i]);
      space = ws;
    }
  }
  if (char < 0 || char >= at.length) return null;
  const isWord = (k: number) => k >= 0 && k < at.length && !/\s/.test(at[k][0].data[at[k][1]]);
  let a = char, b = char;
  while (isWord(a - 1)) a--;
  while (isWord(b + 1)) b++;
  if (!isWord(a)) return null;
  const r = document.createRange();
  r.setStart(at[a][0], at[a][1]);
  r.setEnd(at[b][0], at[b][1] + 1);
  return r;
}

export function plainText(html: string): string {
  const body = parse(html);
  body.querySelectorAll("num").forEach((n) => n.remove());
  body.querySelectorAll("sup").forEach((n) => { if (/^[()]$/.test(n.textContent || "")) n.remove(); });
  let text = body.textContent || "";
  // Greek NT TR+/WH+ "| base | other |": the base reading only.
  if ((text.match(/\|/g) ?? []).length % 3 === 0) text = text.replace(/\|([^|]*)\|[^|]*\|/g, "$1");
  return text.replace(/\s+/g, " ").trim();
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
  /** Interlinear Bibles: the English under this original-language word, and its grammar code. */
  gloss?: string;
  parse?: string;
  /** Its dictionary form, and (Greek NT INT+) which printed editions have the word, when not all do. */
  lemma?: string;
  editions?: string;
  /** Part of another edition's reading (Greek NT TR+ and WH+ mark them | base | other |), or its brackets. */
  variant?: boolean;
}

/** Which edition a Greek NT module's | base | other | readings come from, from its description. */
export function variantSource(info: string): string {
  if (/Scrivener/i.test(info)) return "Scrivener 1894";
  if (/Nestle|UBS/i.test(info)) return "NA27/UBS4";
  return "another edition";
}

/** INT+'s edition markers. */
export const EDITIONS: Record<string, string> = { ν: "NA28/UBS5", α: "Alexandrian (UBS3–4, NA26–27)", τ: "Stephanus 1550 (TR)", σ: "Scrivener 1894 (TR)", β: "Byzantine Majority" };

const CODES = new Set(["PREP", "CONJ", "ADV", "PRT", "INJ", "COND", "HEB", "ARAM"]);
/** A grammar code (N-NSF, V-2AAI-3S, PREP), as opposed to an English gloss (THE, WORD,). */
const isCode = (t: string) => (t.includes("-") ? /^[A-Z0-9]+(-[A-Z0-9]+)+$/.test(t) : CODES.has(t));

const WORD = /[\p{L}\p{M}'’]+(?:-[\p{L}\p{M}'’]+)*/gu;

const ORIGINAL = /[\p{Script=Greek}\p{Script=Hebrew}\p{Script=Syriac}]/u;
/** A word in Greek, Hebrew or Syriac, as opposed to a translation's. */
export const isOriginal = (text: string) => ORIGINAL.test(text);

/**
 * A verse as a list of words and gaps, with each word's Strong's numbers where the Bible has them.
 * An interlinear Bible (one with <tvm>) gets its English glosses and grammar codes attached to the
 * Greek or Hebrew word they belong to instead of as words of their own. Two layouts are known:
 * IGNT+ has <grk>word</grk><num>G3056 [G5748]</num><tvm>GLOSS</tvm> (the bracketed number is a
 * tense code); IWH+P has word<num>G3056</num><tvm>N-NSM</tvm><sup>gloss</sup>; LXX+ has
 * <grk>word</grk> <tvm>3056[N-NSM]</tvm> (the Strong's number and the grammar, no gloss); the Greek NT
 * TR+, BYZ+, WH+ and Greek OT+ have word<num>G3056</num> <tvm>N-NSM</tvm> in one <grk>; and INT+
 * boxes each word in a <div>: word, number, grammar, dictionary form, meaning (<gra>), editions;
 * Peshitta+ (tools/syriac) and the Latin+ Bibles (tools/latin) do the same, without numbers.
 */
export function tokenize(html: string): Token[] {
  const out: Token[] = [];
  const interlinear = /<tvm>/i.test(html);
  /** The last original-language word so far: glosses and codes after it belong to it. */
  const lastOriginal = () => { for (let k = out.length - 1; k >= 0; k--) if (out[k].word && ORIGINAL.test(out[k].text)) return out[k]; };
  let at = 0;
  let wi = 0;
  let groupStart = 0; // first token since the previous <num>
  // "| base | other |": the base reading stays as it is; the other edition's is marked, in
  // brackets, or "omit" when it leaves the base reading out. Only when the pipes come in threes.
  const pipes = (html.match(/\|/g) ?? []).length;
  const variants = pipes > 0 && pipes % 3 === 0;
  let vstate = 0, vstart = 0;
  const mark = (text: string) => { out.push({ text, word: false, red: false, italic: false, strongs: [], at, wi: -1, variant: true }); at += text.length; };
  const pipe = () => {
    vstate = (vstate + 1) % 3;
    if (vstate === 2) { mark("⟨"); vstart = out.length; }
    else if (vstate === 0) { if (!out.slice(vstart).some((t) => t.word)) mark("omit"); mark("⟩"); }
  };
  const push = (text: string, red: boolean, italic: boolean) => {
    if (variants && text.includes("|")) {
      text.split("|").forEach((part, i) => { if (i) pipe(); pushText(part, red, italic); });
      return;
    }
    pushText(text, red, italic);
  };
  const pushText = (text: string, red: boolean, italic: boolean) => {
    const variant = vstate === 2 || undefined;
    let last = 0;
    for (const m of text.matchAll(WORD)) {
      if (m.index! > last) { const t = text.slice(last, m.index); out.push({ text: t, word: false, red, italic, strongs: [], at, wi: -1, variant }); at += t.length; }
      out.push({ text: m[0], word: true, red, italic, strongs: [], at, wi: wi++, variant });
      at += m[0].length;
      last = m.index! + m[0].length;
    }
    if (last < text.length) { const t = text.slice(last); out.push({ text: t, word: false, red, italic, strongs: [], at, wi: -1, variant }); at += t.length; }
  };
  const walk = (node: Node, red: boolean, italic: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) { push(node.textContent || "", red, italic); return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === "num") {
      const raw = (el.textContent || "").trim();
      // "G1526 [G5748]": the Strong's number, then a tense code, which is grammar, not a word.
      const code = raw.match(/\[(\w+)\]/)?.[1];
      const n = raw.replace(/\s*\[\w+\]/g, "").trim();
      if (code && interlinear) { const t = lastOriginal(); if (t) t.parse = t.parse ? `${t.parse} ${code}` : code; }
      const words = out.slice(groupStart).filter((t) => t.word);
      words.forEach((t) => t.strongs.push(n));
      const lastWord = words[words.length - 1];
      if (lastWord) (lastWord.showNums ??= []).push(n);
      groupStart = out.length;
      return;
    }
    if (tag === "sup" && /^[()]$/.test((el.textContent || "").trim())) return;
    if (interlinear && tag === "div" && el.querySelector("gra")) {
      let t: Token | undefined;
      for (const k of Array.from(el.children)) {
        const kt = k.tagName.toLowerCase(), text = (k.textContent || "").trim();
        if (!text) continue;
        if (kt === "grk" && !t) { push(text, red, italic); t = [...out].reverse().find((x) => x.word); groupStart = out.length; } // the box's word, in any script (Latin+ too)
        else if (!t) continue;
        else if (kt === "num") { t.strongs.push(text); (t.showNums ??= []).push(text); }
        else if (kt === "tvm") t.parse = text;
        else if (kt === "grk") t.lemma = text;
        else if (kt === "gra") t.gloss = text;
        else if (kt === "red") t.editions = text;
      }
      push(" ", red, italic);
      return;
    }
    if (interlinear && (tag === "tvm" || tag === "sup")) {
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      const t = lastOriginal();
      const numbered = tag === "tvm" ? text.match(/^(\d*)\[([^\]]+)\]$/) : null;
      if (t && numbered) {
        if (numbered[1]) { const n = `G${numbered[1]}`; t.strongs.push(n); (t.showNums ??= []).push(n); groupStart = out.length; }
        t.parse = numbered[2];
      } else if (t && text) {
        if (tag === "sup" || !isCode(text)) t.gloss = t.gloss ? `${t.gloss} ${text}` : text;
        else t.parse = t.parse ? `${t.parse} ${text}` : text;
      }
      return;
    }
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
const kjvGlossCache = new Map<string, Promise<string | null>>();
/** A Strong's number's commonest rendering in the KJV, from the concordance ("beginning" for H7225); cached. */
export function kjvGloss(concordance: string, num: string): Promise<string | null> {
  const key = `${concordance}/${num}`;
  let p = kjvGlossCache.get(key);
  if (!p) {
    p = api.article("lexicon", concordance, num).then((a) => {
      const r = a ? concordanceRenderings(a.html) : [];
      return r.length ? r.reduce((x, y) => (y[1] > x[1] ? y : x))[0] : null;
    }).catch(() => null);
    kjvGlossCache.set(key, p);
  }
  return p;
}

export function concordanceRenderings(html: string): [string, number][] {
  const out: [string, number][] = [];
  // plainText decodes entities: the concordance writes "love's" as "love&#146;s".
  for (const m of html.matchAll(/<b>([^<]+?),\s*(\d+)<\/b>/g)) out.push([plainText(m[1]), +m[2]]);
  return out;
}
