// The small Markdown the journal is stored in, and the HTML the editor shows. Only what the
// journal toolbar can make round-trips: headings (###), bold, italic, quotes, bullet and
// numbered lists, and paragraphs. Verse references anywhere in the text become links.

import { book, findBook, Ref } from "./bible";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// "John 3:16", "1 John 4:9-10", "Joh 3:16", "Num 21:8–9", "Ps 23:1"; as spoken, "1 John 5, verse 4"
// and "Job 19, verses 25 to 27", "Genesis chapter 3:1 - 5"; a whole chapter, "Hebrews 11"; and a
// range into a later chapter, "Mat 5:3-7:29".
const REF_RE = /\b((?:[123]\s?)?[A-Z][a-z]{1,15}(?:\s(?:of\s)?(?!Chapter\b)[A-Z][a-z]+)?)\.?\s(?:(?:[Cc]hapter|[Cc]hap\.|[Cc]h\.)\s)?(\d{1,3})(?::(\d{1,3})(?:\s?[-–]\s?(\d{1,3})(?::(\d{1,3}))?)?|,?\s(?:verses?|vv?\.?)\s(\d{1,3})(?:\s?(?:[-–]|to)\s?(\d{1,3}))?)?(?!\d|:\d)/g;

/** `loose` also takes a short name with a chapter alone ("1 Cor 13", "Dan 4"): right for reading
 *  aloud, where saying the book in full does no harm, but too eager for links. */
export function findRefs(text: string, loose = false): { index: number; length: number; ref: Ref }[] {
  const out = [];
  REF_RE.lastIndex = 0;
  for (let m: RegExpExecArray | null; (m = REF_RE.exec(text)); ) {
    // Not a reference ("In 1 Peter 1:22" first tries "In 1"): look again from the next word, so
    // the text it took can still be one.
    const reject = () => { REF_RE.lastIndex = m!.index + (m![0].search(/\s/) + 1 || 1); };
    let b = findBook(m[1]), skip = 0;
    // "See John 3:16": the capitalised word before the book was taken as part of its name.
    const w = !b && !/^[123]/.test(m[1]) ? m[1].match(/\s(\S+)$/) : null;
    if (w) { b = findBook(w[1]); skip = m[1].length - w[1].length; }
    if (!b) { reject(); continue; }
    let chapter = +m[2], verse = m[3] ?? m[6] ? +(m[3] ?? m[6]) : undefined;
    // "5:3-7:29": the range ends in chapter 7.
    const toChapter = m[5] ? +m[4] : undefined;
    const to = m[5] ? +m[5] : m[4] ?? m[7] ? +(m[4] ?? m[7]) : undefined;
    if (verse === undefined) {
      // A chapter on its own only by the book's name or a long form of it ("Job 3", "Psalm 23"),
      // not "Dan 4" or "Song 3"; "Jude 5" is a verse.
      const name = m[1].slice(skip).replace(/^[123]\s?/, "");
      const full = book(b).name.replace(/^[123]\s?/, "");
      if (name !== full && (name === "Song" || (name.length < 4 && !loose))) { reject(); continue; }
      if (book(b).chapters === 1 && chapter > 1) { verse = chapter; chapter = 1; }
    }
    if (chapter < 1 || chapter > book(b).chapters || (toChapter !== undefined && (toChapter <= chapter || toChapter > book(b).chapters))) { reject(); continue; }
    out.push({ index: m.index! + skip, length: m[0].length - skip, ref: { book: b, chapter, verse, to, toChapter } });
  }
  return out;
}

/** Escaped text with verse references wrapped in links the page can catch. */
function linkRefs(text: string): string {
  let out = "", last = 0;
  for (const h of findRefs(text)) {
    out += esc(text.slice(last, h.index));
    out += `<a class="ref" data-ref="${esc(JSON.stringify(h.ref))}">${esc(text.slice(h.index, h.index + h.length))}</a>`;
    last = h.index + h.length;
  }
  return out + esc(text.slice(last));
}

// An escaped mark (\*), ***bold italic***, **bold**, *italic*, and _italic_ only at word edges, so
// my_notes_file stays as it is.
const INLINE_RE = /\\[\\*_]|\*\*\*(?=\S)(?:\\.|[^\\])+?\*\*\*|\*\*(?=\S)(?:\\.|[^\\])+?\*\*|\*(?=[^\s*])(?:\\.|[^*\\])+\*|(?<![\p{L}\p{N}_\\])_(?=[^\s_])(?:\\.|[^_\\])+_(?![\p{L}\p{N}_])/gu;

function inline(s: string, links: boolean): string {
  // Split on the marks first, then escape and link the plain parts.
  const parts: string[] = [];
  let last = 0;
  for (const m of s.matchAll(INLINE_RE)) {
    parts.push(links ? linkRefs(s.slice(last, m.index)) : esc(s.slice(last, m.index)));
    const t = m[0];
    const n = t.startsWith("***") ? 3 : t.startsWith("**") ? 2 : 1;
    if (t[0] === "\\") parts.push(esc(t[1]));
    else {
      const body = inline(t.slice(n, -n), links);
      parts.push(n === 3 ? `<b><i>${body}</i></b>` : n === 2 ? `<b>${body}</b>` : `<i>${body}</i>`);
    }
    last = m.index! + t.length;
  }
  parts.push(links ? linkRefs(s.slice(last)) : esc(s.slice(last)));
  return parts.join("");
}

export function mdToHtml(md: string, links = true): string {
  const lines = md.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    const h = l.match(/^(#{1,6})\s+(.*)$/);
    if (h) { out.push(`<h3>${inline(h[2], links)}</h3>`); i++; continue; }
    if (/^>\s?/.test(l)) {
      const q: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ""));
      // A quote whose last line is "— John 3:8 KJV" is a verse inserted from the Bible.
      const cite = q.length > 1 && /^[—–-]\s/.test(q[q.length - 1]) ? q.pop()!.replace(/^[—–-]\s/, "") : null;
      out.push(`<blockquote${cite ? ' class="verse"' : ""}>${q.map((x) => inline(x, links)).join("<br>")}${cite ? `<cite>${inline(cite, links)}</cite>` : ""}</blockquote>`);
      continue;
    }
    if (/^[-*]\s+/.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^[-*]\s+/, ""));
      out.push(`<ul>${items.map((x) => `<li>${inline(x, links)}</li>`).join("")}</ul>`);
      continue;
    }
    if (/^\d+[.)]\s+/.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\d+[.)]\s+/, ""));
      out.push(`<ol>${items.map((x) => `<li>${inline(x, links)}</li>`).join("")}</ol>`);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|>|[-*]\s|\d+[.)]\s)/.test(lines[i])) para.push(lines[i++]);
    out.push(`<p>${para.map((x) => inline(x, links)).join("<br>")}</p>`);
  }
  return out.join("");
}

/** The editor's DOM back to Markdown. One paragraph is one line: no hard wrapping. */
export function htmlToMd(root: HTMLElement): string {
  const inl = (n: Node): string => {
    // Marks typed as text are escaped, so they read back as text; a _ inside a word needs none.
    if (n.nodeType === Node.TEXT_NODE) return (n.textContent || "").replace(/ /g, " ").replace(/\\(?=[\\*_])|\*|(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}])/gu, "\\$&");
    if (n.nodeType !== Node.ELEMENT_NODE) return "";
    const el = n as HTMLElement;
    const kids = Array.from(el.childNodes).map(inl).join("");
    const tag = el.tagName.toLowerCase();
    const bold = tag === "b" || tag === "strong" || (tag === "span" && (el.style.fontWeight === "bold" || +el.style.fontWeight >= 600));
    const ital = tag === "i" || tag === "em" || (tag === "span" && el.style.fontStyle === "italic");
    if (tag === "br") return "\n";
    if (bold && kids.trim()) return `**${kids.trim()}**${kids.endsWith(" ") ? " " : ""}`;
    if (ital && kids.trim()) return `*${kids.trim()}*${kids.endsWith(" ") ? " " : ""}`;
    return kids;
  };
  const blocks: string[] = [];
  const block = (el: Node) => {
    if (el.nodeType === Node.TEXT_NODE) { const t = (el.textContent || "").trim(); if (t) blocks.push(t); return; }
    if (el.nodeType !== Node.ELEMENT_NODE) return;
    const e = el as HTMLElement;
    const tag = e.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) blocks.push(`### ${inl(e).trim()}`);
    else if (tag === "blockquote") {
      const cite = e.querySelector("cite");
      const citeText = cite ? inl(cite).trim() : "";
      cite?.remove();
      const lines = inl(e).split("\n").map((x) => x.trim()).filter(Boolean);
      if (citeText) lines.push(`— ${citeText}`);
      blocks.push(lines.map((x) => `> ${x}`).join("\n"));
      if (cite) e.appendChild(cite);
    } else if (tag === "ul" || tag === "ol") {
      const items = Array.from(e.children).filter((c) => c.tagName === "LI");
      blocks.push(items.map((li, k) => `${tag === "ol" ? `${k + 1}.` : "-"} ${inl(li).replace(/\n+/g, " ").trim()}`).join("\n"));
    } else if (tag === "p" || tag === "div") {
      // A div holding blocks (what WebKit makes on Enter) is walked, not flattened.
      if (Array.from(e.children).some((c) => /^(P|DIV|UL|OL|BLOCKQUOTE|H\d)$/.test(c.tagName))) { e.childNodes.forEach(block); return; }
      const t = inl(e).replace(/\n+$/, "").trim();
      if (t) blocks.push(t.split("\n").join("  \n"));
    } else {
      const t = inl(e).trim();
      if (t) blocks.push(t);
    }
  };
  root.childNodes.forEach(block);
  return blocks.join("\n\n");
}

/** Plain text with the Markdown marks taken out, for excerpts. */
export const mdPlain = (md: string) => md.replace(/^#+\s+/gm, "").replace(/^>\s?/gm, "").replace(/^[-*]\s+/gm, "").replace(/\\([\\*_])|\*+|(?<![\p{L}\p{N}])_+|_+(?![\p{L}\p{N}])/gu, (_m, e) => e ?? "").replace(/\s+/g, " ").trim();
