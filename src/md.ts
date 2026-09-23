// The small Markdown the journal is stored in, and the HTML the editor shows. Only what the
// journal toolbar can make round-trips: headings (###), bold, italic, quotes, bullet and
// numbered lists, and paragraphs. Verse references anywhere in the text become links.

import { findBook, fmtRef, Ref } from "./bible";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// "John 3:16", "1 John 4:9-10", "Joh 3:16", "Num 21:8–9", "Ps 23:1".
const REF_RE = /\b((?:[123]\s?)?[A-Z][a-z]{1,15}(?:\s(?:of\s)?[A-Z][a-z]+)?)\.?\s(\d{1,3}):(\d{1,3})(?:\s?[-–]\s?(\d{1,3}))?/g;

export function findRefs(text: string): { index: number; length: number; ref: Ref }[] {
  const out = [];
  for (const m of text.matchAll(REF_RE)) {
    const b = findBook(m[1]);
    if (!b) continue;
    out.push({ index: m.index!, length: m[0].length, ref: { book: b, chapter: +m[2], verse: +m[3], to: m[4] ? +m[4] : undefined } });
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

function inline(s: string, links: boolean): string {
  // Split on **bold** and *italic* first, then escape and link the plain parts.
  const parts: string[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;
  let last = 0;
  for (const m of s.matchAll(re)) {
    parts.push(links ? linkRefs(s.slice(last, m.index)) : esc(s.slice(last, m.index)));
    const t = m[0];
    const inner = t.startsWith("**") ? t.slice(2, -2) : t.slice(1, -1);
    const body = links ? linkRefs(inner) : esc(inner);
    parts.push(t.startsWith("**") ? `<b>${body}</b>` : `<i>${body}</i>`);
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
    if (n.nodeType === Node.TEXT_NODE) return (n.textContent || "").replace(/ /g, " ");
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

/** A verse quoted into a note: the text, then the reference and Bible on the last line. */
export const verseQuote = (text: string, r: Ref, bible: string) => `> ${text}\n> — ${fmtRef(r)} ${bible}`;

/** Plain text with the Markdown marks taken out, for excerpts. */
export const mdPlain = (md: string) => md.replace(/^#+\s+/gm, "").replace(/^>\s?/gm, "").replace(/^[-*]\s+/gm, "").replace(/\*\*|__|\*|_/g, "").replace(/\s+/g, " ").trim();
